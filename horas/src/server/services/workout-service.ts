import { z } from 'zod';
import { prisma, type Tx } from '@/server/db';
import { audit } from '@/server/audit';
import { assertAreaAccess, assertCan } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import type { RequestMeta } from '@/server/auth/session';
import { AppError, NotFoundError } from '@/server/errors';
import { addDays, formatDateBR, fromUtc, isIsoDate, toUtc, weekdayOf, type IsoDate } from '@/domain/dates';
import { mondayOf, type BlockKind, type WorkoutWeekData } from '@/domain/workout';

/**
 * Treinos da semana — módulo à parte da grade. Quem lança (admin ou
 * coordenador da área da modalidade) gera a arte e o texto de WhatsApp.
 */

const KINDS = ['MOBILIDADE', 'AQUECIMENTO', 'SKILL', 'CORE', 'FORCA', 'ESPECIFICO', 'WOD', 'FUNDAMENTO', 'JOGO', 'OUTRO'] as const;
const optText = (max: number) => z.string().trim().max(max).nullable().optional().transform((v) => v || null);
const optInt = z.union([z.coerce.number().int().min(1).max(300), z.literal('').transform(() => null), z.null()]).optional().transform((v) => v ?? null);

const blockSchema = z.object({
  kind: z.enum(KINDS),
  title: optText(80),
  durationMin: optInt,
  format: optText(120),
  timeCapMin: optInt,
  content: optText(2000),
  notes: optText(300),
  coachNotes: optText(1000),
});
const saveSchema = z.object({
  footerTitle: optText(60),
  footerText: optText(240),
  footerChips: optText(300),
  days: z.array(z.object({
    date: z.string().refine(isIsoDate, 'Data inválida.'),
    title: optText(40),
    blocks: z.array(blockSchema).max(12, 'Máximo de 12 blocos por dia.'),
  })).max(7),
});

async function modalityInScope(db: Tx, principal: Principal, modalityId: string) {
  const m = await db.modality.findUnique({ where: { id: modalityId }, select: { id: true, name: true, areaId: true } });
  if (!m) throw new NotFoundError('Modalidade não encontrada.');
  assertAreaAccess(principal, m.areaId);
  return m;
}

const weekInclude = {
  modality: { select: { id: true, name: true, areaId: true, color: true } },
  days: { orderBy: { date: 'asc' as const }, include: { blocks: { orderBy: { sortOrder: 'asc' as const } } } },
};

function toData(w: Awaited<ReturnType<typeof loadWeek>>): WorkoutWeekData & { id: string; modalityId: string; updatedAt: string } {
  return {
    id: w.id,
    modalityId: w.modalityId,
    modality: w.modality.name,
    weekStart: fromUtc(w.weekStart),
    footerTitle: w.footerTitle,
    footerText: w.footerText,
    footerChips: w.footerChips,
    updatedAt: w.updatedAt.toISOString(),
    days: w.days.map((d) => ({
      date: fromUtc(d.date),
      title: d.title,
      blocks: d.blocks.map((b) => ({
        kind: b.kind as BlockKind, title: b.title, durationMin: b.durationMin, format: b.format,
        timeCapMin: b.timeCapMin, content: b.content, notes: b.notes, coachNotes: b.coachNotes,
      })),
    })),
  };
}

async function loadWeek(db: Tx, id: string) {
  const w = await db.workoutWeek.findUnique({ where: { id }, include: weekInclude });
  if (!w) throw new NotFoundError('Semana de treinos não encontrada.');
  return w;
}

export type WorkoutWeekView = ReturnType<typeof toData>;

export async function getWeek(principal: Principal | null, id: string): Promise<WorkoutWeekView> {
  assertCan(principal, 'workout.edit');
  const w = await loadWeek(prisma, id);
  assertAreaAccess(principal, w.modality.areaId);
  return toData(w);
}

export async function listWeeks(principal: Principal | null) {
  assertCan(principal, 'workout.edit');
  const rows = await prisma.workoutWeek.findMany({
    where: principal.areaIds === null ? {} : { modality: { areaId: { in: [...principal.areaIds] } } },
    include: { modality: { select: { name: true, color: true } }, days: { select: { _count: { select: { blocks: true } } } } },
    orderBy: [{ weekStart: 'desc' }, { modality: { name: 'asc' } }],
    take: 200,
  });
  return rows.map((w) => ({
    id: w.id, modality: w.modality.name, color: w.modality.color, weekStart: fromUtc(w.weekStart),
    days: w.days.length, blocks: w.days.reduce((s, d) => s + d._count.blocks, 0), updatedAt: w.updatedAt.toISOString(),
  }));
}

/** Nova semana: vazia (seg a sáb) ou copiando a semana anterior da mesma modalidade. */
export async function createWeek(principal: Principal | null, input: { modalityId: string; date: string; copyPrevious?: boolean }, meta: RequestMeta) {
  assertCan(principal, 'workout.edit');
  if (!isIsoDate(input.date)) throw new AppError('Data inválida.');
  const weekStart = mondayOf(input.date);
  return prisma.$transaction(async (tx) => {
    const m = await modalityInScope(tx, principal, input.modalityId);
    const exists = await tx.workoutWeek.findUnique({ where: { modalityId_weekStart: { modalityId: m.id, weekStart: toUtc(weekStart) } } });
    if (exists) return exists.id;
    const prev = input.copyPrevious
      ? await tx.workoutWeek.findFirst({ where: { modalityId: m.id, weekStart: { lt: toUtc(weekStart) } }, orderBy: { weekStart: 'desc' }, include: weekInclude })
      : null;
    const shift = prev ? Math.round((toUtc(weekStart).getTime() - prev.weekStart.getTime()) / 86_400_000) : 0;
    const w = await tx.workoutWeek.create({
      data: {
        modalityId: m.id, weekStart: toUtc(weekStart), createdById: principal.id, updatedById: principal.id,
        footerTitle: prev?.footerTitle ?? null, footerText: prev?.footerText ?? null, footerChips: prev?.footerChips ?? null,
        days: prev
          ? { create: prev.days.map((d) => ({ date: toUtc(addDays(fromUtc(d.date), shift)), title: d.title, blocks: { create: d.blocks.map(({ id: _id, dayId: _d, ...b }) => b) } })) }
          : { create: [0, 1, 2, 3, 4, 5].map((i) => ({ date: toUtc(addDays(weekStart, i)) })) },
      },
    });
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: 'workout.created', entityType: 'workout_week', entityId: w.id,
      summary: `${principal.name} criou o plano de treinos de ${m.name} da semana de ${formatDateBR(weekStart)}${prev ? ` (copiado de ${formatDateBR(fromUtc(prev.weekStart))})` : ''}`,
    });
    return w.id;
  });
}

/** Salva a semana inteira (substitui dias e blocos). */
export async function saveWeek(principal: Principal | null, id: string, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'workout.edit');
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const data = parsed.data;
  return prisma.$transaction(async (tx) => {
    const w = await loadWeek(tx, id);
    assertAreaAccess(principal, w.modality.areaId);
    const start = fromUtc(w.weekStart);
    const end = addDays(start, 6);
    const dates = new Set<string>();
    for (const d of data.days) {
      if (d.date < start || d.date > end) throw new AppError(`O dia ${formatDateBR(d.date)} não é desta semana.`);
      if (dates.has(d.date)) throw new AppError(`O dia ${formatDateBR(d.date)} aparece duas vezes.`);
      dates.add(d.date);
    }
    await tx.workoutDay.deleteMany({ where: { weekId: id } });
    for (const d of [...data.days].sort((a, b) => a.date.localeCompare(b.date))) {
      await tx.workoutDay.create({
        data: { weekId: id, date: toUtc(d.date), title: d.title, blocks: { create: d.blocks.map((b, i) => ({ ...b, sortOrder: i })) } },
      });
    }
    await tx.workoutWeek.update({
      where: { id },
      data: { footerTitle: data.footerTitle, footerText: data.footerText, footerChips: data.footerChips, updatedById: principal.id },
    });
    const blocks = data.days.reduce((s, d) => s + d.blocks.length, 0);
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: 'workout.saved', entityType: 'workout_week', entityId: id,
      after: { dias: data.days.length, blocos: blocks },
      summary: `${principal.name} salvou os treinos de ${w.modality.name} da semana de ${formatDateBR(start)} (${data.days.length} dia(s), ${blocks} bloco(s))`,
    });
  });
}

export async function deleteWeek(principal: Principal | null, id: string, meta: RequestMeta) {
  assertCan(principal, 'workout.edit');
  await prisma.$transaction(async (tx) => {
    const w = await loadWeek(tx, id);
    assertAreaAccess(principal, w.modality.areaId);
    await tx.workoutWeek.delete({ where: { id } });
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: 'workout.deleted', entityType: 'workout_week', entityId: id,
      summary: `${principal.name} excluiu os treinos de ${w.modality.name} da semana de ${formatDateBR(fromUtc(w.weekStart))}`,
    });
  });
}

/** Modalidades que a pessoa pode usar no módulo de treinos. */
export async function workoutModalities(principal: Principal | null) {
  assertCan(principal, 'workout.edit');
  return prisma.modality.findMany({
    where: { active: true, ...(principal.areaIds === null ? {} : { areaId: { in: [...principal.areaIds] } }) },
    orderBy: [{ area: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
    select: { id: true, name: true },
  });
}

export const isMonday = (d: IsoDate) => weekdayOf(d) === 1;

/**
 * Grava um dia vindo da Geração por IA: cria a semana se preciso e troca os
 * blocos do dia. Dia que já tem treino só é substituído com `replace`.
 */
export async function setDayFromAi(
  principal: Principal | null,
  input: { modalityId: string; date: string; title: string | null; blocks: unknown[]; replace?: boolean },
  meta: RequestMeta,
): Promise<{ weekId: string; replaced: boolean }> {
  assertCan(principal, 'workout.edit');
  if (!isIsoDate(input.date)) throw new AppError('Data inválida.');
  const blocks = z.array(blockSchema).min(1).max(12).safeParse(input.blocks);
  if (!blocks.success) throw new AppError(blocks.error.issues[0]?.message ?? 'Blocos inválidos.');
  const weekId = await createWeek(principal, { modalityId: input.modalityId, date: input.date }, meta);
  return prisma.$transaction(async (tx) => {
    const w = await loadWeek(tx, weekId);
    assertAreaAccess(principal, w.modality.areaId);
    const day = w.days.find((d) => fromUtc(d.date) === input.date);
    if (day?.blocks.length && !input.replace) throw new AppError(`${formatDateBR(input.date)} já tem treino lançado. Confirme para substituir.`);
    if (day) await tx.workoutDay.delete({ where: { id: day.id } });
    await tx.workoutDay.create({
      data: { weekId, date: toUtc(input.date), title: input.title?.slice(0, 40) || null, blocks: { create: blocks.data.map((b, i) => ({ ...b, sortOrder: i })) } },
    });
    await tx.workoutWeek.update({ where: { id: weekId }, data: { updatedById: principal.id } });
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: 'workout.ai_day', entityType: 'workout_week', entityId: weekId,
      after: { dia: input.date, blocos: blocks.data.length, substituiu: !!day?.blocks.length },
      summary: `${principal.name} lançou o treino de ${w.modality.name} de ${formatDateBR(input.date)} gerado pela IA${day?.blocks.length ? ' (substituindo o anterior)' : ''}`,
    });
    return { weekId, replaced: !!day?.blocks.length };
  });
}
