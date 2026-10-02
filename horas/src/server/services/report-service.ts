import { z } from 'zod';
import { prisma } from '@/server/db';
import { assertCan, can } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import { AppError } from '@/server/errors';
import { addDays, formatClock, formatDateBR, fromUtc, isIsoDate, toUtc, type IsoDate } from '@/domain/dates';
import { computeLedger, type LedgerOccurrence } from '@/domain/ledger';
import { periodBounds, periodLabel, periodOf, parsePeriodKey, shiftPeriod, type PeriodRef } from '@/domain/period';
import { buildHoursReport } from '@/domain/report';
import { todayIso } from '@/lib/today';
import { doubleDayRule } from './double-hours';
import { periodStartDay } from './period-service';

/**
 * Relatórios de horas por período: competência (26→25) ou intervalo livre,
 * com filtros de área, modalidade e professor — sempre dentro das áreas
 * que a pessoa enxerga.
 */
export const MAX_RANGE_DAYS = 400;
const MAX_DETAIL = 3000;

export interface ReportFilter {
  mode: 'competencia' | 'intervalo';
  period: PeriodRef;
  start: IsoDate;
  end: IsoDate;
  areaId: string | null;
  modalityId: string | null;
  teacherId: string | null;
}

const paramsSchema = z.object({
  modo: z.enum(['competencia', 'intervalo']).optional(),
  competencia: z.string().optional(),
  de: z.string().optional(),
  ate: z.string().optional(),
  area: z.string().uuid().optional().or(z.literal('')),
  modalidade: z.string().uuid().optional().or(z.literal('')),
  professor: z.string().uuid().optional().or(z.literal('')),
});

/** Lê os filtros da URL (tela, impressão e Excel usam os mesmos). */
export async function parseReportFilter(params: Record<string, string | string[] | undefined>): Promise<ReportFilter> {
  const flat = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const p = paramsSchema.safeParse(flat);
  const sp = p.success ? p.data : {};
  const startDay = await periodStartDay();
  const period = parsePeriodKey(sp.competencia) ?? periodOf(todayIso(), startDay);
  const bounds = periodBounds(period.year, period.month, startDay);
  const mode = sp.modo === 'intervalo' ? 'intervalo' : 'competencia';
  let start = bounds.start;
  let end = bounds.end;
  if (mode === 'intervalo') {
    if (sp.de && isIsoDate(sp.de)) start = sp.de;
    if (sp.ate && isIsoDate(sp.ate)) end = sp.ate;
    if (end < start) [start, end] = [end, start];
    if (addDays(start, MAX_RANGE_DAYS) < end) end = addDays(start, MAX_RANGE_DAYS);
  }
  return { mode, period, start, end, areaId: sp.area || null, modalityId: sp.modalidade || null, teacherId: sp.professor || null };
}

export function filterToParams(f: ReportFilter): string {
  const sp = new URLSearchParams();
  if (f.mode === 'intervalo') { sp.set('modo', 'intervalo'); sp.set('de', f.start); sp.set('ate', f.end); }
  else sp.set('competencia', `${f.period.year}-${String(f.period.month).padStart(2, '0')}`);
  if (f.areaId) sp.set('area', f.areaId);
  if (f.modalityId) sp.set('modalidade', f.modalityId);
  if (f.teacherId) sp.set('professor', f.teacherId);
  return sp.toString();
}

/** Competências que cruzam o intervalo e ainda não foram geradas (sem aulas no sistema). */
async function missingPeriods(start: IsoDate, end: IsoDate, startDay: number) {
  const refs: PeriodRef[] = [];
  for (let p = periodOf(start, startDay); periodBounds(p.year, p.month, startDay).start <= end; p = shiftPeriod(p, 1)) refs.push(p);
  const found = await prisma.payrollPeriod.findMany({ where: { OR: refs.map((r) => ({ year: r.year, month: r.month })) }, select: { year: true, month: true, generatedAt: true } });
  const ok = new Set(found.filter((f) => f.generatedAt).map((f) => `${f.year}-${f.month}`));
  return refs.filter((r) => !ok.has(`${r.year}-${r.month}`)).map(periodLabel);
}

export async function hoursReport(principal: Principal | null, filter: ReportFilter) {
  // Perfil Professor: só o próprio extrato (todas as áreas, só as aulas em que ele aparece).
  const own = !!principal && !can(principal, 'payroll.view_hours') && can(principal, 'hours.own');
  if (!own) assertCan(principal, 'payroll.view_hours');
  if (own && !principal!.teacherId) throw new AppError('Seu usuário ainda não está vinculado a um professor. Peça à coordenação para fazer o vínculo em Usuários.');
  const f: ReportFilter = own ? { ...filter, teacherId: principal!.teacherId, areaId: null } : filter;
  principal = principal!;
  const startDay = await periodStartDay();
  const areaScope = own || principal.areaIds === null ? {} : { areaId: { in: [...principal.areaIds] } };
  if (f.areaId && principal.areaIds !== null && !principal.areaIds.includes(f.areaId)) throw new AppError('Você não tem acesso a essa área.', 403);

  const occ = await prisma.classOccurrence.findMany({
    where: {
      date: { gte: toUtc(f.start), lte: toUtc(f.end) },
      modality: { ...areaScope, ...(f.areaId ? { areaId: f.areaId } : {}) },
      ...(f.modalityId ? { modalityId: f.modalityId } : {}),
      ...(own ? { assignments: { some: { OR: [{ plannedTeacherId: f.teacherId }, { executingTeacherId: f.teacherId }] } } } : {}),
    },
    include: {
      activityType: { select: { countsHours: true, name: true } },
      cancellationReason: { select: { countsTeacherHours: true, name: true } },
      modality: { select: { name: true } },
      space: { select: { name: true } },
      holiday: { select: { name: true } },
      assignments: { include: { plannedTeacher: { select: { name: true, displayName: true } }, executingTeacher: { select: { name: true, displayName: true } } } },
    },
    orderBy: [{ date: 'asc' }, { startMin: 'asc' }],
  });

  const doubled = await doubleDayRule(prisma, f.start, f.end);
  const ledgerInput: LedgerOccurrence[] = occ.map((o) => ({
    id: o.id,
    date: fromUtc(o.date),
    doubled: doubled(fromUtc(o.date)),
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

  const [teachers, modalities] = await Promise.all([
    prisma.teacher.findMany({ where: { id: { in: ledger.map((l) => l.teacherId) } }, select: { id: true, name: true } }),
    prisma.modality.findMany({ where: { id: { in: [...new Set(occ.map((o) => o.modalityId))] } }, select: { id: true, name: true, area: { select: { name: true } } } }),
  ]);
  const report = buildHoursReport(ledger, teachers, modalities.map((m) => ({ id: m.id, name: m.name, area: m.area.name })), { teacherId: f.teacherId });

  // Aula a aula: só as que envolvem o professor filtrado (ou todas, até o limite).
  const name = (t: { name: string; displayName: string | null } | null) => (t ? t.displayName || t.name : null);
  const involved = f.teacherId
    ? occ.filter((o) => o.assignments.some((a) => a.plannedTeacherId === f.teacherId || a.executingTeacherId === f.teacherId))
    : occ;
  const detail = involved.slice(0, MAX_DETAIL).map((o) => ({
    date: fromUtc(o.date),
    start: formatClock(o.startMin),
    durationMin: o.durationMin,
    modality: o.modality.name,
    label: o.label,
    type: o.activityType.name,
    countsHours: o.activityType.countsHours,
    space: o.space?.name ?? null,
    status: o.status,
    doubled: doubled(fromUtc(o.date)),
    note: o.cancellationReason?.name ?? o.holiday?.name ?? null,
    people: o.assignments.map((a) => ({
      role: a.role,
      status: a.status,
      plannedId: a.plannedTeacherId,
      executingId: a.executingTeacherId,
      planned: name(a.plannedTeacher),
      executing: name(a.executingTeacher),
      absenceReason: a.absenceReason,
    })),
  }));

  const labels = {
    period: f.mode === 'competencia'
      ? `Competência ${periodLabel(f.period)} (${formatDateBR(f.start)} a ${formatDateBR(f.end)})`
      : `De ${formatDateBR(f.start)} a ${formatDateBR(f.end)}`,
    area: f.areaId ? (await prisma.coordinationArea.findUnique({ where: { id: f.areaId }, select: { name: true } }))?.name ?? null : null,
    modality: f.modalityId ? (await prisma.modality.findUnique({ where: { id: f.modalityId }, select: { name: true } }))?.name ?? null : null,
    teacher: f.teacherId ? (await prisma.teacher.findUnique({ where: { id: f.teacherId }, select: { name: true } }))?.name ?? null : null,
    scope: own ? 'Seu extrato' : principal.areaIds === null ? null : 'Somente as áreas que você coordena',
  };

  return {
    filter: f,
    labels,
    missing: await missingPeriods(f.start, f.end, startDay),
    counts: { aulas: occ.length, detalhe: involved.length, detalheCortado: involved.length > MAX_DETAIL },
    ...report,
    detail,
  };
}

export type HoursReportResult = Awaited<ReturnType<typeof hoursReport>>;
