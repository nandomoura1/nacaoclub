import { z } from 'zod';
import { prisma } from '@/server/db';
import { audit } from '@/server/audit';
import { assertAreaAccess, assertCan } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import type { RequestMeta } from '@/server/auth/session';
import { AppError, NotFoundError } from '@/server/errors';
import { formatClock, formatDateBR, fromUtc, isIsoDate, parseClock, toUtc, type IsoDate } from '@/domain/dates';
import { periodLabel, periodOf } from '@/domain/period';
import { ensurePeriod, periodStartDay } from './period-service';

/**
 * Horas extras lançadas na ficha do professor: viram uma atividade avulsa
 * (origem EXTRA, sem aula da grade) na competência da data. As horas entram
 * sozinhas como "extra" no quadro de horas, relatórios e ficha — o mesmo
 * caminho das escalas de fim de semana.
 */

const extraSchema = z.object({
  date: z.string().refine(isIsoDate, 'Data inválida.'),
  start: z.string().regex(/^\d{1,2}:\d{2}$/, 'Início inválido.'),
  end: z.string().regex(/^\d{1,2}:\d{2}$/, 'Término inválido.'),
  modalityId: z.string().uuid('Escolha a modalidade.'),
  activityTypeId: z.string().uuid('Escolha o tipo.'),
  description: z.string().trim().min(3, 'Descreva a hora extra (ex.: aula extra de sábado, evento).').max(120),
});

/** Lança uma hora extra para o professor. */
export async function saveExtraHours(principal: Principal | null, teacherId: string, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'occurrence.exception');
  const parsed = extraSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const d = parsed.data;
  const startMin = parseClock(d.start), endMin = parseClock(d.end);
  if (startMin === null || endMin === null || endMin <= startMin) throw new AppError('O término precisa ser depois do início.');
  const dur = endMin - startMin;

  return prisma.$transaction(async (tx) => {
    const [teacher, modality, type] = await Promise.all([
      tx.teacher.findUnique({ where: { id: teacherId }, select: { name: true } }),
      tx.modality.findUnique({ where: { id: d.modalityId }, select: { id: true, name: true, areaId: true } }),
      tx.activityType.findUnique({ where: { id: d.activityTypeId }, select: { id: true, name: true } }),
    ]);
    if (!teacher) throw new NotFoundError('Professor não encontrado.');
    if (!modality || !type) throw new AppError('Modalidade ou tipo inválido.');
    assertAreaAccess(principal, modality.areaId);
    const ref = periodOf(d.date, await periodStartDay(tx));
    const period = await ensurePeriod(tx, ref);
    if (period.status === 'FECHADO') throw new AppError(`A competência ${periodLabel(ref)} está fechada: não dá para lançar hora extra em ${formatDateBR(d.date)}.`);

    const occ = await tx.classOccurrence.create({
      data: {
        periodId: period.id, date: toUtc(d.date), origin: 'EXTRA', slotId: null,
        modalityId: modality.id, activityTypeId: type.id, label: `Hora extra · ${d.description}`,
        startMin, durationMin: dur, plannedStartMin: startMin, plannedDurationMin: dur, status: 'PREVISTA', touched: true,
        assignments: { create: [{ role: 'TITULAR', plannedTeacherId: null, executingTeacherId: teacherId, minutes: dur, status: 'PREVISTA' }] },
      },
    });
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: 'extra.created', entityType: 'class_occurrence', entityId: occ.id,
      after: { professor: teacher.name, data: d.date, inicio: d.start, fim: d.end, modalidade: modality.name, tipo: type.name, descricao: d.description },
      summary: `${principal.name} lançou hora extra de ${teacher.name}: ${formatDateBR(d.date)} ${d.start}–${d.end} (${modality.name}, ${d.description})`,
    });
    return { id: occ.id, minutes: dur };
  });
}

/** Horas extras do professor num intervalo (só as lançadas na ficha; escalas têm a tela delas). */
export async function listExtraHours(principal: Principal | null, teacherId: string, start: IsoDate, end: IsoDate) {
  assertCan(principal, 'teacher.view');
  const rows = await prisma.classOccurrence.findMany({
    where: {
      origin: 'EXTRA', slotId: null, dutyShiftId: null, status: { not: 'CANCELADA' },
      date: { gte: toUtc(start), lte: toUtc(end) },
      assignments: { some: { executingTeacherId: teacherId, plannedTeacherId: null } },
    },
    include: { modality: { select: { name: true } }, activityType: { select: { name: true } }, period: { select: { status: true } } },
    orderBy: [{ date: 'asc' }, { startMin: 'asc' }],
  });
  return rows.map((o) => ({
    id: o.id, date: fromUtc(o.date), start: formatClock(o.startMin), end: formatClock(o.startMin + o.durationMin), minutes: o.durationMin,
    modality: o.modality.name, type: o.activityType.name, description: (o.label ?? '').replace(/^Hora extra · /, ''), closed: o.period.status === 'FECHADO',
  }));
}
export type ExtraHoursItem = Awaited<ReturnType<typeof listExtraHours>>[number];

/** Remove uma hora extra lançada por engano (competência aberta). */
export async function removeExtraHours(principal: Principal | null, occurrenceId: string, meta: RequestMeta) {
  assertCan(principal, 'occurrence.exception');
  await prisma.$transaction(async (tx) => {
    const o = await tx.classOccurrence.findUnique({
      where: { id: occurrenceId },
      include: { modality: { select: { areaId: true, name: true } }, period: { select: { status: true } }, assignments: { include: { executingTeacher: { select: { name: true } } } }, _count: { select: { exceptions: true } } },
    });
    if (!o || o.origin !== 'EXTRA' || o.slotId || o.dutyShiftId) throw new NotFoundError('Hora extra não encontrada.');
    assertAreaAccess(principal, o.modality.areaId);
    if (o.period.status === 'FECHADO') throw new AppError('Competência fechada: esta hora extra não pode mais ser removida.');
    if (o._count.exceptions) throw new AppError('Esta atividade tem alterações registradas no calendário; remova por lá.');
    await tx.classAssignment.deleteMany({ where: { occurrenceId } });
    await tx.classOccurrence.delete({ where: { id: occurrenceId } });
    const who = o.assignments[0]?.executingTeacher?.name ?? '?';
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: 'extra.removed', entityType: 'class_occurrence', entityId: occurrenceId,
      summary: `${principal.name} removeu a hora extra de ${who}: ${formatDateBR(fromUtc(o.date))} ${formatClock(o.startMin)} (${o.modality.name}, ${o.label ?? ''})`,
    });
  });
}
