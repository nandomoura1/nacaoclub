import { z } from 'zod';
import { prisma, type Tx } from '@/server/db';
import { audit } from '@/server/audit';
import { assertAreaAccess, assertCan } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import type { RequestMeta } from '@/server/auth/session';
import { AppError, NotFoundError } from '@/server/errors';
import { addDays, eachDay, formatClock, formatDateBR, fromUtc, isIsoDate, toUtc, weekdayOf, type IsoDate } from '@/domain/dates';
import { dayType, dutyWarnings, type SectorDefaults } from '@/domain/duty';
import { LEAVE_LABEL, type LeaveType } from '@/domain/leave';
import { periodLabel, periodOf } from '@/domain/period';
import { ensurePeriod, periodStartDay } from './period-service';

/**
 * Escalas de fim de semana e feriados. Cada turno com gente vira uma aula
 * "avulsa" (origem EXTRA, tipo Plantão) na competência: as horas entram
 * sozinhas no quadro de horas, relatórios e ficha, como extra de quem trabalhou.
 */

const MAX_RANGE = 45;

const shiftSchema = z.object({
  date: z.string().refine(isIsoDate, 'Data inválida.'),
  startMin: z.coerce.number().int().min(0).max(1439),
  endMin: z.coerce.number().int().min(1).max(1440),
  notes: z.string().trim().max(120).optional().nullable().transform((v) => v || null),
  people: z.array(z.string().uuid()).max(20).refine((p) => new Set(p).size === p.length, 'A mesma pessoa aparece duas vezes no turno.'),
});
const saveSchema = z.object({
  sectorId: z.string().uuid(),
  start: z.string().refine(isIsoDate),
  end: z.string().refine(isIsoDate),
  shifts: z.array(shiftSchema).max(200),
});

function sectorScope(principal: Principal) {
  return principal.areaIds === null ? {} : { modality: { areaId: { in: [...principal.areaIds] } } };
}

function checkRange(start: string, end: string) {
  if (!isIsoDate(start) || !isIsoDate(end) || end < start) throw new AppError('Período inválido.');
  if (addDays(start, MAX_RANGE) < end) throw new AppError(`Período longo demais (máximo ${MAX_RANGE} dias).`);
}

/** Tudo que a tela e o relatório precisam para um período. */
export async function loadDuty(principal: Principal | null, start: IsoDate, end: IsoDate, sectorId?: string | null) {
  assertCan(principal, 'duty.edit');
  checkRange(start, end);
  const [sectors, holidays] = await Promise.all([
    prisma.dutySector.findMany({
      where: { active: true, ...sectorScope(principal), ...(sectorId ? { id: sectorId } : {}) },
      include: {
        modality: { select: { name: true, areaId: true, color: true } },
        shifts: {
          where: { date: { gte: toUtc(start), lte: toUtc(end) } },
          orderBy: [{ date: 'asc' }, { startMin: 'asc' }],
          include: { people: { include: { teacher: { select: { id: true, name: true, displayName: true } } } } },
        },
      },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.holiday.findMany({ where: { date: { gte: toUtc(start), lte: toUtc(end) } } }),
  ]);
  const holidayName = Object.fromEntries(holidays.map((h) => [fromUtc(h.date), h.name]));
  const holidaySet = new Set(Object.keys(holidayName));
  const withShifts = new Set(sectors.flatMap((s) => s.shifts.map((sh) => fromUtc(sh.date))));
  // Dias da escala: sábados, domingos e feriados do período (e qualquer dia que já tenha turno).
  const dates = eachDay(start, end).filter((d) => dayType(d, holidaySet) !== 'SEMANA' || withShifts.has(d));

  const view = sectors.map((s) => ({
    id: s.id,
    name: s.name,
    modality: s.modality.name,
    modalityId: s.modalityId,
    countsHours: s.countsHours,
    color: s.modality.color,
    defaults: s.defaults as SectorDefaults,
    shifts: s.shifts.map((sh) => ({
      id: sh.id, date: fromUtc(sh.date), startMin: sh.startMin, endMin: sh.endMin, notes: sh.notes,
      people: sh.people.map((p) => ({ id: p.teacher.id, name: p.teacher.displayName || p.teacher.name })),
    })),
  }));
  const warnings = await warningsFor(prisma, view.flatMap((s) => s.shifts.map((sh) => ({ ...sh, sector: s.name }))), start, end);
  return { start, end, dates, holidays: holidayName, dayTypes: Object.fromEntries(dates.map((d) => [d, dayType(d, holidaySet)])), sectors: view, warnings };
}

export type DutyView = Awaited<ReturnType<typeof loadDuty>>;

/**
 * Escala da semana (segunda a domingo) de uma data, para a Grade semanal: a
 * grade é o padrão que se repete; a escala é datada e aparece por cima dela.
 */
export async function dutyForWeek(principal: Principal | null, date: IsoDate, areaId?: string | null) {
  assertCan(principal, 'schedule.view');
  const start = addDays(date, 1 - weekdayOf(date));
  const end = addDays(start, 6);
  const [shifts, holidays] = await Promise.all([
    prisma.dutyShift.findMany({
      where: {
        date: { gte: toUtc(start), lte: toUtc(end) },
        sector: { active: true, ...sectorScope(principal), ...(areaId ? { modality: { areaId } } : {}) },
      },
      orderBy: [{ date: 'asc' }, { startMin: 'asc' }],
      include: {
        sector: { select: { name: true, sortOrder: true, modality: { select: { color: true } } } },
        people: { include: { teacher: { select: { id: true, name: true, displayName: true } } } },
      },
    }),
    prisma.holiday.findMany({ where: { date: { gte: toUtc(start), lte: toUtc(end) } } }),
  ]);
  return {
    start, end,
    holidays: Object.fromEntries(holidays.map((h) => [fromUtc(h.date), h.name])) as Record<IsoDate, string>,
    shifts: shifts.map((s) => ({
      id: s.id, date: fromUtc(s.date), weekday: weekdayOf(fromUtc(s.date)), startMin: s.startMin, endMin: s.endMin, notes: s.notes,
      sector: s.sector.name, color: s.sector.modality.color,
      people: s.people.map((p) => ({ id: p.teacher.id, name: p.teacher.displayName || p.teacher.name })),
    })),
  };
}
export type WeekDuty = Awaited<ReturnType<typeof dutyForWeek>>;

async function warningsFor(db: Tx, shifts: Parameters<typeof dutyWarnings>[0], start: IsoDate, end: IsoDate) {
  const ids = [...new Set(shifts.flatMap((s) => s.people.map((p) => p.id)))];
  if (!ids.length) return dutyWarnings(shifts);
  const [busy, leaves] = await Promise.all([
    db.classAssignment.findMany({
      where: {
        executingTeacherId: { in: ids },
        status: { in: ['PREVISTA', 'REALIZADA', 'SUBSTITUIDA'] },
        occurrence: { date: { gte: toUtc(start), lte: toUtc(end) }, dutyShiftId: null, status: { not: 'CANCELADA' }, activityType: { kind: { not: 'PERSONAL' } } },
      },
      include: { occurrence: { select: { date: true, startMin: true, durationMin: true, modality: { select: { name: true } } } } },
    }),
    db.leave.findMany({ where: { teacherId: { in: ids }, cancelledAt: null, startDate: { lte: toUtc(end) }, endDate: { gte: toUtc(start) } } }),
  ]);
  return dutyWarnings(
    shifts,
    busy.map((b) => ({ teacherId: b.executingTeacherId!, date: fromUtc(b.occurrence.date), startMin: b.occurrence.startMin, endMin: b.occurrence.startMin + b.occurrence.durationMin, label: `aula de ${b.occurrence.modality.name}` })),
    leaves.map((l) => ({ teacherId: l.teacherId, start: fromUtc(l.startDate), end: fromUtc(l.endDate), label: LEAVE_LABEL[l.type as LeaveType] })),
  );
}

/** Salva a escala de UM setor no período: substitui os turnos e refaz as horas de plantão. */
export async function saveDuty(principal: Principal | null, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'duty.edit');
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const { sectorId, start, end, shifts } = parsed.data;
  checkRange(start, end);
  for (const s of shifts) {
    if (s.date < start || s.date > end) throw new AppError(`O turno de ${formatDateBR(s.date)} está fora do período.`);
    if (s.endMin <= s.startMin) throw new AppError(`Turno de ${formatDateBR(s.date)}: o término precisa ser depois do início.`);
  }

  return prisma.$transaction(async (tx) => {
    const sector = await tx.dutySector.findUnique({ where: { id: sectorId }, include: { modality: { select: { id: true, areaId: true } } } });
    if (!sector) throw new NotFoundError('Setor não encontrado.');
    assertAreaAccess(principal, sector.modality.areaId);
    const plantao = await tx.activityType.findFirst({ where: { kind: 'PLANTAO' } });
    if (!plantao) throw new AppError('Tipo de atividade "Plantão" não cadastrado.');
    const people = await tx.teacher.findMany({ where: { id: { in: [...new Set(shifts.flatMap((s) => s.people))] } }, select: { id: true, name: true, displayName: true } });
    const nameOf = new Map(people.map((p) => [p.id, p.displayName || p.name]));
    if (people.length !== new Set(shifts.flatMap((s) => s.people)).size) throw new AppError('Uma das pessoas escaladas não existe mais. Recarregue a tela.');

    // Competências fechadas não mudam.
    const startDay = await periodStartDay(tx);
    const periods = new Map<string, Awaited<ReturnType<typeof ensurePeriod>>>();
    const periodFor = async (date: IsoDate) => {
      const ref = periodOf(date, startDay);
      const key = `${ref.year}-${ref.month}`;
      if (!periods.has(key)) periods.set(key, await ensurePeriod(tx, ref));
      const p = periods.get(key)!;
      if (p.status === 'FECHADO') throw new AppError(`A competência ${periodLabel(ref)} está fechada: a escala de ${formatDateBR(date)} não pode mudar.`);
      return p;
    };
    const old = await tx.dutyShift.findMany({ where: { sectorId, date: { gte: toUtc(start), lte: toUtc(end) } }, select: { date: true } });
    for (const o of old) await periodFor(fromUtc(o.date));
    for (const s of shifts) await periodFor(s.date);

    await tx.dutyShift.deleteMany({ where: { sectorId, date: { gte: toUtc(start), lte: toUtc(end) } } }); // horas antigas saem junto (cascade)
    let minutes = 0;
    for (const s of shifts) {
      const shift = await tx.dutyShift.create({
        data: { sectorId, date: toUtc(s.date), startMin: s.startMin, endMin: s.endMin, notes: s.notes, createdById: principal.id, people: { create: s.people.map((teacherId) => ({ teacherId })) } },
      });
      // Setor que não conta hora (Aulões): a escala existe só para organizar e divulgar.
      if (!s.people.length || !sector.countsHours) continue;
      const dur = s.endMin - s.startMin;
      minutes += dur * s.people.length;
      await tx.classOccurrence.create({
        data: {
          periodId: (await periodFor(s.date)).id,
          date: toUtc(s.date), origin: 'EXTRA', slotId: null, dutyShiftId: shift.id,
          modalityId: sector.modality.id, activityTypeId: plantao.id, label: `Escala · ${sector.name}`,
          startMin: s.startMin, durationMin: dur, plannedStartMin: s.startMin, plannedDurationMin: dur,
          status: 'PREVISTA', touched: true,
          assignments: { create: s.people.map((teacherId) => ({ role: 'TITULAR' as const, plannedTeacherId: null, executingTeacherId: teacherId, minutes: dur, status: 'PREVISTA' as const })) },
        },
      });
    }

    const view = shifts.map((s) => ({ ...s, sector: sector.name, people: s.people.map((id) => ({ id, name: nameOf.get(id) ?? '?' })) }));
    // Avisos consideram também os outros setores no mesmo período.
    const others = await tx.dutyShift.findMany({
      where: { sectorId: { not: sectorId }, date: { gte: toUtc(start), lte: toUtc(end) } },
      include: { sector: { select: { name: true } }, people: { include: { teacher: { select: { id: true, name: true, displayName: true } } } } },
    });
    const warnings = await warningsFor(tx, [
      ...view,
      ...others.map((o) => ({ sector: o.sector.name, date: fromUtc(o.date), startMin: o.startMin, endMin: o.endMin, people: o.people.map((p) => ({ id: p.teacher.id, name: p.teacher.displayName || p.teacher.name })) })),
    ], start, end);

    await audit(tx, { actorId: principal.id, ...meta }, {
      action: 'duty.saved', entityType: 'duty_sector', entityId: sectorId,
      after: { setor: sector.name, de: start, ate: end, turnos: shifts.length, horas: minutes / 60 },
      summary: `${principal.name} salvou a escala de ${sector.name} de ${formatDateBR(start)} a ${formatDateBR(end)}: ${shifts.length} turno(s), ${sector.countsHours ? `${formatClock(minutes).replace(':', 'h')} de plantão` : 'sem horas (não remunerado pela Nação)'}`,
    });
    return { shifts: shifts.length, minutes, countsHours: sector.countsHours, warnings: warnings.filter((w) => w.includes(sector.name)) };
  }, { timeout: 120_000, maxWait: 10_000 });
}

/** Pessoas que podem ser escaladas (ativos), com as modalidades para sugerir quem é do setor. */
export async function dutyPeople(principal: Principal | null) {
  assertCan(principal, 'duty.edit');
  const t = await prisma.teacher.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, displayName: true, modalities: { select: { modalityId: true } } } });
  return t.map((x) => ({ id: x.id, name: x.displayName || x.name, fullName: x.name, modalityIds: x.modalities.map((m) => m.modalityId) }));
}

/** Atalhos de período: próximos fins de semana e feriados. */
export async function upcomingRanges(today: IsoDate) {
  const holidays = await prisma.holiday.findMany({ where: { date: { gte: toUtc(today), lte: toUtc(addDays(today, 120)) } }, orderBy: { date: 'asc' }, take: 6 });
  const weekends: { label: string; start: IsoDate; end: IsoDate }[] = [];
  let d = today;
  while (weekends.length < 4) {
    const wd = new Date(`${d}T12:00:00Z`).getUTCDay();
    if (wd === 6) { weekends.push({ label: `Fim de semana ${formatDateBR(d).slice(0, 5)}`, start: d, end: addDays(d, 1) }); d = addDays(d, 7); continue; }
    d = addDays(d, 1);
  }
  return {
    weekends,
    holidays: holidays.map((h) => ({ label: `${h.name} · ${formatDateBR(fromUtc(h.date)).slice(0, 5)}`, start: fromUtc(h.date), end: fromUtc(h.date) })),
  };
}
