import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/server/db';
import { audit } from '@/server/audit';
import { assertCan, can } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import type { RequestMeta } from '@/server/auth/session';
import { AppError, AuthorizationError, NotFoundError } from '@/server/errors';
import { isIsoDate } from '@/domain/dates';
import { isOpen } from '@/domain/processos';
import { focusMessage, isoWeek, MEETING_KINDS, previousWeek, scoreboard, type Scoreboard } from '@/domain/proc-meeting';
import { normalizeDestination } from '@/domain/whatsapp';
import { zapiConfig } from '@/server/whatsapp/zapi';
import { deliverWhatsApp } from '@/server/services/whatsapp-service';
import { canWork, listDemands, type DemandRow } from './proc-service';
import { dt, iso } from './marketing-service';

/**
 * Reunião de líderes: quem conduz (diretoria, proc.admin) abre a semanal ou
 * a daily; os líderes atualizam as próprias demandas durante a reunião.
 * Foco da semana (🎯) e impedimentos ficam na própria demanda e aparecem no Kanban.
 */

const TEST_LIMIT = 3;

export interface MeetingRow { id: string; kind: string; date: string; week: string; status: string; notes: string | null; summary: (Scoreboard & { enviados?: number }) | null; createdBy: string | null }

export async function listProcMeetings(principal: Principal | null): Promise<MeetingRow[]> {
  assertCan(principal, 'proc.view');
  const rows = await prisma.procMeeting.findMany({ orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: 40 });
  const users = new Map((await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.createdById).filter(Boolean) as string[] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return rows.map((r) => ({ id: r.id, kind: r.kind, date: iso(r.date)!, week: r.week, status: r.status, notes: r.notes, summary: r.summary as MeetingRow['summary'], createdBy: r.createdById ? users.get(r.createdById) ?? null : null }));
}

/** Abre a reunião do dia (ou devolve a que já está aberta, do mesmo tipo e data). */
export async function startProcMeeting(principal: Principal | null, kind: string, today: string, meta: RequestMeta) {
  assertCan(principal, 'proc.admin');
  if (!MEETING_KINDS.some((k) => k.id === kind)) throw new AppError('Tipo de reunião inválido.');
  const open = await prisma.procMeeting.findFirst({ where: { kind, date: dt(today)!, status: 'ABERTA' }, select: { id: true } });
  if (open) return open.id;
  return prisma.$transaction(async (tx) => {
    const m = await tx.procMeeting.create({ data: { kind, date: dt(today)!, week: isoWeek(today), createdById: principal.id } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'proc.meeting_started', entityType: 'proc_meeting', entityId: m.id, after: { tipo: kind }, summary: `${principal.name} abriu a ${MEETING_KINDS.find((k) => k.id === kind)!.label.toLowerCase()} de ${today}` });
    return m.id;
  });
}

export interface LeaderLane { id: string | null; name: string; sectors: string[]; demands: DemandRow[] }

/** Tudo da reunião: demandas visíveis, placar (semana atual e foco da anterior) e raias por líder. */
export async function procMeetingView(principal: Principal | null, id: string, today: string) {
  assertCan(principal, 'proc.view');
  const m = await prisma.procMeeting.findUnique({ where: { id } });
  if (!m) throw new NotFoundError('Reunião não encontrada.');
  const day = iso(m.date)!;
  const ref = m.status === 'ABERTA' ? today : day;
  const [demands, sectors] = await Promise.all([
    listDemands(principal, ref, { view: 'todas' }),
    prisma.procSector.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], select: { id: true, name: true, leaderId: true } }),
  ]);
  const recent = demands.filter((d) => isOpen(d.status) || (d.doneAt && d.doneAt.slice(0, 10) >= isoMinus(ref, 14)) || d.focusWeek === m.week || d.focusWeek === previousWeek(ref));
  const lite = recent.map((d) => ({ status: d.status, dueDate: d.dueDate, priority: d.priority, doneAt: d.doneAt, focusWeek: d.focusWeek, blocker: d.blocker, ownerId: d.ownerId }));
  const leaderIds = [...new Set(sectors.map((s) => s.leaderId).filter(Boolean) as string[])];
  const leaders = new Map((await prisma.user.findMany({ where: { id: { in: leaderIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  // Raias: um líder por raia, com as demandas dos setores dele (ou dele como responsável).
  const lanes: LeaderLane[] = leaderIds.map((lid) => {
    const mine = sectors.filter((s) => s.leaderId === lid);
    const ids = new Set(mine.map((s) => s.id));
    return { id: lid, name: leaders.get(lid) ?? '—', sectors: mine.map((s) => s.name), demands: recent.filter((d) => ids.has(d.sectorId) || d.ownerId === lid) };
  }).filter((l) => l.demands.length || can(principal, 'proc.admin'));
  const covered = new Set(lanes.flatMap((l) => l.demands.map((d) => d.id)));
  const orphan = recent.filter((d) => !covered.has(d.id));
  if (orphan.length) lanes.push({ id: null, name: 'Setores sem líder', sectors: [], demands: orphan });
  lanes.sort((a, b) => a.name.localeCompare(b.name));
  return {
    meeting: { id: m.id, kind: m.kind, date: day, week: m.week, status: m.status, notes: m.notes, summary: m.summary as MeetingRow['summary'] },
    demands: recent, lanes, sectors: sectors.map((s) => ({ id: s.id, name: s.name })),
    score: scoreboard(lite, m.week, ref),
    lastWeek: scoreboard(lite, previousWeek(ref), ref),
    canRun: can(principal, 'proc.admin'),
  };
}
export type ProcMeetingView = Awaited<ReturnType<typeof procMeetingView>>;

function isoMinus(date: string, days: number) {
  const t = new Date(`${date}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() - days);
  return t.toISOString().slice(0, 10);
}

async function workable(principal: Principal, id: string) {
  const d = await prisma.procDemand.findUnique({ where: { id }, include: { sector: { select: { name: true } } } });
  if (!d) throw new NotFoundError('Demanda não encontrada.');
  if (!(await canWork(principal, d))) throw new AuthorizationError('Esta demanda não é do seu setor.');
  return d;
}

/** 🎯 liga/desliga o foco da semana na demanda. */
export async function setDemandFocus(principal: Principal | null, id: string, week: string | null, meta: RequestMeta) {
  assertCan(principal, 'proc.view');
  if (week && !/^\d{4}-W\d{2}$/.test(week)) throw new AppError('Semana inválida.');
  const d = await workable(principal, id);
  if (week && !isOpen(d.status)) throw new AppError('Só demandas em aberto entram no foco.');
  await prisma.$transaction(async (tx) => {
    await tx.procDemand.update({ where: { id }, data: { focusWeek: week } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'proc.demand_focus', entityType: 'proc_demand', entityId: id, before: { foco: d.focusWeek }, after: { foco: week }, summary: `${principal.name} ${week ? 'colocou' : 'tirou'} "${d.title}" ${week ? 'no' : 'do'} foco da semana` });
  });
}

/** Impedimento (daily): texto = travada; null = destravada. */
export async function setDemandBlocker(principal: Principal | null, id: string, blocker: string | null, meta: RequestMeta) {
  assertCan(principal, 'proc.view');
  const text = blocker?.trim().slice(0, 300) || null;
  const d = await workable(principal, id);
  await prisma.$transaction(async (tx) => {
    await tx.procDemand.update({ where: { id }, data: { blocker: text } });
    if (text) await tx.procComment.create({ data: { demandId: id, authorId: principal.id, body: `⛔ Impedimento: ${text}` } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'proc.demand_blocker', entityType: 'proc_demand', entityId: id, before: { impedimento: d.blocker }, after: { impedimento: text }, summary: `${principal.name} ${text ? `registrou impedimento em "${d.title}": ${text}` : `destravou "${d.title}"`}` });
  });
}

const quickSchema = z.object({ dueDate: z.string().refine(isIsoDate, 'Prazo inválido.').nullable().optional(), ownerId: z.string().uuid().nullable().optional() });

/** Ajuste rápido na reunião: novo prazo e/ou novo responsável. */
export async function quickUpdateDemand(principal: Principal | null, id: string, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'proc.view');
  const r = quickSchema.safeParse(input);
  if (!r.success) throw new AppError(r.error.issues[0]?.message ?? 'Dados inválidos.');
  const d = await workable(principal, id);
  const data: Prisma.ProcDemandUpdateInput = {};
  if (r.data.dueDate !== undefined) data.dueDate = dt(r.data.dueDate);
  if (r.data.ownerId !== undefined) {
    if (r.data.ownerId && !(await prisma.user.findFirst({ where: { id: r.data.ownerId, active: true }, select: { id: true } }))) throw new AppError('Responsável não encontrado.');
    data.ownerId = r.data.ownerId;
  }
  await prisma.$transaction(async (tx) => {
    const after = await tx.procDemand.update({ where: { id }, data });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'proc.demand_updated', entityType: 'proc_demand', entityId: id, before: { prazo: iso(d.dueDate), responsavel: d.ownerId }, after: { prazo: iso(after.dueDate), responsavel: after.ownerId }, summary: `${principal.name} ajustou "${d.title}" na reunião de líderes` });
  });
}

/** Encerra: grava o placar e, se pedido, manda a cada líder o foco dele pelo WhatsApp. */
export async function closeProcMeeting(principal: Principal | null, id: string, notes: string | null, notify: boolean, today: string, meta: RequestMeta) {
  assertCan(principal, 'proc.admin');
  const view = await procMeetingView(principal, id, today);
  if (view.meeting.status !== 'ABERTA') throw new AppError('Esta reunião já foi encerrada.');
  let enviados = 0;
  const falhas: string[] = [];
  if (notify) {
    const cfg = zapiConfig();
    if (!cfg.configured) throw new AppError('WhatsApp não configurado. Encerre sem enviar.');
    const leaders = await prisma.user.findMany({ where: { id: { in: view.lanes.map((l) => l.id).filter(Boolean) as string[] }, active: true }, select: { id: true, name: true, phone: true, teachers: { select: { teacher: { select: { phone: true } } } } } });
    let sent = 0;
    for (const u of leaders) {
      const phone = u.phone ?? u.teachers.map((t) => t.teacher.phone).find(Boolean) ?? null;
      if (!phone || !normalizeDestination(phone)) { falhas.push(`${u.name} (sem WhatsApp)`); continue; }
      if (cfg.testPhone && sent >= TEST_LIMIT) break;
      const lane = view.lanes.find((l) => l.id === u.id)!;
      const focus = lane.demands.filter((d) => d.focusWeek === view.meeting.week && isOpen(d.status)).map((d) => ({ title: d.title, dueDate: d.dueDate, sector: d.sector }));
      try {
        const r = await deliverWhatsApp({ kind: 'DEMANDAS', to: phone, text: focusMessage(u.name, view.meeting.date, focus, notes), actor: { id: principal.id, name: `${principal.name} (reunião de líderes)` } });
        sent++;
        if (r.error) falhas.push(u.name); else enviados++;
      } catch { falhas.push(u.name); }
    }
  }
  const summary = { ...view.score, enviados, ...(falhas.length ? { falhas } : {}) };
  const claimed = await prisma.procMeeting.updateMany({ where: { id, status: 'ABERTA' }, data: { status: 'ENCERRADA', closedAt: new Date(), notes: notes?.trim().slice(0, 4000) || null, summary: summary as unknown as Prisma.InputJsonValue } });
  if (!claimed.count) throw new AppError('Esta reunião já foi encerrada.');
  await prisma.$transaction(async (tx) => {
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'proc.meeting_closed', entityType: 'proc_meeting', entityId: id, after: summary, summary: `${principal.name} encerrou a reunião de líderes de ${view.meeting.date}${notify ? ` (${enviados} WhatsApp)` : ''}` });
  });
  return { enviados, falhas };
}

export async function saveMeetingNotes(principal: Principal | null, id: string, notes: string) {
  assertCan(principal, 'proc.admin');
  await prisma.procMeeting.update({ where: { id }, data: { notes: notes.slice(0, 4000) } });
}
