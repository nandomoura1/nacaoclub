import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma, type Tx } from '@/server/db';
import { audit } from '@/server/audit';
import { assertAreaAccess, assertCan, can } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import type { RequestMeta } from '@/server/auth/session';
import { AppError, NotFoundError } from '@/server/errors';
import { WEEKDAYS, addDays, formatClock, formatDateBR, fromUtc, isIsoDate, toUtc, type IsoDate } from '@/domain/dates';
import {
  COVERAGE_LABEL, LEAVE_LABEL, defaultDeducts, exceptionTypeOf, isAffectable, leaveEffect, overlaps, revertState,
  type LeaveCoverage, type LeaveType,
} from '@/domain/leave';

/**
 * Ausências lançadas na ficha do professor. Uma ausência vale para as aulas
 * já geradas E para as que forem geradas depois (fillPeriod chama
 * applyLeavesToPeriod). Anular devolve as aulas ao previsto, com registro.
 */

const MAX_DAYS = 400;

export const leaveSchema = z.object({
  type: z.enum(['FERIAS', 'ATESTADO', 'AFASTAMENTO', 'FOLGA', 'FALTA', 'INDISPONIVEL']),
  startDate: z.string().refine(isIsoDate, 'Data inicial inválida.'),
  endDate: z.string().refine(isIsoDate, 'Data final inválida.'),
  coverage: z.enum(['PENDENTE', 'CANCELAR', 'SUBSTITUIR']),
  substituteId: z.string().uuid().nullable().or(z.literal('').transform(() => null)).optional(),
  /** Só esta aula da grade (substituição por aula). */
  slotId: z.string().uuid().nullable().or(z.literal('').transform(() => null)).optional(),
  notes: z.string().trim().max(500).optional().transform((v) => v || null),
  /** Desconta das horas? Vazio = padrão do tipo (só folga não desconta). */
  deductsHours: z.boolean().optional(),
});

type LeaveRow = { id: string; teacherId: string; type: LeaveType; coverage: LeaveCoverage; substituteId: string | null; slotId: string | null; startDate: Date; endDate: Date; createdById: string | null; deductsHours: boolean };

/** Coordenador só lança ausência de quem dá aula nas áreas dele. */
async function assertTeacherInScope(db: Tx, principal: Principal, teacherId: string) {
  const t = await db.teacher.findUnique({
    where: { id: teacherId },
    select: { id: true, name: true, modalities: { select: { modality: { select: { areaId: true } } } } },
  });
  if (!t) throw new NotFoundError('Professor não encontrado.');
  if (principal.areaIds !== null) {
    const areas = new Set(principal.areaIds);
    const slotAreas = await db.slotVersionTeacher.findFirst({ where: { teacherId, version: { modality: { areaId: { in: [...areas] } } } }, select: { versionId: true } });
    if (!t.modalities.some((m) => areas.has(m.modality.areaId)) && !slotAreas) {
      throw new AppError('Este professor não dá aula nas áreas que você coordena.', 403);
    }
  }
  return t;
}

/** Aplica UMA ausência às aulas geradas (em competências abertas) no intervalo dado. Idempotente. */
async function applyLeave(tx: Tx, leave: LeaveRow, range?: { start: IsoDate; end: IsoDate }) {
  const start = range && range.start > fromUtc(leave.startDate) ? range.start : fromUtc(leave.startDate);
  const end = range && range.end < fromUtc(leave.endDate) ? range.end : fromUtc(leave.endDate);
  if (start > end) return { applied: 0, closed: 0 };

  const occ = await tx.classOccurrence.findMany({
    where: {
      date: { gte: toUtc(start), lte: toUtc(end) },
      assignments: { some: { plannedTeacherId: leave.teacherId } },
      ...(leave.slotId ? { slotId: leave.slotId } : {}),
    },
    include: { assignments: true, period: { select: { status: true } }, exceptions: { where: { leaveId: leave.id }, select: { assignmentId: true } } },
  });
  const falta = await tx.cancellationReason.findFirst({ where: { name: 'Falta de professor' } });
  const effect = leaveEffect(leave);
  let applied = 0;
  let closed = 0;

  for (const o of occ) {
    const done = new Set(o.exceptions.map((e) => e.assignmentId));
    const targets = o.assignments.filter((a) => isAffectable(a, leave.teacherId, o.status, !!leave.slotId) && !done.has(a.id));
    if (!targets.length) continue;
    if (o.period.status === 'FECHADO') { closed++; continue; }

    for (const a of targets) {
      await tx.classAssignment.update({
        where: { id: a.id },
        data: { status: effect.status, executingTeacherId: effect.executingTeacherId, absenceReason: effect.absenceReason, absencePaid: effect.absencePaid ?? false },
      });
      await tx.classException.create({
        data: {
          occurrenceId: o.id,
          assignmentId: a.id,
          type: exceptionTypeOf(leave.type, leave.coverage),
          leaveId: leave.id,
          notes: leave.slotId ? `${LEAVE_LABEL[leave.type]} · substituição nesta aula` : `${LEAVE_LABEL[leave.type]} · ${COVERAGE_LABEL[leave.coverage]}`,
          before: { status: a.status, executingTeacherId: a.executingTeacherId, absenceReason: a.absenceReason, absencePaid: a.absencePaid, occurrenceStatus: o.status, cancellationReasonId: o.cancellationReasonId },
          after: { ...effect },
          createdById: leave.createdById,
        },
      });
      applied++;
    }
    // Se ninguém mais dá a aula e a escolha foi cancelar, a aula inteira é cancelada.
    const remaining = o.assignments.filter((a) => !targets.includes(a) && (a.status === 'PREVISTA' || a.status === 'REALIZADA' || a.status === 'SUBSTITUIDA'));
    const cancelWhole = leave.coverage === 'CANCELAR' && remaining.length === 0;
    await tx.classOccurrence.update({
      where: { id: o.id },
      data: { touched: true, ...(cancelWhole ? { status: 'CANCELADA', cancellationReasonId: falta?.id ?? null } : {}) },
    });
  }
  return { applied, closed };
}

/** Chamado na geração/realinhamento da competência: ausências valem para aulas novas também. */
export async function applyLeavesToPeriod(tx: Tx, period: { startDate: Date; endDate: Date }) {
  const leaves = await tx.leave.findMany({
    where: { cancelledAt: null, startDate: { lte: period.endDate }, endDate: { gte: period.startDate } },
  });
  // Substituições por aula primeiro: a aula já nasce com o substituto, e as férias (todas as aulas) cuidam do resto.
  leaves.sort((a, b) => Number(!a.slotId) - Number(!b.slotId));
  for (const l of leaves) await applyLeave(tx, l, { start: fromUtc(period.startDate), end: fromUtc(period.endDate) });
}

/** Prévia: quais aulas a ausência afeta e onde o substituto já tem aula no mesmo horário. */
export async function previewLeave(principal: Principal | null, teacherId: string, input: unknown) {
  assertCan(principal, 'leave.manage');
  const parsed = leaveSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const d = parsed.data;
  const end = d.type === 'FALTA' && !d.endDate ? d.startDate : d.endDate;
  const occ = await prisma.classOccurrence.findMany({
    where: { date: { gte: toUtc(d.startDate), lte: toUtc(end) }, assignments: { some: { plannedTeacherId: teacherId } }, ...(d.slotId ? { slotId: d.slotId } : {}) },
    include: { assignments: true, modality: { select: { name: true } }, period: { select: { status: true } } },
    orderBy: [{ date: 'asc' }, { startMin: 'asc' }],
  });
  const affected = occ.filter((o) => o.assignments.some((a) => isAffectable(a, teacherId, o.status, !!d.slotId)));
  const conflicts: string[] = [];
  if (d.coverage === 'SUBSTITUIR' && d.substituteId) {
    const busy = await prisma.classOccurrence.findMany({
      where: { date: { gte: toUtc(d.startDate), lte: toUtc(end) }, status: { not: 'CANCELADA' }, assignments: { some: { executingTeacherId: d.substituteId } } },
      select: { date: true, startMin: true, durationMin: true, modality: { select: { name: true } } },
    });
    for (const o of affected) {
      const hit = busy.find((b) => +b.date === +o.date && b.startMin < o.startMin + o.durationMin && o.startMin < b.startMin + b.durationMin);
      if (hit) conflicts.push(`${formatDateBR(fromUtc(o.date))} ${formatClock(o.startMin)}: substituto já tem ${hit.modality.name}`);
    }
  }
  // Aulas da grade ainda não geradas (competência por gerar): serão afetadas quando a competência for gerada.
  const { ungeneratedClasses } = await import('./period-service');
  const pending = await ungeneratedClasses(teacherId, d.startDate, end);
  const periodsMissing = !occ.length && !pending.count;
  return {
    pending: pending.count ? { ...pending, canGenerate: can(principal, 'period.generate') } : null,
    count: affected.length,
    minutes: affected.reduce((s, o) => s + o.plannedDurationMin, 0),
    closed: affected.filter((o) => o.period.status === 'FECHADO').length,
    sample: affected.slice(0, 8).map((o) => `${formatDateBR(fromUtc(o.date))} ${formatClock(o.startMin)} ${o.modality.name}`),
    conflicts,
    note: periodsMissing ? 'Nenhuma aula gerada nesse intervalo ainda: a ausência será aplicada quando a competência for gerada.' : null,
  };
}

/** `scopeChecked`: quem chama já conferiu o escopo (ex.: Escalas 5x2, por setor que lidera). */
export async function saveLeave(principal: Principal | null, teacherId: string, input: unknown, meta: RequestMeta, opts: { scopeChecked?: boolean } = {}) {
  assertCan(principal, 'leave.manage');
  const parsed = leaveSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const d = parsed.data;
  if (d.endDate < d.startDate) throw new AppError('A data final é antes da inicial.');
  if (addDays(d.startDate, MAX_DAYS) < d.endDate) throw new AppError('Ausência longa demais (máximo 400 dias).');
  if (d.coverage === 'SUBSTITUIR' && !d.substituteId) throw new AppError('Escolha quem vai substituir.');
  if (d.substituteId === teacherId) throw new AppError('O substituto não pode ser o próprio professor.');
  if (d.slotId && d.coverage !== 'SUBSTITUIR') throw new AppError('Substituição por aula precisa de um substituto.');

  return prisma.$transaction(async (tx) => {
    const teacher = opts.scopeChecked
      ? await tx.teacher.findUniqueOrThrow({ where: { id: teacherId }, select: { id: true, name: true } })
      : await assertTeacherInScope(tx, principal, teacherId);
    let slotLabel: string | null = null;
    if (d.slotId) {
      const v = await tx.scheduleSlotVersion.findFirst({
        where: { slotId: d.slotId, validFrom: { lte: toUtc(d.endDate) }, OR: [{ validTo: null }, { validTo: { gte: toUtc(d.startDate) } }], teachers: { some: { teacherId } } },
        include: { modality: { select: { name: true } } }, orderBy: { validFrom: 'desc' },
      });
      if (!v) throw new AppError('Este professor não está nessa aula no período escolhido.');
      slotLabel = `${v.modality.name} ${WEEKDAYS[v.weekday - 1]!.short.toLowerCase()} ${formatClock(v.startMin)}`;
    }
    // Ausências do professor não se sobrepõem; substituições da MESMA aula também não. Uma substituição por aula pode cair dentro das férias.
    const active = await tx.leave.findMany({ where: { teacherId, cancelledAt: null, slotId: d.slotId ?? null }, select: { startDate: true, endDate: true, type: true, slotId: true } });
    const clash = active.find((l) => overlaps({ start: d.startDate, end: d.endDate }, { start: fromUtc(l.startDate), end: fromUtc(l.endDate) }));
    if (clash) throw new AppError(`Já existe ${clash.slotId ? 'substituição nesta aula' : LEAVE_LABEL[clash.type].toLowerCase()} de ${formatDateBR(fromUtc(clash.startDate))} a ${formatDateBR(fromUtc(clash.endDate))}. Anule ou ajuste antes.`);
    const substitute = d.coverage === 'SUBSTITUIR' ? await tx.teacher.findUnique({ where: { id: d.substituteId! }, select: { name: true } }) : null;
    if (d.coverage === 'SUBSTITUIR' && !substitute) throw new AppError('Substituto não encontrado.');

    const leave = await tx.leave.create({
      data: {
        teacherId, type: d.type, startDate: toUtc(d.startDate), endDate: toUtc(d.endDate), coverage: d.coverage,
        substituteId: d.coverage === 'SUBSTITUIR' ? d.substituteId! : null, slotId: d.slotId ?? null, notes: d.notes, createdById: principal.id,
        deductsHours: d.deductsHours ?? defaultDeducts(d.type),
      },
    });
    const r = await applyLeave(tx, leave);
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: 'leave.created',
      entityType: 'leave',
      entityId: leave.id,
      after: { professor: teacher.name, tipo: d.type, de: d.startDate, ate: d.endDate, cobertura: d.coverage, desconta_horas: leave.deductsHours, substituto: substitute?.name ?? null, aula: slotLabel, aulas_afetadas: r.applied },
      summary: slotLabel
        ? `${principal.name} lançou substituição de ${teacher.name} na aula ${slotLabel} (${formatDateBR(d.startDate)} a ${formatDateBR(d.endDate)}, ${LEAVE_LABEL[d.type].toLowerCase()}): ${substitute!.name}; ${r.applied} aula(s)`
        : `${principal.name} lançou ${LEAVE_LABEL[d.type].toLowerCase()} de ${teacher.name} (${formatDateBR(d.startDate)}${d.endDate !== d.startDate ? ` a ${formatDateBR(d.endDate)}` : ''}) — ${COVERAGE_LABEL[d.coverage].toLowerCase()}${substitute ? `: ${substitute.name}` : ''}; ${r.applied} aula(s) afetada(s)`,
    });
    return { id: leave.id, applied: r.applied, closed: r.closed };
  }, { timeout: 120_000, maxWait: 10_000 });
}

/** Anula a ausência: cada aula volta exatamente ao que era antes (registro de reversão). */
export async function cancelLeave(principal: Principal | null, leaveId: string, meta: RequestMeta, opts: { scopeChecked?: boolean } = {}) {
  assertCan(principal, 'leave.manage');
  return prisma.$transaction(async (tx) => {
    const leave = await tx.leave.findUnique({ where: { id: leaveId }, include: { teacher: { select: { name: true } } } });
    if (!leave) throw new NotFoundError('Ausência não encontrada.');
    if (leave.cancelledAt) throw new AppError('Esta ausência já foi anulada.');
    if (!opts.scopeChecked) await assertTeacherInScope(tx, principal, leave.teacherId);

    // Mais recentes primeiro: uma cobertura lançada por cima desfaz antes da ausência original.
    const exceptions = await tx.classException.findMany({
      where: { leaveId, type: { not: 'REVERSAO' } },
      include: { occurrence: { select: { id: true, date: true, status: true, period: { select: { status: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
    const others = await tx.leave.findMany({ where: { teacherId: leave.teacherId, cancelledAt: null, slotId: null, coverage: 'PENDENTE', id: { not: leaveId } }, select: { startDate: true, endDate: true } });
    const reverted = new Set((await tx.classException.findMany({ where: { revertsExceptionId: { in: exceptions.map((e) => e.id) } }, select: { revertsExceptionId: true } })).map((e) => e.revertsExceptionId));
    let restored = 0;
    let closed = 0;
    for (const e of exceptions) {
      if (reverted.has(e.id) || !e.assignmentId) continue;
      if (e.occurrence.period.status === 'FECHADO') { closed++; continue; }
      const before = (e.before ?? {}) as { status?: string; executingTeacherId?: string | null; absenceReason?: string | null; absencePaid?: boolean; occurrenceStatus?: string; cancellationReasonId?: string | null };
      const current = await tx.classAssignment.findUnique({ where: { id: e.assignmentId }, select: { status: true, executingTeacherId: true, plannedTeacherId: true } });
      if (!current) continue;
      const covered = others.some((l) => l.startDate <= e.occurrence.date && e.occurrence.date <= l.endDate);
      const target = revertState(current, (e.after ?? {}) as { status?: string; executingTeacherId?: string | null }, before, current.plannedTeacherId, covered);
      if (!target) continue; // alguém mexeu depois (ex.: substituição por aula): fica como está
      await tx.classAssignment.update({
        where: { id: e.assignmentId },
        data: {
          status: target.status as Prisma.ClassAssignmentUpdateInput['status'],
          executingTeacherId: target.executingTeacherId,
          absenceReason: target.absenceReason as Prisma.ClassAssignmentUpdateInput['absenceReason'],
          absencePaid: target.status === 'PREVISTA' || target.status === 'REALIZADA' ? false : before.absencePaid ?? false,
        },
      });
      if (e.occurrence.status === 'CANCELADA' && before.occurrenceStatus && before.occurrenceStatus !== 'CANCELADA') {
        await tx.classOccurrence.update({
          where: { id: e.occurrenceId },
          data: { status: before.occurrenceStatus as Prisma.ClassOccurrenceUpdateInput['status'], cancellationReasonId: before.cancellationReasonId ?? null },
        });
      }
      await tx.classException.create({
        data: { occurrenceId: e.occurrenceId, assignmentId: e.assignmentId, type: 'REVERSAO', revertsExceptionId: e.id, leaveId, notes: 'Ausência anulada', before: e.after ?? undefined, after: e.before ?? undefined, createdById: principal.id },
      });
      restored++;
    }
    await tx.leave.update({ where: { id: leaveId }, data: { cancelledAt: new Date(), cancelledById: principal.id } });
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: 'leave.cancelled',
      entityType: 'leave',
      entityId: leaveId,
      after: { aulas_restauradas: restored, em_competencia_fechada: closed },
      summary: `${principal.name} anulou ${LEAVE_LABEL[leave.type].toLowerCase()} de ${leave.teacher.name} (${formatDateBR(fromUtc(leave.startDate))} a ${formatDateBR(fromUtc(leave.endDate))}); ${restored} aula(s) voltaram ao previsto`,
    });
    return { restored, closed };
  }, { timeout: 120_000, maxWait: 10_000 });
}

/** Troca "desconta / não desconta" de uma ausência já lançada (só nas competências abertas). */
export async function setLeaveDeducts(principal: Principal | null, leaveId: string, deducts: boolean, meta: RequestMeta) {
  assertCan(principal, 'leave.manage');
  return prisma.$transaction(async (tx) => {
    const leave = await tx.leave.findUnique({ where: { id: leaveId }, include: { teacher: { select: { name: true } } } });
    if (!leave) throw new NotFoundError('Ausência não encontrada.');
    if (leave.cancelledAt) throw new AppError('Esta ausência foi anulada.');
    await assertTeacherInScope(tx, principal, leave.teacherId);
    const exceptions = await tx.classException.findMany({
      where: { leaveId, type: { not: 'REVERSAO' }, assignmentId: { not: null } },
      select: { id: true, assignmentId: true, occurrence: { select: { period: { select: { status: true } } } } },
    });
    const reverted = new Set((await tx.classException.findMany({ where: { revertsExceptionId: { in: exceptions.map((e) => e.id) } }, select: { revertsExceptionId: true } })).map((e) => e.revertsExceptionId));
    const live = exceptions.filter((e) => !reverted.has(e.id));
    const open = live.filter((e) => e.occurrence.period.status !== 'FECHADO').map((e) => e.assignmentId!);
    // Só mexe nas cadeiras que continuam ausentes por causa desta ausência.
    const r = await tx.classAssignment.updateMany({
      where: { id: { in: open }, status: { in: ['SUBSTITUIDA', 'AUSENTE_PENDENTE', 'CANCELADA'] } },
      data: { absencePaid: !deducts },
    });
    await tx.leave.update({ where: { id: leaveId }, data: { deductsHours: deducts } });
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: 'leave.deducts_changed', entityType: 'leave', entityId: leaveId,
      before: { desconta_horas: leave.deductsHours }, after: { desconta_horas: deducts, aulas: r.count },
      summary: `${principal.name} marcou ${LEAVE_LABEL[leave.type].toLowerCase()} de ${leave.teacher.name} (${formatDateBR(fromUtc(leave.startDate))}) como ${deducts ? 'desconta das horas' : 'abonada (não desconta)'}; ${r.count} aula(s)`,
    });
    return { updated: r.count, closed: live.length - open.length };
  });
}

export async function listLeaves(principal: Principal | null, teacherId: string) {
  assertCan(principal, 'schedule.view');
  const rows = await prisma.leave.findMany({
    where: { teacherId },
    include: {
      substitute: { select: { name: true } },
      slot: { select: { versions: { orderBy: { validFrom: 'desc' }, take: 1, select: { weekday: true, startMin: true, modality: { select: { name: true } } } } } },
      _count: { select: { exceptions: { where: { type: { not: 'REVERSAO' } } } } } },
    orderBy: { startDate: 'desc' },
  });
  return rows.map((l) => ({
    id: l.id, type: l.type as LeaveType, coverage: l.coverage as LeaveCoverage,
    startDate: fromUtc(l.startDate), endDate: fromUtc(l.endDate), substitute: l.substitute?.name ?? null,
    notes: l.notes, cancelled: Boolean(l.cancelledAt), classes: l._count.exceptions, deductsHours: l.deductsHours,
    slot: l.slot?.versions[0] ? `${l.slot.versions[0].modality.name} · ${WEEKDAYS[l.slot.versions[0].weekday - 1]!.long} ${formatClock(l.slot.versions[0].startMin)}` : null,
  }));
}
export type LeaveItem = Awaited<ReturnType<typeof listLeaves>>[number];

// ── Cobertura de ausência (horas extras de quem cobre) ─────────────

/** Situação de cada aula da ausência, do ponto de vista de quem vai cobrir. */
export type CoverState = 'pendente' | 'cancelada' | 'coberta_por_mim' | 'coberta_por_outro';

const coverSchema = z.object({
  leaveId: z.string().uuid(),
  assignmentIds: z.array(z.string().uuid()).min(1, 'Selecione ao menos uma aula.').max(500),
});

/** A exceção é uma cobertura lançada à parte (não o efeito da própria ausência). */
const isCoverException = (e: { type: string; after: unknown }) =>
  e.type === 'SUBSTITUICAO' && !!e.after && typeof e.after === 'object' && (e.after as { cover?: boolean }).cover === true;

/** Exceções vivas (não revertidas) da ausência, com a cadeira e a aula. */
async function liveLeaveExceptions(db: Tx, leaveId: string) {
  const all = await db.classException.findMany({
    where: { leaveId, type: { not: 'REVERSAO' }, assignmentId: { not: null } },
    select: { id: true, type: true, after: true, before: true, assignmentId: true, occurrenceId: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  const reverted = new Set((await db.classException.findMany({ where: { revertsExceptionId: { in: all.map((e) => e.id) } }, select: { revertsExceptionId: true } })).map((e) => e.revertsExceptionId));
  return all.filter((e) => !reverted.has(e.id));
}

/** Ausências de outros professores que dá para cobrir (no período e nos próximos 60 dias). */
export async function listCoverableLeaves(principal: Principal | null, substituteId: string, start: IsoDate, end: IsoDate) {
  assertCan(principal, 'occurrence.exception');
  const until = end > addDays(fromUtc(new Date()), 60) ? end : addDays(fromUtc(new Date()), 60);
  const leaves = await prisma.leave.findMany({
    where: { cancelledAt: null, slotId: null, teacherId: { not: substituteId }, endDate: { gte: toUtc(start) }, startDate: { lte: toUtc(until) } },
    include: { teacher: { select: { name: true } } },
    orderBy: [{ startDate: 'asc' }],
  });
  const out: { id: string; teacher: string; type: LeaveType; label: string; startDate: IsoDate; endDate: IsoDate }[] = [];
  for (const l of leaves) {
    if (principal.areaIds !== null) {
      try { await assertTeacherInScope(prisma, principal, l.teacherId); } catch { continue; }
    }
    const s = fromUtc(l.startDate), e = fromUtc(l.endDate);
    out.push({ id: l.id, teacher: l.teacher.name, type: l.type as LeaveType, startDate: s, endDate: e,
      label: `${l.teacher.name} · ${LEAVE_LABEL[l.type as LeaveType]} ${formatDateBR(s)}${e !== s ? ` a ${formatDateBR(e)}` : ''}` });
  }
  return out;
}
export type CoverableLeave = Awaited<ReturnType<typeof listCoverableLeaves>>[number];

/** Aulas da ausência, para escolher quais o substituto cobre (e onde ele já tem aula no horário). */
export async function listLeaveClasses(principal: Principal | null, leaveId: string, substituteId: string) {
  assertCan(principal, 'occurrence.exception');
  const leave = await prisma.leave.findUnique({ where: { id: leaveId }, include: { teacher: { select: { name: true } } } });
  if (!leave || leave.cancelledAt) throw new NotFoundError('Ausência não encontrada.');
  const live = await liveLeaveExceptions(prisma, leaveId);
  const ids = [...new Set(live.map((e) => e.assignmentId!))];
  const assignments = await prisma.classAssignment.findMany({
    where: { id: { in: ids } },
    include: {
      executingTeacher: { select: { name: true } },
      occurrence: { select: { id: true, date: true, startMin: true, durationMin: true, status: true, modality: { select: { name: true, areaId: true } }, period: { select: { status: true } } } },
    },
  });
  const visible = assignments.filter((a) => principal.areaIds === null || principal.areaIds.includes(a.occurrence.modality.areaId));
  const dates = [...new Set(visible.map((a) => +a.occurrence.date))].map((t) => new Date(t));
  const busy = dates.length ? await prisma.classAssignment.findMany({
    where: { executingTeacherId: substituteId, status: { in: ['PREVISTA', 'REALIZADA', 'SUBSTITUIDA'] }, occurrence: { date: { in: dates }, status: { not: 'CANCELADA' } } },
    select: { id: true, occurrence: { select: { date: true, startMin: true, durationMin: true, modality: { select: { name: true } } } } },
  }) : [];
  const coverMine = new Set(live.filter((e) => isCoverException(e) && (e.after as { executingTeacherId?: string }).executingTeacherId === substituteId).map((e) => e.assignmentId));

  const rows = visible.map((a) => {
    const o = a.occurrence;
    const state: CoverState | null =
      a.status === 'AUSENTE_PENDENTE' ? 'pendente'
      : a.status === 'CANCELADA' ? 'cancelada'
      : a.status === 'SUBSTITUIDA' && a.executingTeacherId === substituteId ? 'coberta_por_mim'
      : a.status === 'SUBSTITUIDA' ? 'coberta_por_outro' : null;
    const clash = busy.find((b) => b.id !== a.id && +b.occurrence.date === +o.date && b.occurrence.startMin < o.startMin + o.durationMin && o.startMin < b.occurrence.startMin + b.occurrence.durationMin);
    return {
      assignmentId: a.id, date: fromUtc(o.date), start: formatClock(o.startMin), end: formatClock(o.startMin + o.durationMin),
      minutes: a.minutes, modality: o.modality.name, state, by: a.status === 'SUBSTITUIDA' ? a.executingTeacher?.name ?? null : null,
      closed: o.period.status === 'FECHADO', undoable: coverMine.has(a.id),
      clash: clash ? `já tem ${clash.occurrence.modality.name} ${formatClock(clash.occurrence.startMin)}` : null,
    };
  }).filter((r) => r.state !== null)
    .sort((x, y) => x.date.localeCompare(y.date) || x.start.localeCompare(y.start));

  const { ungeneratedClasses } = await import('./period-service');
  const pending = await ungeneratedClasses(leave.teacherId, fromUtc(leave.startDate), fromUtc(leave.endDate));
  return { teacher: leave.teacher.name, rows, ungenerated: pending.count ? { count: pending.count, periods: pending.periods.map((p) => p.label) } : null };
}
export type LeaveClassRow = Awaited<ReturnType<typeof listLeaveClasses>>['rows'][number];

/**
 * Lança em lote o substituto nas aulas escolhidas da ausência: a aula passa a
 * "substituída" por ele (as horas entram para quem cobriu; quem faltou segue
 * com a regra da ausência — desconta ou abonada). Cada aula ganha um registro.
 */
export async function coverLeaveClasses(principal: Principal | null, substituteId: string, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'occurrence.exception');
  const parsed = coverSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const { leaveId, assignmentIds } = parsed.data;
  return prisma.$transaction(async (tx) => {
    const leave = await tx.leave.findUnique({ where: { id: leaveId }, include: { teacher: { select: { name: true } } } });
    if (!leave || leave.cancelledAt) throw new NotFoundError('Ausência não encontrada.');
    if (leave.teacherId === substituteId) throw new AppError('O substituto não pode ser o próprio professor ausente.');
    const sub = await tx.teacher.findUnique({ where: { id: substituteId }, select: { name: true, active: true } });
    if (!sub) throw new NotFoundError('Professor não encontrado.');
    if (!sub.active) throw new AppError(`${sub.name} está inativo.`);

    const live = await liveLeaveExceptions(tx, leaveId);
    const ofLeave = new Set(live.map((e) => e.assignmentId));
    const assignments = await tx.classAssignment.findMany({
      where: { id: { in: assignmentIds } },
      include: { occurrence: { select: { id: true, date: true, startMin: true, status: true, cancellationReasonId: true, modality: { select: { areaId: true } }, period: { select: { status: true } } } } },
    });
    let covered = 0, minutes = 0;
    const skipped: string[] = [];
    for (const a of assignments) {
      const o = a.occurrence;
      const when = `${formatDateBR(fromUtc(o.date))} ${formatClock(o.startMin)}`;
      if (!ofLeave.has(a.id)) { skipped.push(`${when}: não é desta ausência`); continue; }
      assertAreaAccess(principal, o.modality.areaId);
      if (o.period.status === 'FECHADO') { skipped.push(`${when}: competência fechada`); continue; }
      if (a.status !== 'AUSENTE_PENDENTE' && a.status !== 'CANCELADA') { skipped.push(`${when}: já coberta`); continue; }
      const after = { status: 'SUBSTITUIDA', executingTeacherId: substituteId, absenceReason: a.absenceReason, absencePaid: a.absencePaid, cover: true };
      await tx.classAssignment.update({ where: { id: a.id }, data: { status: 'SUBSTITUIDA', executingTeacherId: substituteId } });
      // Aula inteira cancelada por causa da ausência volta a acontecer (agora com o substituto).
      if (o.status === 'CANCELADA') await tx.classOccurrence.update({ where: { id: o.id }, data: { status: 'PREVISTA', cancellationReasonId: null, touched: true } });
      else await tx.classOccurrence.update({ where: { id: o.id }, data: { touched: true } });
      await tx.classException.create({
        data: {
          occurrenceId: o.id, assignmentId: a.id, type: 'SUBSTITUICAO', leaveId,
          notes: `Cobertura de ${LEAVE_LABEL[leave.type as LeaveType].toLowerCase()}: ${sub.name}`,
          before: { status: a.status, executingTeacherId: a.executingTeacherId, absenceReason: a.absenceReason, absencePaid: a.absencePaid, occurrenceStatus: o.status, cancellationReasonId: o.cancellationReasonId },
          after, createdById: principal.id,
        },
      });
      covered++; minutes += a.minutes;
    }
    if (assignments.length < assignmentIds.length) skipped.push(`${assignmentIds.length - assignments.length} aula(s) não encontrada(s)`);
    if (!covered) throw new AppError(skipped.length ? `Nenhuma aula lançada — ${skipped.slice(0, 3).join('; ')}.` : 'Nenhuma aula lançada.');
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: 'leave.covered', entityType: 'leave', entityId: leaveId,
      after: { substituto: sub.name, ausente: leave.teacher.name, aulas: covered, minutos: minutes, ignoradas: skipped },
      summary: `${principal.name} lançou ${sub.name} cobrindo ${covered} aula(s) de ${leave.teacher.name} (${LEAVE_LABEL[leave.type as LeaveType].toLowerCase()} ${formatDateBR(fromUtc(leave.startDate))}${leave.endDate > leave.startDate ? ` a ${formatDateBR(fromUtc(leave.endDate))}` : ''})`,
    });
    return { covered, minutes, skipped };
  }, { timeout: 120_000, maxWait: 10_000 });
}

/** Desfaz coberturas lançadas por engano: a aula volta a "aguardando substituto" (ou cancelada). */
export async function uncoverLeaveClasses(principal: Principal | null, substituteId: string, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'occurrence.exception');
  const parsed = coverSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const { leaveId, assignmentIds } = parsed.data;
  return prisma.$transaction(async (tx) => {
    const leave = await tx.leave.findUnique({ where: { id: leaveId }, include: { teacher: { select: { name: true } } } });
    if (!leave) throw new NotFoundError('Ausência não encontrada.');
    const sub = await tx.teacher.findUnique({ where: { id: substituteId }, select: { name: true } });
    if (!sub) throw new NotFoundError('Professor não encontrado.');
    const wanted = new Set(assignmentIds);
    const covers = (await liveLeaveExceptions(tx, leaveId))
      .filter((e) => wanted.has(e.assignmentId!) && isCoverException(e) && (e.after as { executingTeacherId?: string }).executingTeacherId === substituteId);
    let undone = 0;
    for (const e of covers) {
      const [a, o] = await Promise.all([
        tx.classAssignment.findUnique({ where: { id: e.assignmentId! } }),
        tx.classOccurrence.findUnique({ where: { id: e.occurrenceId }, select: { status: true, modality: { select: { areaId: true } }, period: { select: { status: true } } } }),
      ]);
      if (!a || !o) continue;
      assertAreaAccess(principal, o.modality.areaId);
      if (o.period.status === 'FECHADO') throw new AppError('Há aula em competência fechada: não dá para desfazer.');
      if (a.status !== 'SUBSTITUIDA' || a.executingTeacherId !== substituteId) continue; // alguém mexeu depois
      const before = (e.before ?? {}) as { status?: string; executingTeacherId?: string | null; occurrenceStatus?: string; cancellationReasonId?: string | null };
      await tx.classAssignment.update({
        where: { id: a.id },
        data: { status: (before.status ?? 'AUSENTE_PENDENTE') as Prisma.ClassAssignmentUpdateInput['status'], executingTeacherId: before.executingTeacherId ?? null },
      });
      if (before.occurrenceStatus === 'CANCELADA' && o.status !== 'CANCELADA') {
        await tx.classOccurrence.update({ where: { id: e.occurrenceId }, data: { status: 'CANCELADA', cancellationReasonId: before.cancellationReasonId ?? null } });
      }
      await tx.classException.create({
        data: { occurrenceId: e.occurrenceId, assignmentId: a.id, type: 'REVERSAO', revertsExceptionId: e.id, leaveId, notes: 'Cobertura desfeita', before: e.after ?? undefined, after: e.before ?? undefined, createdById: principal.id },
      });
      undone++;
    }
    if (!undone) throw new AppError('Nada para desfazer nas aulas escolhidas.');
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: 'leave.uncovered', entityType: 'leave', entityId: leaveId,
      after: { substituto: sub.name, ausente: leave.teacher.name, aulas: undone },
      summary: `${principal.name} desfez ${undone} cobertura(s) de ${sub.name} nas aulas de ${leave.teacher.name}`,
    });
    return { undone };
  }, { timeout: 120_000, maxWait: 10_000 });
}

/** Coberturas que o professor fez numa competência (para a ficha). */
export async function listCoveredByTeacher(principal: Principal | null, substituteId: string, start: IsoDate, end: IsoDate) {
  assertCan(principal, 'teacher.view');
  const rows = await prisma.classAssignment.findMany({
    where: { executingTeacherId: substituteId, status: 'SUBSTITUIDA', occurrence: { date: { gte: toUtc(start), lte: toUtc(end) } } },
    include: {
      plannedTeacher: { select: { name: true } },
      occurrence: { select: { date: true, startMin: true, durationMin: true, modality: { select: { name: true } } } },
    },
    orderBy: [{ occurrence: { date: 'asc' } }, { occurrence: { startMin: 'asc' } }],
  });
  return rows.map((a) => ({
    assignmentId: a.id, date: fromUtc(a.occurrence.date), start: formatClock(a.occurrence.startMin), end: formatClock(a.occurrence.startMin + a.occurrence.durationMin),
    minutes: a.minutes, modality: a.occurrence.modality.name, absent: a.plannedTeacher?.name ?? '—',
  }));
}
export type CoveredItem = Awaited<ReturnType<typeof listCoveredByTeacher>>[number];
