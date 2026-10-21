import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '@/server/db';
import { audit } from '@/server/audit';
import { assertAreaAccess, assertCan } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import type { RequestMeta } from '@/server/auth/session';
import { AppError, NotFoundError } from '@/server/errors';
import { addDays, fromUtc, isIsoDate, toUtc, type IsoDate } from '@/domain/dates';
import type { BlockKind, WorkoutBlockData } from '@/domain/workout';
import { screenDate } from '@/domain/workout-tv';
import { getWeek } from './workout-service';

/**
 * Treino na TV do box. Cada tela tem um link secreto (sem login) e mostra
 * sozinha o treino do dia da modalidade — ou o dia que o coach fixou.
 * Só sai a versão do aluno: orientações ao professor nunca vão para a TV.
 */

// Código curto e fácil de digitar no controle da TV (sem 0/o, 1/l/i): ~49 bits.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const newToken = () => [...randomBytes(10)].map((b) => ALPHABET[b % ALPHABET.length]).join('');

export interface TvDay {
  modality: string; color: string | null; date: IsoDate; pinned: boolean; screenName: string | null;
  title: string | null; blocks: WorkoutBlockData[]; theme: string | null; footerTitle: string | null; footerChips: string | null;
  /** Sem treino no dia: o próximo dia com treino lançado. */
  next: IsoDate | null;
}

async function dayOf(modalityId: string, date: IsoDate) {
  return prisma.workoutDay.findFirst({
    where: { date: toUtc(date), week: { modalityId }, blocks: { some: {} } },
    include: { blocks: { orderBy: { sortOrder: 'asc' } }, week: { select: { theme: true, footerTitle: true, footerChips: true } } },
  });
}
const blocksOf = (d: NonNullable<Awaited<ReturnType<typeof dayOf>>>): WorkoutBlockData[] =>
  d.blocks.map((b) => ({ kind: b.kind as BlockKind, title: b.title, durationMin: b.durationMin, format: b.format, timeCapMin: b.timeCapMin, content: b.content, notes: b.notes, coachNotes: null }));

/** Tela pública: o que a TV com este link mostra agora. */
export async function tvByToken(token: string, today: IsoDate): Promise<TvDay | null> {
  if (!/^[a-z0-9]{8,64}$/.test(token)) return null;
  const s = await prisma.tvScreen.findUnique({ where: { token }, include: { modality: { select: { name: true, color: true } } } });
  if (!s || !s.active) return null;
  if (!s.lastSeenAt || Date.now() - s.lastSeenAt.getTime() > 5 * 60_000) {
    await prisma.tvScreen.update({ where: { id: s.id }, data: { lastSeenAt: new Date() } });
  }
  const { date, pinned } = screenDate(s.pinnedDate ? fromUtc(s.pinnedDate) : null, today);
  const d = await dayOf(s.modalityId, date);
  const next = d ? null : await prisma.workoutDay.findFirst({
    where: { date: { gt: toUtc(date), lte: toUtc(addDays(date, 14)) }, week: { modalityId: s.modalityId }, blocks: { some: {} } },
    orderBy: { date: 'asc' }, select: { date: true },
  });
  return {
    modality: s.modality.name, color: s.modality.color, date, pinned, screenName: s.name,
    title: d?.title ?? null, blocks: d ? blocksOf(d) : [], theme: d?.week.theme ?? null, footerTitle: d?.week.footerTitle ?? null, footerChips: d?.week.footerChips ?? null,
    next: next ? fromUtc(next.date) : null,
  };
}

/** Tela com login (notebook/Chromecast): um dia de uma semana. */
export async function tvByWeek(principal: Principal | null, weekId: string, date: IsoDate): Promise<TvDay> {
  const w = await getWeek(principal, weekId);
  const d = w.days.find((x) => x.date === date && x.blocks.length);
  if (!d) throw new NotFoundError('Esse dia não tem treino lançado.');
  const m = await prisma.modality.findUnique({ where: { id: w.modalityId }, select: { color: true } });
  return {
    modality: w.modality, color: m?.color ?? null, date, pinned: false, screenName: null, title: d.title,
    blocks: d.blocks.map((b) => ({ ...b, coachNotes: null })), theme: w.theme ?? null, footerTitle: w.footerTitle, footerChips: w.footerChips, next: null,
  };
}

// ── Cadastro das telas ──────────────────────────────────────

export async function listScreens(principal: Principal | null) {
  assertCan(principal, 'workout.edit');
  const rows = await prisma.tvScreen.findMany({
    where: principal.areaIds === null ? {} : { modality: { areaId: { in: [...principal.areaIds] } } },
    include: { modality: { select: { name: true, color: true } } }, orderBy: [{ modality: { name: 'asc' } }, { name: 'asc' }],
  });
  return rows.map((s) => ({
    id: s.id, name: s.name, modalityId: s.modalityId, modality: s.modality.name, color: s.modality.color, token: s.token, active: s.active,
    pinnedDate: s.pinnedDate ? fromUtc(s.pinnedDate) : null, lastSeenAt: s.lastSeenAt?.toISOString() ?? null,
  }));
}
export type ScreenRow = Awaited<ReturnType<typeof listScreens>>[number];

const schema = z.object({ name: z.string().trim().min(2, 'Dê um nome à tela (ex.: TV do box).').max(60), modalityId: z.string().uuid('Escolha a modalidade.') });

async function screenInScope(principal: Principal, id: string) {
  const s = await prisma.tvScreen.findUnique({ where: { id }, include: { modality: { select: { areaId: true } } } });
  if (!s) throw new NotFoundError('Tela não encontrada.');
  assertAreaAccess(principal, s.modality.areaId);
  return s;
}

export async function saveScreen(principal: Principal | null, id: string | null, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'workout.edit');
  const p = schema.safeParse(input);
  if (!p.success) throw new AppError(p.error.issues[0]?.message ?? 'Dados inválidos.');
  const m = await prisma.modality.findUnique({ where: { id: p.data.modalityId }, select: { id: true, areaId: true, name: true } });
  if (!m) throw new NotFoundError('Modalidade não encontrada.');
  assertAreaAccess(principal, m.areaId);
  if (id) await screenInScope(principal, id);
  return prisma.$transaction(async (tx) => {
    const s = id
      ? await tx.tvScreen.update({ where: { id }, data: p.data })
      : await tx.tvScreen.create({ data: { ...p.data, token: newToken() } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: id ? 'tv.screen_updated' : 'tv.screen_created', entityType: 'tv_screen', entityId: s.id, after: { nome: s.name, modalidade: m.name }, summary: `${principal.name} ${id ? 'alterou' : 'criou'} a tela de TV “${s.name}” (${m.name})` });
    return s.id;
  });
}

/** Fixa um dia na tela (até ele passar) ou volta para "sempre hoje" (null). */
export async function pinScreen(principal: Principal | null, id: string, date: string | null, today: IsoDate, meta: RequestMeta) {
  assertCan(principal, 'workout.edit');
  if (date !== null && (!isIsoDate(date) || date < today)) throw new AppError('Escolha hoje ou um dia à frente.');
  const s = await screenInScope(principal, id);
  await prisma.$transaction(async (tx) => {
    await tx.tvScreen.update({ where: { id }, data: { pinnedDate: date ? toUtc(date) : null } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'tv.screen_pinned', entityType: 'tv_screen', entityId: id, after: { dia: date }, summary: date ? `${principal.name} fixou ${date} na TV “${s.name}”` : `${principal.name} voltou a TV “${s.name}” para o treino de hoje` });
  });
}

/** Novo link (o antigo para de funcionar) — se o link vazou. */
export async function rotateScreenToken(principal: Principal | null, id: string, meta: RequestMeta) {
  assertCan(principal, 'workout.edit');
  const s = await screenInScope(principal, id);
  await prisma.$transaction(async (tx) => {
    await tx.tvScreen.update({ where: { id }, data: { token: newToken() } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'tv.screen_token', entityType: 'tv_screen', entityId: id, summary: `${principal.name} trocou o link da TV “${s.name}”` });
  });
}

export async function deleteScreen(principal: Principal | null, id: string, meta: RequestMeta) {
  assertCan(principal, 'workout.edit');
  const s = await screenInScope(principal, id);
  await prisma.$transaction(async (tx) => {
    await tx.tvScreen.delete({ where: { id } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'tv.screen_deleted', entityType: 'tv_screen', entityId: id, before: { nome: s.name }, summary: `${principal.name} excluiu a tela de TV “${s.name}”` });
  });
}
