import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '@/server/db';
import { audit } from '@/server/audit';
import { assertAreaAccess, assertCan } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import type { RequestMeta } from '@/server/auth/session';
import { AppError, NotFoundError } from '@/server/errors';
import { addDays, formatDateBR, fromUtc, isIsoDate, toUtc, type IsoDate } from '@/domain/dates';
import { periodOf, planFrom, type SimItem } from '@/domain/grade-sim';
import { todayIso } from '@/lib/today';
import { changeSlotTx, createSlotsTx, endSlotTx, listGrade, type GradeItem } from './schedule-service';
import { onScheduleChanged } from './period-service';

/**
 * Simulação de grade: copia a grade valendo numa data para um rascunho, deixa editar
 * à vontade (sem tocar na grade real), compara horas e, se aprovada, implanta a partir de
 * uma data com as mesmas operações da grade — tudo numa transação, com histórico.
 */

type P = Principal;
const MAX_ITEMS = 2000;

const toItem = (g: GradeItem): SimItem => ({
  key: g.slotId, slotId: g.slotId, baseVersionId: g.id, weekday: g.weekday, startMin: g.startMin, durationMin: g.durationMin,
  modalityId: g.modality.id, activityTypeId: g.activityType.id, spaceId: g.space?.id ?? null, label: g.label,
  people: g.people.map((p) => ({ teacherId: p.teacherId, role: p.role as SimItem['people'][number]['role'] })),
});

/** Grade real valendo na data, só nas áreas que a pessoa edita (e na área da simulação, se houver). */
async function editableGrade(principal: P, date: IsoDate, areaId: string | null): Promise<SimItem[]> {
  const rows = await listGrade(principal, date, areaId);
  return rows.filter((r) => principal.areaIds === null || principal.areaIds.includes(r.modality.areaId)).map(toItem);
}

/** Próximo início de competência (dia 26) a partir de hoje — bom padrão para implantar. */
export const nextPeriodStart = (today: IsoDate) => addDays(periodOf(today).end, 1);

export async function listSimulations(principal: P | null) {
  assertCan(principal, 'schedule.edit');
  const rows = await prisma.gradeSimulation.findMany({ orderBy: { createdAt: 'desc' }, take: 60 });
  const users = new Map((await prisma.user.findMany({ where: { id: { in: [...new Set(rows.flatMap((r) => [r.createdById, r.appliedById]).filter((x): x is string => !!x))] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const areas = new Map((await prisma.coordinationArea.findMany({ select: { id: true, name: true } })).map((a) => [a.id, a.name]));
  return rows.map((r) => ({
    id: r.id, name: r.name, status: r.status, area: r.areaId ? areas.get(r.areaId) ?? null : null, baseDate: fromUtc(r.baseDate),
    effectiveFrom: r.effectiveFrom ? fromUtc(r.effectiveFrom) : null, items: (r.items as unknown as SimItem[]).filter((i) => !i.removed).length,
    createdBy: r.createdById ? users.get(r.createdById) ?? null : null, createdAt: r.createdAt.toISOString(),
    appliedAt: r.appliedAt?.toISOString() ?? null, appliedBy: r.appliedById ? users.get(r.appliedById) ?? null : null,
  }));
}

const createSchema = z.object({
  name: z.string().trim().min(3, 'Dê um nome à simulação (ex.: Grade de verão 2027).').max(80),
  areaId: z.string().uuid().nullable(),
  baseDate: z.string().refine(isIsoDate, 'Data inválida.'),
});

export async function createSimulation(principal: P | null, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'schedule.edit');
  const p = createSchema.safeParse(input);
  if (!p.success) throw new AppError(p.error.issues[0]?.message ?? 'Dados inválidos.');
  const d = p.data;
  if (d.areaId) assertAreaAccess(principal, d.areaId);
  const items = await editableGrade(principal, d.baseDate, d.areaId);
  return prisma.$transaction(async (tx) => {
    const s = await tx.gradeSimulation.create({
      data: { name: d.name, areaId: d.areaId, baseDate: toUtc(d.baseDate), effectiveFrom: toUtc(nextPeriodStart(todayIso())), items: items as object[], createdById: principal.id },
    });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'grade.simulation_created', entityType: 'grade_simulation', entityId: s.id, after: { nome: d.name, aulas: items.length }, summary: `${principal.name} criou a simulação de grade "${d.name}" (${items.length} aulas, a partir da grade de ${formatDateBR(d.baseDate)})` });
    return s.id;
  });
}

async function load(principal: P, id: string) {
  const s = await prisma.gradeSimulation.findUnique({ where: { id } });
  if (!s) throw new NotFoundError('Simulação não encontrada.');
  if (s.areaId) assertAreaAccess(principal, s.areaId);
  return s;
}

/** Simulação + a grade real na data de implantação (para comparar horas e montar o plano). */
export async function getSimulation(principal: P | null, id: string) {
  assertCan(principal, 'schedule.edit');
  const s = await load(principal, id);
  const from = s.effectiveFrom ? fromUtc(s.effectiveFrom) : nextPeriodStart(todayIso());
  // Implantada: compara a grade da véspera com a grade real a partir da data (o que de fato mudou).
  const applied = s.status === 'IMPLANTADA';
  const current = await editableGrade(principal, applied ? addDays(from, -1) : from, s.areaId);
  const items = applied ? await editableGrade(principal, from, s.areaId) : (s.items as unknown as SimItem[]);
  return {
    id: s.id, name: s.name, status: s.status, areaId: s.areaId, baseDate: fromUtc(s.baseDate), effectiveFrom: from, notes: s.notes,
    items, current, appliedAt: s.appliedAt?.toISOString() ?? null, appliedSummary: s.appliedSummary as Record<string, number> | null,
  };
}
export type SimulationView = Awaited<ReturnType<typeof getSimulation>>;

const itemSchema = z.object({
  key: z.string().min(1).max(64), slotId: z.string().uuid().nullable(), baseVersionId: z.string().uuid().nullable(),
  weekday: z.number().int().min(1).max(7), startMin: z.number().int().min(0).max(1439), durationMin: z.number().int().min(5).max(600),
  modalityId: z.string().uuid(), activityTypeId: z.string().uuid(), spaceId: z.string().uuid().nullable(), label: z.string().trim().max(60).nullable(),
  people: z.array(z.object({ teacherId: z.string().uuid(), role: z.enum(['TITULAR', 'AUXILIAR', 'ESTAGIARIO']) })).max(10),
  removed: z.boolean().optional(),
});
const saveSchema = z.object({
  name: z.string().trim().min(3).max(80),
  effectiveFrom: z.string().refine(isIsoDate, 'Data inválida.'),
  notes: z.string().trim().max(2000).nullable().optional(),
  items: z.array(itemSchema).max(MAX_ITEMS, 'Simulação grande demais.'),
});

export async function saveSimulation(principal: P | null, id: string, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'schedule.edit');
  const p = saveSchema.safeParse(input);
  if (!p.success) throw new AppError(p.error.issues[0]?.message ?? 'Dados inválidos.');
  const d = p.data;
  const s = await load(principal, id);
  if (s.status !== 'RASCUNHO') throw new AppError('Simulação já implantada ou descartada: crie outra.');
  // Só modalidades das áreas que a pessoa edita (e da área da simulação, se houver).
  const modIds = [...new Set(d.items.map((i) => i.modalityId))];
  const mods = await prisma.modality.findMany({ where: { id: { in: modIds } }, select: { id: true, areaId: true, name: true } });
  for (const m of mods) {
    assertAreaAccess(principal, m.areaId);
    if (s.areaId && m.areaId !== s.areaId) throw new AppError(`${m.name} é de outra área: esta simulação é só de uma área.`);
  }
  if (mods.length !== modIds.length) throw new AppError('Modalidade inexistente na simulação.');
  for (const it of d.items) if (new Set(it.people.map((x) => x.teacherId)).size !== it.people.length) throw new AppError('A mesma pessoa aparece duas vezes numa aula.');
  await prisma.gradeSimulation.update({ where: { id }, data: { name: d.name, effectiveFrom: toUtc(d.effectiveFrom), notes: d.notes || null, items: d.items as object[] } });
  void meta;
}

export async function discardSimulation(principal: P | null, id: string, meta: RequestMeta) {
  assertCan(principal, 'schedule.edit');
  const s = await load(principal, id);
  if (s.status !== 'RASCUNHO') throw new AppError('Só simulação em rascunho pode ser descartada.');
  await prisma.$transaction(async (tx) => {
    await tx.gradeSimulation.update({ where: { id }, data: { status: 'DESCARTADA' } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'grade.simulation_discarded', entityType: 'grade_simulation', entityId: id, summary: `${principal.name} descartou a simulação de grade "${s.name}"` });
  });
}

/**
 * Implanta a simulação a partir de `from`: alterar, encerrar e criar aulas na grade real,
 * numa transação só; realinha as competências abertas; competência fechada bloqueia.
 * Conflitos (aulas mexidas na grade real depois da simulação) exigem `acceptConflicts`.
 */
export async function applySimulation(principal: P | null, id: string, input: { from: string; acceptConflicts?: boolean }, meta: RequestMeta) {
  assertCan(principal, 'schedule.edit');
  const s = await load(principal, id);
  if (s.status !== 'RASCUNHO') throw new AppError('Simulação já implantada ou descartada.');
  const from = input.from;
  if (!isIsoDate(from)) throw new AppError('Data inválida.');
  if (from < todayIso()) throw new AppError('A nova grade vale de hoje em diante: escolha hoje ou uma data futura.');
  const closed = await prisma.payrollPeriod.findFirst({ where: { status: 'FECHADO', endDate: { gte: toUtc(from) } }, orderBy: { endDate: 'desc' }, select: { endDate: true } });
  if (closed) throw new AppError(`Há competência fechada até ${formatDateBR(fromUtc(closed.endDate))}: escolha uma data depois disso.`);

  const items = s.items as unknown as SimItem[];
  const current = await editableGrade(principal, from, s.areaId);
  const plan = planFrom(items, current);
  if (plan.conflicts.length && !input.acceptConflicts) {
    throw new AppError(`${plan.conflicts.length} aula(s) mudaram na grade depois da simulação. Confira a lista e confirme para implantar mesmo assim.`);
  }
  const total = plan.change.length + plan.end.length + plan.create.length;
  if (!total) throw new AppError('A simulação está igual à grade atual: nada para implantar.');
  const note = ` — simulação "${s.name}"`;
  const reason = `Simulação "${s.name}"`;

  return prisma.$transaction(async (tx) => {
    const touched: string[] = [];
    for (const it of plan.change) {
      await changeSlotTx(tx, principal, it.slotId!, {
        weekday: it.weekday, startMin: it.startMin, durationMin: it.durationMin, modalityId: it.modalityId, activityTypeId: it.activityTypeId,
        spaceId: it.spaceId, label: it.label, people: it.people, from, reason,
      }, meta);
      touched.push(it.slotId!);
    }
    for (const it of plan.end) { await endSlotTx(tx, principal, it.slotId!, from, reason, meta); touched.push(it.slotId!); }
    for (const it of plan.create) {
      const ids = await createSlotsTx(tx, principal, {
        weekdays: [it.weekday], startMin: it.startMin, durationMin: it.durationMin, modalityId: it.modalityId, activityTypeId: it.activityTypeId,
        spaceId: it.spaceId, label: it.label, people: it.people, validFrom: from, endMin: null, split: true,
      }, meta, note);
      touched.push(...ids);
    }
    await onScheduleChanged(tx, touched, from);
    const summary = { alteradas: plan.change.length, encerradas: plan.end.length, criadas: plan.create.length, conflitos: plan.conflicts.length };
    await tx.gradeSimulation.update({ where: { id }, data: { status: 'IMPLANTADA', effectiveFrom: toUtc(from), appliedAt: new Date(), appliedById: principal.id, appliedSummary: summary } });
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: 'grade.simulation_applied', entityType: 'grade_simulation', entityId: id, after: { ...summary, a_partir_de: from },
      summary: `${principal.name} implantou a simulação de grade "${s.name}" a partir de ${formatDateBR(from)}: ${summary.alteradas} alterada(s), ${summary.criadas} criada(s), ${summary.encerradas} encerrada(s)`,
    });
    return summary;
  }, { timeout: 300_000, maxWait: 10_000 });
}

/** Chave nova para aula criada na simulação. */
export const newKey = () => `n-${randomUUID()}`;
