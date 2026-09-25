import type { Prisma } from '@prisma/client';
import { prisma, type Tx } from '@/server/db';
import { audit } from '@/server/audit';
import { assertCan } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import type { RequestMeta } from '@/server/auth/session';
import { AppError } from '@/server/errors';
import { formatDateBR, fromUtc, isIsoDate, toUtc, type IsoDate } from '@/domain/dates';
import { expandGrade, type GradeVersion, type HolidayPolicy } from '@/domain/calendar';
import { computeLedger, type LedgerOccurrence } from '@/domain/ledger';
import { periodBounds, periodLabel, periodOf, type PeriodRef } from '@/domain/period';

/**
 * Competência: geração a partir da grade (idempotente), realinhamento quando
 * a grade muda, decisão de feriado e quadro de horas.
 */

export async function periodStartDay(db: Tx = prisma): Promise<number> {
  return (await db.appSettings.findUnique({ where: { id: 1 } }))?.periodStartDay ?? 26;
}

export async function ensurePeriod(tx: Tx, ref: PeriodRef) {
  const found = await tx.payrollPeriod.findUnique({ where: { year_month: { year: ref.year, month: ref.month } } });
  if (found) return found;
  const b = periodBounds(ref.year, ref.month, await periodStartDay(tx));
  return tx.payrollPeriod.create({ data: { year: ref.year, month: ref.month, startDate: toUtc(b.start), endDate: toUtc(b.end) } });
}

type PeriodRow = Awaited<ReturnType<typeof ensurePeriod>>;

async function gradeVersions(tx: Tx, start: IsoDate, end: IsoDate, slotId?: string | null): Promise<GradeVersion[]> {
  const rows = await tx.scheduleSlotVersion.findMany({
    where: {
      ...(slotId ? { slotId } : {}),
      validFrom: { lte: toUtc(end) },
      OR: [{ validTo: null }, { validTo: { gte: toUtc(start) } }],
    },
    include: { teachers: true },
  });
  return rows.map((v) => ({
    id: v.id, slotId: v.slotId, weekday: v.weekday, startMin: v.startMin, durationMin: v.durationMin,
    validFrom: fromUtc(v.validFrom), validTo: v.validTo ? fromUtc(v.validTo) : null,
    modalityId: v.modalityId, activityTypeId: v.activityTypeId, spaceId: v.spaceId, label: v.label,
    people: v.teachers.map((t) => ({ teacherId: t.teacherId, role: t.role })),
  }));
}

async function holidaysIn(tx: Tx, start: IsoDate, end: IsoDate) {
  const rows = await tx.holiday.findMany({ where: { date: { gte: toUtc(start), lte: toUtc(end) } } });
  return rows.map((h) => ({ id: h.id, date: fromUtc(h.date), policy: h.policy as HolidayPolicy }));
}

/**
 * Cria as aulas previstas que faltam no período (a partir de `from`).
 * Idempotente: aula que já existe (slot + data) não é recriada nem alterada.
 */
async function fillPeriod(tx: Tx, period: PeriodRow, opts: { from?: IsoDate; slotId?: string | null } = {}) {
  const start = fromUtc(period.startDate);
  const end = fromUtc(period.endDate);
  const [versions, holidays, holidayReason] = await Promise.all([
    gradeVersions(tx, start, end, opts.slotId),
    holidaysIn(tx, start, end),
    tx.cancellationReason.findFirst({ where: { name: 'Feriado' } }),
  ]);
  const planned = expandGrade({ start, end }, versions, holidays, { slotId: opts.slotId, from: opts.from });

  const existing = new Set(
    (await tx.classOccurrence.findMany({
      where: { periodId: period.id, slotId: { not: null }, ...(opts.slotId ? { slotId: opts.slotId } : {}) },
      select: { slotId: true, date: true },
    })).map((o) => `${o.slotId}|${fromUtc(o.date)}`),
  );

  let created = 0;
  for (const p of planned) {
    if (existing.has(`${p.slotId}|${p.date}`)) continue;
    await tx.classOccurrence.create({
      data: {
        periodId: period.id,
        date: toUtc(p.date),
        origin: 'GRADE',
        slotId: p.slotId,
        slotVersionId: p.slotVersionId,
        modalityId: p.modalityId,
        activityTypeId: p.activityTypeId,
        spaceId: p.spaceId,
        label: p.label,
        startMin: p.startMin,
        durationMin: p.durationMin,
        plannedStartMin: p.startMin,
        plannedDurationMin: p.durationMin,
        status: p.status,
        holidayId: p.holidayId,
        cancellationReasonId: p.cancelledByHoliday ? (holidayReason?.id ?? null) : null,
        assignments: {
          create: p.people.map((person) => ({
            role: person.role,
            plannedTeacherId: person.teacherId,
            executingTeacherId: p.status === 'CANCELADA' ? null : person.teacherId,
            minutes: p.durationMin,
            status: p.status === 'CANCELADA' ? 'CANCELADA' : 'PREVISTA',
          })),
        },
      },
    });
    created++;
  }
  return created;
}

function assertOpen(period: { status: string; year: number; month: number }) {
  if (period.status === 'FECHADO') throw new AppError(`A competência ${periodLabel(period)} está fechada.`);
}

/** GERAR COMPETÊNCIA: todas as aulas previstas do período, a partir da grade vigente. */
export async function generatePeriod(principal: Principal | null, ref: PeriodRef, meta: RequestMeta) {
  assertCan(principal, 'period.generate');
  if (!Number.isInteger(ref.year) || ref.month < 1 || ref.month > 12) throw new AppError('Competência inválida.');

  return prisma.$transaction(async (tx) => {
    const period = await ensurePeriod(tx, ref);
    assertOpen(period);
    const created = await fillPeriod(tx, period);
    await tx.payrollPeriod.update({
      where: { id: period.id },
      data: { generatedAt: period.generatedAt ?? new Date(), generatedById: period.generatedById ?? principal.id },
    });
    const summary = await quickSummary(tx, period.id);
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: period.generatedAt ? 'period.synced' : 'period.generated',
      entityType: 'payroll_period',
      entityId: period.id,
      after: { competencia: periodLabel(ref), novas_aulas: created, ...summary },
      summary: `${principal.name} ${period.generatedAt ? 'sincronizou' : 'gerou'} a competência ${periodLabel(ref)} (${formatDateBR(fromUtc(period.startDate))} a ${formatDateBR(fromUtc(period.endDate))}): ${created} aula(s) nova(s), ${summary.aulas} no total`,
    });
    return { periodId: period.id, created, ...summary };
  }, { timeout: 120_000, maxWait: 10_000 });
}

async function quickSummary(tx: Tx, periodId: string) {
  const [aulas, aguardando, canceladas, pessoas] = await Promise.all([
    tx.classOccurrence.count({ where: { periodId } }),
    tx.classOccurrence.count({ where: { periodId, status: 'AGUARDANDO_DECISAO_FERIADO' } }),
    tx.classOccurrence.count({ where: { periodId, status: 'CANCELADA' } }),
    tx.classAssignment.findMany({ where: { occurrence: { periodId } }, distinct: ['plannedTeacherId'], select: { plannedTeacherId: true } }),
  ]);
  return { aulas, aguardando, canceladas, professores: pessoas.filter((p) => p.plannedTeacherId).length };
}

/**
 * A grade mudou (aula criada, alterada, encerrada ou importada) a partir de
 * `from`. Nas competências já geradas e abertas: aulas em que ninguém mexeu
 * são refeitas pela grade nova; aulas com exceção ficam para revisão humana.
 */
export async function onScheduleChanged(tx: Tx, slotId: string | null, from: IsoDate, _opts: { ending?: boolean } = {}): Promise<void> {
  const periods = await tx.payrollPeriod.findMany({
    where: { generatedAt: { not: null }, status: { not: 'FECHADO' }, endDate: { gte: toUtc(from) } },
  });
  for (const period of periods) {
    const scope: Prisma.ClassOccurrenceWhereInput = {
      periodId: period.id,
      origin: 'GRADE',
      date: { gte: toUtc(from) },
      ...(slotId ? { slotId } : {}),
    };
    await tx.classOccurrence.deleteMany({ where: { ...scope, touched: false } });
    await tx.classOccurrence.updateMany({ where: { ...scope, touched: true }, data: { needsReview: true } });
    await fillPeriod(tx, period, { from, slotId });
  }
}

/** A política de um feriado mudou: refaz as aulas intocadas daquele dia. */
export async function onHolidayChanged(tx: Tx, date: IsoDate): Promise<void> {
  const periods = await tx.payrollPeriod.findMany({
    where: { generatedAt: { not: null }, status: { not: 'FECHADO' }, startDate: { lte: toUtc(date) }, endDate: { gte: toUtc(date) } },
  });
  for (const period of periods) {
    await tx.classOccurrence.deleteMany({ where: { periodId: period.id, origin: 'GRADE', date: toUtc(date), touched: false } });
    await fillPeriod(tx, period, { from: date });
  }
}

/** Decide em lote as aulas de um feriado que aguardam decisão (na área do usuário). */
export async function decideHoliday(
  principal: Principal | null,
  date: string,
  decision: 'MANTER' | 'CANCELAR',
  areaId: string | null,
  meta: RequestMeta,
) {
  assertCan(principal, 'occurrence.exception');
  if (!isIsoDate(date)) throw new AppError('Data inválida.');
  if (areaId && principal.areaIds !== null && !principal.areaIds.includes(areaId)) throw new AppError('Esta área não está sob a sua coordenação.', 403);

  return prisma.$transaction(async (tx) => {
    const areaFilter = areaId ? { areaId } : principal.areaIds === null ? {} : { areaId: { in: [...principal.areaIds] } };
    const pending = await tx.classOccurrence.findMany({
      where: { date: toUtc(date), status: 'AGUARDANDO_DECISAO_FERIADO', modality: areaFilter, period: { status: { not: 'FECHADO' } } },
      include: { holiday: true, modality: { select: { name: true } } },
    });
    if (!pending.length) throw new AppError('Não há aulas aguardando decisão neste dia.');
    const reason = await tx.cancellationReason.findFirst({ where: { name: 'Feriado' } });

    for (const o of pending) {
      const cancel = decision === 'CANCELAR';
      await tx.classOccurrence.update({
        where: { id: o.id },
        data: { status: cancel ? 'CANCELADA' : 'PREVISTA', cancellationReasonId: cancel ? (reason?.id ?? null) : null, touched: true },
      });
      await tx.classAssignment.updateMany({
        where: { occurrenceId: o.id },
        data: cancel ? { status: 'CANCELADA', executingTeacherId: null } : { status: 'PREVISTA' },
      });
      if (!cancel) {
        // Manter: quem estava previsto é quem dá a aula.
        const assignments = await tx.classAssignment.findMany({ where: { occurrenceId: o.id } });
        for (const a of assignments) await tx.classAssignment.update({ where: { id: a.id }, data: { executingTeacherId: a.plannedTeacherId } });
      }
      await tx.classException.create({
        data: {
          occurrenceId: o.id,
          type: 'DECISAO_FERIADO',
          cancellationReasonId: cancel ? (reason?.id ?? null) : null,
          notes: `${o.holiday?.name ?? 'Feriado'}: ${cancel ? 'aula cancelada' : 'aula mantida'}`,
          before: { status: 'AGUARDANDO_DECISAO_FERIADO' },
          after: { status: cancel ? 'CANCELADA' : 'PREVISTA' },
          createdById: principal.id,
        },
      });
    }
    const holidayName = pending[0]!.holiday?.name ?? 'feriado';
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: 'holiday.decided',
      entityType: 'class_occurrence',
      after: { data: date, decisao: decision, aulas: pending.length },
      summary: `${principal.name} ${decision === 'CANCELAR' ? 'cancelou' : 'manteve'} ${pending.length} aula(s) de ${formatDateBR(date)} (${holidayName}): ${[...new Set(pending.map((p) => p.modality.name))].join(', ')}`,
    });
    return pending.length;
  });
}

const occurrenceInclude = {
  modality: { select: { id: true, name: true, color: true, areaId: true } },
  activityType: { select: { id: true, name: true, kind: true, countsHours: true } },
  space: { select: { name: true } },
  holiday: { select: { name: true } },
  cancellationReason: { select: { name: true, countsTeacherHours: true } },
  assignments: {
    include: {
      plannedTeacher: { select: { id: true, name: true, displayName: true } },
      executingTeacher: { select: { id: true, name: true, displayName: true } },
    },
  },
} satisfies Prisma.ClassOccurrenceInclude;

/** Aulas de um intervalo, escopadas pelas áreas do usuário. */
export async function listOccurrences(
  principal: Principal | null,
  filter: { start: IsoDate; end: IsoDate; areaId?: string | null; modalityId?: string | null; teacherId?: string | null },
) {
  assertCan(principal, 'schedule.view');
  const areaScope = principal.areaIds === null ? {} : { areaId: { in: [...principal.areaIds] } };
  const rows = await prisma.classOccurrence.findMany({
    where: {
      date: { gte: toUtc(filter.start), lte: toUtc(filter.end) },
      modality: { ...areaScope, ...(filter.areaId ? { areaId: filter.areaId } : {}) },
      ...(filter.modalityId ? { modalityId: filter.modalityId } : {}),
      ...(filter.teacherId
        ? { assignments: { some: { OR: [{ plannedTeacherId: filter.teacherId }, { executingTeacherId: filter.teacherId }] } } }
        : {}),
    },
    include: occurrenceInclude,
    orderBy: [{ date: 'asc' }, { startMin: 'asc' }],
  });
  return rows.map((o) => ({
    id: o.id,
    date: fromUtc(o.date),
    origin: o.origin,
    startMin: o.startMin,
    durationMin: o.durationMin,
    status: o.status,
    label: o.label,
    needsReview: o.needsReview,
    modality: o.modality,
    activityType: o.activityType,
    space: o.space?.name ?? null,
    holiday: o.holiday?.name ?? null,
    cancellationReason: o.cancellationReason?.name ?? null,
    people: o.assignments.map((a) => ({
      role: a.role,
      status: a.status,
      planned: a.plannedTeacher ? a.plannedTeacher.displayName || a.plannedTeacher.name : null,
      executing: a.executingTeacher ? a.executingTeacher.displayName || a.executingTeacher.name : null,
    })),
  }));
}

export type OccurrenceItem = Awaited<ReturnType<typeof listOccurrences>>[number];

/** Competência + quadro de horas por professor (escopado). */
export async function periodOverview(principal: Principal | null, ref: PeriodRef, areaId?: string | null) {
  assertCan(principal, 'schedule.view');
  const startDay = await periodStartDay();
  const bounds = periodBounds(ref.year, ref.month, startDay);
  const period = await prisma.payrollPeriod.findUnique({ where: { year_month: { year: ref.year, month: ref.month } } });

  const areaScope = principal.areaIds === null ? {} : { areaId: { in: [...principal.areaIds] } };
  const occ = period
    ? await prisma.classOccurrence.findMany({
        where: { periodId: period.id, modality: { ...areaScope, ...(areaId ? { areaId } : {}) } },
        include: { activityType: { select: { countsHours: true } }, cancellationReason: { select: { countsTeacherHours: true } }, assignments: true },
      })
    : [];

  const ledgerInput: LedgerOccurrence[] = occ.map((o) => ({
    id: o.id,
    date: fromUtc(o.date),
    modalityId: o.modalityId,
    status: o.status,
    plannedDurationMin: o.plannedDurationMin,
    durationMin: o.durationMin,
    countsHours: o.activityType.countsHours,
    cancellationCountsHours: o.cancellationReason?.countsTeacherHours ?? false,
    assignments: o.assignments.map((a) => ({
      plannedTeacherId: a.plannedTeacherId, executingTeacherId: a.executingTeacherId, status: a.status, minutes: a.minutes, absenceReason: a.absenceReason,
    })),
  }));
  const ledger = computeLedger(ledgerInput);
  const teachers = await prisma.teacher.findMany({ where: { id: { in: ledger.map((l) => l.teacherId) } }, select: { id: true, name: true, displayName: true } });
  const nameOf = new Map(teachers.map((t) => [t.id, t.displayName || t.name]));

  const pendingByDate = new Map<string, number>();
  for (const o of occ) if (o.status === 'AGUARDANDO_DECISAO_FERIADO') pendingByDate.set(fromUtc(o.date), (pendingByDate.get(fromUtc(o.date)) ?? 0) + 1);
  const holidays = await prisma.holiday.findMany({ where: { date: { in: [...pendingByDate.keys()].map(toUtc) } } });

  return {
    ref,
    label: periodLabel(ref),
    start: bounds.start,
    end: bounds.end,
    period: period ? { id: period.id, status: period.status, generatedAt: period.generatedAt?.toISOString() ?? null } : null,
    counts: {
      aulas: occ.length,
      canceladas: occ.filter((o) => o.status === 'CANCELADA').length,
      aguardando: occ.filter((o) => o.status === 'AGUARDANDO_DECISAO_FERIADO').length,
      revisar: occ.filter((o) => o.needsReview).length,
      horasAula: occ.filter((o) => o.activityType.countsHours && o.status !== 'CANCELADA').reduce((s, o) => s + o.durationMin, 0),
    },
    pendingHolidays: holidays.map((h) => ({ date: fromUtc(h.date), name: h.name, count: pendingByDate.get(fromUtc(h.date)) ?? 0 })),
    teachers: ledger
      .map((l) => ({ ...l, name: nameOf.get(l.teacherId) ?? '?' }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export function currentPeriodRef(today: IsoDate, startDay: number): PeriodRef {
  return periodOf(today, startDay);
}
