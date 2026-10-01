import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma, type Tx } from '@/server/db';
import { audit } from '@/server/audit';
import { assertCan } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import type { RequestMeta } from '@/server/auth/session';
import { AppError, NotFoundError } from '@/server/errors';
import { WEEKDAYS, addDays, formatClock, formatDateBR, fromUtc, isIsoDate, toUtc, type IsoDate } from '@/domain/dates';
import {
  COVERAGE_LABEL, LEAVE_LABEL, exceptionTypeOf, isAffectable, leaveEffect, overlaps, revertState,
  type LeaveCoverage, type LeaveType,
} from '@/domain/leave';

/**
 * Ausências lançadas na ficha do professor. Uma ausência vale para as aulas
 * já geradas E para as que forem geradas depois (fillPeriod chama
 * applyLeavesToPeriod). Anular devolve as aulas ao previsto, com registro.
 */

const MAX_DAYS = 400;

export const leaveSchema = z.object({
  type: z.enum(['FERIAS', 'ATESTADO', 'AFASTAMENTO', 'FOLGA', 'FALTA']),
  startDate: z.string().refine(isIsoDate, 'Data inicial inválida.'),
  endDate: z.string().refine(isIsoDate, 'Data final inválida.'),
  coverage: z.enum(['PENDENTE', 'CANCELAR', 'SUBSTITUIR']),
  substituteId: z.string().uuid().nullable().or(z.literal('').transform(() => null)).optional(),
  /** Só esta aula da grade (substituição por aula). */
  slotId: z.string().uuid().nullable().or(z.literal('').transform(() => null)).optional(),
  notes: z.string().trim().max(500).optional().transform((v) => v || null),
});

type LeaveRow = { id: string; teacherId: string; type: LeaveType; coverage: LeaveCoverage; substituteId: string | null; slotId: string | null; startDate: Date; endDate: Date; createdById: string | null };

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
        data: { status: effect.status, executingTeacherId: effect.executingTeacherId, absenceReason: effect.absenceReason },
      });
      await tx.classException.create({
        data: {
          occurrenceId: o.id,
          assignmentId: a.id,
          type: exceptionTypeOf(leave.type, leave.coverage),
          leaveId: leave.id,
          notes: leave.slotId ? `${LEAVE_LABEL[leave.type]} · substituição nesta aula` : `${LEAVE_LABEL[leave.type]} · ${COVERAGE_LABEL[leave.coverage]}`,
          before: { status: a.status, executingTeacherId: a.executingTeacherId, absenceReason: a.absenceReason, occurrenceStatus: o.status, cancellationReasonId: o.cancellationReasonId },
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
  const periodsMissing = !occ.length;
  return {
    count: affected.length,
    minutes: affected.reduce((s, o) => s + o.plannedDurationMin, 0),
    closed: affected.filter((o) => o.period.status === 'FECHADO').length,
    sample: affected.slice(0, 8).map((o) => `${formatDateBR(fromUtc(o.date))} ${formatClock(o.startMin)} ${o.modality.name}`),
    conflicts,
    note: periodsMissing ? 'Nenhuma aula gerada nesse intervalo ainda: a ausência será aplicada quando a competência for gerada.' : null,
  };
}

export async function saveLeave(principal: Principal | null, teacherId: string, input: unknown, meta: RequestMeta) {
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
    const teacher = await assertTeacherInScope(tx, principal, teacherId);
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
      },
    });
    const r = await applyLeave(tx, leave);
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: 'leave.created',
      entityType: 'leave',
      entityId: leave.id,
      after: { professor: teacher.name, tipo: d.type, de: d.startDate, ate: d.endDate, cobertura: d.coverage, substituto: substitute?.name ?? null, aula: slotLabel, aulas_afetadas: r.applied },
      summary: slotLabel
        ? `${principal.name} lançou substituição de ${teacher.name} na aula ${slotLabel} (${formatDateBR(d.startDate)} a ${formatDateBR(d.endDate)}, ${LEAVE_LABEL[d.type].toLowerCase()}): ${substitute!.name}; ${r.applied} aula(s)`
        : `${principal.name} lançou ${LEAVE_LABEL[d.type].toLowerCase()} de ${teacher.name} (${formatDateBR(d.startDate)}${d.endDate !== d.startDate ? ` a ${formatDateBR(d.endDate)}` : ''}) — ${COVERAGE_LABEL[d.coverage].toLowerCase()}${substitute ? `: ${substitute.name}` : ''}; ${r.applied} aula(s) afetada(s)`,
    });
    return { id: leave.id, applied: r.applied, closed: r.closed };
  }, { timeout: 120_000, maxWait: 10_000 });
}

/** Anula a ausência: cada aula volta exatamente ao que era antes (registro de reversão). */
export async function cancelLeave(principal: Principal | null, leaveId: string, meta: RequestMeta) {
  assertCan(principal, 'leave.manage');
  return prisma.$transaction(async (tx) => {
    const leave = await tx.leave.findUnique({ where: { id: leaveId }, include: { teacher: { select: { name: true } } } });
    if (!leave) throw new NotFoundError('Ausência não encontrada.');
    if (leave.cancelledAt) throw new AppError('Esta ausência já foi anulada.');
    await assertTeacherInScope(tx, principal, leave.teacherId);

    const exceptions = await tx.classException.findMany({
      where: { leaveId, type: { not: 'REVERSAO' } },
      include: { occurrence: { select: { id: true, date: true, status: true, period: { select: { status: true } } } } },
    });
    const others = await tx.leave.findMany({ where: { teacherId: leave.teacherId, cancelledAt: null, slotId: null, coverage: 'PENDENTE', id: { not: leaveId } }, select: { startDate: true, endDate: true } });
    const reverted = new Set((await tx.classException.findMany({ where: { revertsExceptionId: { in: exceptions.map((e) => e.id) } }, select: { revertsExceptionId: true } })).map((e) => e.revertsExceptionId));
    let restored = 0;
    let closed = 0;
    for (const e of exceptions) {
      if (reverted.has(e.id) || !e.assignmentId) continue;
      if (e.occurrence.period.status === 'FECHADO') { closed++; continue; }
      const before = (e.before ?? {}) as { status?: string; executingTeacherId?: string | null; absenceReason?: string | null; occurrenceStatus?: string; cancellationReasonId?: string | null };
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
    notes: l.notes, cancelled: Boolean(l.cancelledAt), classes: l._count.exceptions,
    slot: l.slot?.versions[0] ? `${l.slot.versions[0].modality.name} · ${WEEKDAYS[l.slot.versions[0].weekday - 1]!.long} ${formatClock(l.slot.versions[0].startMin)}` : null,
  }));
}
export type LeaveItem = Awaited<ReturnType<typeof listLeaves>>[number];
