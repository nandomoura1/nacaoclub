import { z } from 'zod';
import type { MktCampaign, MktTask } from '@prisma/client';
import { prisma, type Tx } from '@/server/db';
import { audit } from '@/server/audit';
import { assertCan } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import type { RequestMeta } from '@/server/auth/session';
import { AppError, NotFoundError } from '@/server/errors';
import { addDays, isIsoDate } from '@/domain/dates';
import {
  APPROVAL_STATUSES, CALENDAR_KINDS, CAMPAIGN_STATUSES, CAMPAIGN_TYPES, CHANNELS, CONVERSION_CHANNELS, EVENT_STATUSES, isDone, labelOf,
  type AreaKey, type CampaignStatus, type TaskColumn,
} from '@/domain/marketing/constants';
import type { BoardColumn } from '@/domain/marketing/board';
import { commercialGate, milestoneAlerts, readiness, type CampaignFacts, type TaskFacts } from '@/domain/marketing/readiness';
import { attention, type AgendaCampaign, type AgendaTask } from '@/domain/marketing/agenda';
import { mondayOf, moveRange, type CalEntry } from '@/domain/marketing/calendar';

/**
 * Marketing Nação — campanhas, eventos, calendário e Command Center.
 * Regras (readiness, trava comercial, antecedência) vêm do domínio puro;
 * aqui ficam permissão, transação e auditoria.
 */

export const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
export const dt = (s: string | null | undefined) => (s ? new Date(`${s}T00:00:00Z`) : null);
const text = (max: number) => z.string().trim().max(max).transform((v) => v || null).nullable().optional().transform((v) => v ?? null);
const uuidOrNull = z.string().uuid().or(z.literal('')).nullable().optional().transform((v) => v || null);
const isoDate = (msg: string) => z.string().refine(isIsoDate, msg);
const optIso = z.string().refine((v) => v === '' || isIsoDate(v), 'Data inválida.').nullable().optional().transform((v) => v || null);
const parse = <T,>(schema: z.ZodType<T>, input: unknown): T => {
  const p = schema.safeParse(input);
  if (!p.success) throw new AppError(p.error.issues[0]?.message ?? 'Dados inválidos.');
  return p.data;
};

// ── Pessoas, áreas, modalidades ─────────────────────────────

/** Quem pode ser responsável: usuários ativos com acesso ao Marketing. */
export async function marketingPeople(db: Tx = prisma) {
  return db.user.findMany({
    where: { active: true, roles: { some: { role: { permissions: { some: { permission: { key: 'mkt.view' } } } } } } },
    select: { id: true, name: true }, orderBy: { name: 'asc' },
  });
}
/** Colunas do Kanban, na ordem do quadro. */
export async function listColumns(db: Tx = prisma): Promise<BoardColumn[]> {
  const rows = await db.mktBoardColumn.findMany({ orderBy: [{ position: 'asc' }, { name: 'asc' }] });
  return rows.map((c) => ({ id: c.id, name: c.name, color: c.color, stage: c.stage as TaskColumn, position: c.position }));
}

export async function listAreas(db: Tx = prisma) {
  return db.mktArea.findMany({ orderBy: { sortOrder: 'asc' } });
}
export async function listModalities() {
  return prisma.modality.findMany({ select: { id: true, name: true, color: true }, orderBy: { name: 'asc' } });
}

/** Responsável padrão da área + corresponsáveis (entram nas tarefas novas da área). */
export async function saveAreaOwners(principal: Principal | null, areaId: string, userId: string | null, coOwnerIds: string[], meta: RequestMeta) {
  assertCan(principal, 'mkt.admin');
  const co = [...new Set(coOwnerIds)].filter((u) => u !== userId).slice(0, 10);
  if (co.some((u) => !/^[0-9a-f-]{36}$/i.test(u)) || (userId && !/^[0-9a-f-]{36}$/i.test(userId))) throw new AppError('Pessoa inválida.');
  await prisma.$transaction(async (tx) => {
    const a = await tx.mktArea.findUnique({ where: { id: areaId } });
    if (!a) throw new NotFoundError('Área não encontrada.');
    await tx.mktArea.update({ where: { id: areaId }, data: { defaultUserId: userId, coOwnerIds: co } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'mkt.area_owner', entityType: 'mkt_area', entityId: areaId, before: { responsavel: a.defaultUserId, corresponsaveis: a.coOwnerIds }, after: { responsavel: userId, corresponsaveis: co }, summary: `${principal.name} definiu os responsáveis padrão de ${a.name}` });
  });
}

// ── Fatos para o domínio ─────────────────────────────────────

export const campaignFacts = (c: MktCampaign): CampaignFacts => ({
  type: c.type, status: c.status, objective: c.objective, audience: c.audience, offer: c.offer, message: c.message, cta: c.cta,
  channels: c.channels, conversionChannel: c.conversionChannel, conversionUrl: c.conversionUrl, leadOwnerId: c.leadOwnerId,
  measurement: c.measurement, ownerId: c.ownerId, startDate: iso(c.startDate)!, endDate: iso(c.endDate),
});
export const taskFacts = (t: MktTask & { area?: { key: string } | null }): TaskFacts => ({
  area: (t.area?.key ?? null) as AreaKey | null, column: t.column, dueDate: iso(t.dueDate), title: t.title, milestone: t.milestone,
});

// ── Campanhas ────────────────────────────────────────────────

const TYPE_IDS = CAMPAIGN_TYPES.map((t) => t.id) as [string, ...string[]];
const STATUS_IDS = CAMPAIGN_STATUSES.map((s) => s.id) as [string, ...string[]];
const CHANNEL_KEYS = CHANNELS.map((c) => c.key) as string[];

const campaignSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome da campanha.').max(140),
  type: z.enum(TYPE_IDS),
  objective: text(600), audience: text(400), product: text(200), offer: text(400), message: text(600), cta: text(200),
  channels: z.array(z.string()).default([]).refine((a) => a.every((k) => CHANNEL_KEYS.includes(k)), 'Canal inválido.'),
  conversionChannel: z.string().nullable().optional().transform((v) => v || null).refine((v) => !v || CONVERSION_CHANNELS.some((c) => c.key === v), 'Canal de conversão inválido.'),
  conversionUrl: text(500).refine((v) => !v || /^https?:\/\/\S+$/i.test(v) || /^wa\.me\//i.test(v), 'Link de conversão inválido (use http(s)://…).'),
  leadOwnerId: uuidOrNull, measurement: text(300), goal: text(300), kpis: text(400),
  startDate: isoDate('Informe a data de início.'), endDate: optIso,
  budgetCents: z.number().int().min(0).max(1_000_000_000).nullable().optional().transform((v) => v ?? null),
  ownerId: uuidOrNull, participantIds: z.array(z.string().uuid()).max(20).default([]),
  modalityId: uuidOrNull, eventId: uuidOrNull, details: text(4000), notes: text(2000),
  status: z.enum(STATUS_IDS).optional(),
}).refine((c) => !c.endDate || c.endDate >= c.startDate, 'A data final é anterior à inicial.');
export type CampaignInput = z.input<typeof campaignSchema>;

export async function saveCampaign(principal: Principal | null, id: string | null, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'mkt.edit');
  const { status, ...d } = parse(campaignSchema, input);
  return prisma.$transaction(async (tx) => {
    const data = { ...d, type: d.type as MktCampaign['type'], startDate: dt(d.startDate)!, endDate: dt(d.endDate) };
    if (!id) {
      const initial = (status ?? 'PLANEJAMENTO') as CampaignStatus;
      if (APPROVAL_STATUSES.includes(initial)) throw new AppError('Crie a campanha e depois aprove (programar/ativar).');
      const c = await tx.mktCampaign.create({ data: { ...data, status: initial, createdById: principal.id } });
      await audit(tx, { actorId: principal.id, ...meta }, { action: 'mkt.campaign_created', entityType: 'mkt_campaign', entityId: c.id, after: { nome: c.name, tipo: c.type, inicio: d.startDate }, summary: `${principal.name} criou a campanha ${c.name}` });
      return c.id;
    }
    const before = await tx.mktCampaign.findUnique({ where: { id } });
    if (!before) throw new NotFoundError('Campanha não encontrada.');
    const c = await tx.mktCampaign.update({ where: { id }, data });
    // Campanha já ativa não pode perder o que a trava exige.
    if (c.status === 'ATIVA') {
      const miss = commercialGate(campaignFacts(c));
      if (miss.length) throw new AppError(`Campanha ativa precisa manter: ${miss.join(', ')}.`);
    }
    const changed = Object.keys(data).filter((k) => JSON.stringify((before as Record<string, unknown>)[k] ?? null) !== JSON.stringify((c as Record<string, unknown>)[k] ?? null));
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'mkt.campaign_updated', entityType: 'mkt_campaign', entityId: id, after: { campos: changed }, summary: `${principal.name} editou a campanha ${c.name}${changed.length ? ` (${changed.join(', ')})` : ''}` });
    return id;
  });
}

/** Mudança de status: programar/ativar exige aprovação; ativar exige a trava comercial completa. */
export async function setCampaignStatus(principal: Principal | null, id: string, status: string, meta: RequestMeta) {
  assertCan(principal, 'mkt.edit');
  const st = parse(z.enum(STATUS_IDS), status) as CampaignStatus;
  if (APPROVAL_STATUSES.includes(st)) assertCan(principal, 'mkt.approve');
  await prisma.$transaction(async (tx) => {
    const c = await tx.mktCampaign.findUnique({ where: { id } });
    if (!c) throw new NotFoundError('Campanha não encontrada.');
    if (st === 'ATIVA') {
      const miss = commercialGate(campaignFacts(c));
      if (miss.length) throw new AppError(`Antes de ativar, defina: ${miss.join(', ')}.`);
    }
    await tx.mktCampaign.update({ where: { id }, data: { status: st } });
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: APPROVAL_STATUSES.includes(st) ? 'mkt.campaign_approved' : 'mkt.campaign_status', entityType: 'mkt_campaign', entityId: id,
      before: { status: c.status }, after: { status: st },
      summary: `${principal.name} mudou ${c.name}: ${labelOf(CAMPAIGN_STATUSES, c.status)} → ${labelOf(CAMPAIGN_STATUSES, st)}`,
    });
  });
}

export async function deleteCampaign(principal: Principal | null, id: string, meta: RequestMeta) {
  assertCan(principal, 'mkt.approve');
  await prisma.$transaction(async (tx) => {
    const c = await tx.mktCampaign.findUnique({ where: { id }, include: { _count: { select: { tasks: true } } } });
    if (!c) throw new NotFoundError('Campanha não encontrada.');
    if (['ATIVA', 'FINALIZADA', 'ANALISE'].includes(c.status)) throw new AppError('Campanha ativa ou concluída não pode ser excluída (fica no histórico).');
    await tx.mktCampaign.delete({ where: { id } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'mkt.campaign_deleted', entityType: 'mkt_campaign', entityId: id, before: { nome: c.name, tarefas: c._count.tasks }, summary: `${principal.name} excluiu a campanha ${c.name} (${c._count.tasks} tarefa(s))` });
  });
}

async function nameMap(ids: (string | null | undefined)[]) {
  const list = [...new Set(ids.filter((x): x is string => !!x))];
  if (!list.length) return new Map<string, string>();
  return new Map((await prisma.user.findMany({ where: { id: { in: list } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
}

export async function listCampaigns(principal: Principal | null, today: string) {
  assertCan(principal, 'mkt.view');
  const rows = await prisma.mktCampaign.findMany({ orderBy: [{ startDate: 'asc' }], include: { tasks: { include: { area: { select: { key: true } } } }, event: { select: { name: true } } } });
  const names = await nameMap(rows.map((r) => r.ownerId));
  return rows.map((c) => {
    const facts = campaignFacts(c);
    const tasks = c.tasks.map(taskFacts);
    const r = readiness(facts, tasks, today);
    return {
      id: c.id, name: c.name, type: c.type, status: c.status, startDate: facts.startDate, endDate: facts.endDate, owner: c.ownerId ? names.get(c.ownerId) ?? null : null,
      event: c.event?.name ?? null, readiness: r.score, missing: r.missing.map((m) => m.label),
      tasks: { total: tasks.length, done: tasks.filter((t) => isDone(t.column)).length, late: tasks.filter((t) => t.dueDate && t.dueDate < today && !isDone(t.column)).length },
      alerts: milestoneAlerts(facts, tasks, today).alerts.length,
    };
  });
}
export type CampaignRow = Awaited<ReturnType<typeof listCampaigns>>[number];

export async function getCampaign(principal: Principal | null, id: string, today: string) {
  assertCan(principal, 'mkt.view');
  const c = await prisma.mktCampaign.findUnique({
    where: { id },
    include: {
      event: true,
      tasks: { include: { area: true, boardColumn: { select: { name: true } }, checklist: { select: { done: true } } }, orderBy: [{ dueDate: 'asc' }, { position: 'asc' }] },
      suggestions: { where: { kind: 'TAREFAS_CAMPANHA' }, orderBy: { createdAt: 'desc' }, take: 5 },
    },
  });
  if (!c) throw new NotFoundError('Campanha não encontrada.');
  const facts = campaignFacts(c);
  const tasks = c.tasks.map(taskFacts);
  const [history, comments] = await Promise.all([
    prisma.auditLog.findMany({ where: { entityType: 'mkt_campaign', entityId: id }, orderBy: { at: 'desc' }, take: 40, select: { at: true, summary: true } }),
    prisma.mktComment.findMany({ where: { entityType: 'campaign', entityId: id }, orderBy: { createdAt: 'asc' } }),
  ]);
  const names = await nameMap([c.ownerId, c.leadOwnerId, ...c.participantIds, ...c.tasks.map((t) => t.assigneeId), ...comments.map((x) => x.authorId)]);
  return {
    id: c.id, name: c.name, type: c.type, status: c.status,
    data: {
      name: c.name, type: c.type, objective: c.objective, audience: c.audience, product: c.product, offer: c.offer, message: c.message, cta: c.cta,
      channels: c.channels, conversionChannel: c.conversionChannel, conversionUrl: c.conversionUrl, leadOwnerId: c.leadOwnerId, measurement: c.measurement,
      goal: c.goal, kpis: c.kpis, startDate: facts.startDate, endDate: facts.endDate, budgetCents: c.budgetCents, ownerId: c.ownerId,
      participantIds: c.participantIds, modalityId: c.modalityId, eventId: c.eventId, details: c.details, notes: c.notes,
    },
    owner: c.ownerId ? names.get(c.ownerId) ?? null : null,
    leadOwner: c.leadOwnerId ? names.get(c.leadOwnerId) ?? null : null,
    event: c.event ? { id: c.event.id, name: c.event.name, startDate: iso(c.event.startDate)!, registrationUrl: c.event.registrationUrl } : null,
    readiness: readiness(facts, tasks, today),
    gate: commercialGate(facts),
    milestones: milestoneAlerts(facts, tasks, today),
    tasks: c.tasks.map((t) => ({
      id: t.id, title: t.title, column: t.column, columnName: t.boardColumn?.name ?? null, dueDate: iso(t.dueDate), priority: t.priority, origin: t.origin,
      area: t.area ? { key: t.area.key, name: t.area.name, color: t.area.color } : null,
      assignee: t.assigneeId ? names.get(t.assigneeId) ?? null : null,
      checklist: { total: t.checklist.length, done: t.checklist.filter((x) => x.done).length },
    })),
    suggestions: c.suggestions.map((s) => ({ id: s.id, status: s.status, createdAt: s.createdAt.toISOString(), payload: s.payload as unknown as SuggestedTasksPayload, model: s.model, promptVersion: s.promptVersion })),
    history: history.map((h) => ({ at: h.at.toISOString(), summary: h.summary })),
    comments: comments.map((x) => ({ id: x.id, body: x.body, at: x.createdAt.toISOString(), author: x.authorId ? names.get(x.authorId) ?? null : null })),
  };
}
export type CampaignView = Awaited<ReturnType<typeof getCampaign>>;
export interface SuggestedTasksPayload {
  tarefas: { area: AreaKey; titulo: string; descricao: string; offsetDias: number; prioridade: string; decisao?: 'aceita' | 'recusada' }[];
  observacoes: string;
}

export async function addCampaignComment(principal: Principal | null, campaignId: string, body: string) {
  assertCan(principal, 'mkt.view');
  const b = body.trim().slice(0, 2000);
  if (!b) throw new AppError('Escreva o comentário.');
  await prisma.mktComment.create({ data: { entityType: 'campaign', entityId: campaignId, authorId: principal.id, body: b } });
}

// ── Eventos ──────────────────────────────────────────────────

const eventSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome do evento.').max(140),
  startDate: isoDate('Informe a data do evento.'), endDate: optIso,
  location: text(200), audience: text(300), registrationUrl: text(500),
  modalityId: uuidOrNull, ownerId: uuidOrNull, notes: text(2000),
  status: z.enum(EVENT_STATUSES.map((s) => s.id) as [string, ...string[]]).default('PLANEJADO'),
}).refine((e) => !e.endDate || e.endDate >= e.startDate, 'A data final é anterior à inicial.');

export async function saveEvent(principal: Principal | null, id: string | null, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'mkt.edit');
  const d = parse(eventSchema, input);
  return prisma.$transaction(async (tx) => {
    const data = { ...d, status: d.status as 'PLANEJADO', startDate: dt(d.startDate)!, endDate: dt(d.endDate) };
    const e = id ? await tx.mktEvent.update({ where: { id }, data }) : await tx.mktEvent.create({ data: { ...data, createdById: principal.id } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: id ? 'mkt.event_updated' : 'mkt.event_created', entityType: 'mkt_event', entityId: e.id, after: { nome: e.name, data: d.startDate, status: d.status }, summary: `${principal.name} ${id ? 'editou' : 'criou'} o evento ${e.name}` });
    return e.id;
  });
}

export async function deleteEvent(principal: Principal | null, id: string, meta: RequestMeta) {
  assertCan(principal, 'mkt.approve');
  await prisma.$transaction(async (tx) => {
    const e = await tx.mktEvent.findUnique({ where: { id } });
    if (!e) throw new NotFoundError('Evento não encontrado.');
    await tx.mktEvent.delete({ where: { id } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'mkt.event_deleted', entityType: 'mkt_event', entityId: id, before: { nome: e.name }, summary: `${principal.name} excluiu o evento ${e.name}` });
  });
}

export async function listEvents(principal: Principal | null, today: string) {
  assertCan(principal, 'mkt.view');
  const rows = await prisma.mktEvent.findMany({ orderBy: { startDate: 'asc' }, include: { campaigns: { select: { id: true, name: true, status: true } }, _count: { select: { tasks: true } } } });
  const names = await nameMap(rows.map((r) => r.ownerId));
  return rows.map((e) => ({
    id: e.id, name: e.name, startDate: iso(e.startDate)!, endDate: iso(e.endDate), location: e.location, audience: e.audience, registrationUrl: e.registrationUrl,
    modalityId: e.modalityId, ownerId: e.ownerId, owner: e.ownerId ? names.get(e.ownerId) ?? null : null, notes: e.notes, status: e.status,
    daysTo: Math.round((Date.parse(iso(e.startDate)!) - Date.parse(today)) / 86_400_000), campaigns: e.campaigns, tasks: e._count.tasks,
  }));
}
export type EventRow = Awaited<ReturnType<typeof listEvents>>[number];

// ── Itens avulsos do calendário ──────────────────────────────

const itemSchema = z.object({
  title: z.string().trim().min(2, 'Informe o título.').max(140),
  kind: z.enum(CALENDAR_KINDS.map((k) => k.id) as [string, ...string[]]),
  startDate: isoDate('Informe a data.'), endDate: optIso, description: text(1000), modalityId: uuidOrNull, ownerId: uuidOrNull, audience: text(200),
}).refine((e) => !e.endDate || e.endDate >= e.startDate, 'A data final é anterior à inicial.');

export async function saveCalendarItem(principal: Principal | null, id: string | null, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'mkt.edit');
  const d = parse(itemSchema, input);
  return prisma.$transaction(async (tx) => {
    const data = { ...d, kind: d.kind as 'OUTRO', startDate: dt(d.startDate)!, endDate: dt(d.endDate) };
    const it = id ? await tx.mktCalendarItem.update({ where: { id }, data }) : await tx.mktCalendarItem.create({ data: { ...data, createdById: principal.id } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: id ? 'mkt.item_updated' : 'mkt.item_created', entityType: 'mkt_calendar_item', entityId: it.id, after: { titulo: it.title, data: d.startDate }, summary: `${principal.name} ${id ? 'editou' : 'incluiu'} "${it.title}" no calendário de marketing` });
    return it.id;
  });
}
export async function deleteCalendarItem(principal: Principal | null, id: string, meta: RequestMeta) {
  assertCan(principal, 'mkt.edit');
  await prisma.$transaction(async (tx) => {
    const it = await tx.mktCalendarItem.findUnique({ where: { id } });
    if (!it) throw new NotFoundError('Item não encontrado.');
    await tx.mktCalendarItem.delete({ where: { id } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'mkt.item_deleted', entityType: 'mkt_calendar_item', entityId: id, before: { titulo: it.title }, summary: `${principal.name} removeu "${it.title}" do calendário de marketing` });
  });
}

// ── Calendário (visão) ───────────────────────────────────────

export async function calendarEntries(principal: Principal | null, from: string, to: string): Promise<CalEntry[]> {
  assertCan(principal, 'mkt.view');
  const F = dt(from)!; const T = dt(to)!;
  const range = { startDate: { lte: T }, OR: [{ endDate: { gte: F } }, { endDate: null, startDate: { gte: F } }] };
  const [camps, events, tasks, items, holidays] = await Promise.all([
    prisma.mktCampaign.findMany({ where: range }),
    prisma.mktEvent.findMany({ where: range }),
    prisma.mktTask.findMany({ where: { dueDate: { gte: F, lte: T } }, include: { area: true, campaign: { select: { name: true } } } }),
    prisma.mktCalendarItem.findMany({ where: range }),
    prisma.holiday.findMany({ where: { date: { gte: F, lte: T } } }),
  ]);
  const types = Object.fromEntries(CAMPAIGN_TYPES.map((t) => [t.id, t.label]));
  return [
    ...holidays.map((h): CalEntry => ({ kind: 'feriado', id: h.id, title: h.name, start: iso(h.date)!, end: iso(h.date)!, tag: 'Feriado' })),
    ...events.map((e): CalEntry => ({ kind: 'evento', id: e.id, title: e.name, start: iso(e.startDate)!, end: iso(e.endDate) ?? iso(e.startDate)!, tag: 'Evento', href: '/marketing/eventos', ownerId: e.ownerId, modalityId: e.modalityId, status: e.status })),
    ...camps.map((c): CalEntry => ({ kind: 'campanha', id: c.id, title: c.name, start: iso(c.startDate)!, end: iso(c.endDate) ?? iso(c.startDate)!, tag: types[c.type], href: `/marketing/campanhas/${c.id}`, ownerId: c.ownerId, modalityId: c.modalityId, status: c.status, campaignId: c.id })),
    ...items.map((i): CalEntry => ({ kind: 'item', id: i.id, title: i.title, start: iso(i.startDate)!, end: iso(i.endDate) ?? iso(i.startDate)!, tag: labelOf(CALENDAR_KINDS, i.kind), ownerId: i.ownerId, modalityId: i.modalityId })),
    ...tasks.map((t): CalEntry => ({ kind: 'tarefa', id: t.id, title: t.title, start: iso(t.dueDate)!, end: iso(t.dueDate)!, tag: t.campaign?.name ?? 'Tarefa', color: t.area?.color, ownerId: t.assigneeId, areaKey: t.area?.key ?? null, status: t.column, campaignId: t.campaignId })),
  ];
}

/** Arrastar no calendário: muda a data mantendo a duração. */
export async function reschedule(principal: Principal | null, kind: string, id: string, newStart: string, meta: RequestMeta) {
  assertCan(principal, 'mkt.edit');
  if (!isIsoDate(newStart)) throw new AppError('Data inválida.');
  await prisma.$transaction(async (tx) => {
    let label = '';
    if (kind === 'campanha') {
      const c = await tx.mktCampaign.findUniqueOrThrow({ where: { id } });
      const r = moveRange(iso(c.startDate)!, iso(c.endDate), newStart);
      await tx.mktCampaign.update({ where: { id }, data: { startDate: dt(r.start)!, endDate: dt(r.end) } });
      label = `a campanha ${c.name}`;
    } else if (kind === 'evento') {
      const e = await tx.mktEvent.findUniqueOrThrow({ where: { id } });
      const r = moveRange(iso(e.startDate)!, iso(e.endDate), newStart);
      await tx.mktEvent.update({ where: { id }, data: { startDate: dt(r.start)!, endDate: dt(r.end) } });
      label = `o evento ${e.name}`;
    } else if (kind === 'item') {
      const i = await tx.mktCalendarItem.findUniqueOrThrow({ where: { id } });
      const r = moveRange(iso(i.startDate)!, iso(i.endDate), newStart);
      await tx.mktCalendarItem.update({ where: { id }, data: { startDate: dt(r.start)!, endDate: dt(r.end) } });
      label = `"${i.title}"`;
    } else if (kind === 'tarefa') {
      const t = await tx.mktTask.findUniqueOrThrow({ where: { id } });
      await tx.mktTask.update({ where: { id }, data: { dueDate: dt(newStart) } });
      label = `a tarefa "${t.title}"`;
    } else throw new AppError('Este item não pode ser movido.');
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'mkt.rescheduled', entityType: kind === 'campanha' ? 'mkt_campaign' : kind === 'evento' ? 'mkt_event' : kind === 'tarefa' ? 'mkt_task' : 'mkt_calendar_item', entityId: id, after: { inicio: newStart }, summary: `${principal.name} remarcou ${label} para ${newStart.split('-').reverse().join('/')}` });
  });
}

// ── Command Center ───────────────────────────────────────────

/** Fatos de todas as campanhas abertas + tarefas (base do Command Center, da pauta e das recomendações). */
export async function marketingFacts(db: Tx = prisma) {
  const [camps, tasks, events, items] = await Promise.all([
    db.mktCampaign.findMany({ where: { status: { notIn: ['FINALIZADA'] } } }),
    db.mktTask.findMany({ include: { area: { select: { key: true } } } }),
    db.mktEvent.findMany({ where: { status: { not: 'CANCELADO' } } }),
    db.mktCalendarItem.findMany(),
  ]);
  const names = await nameMap(tasks.map((t) => t.assigneeId));
  const campaigns: AgendaCampaign[] = camps.map((c) => ({ ...campaignFacts(c), id: c.id, name: c.name }));
  const agendaTasks: AgendaTask[] = tasks.map((t) => ({ ...taskFacts(t), id: t.id, campaignId: t.campaignId, assignee: t.assigneeId ? names.get(t.assigneeId) ?? null : null }));
  return {
    campaigns, tasks: agendaTasks,
    events: events.map((e) => ({ id: e.id, name: e.name, startDate: iso(e.startDate)!, endDate: iso(e.endDate), status: e.status })),
    items: items.map((i) => ({ id: i.id, title: i.title, startDate: iso(i.startDate)!, endDate: iso(i.endDate), kind: i.kind })),
  };
}

export async function commandCenter(principal: Principal | null, today: string) {
  assertCan(principal, 'mkt.view');
  const f = await marketingFacts();
  const mon = mondayOf(today);
  const sun = addDays(mon, 6);
  const att = attention(f.campaigns, f.tasks, today);
  const in30 = addDays(today, 30);
  const upcoming = f.campaigns.filter((c) => c.startDate >= addDays(today, -7) && c.startDate <= in30 && c.status !== 'ANALISE').sort((a, b) => a.startDate.localeCompare(b.startDate));
  const reco = await prisma.mktAiSuggestion.findFirst({ where: { kind: 'RECOMENDACOES' }, orderBy: { createdAt: 'desc' } });
  const late = f.tasks.filter((t) => t.dueDate && t.dueDate < today && !isDone(t.column));
  const status = (s: string[]) => f.campaigns.filter((c) => s.includes(c.status)).length;
  return {
    counts: {
      ativas: status(['ATIVA']),
      planejadas: status(['IDEIA', 'PLANEJAMENTO', 'PRODUCAO', 'AGUARDANDO_APROVACAO', 'PROGRAMADA']),
      aprovacao: status(['AGUARDANDO_APROVACAO']),
      atrasadas: f.campaigns.filter((c) => c.startDate < today && ['IDEIA', 'PLANEJAMENTO', 'PRODUCAO', 'AGUARDANDO_APROVACAO'].includes(c.status)).length,
      concluidas: await prisma.mktCampaign.count({ where: { status: { in: ['FINALIZADA', 'ANALISE'] } } }),
      tarefasAtrasadas: late.length,
      tarefasSemana: f.tasks.filter((t) => t.dueDate && t.dueDate >= today && t.dueDate <= sun && !isDone(t.column)).length,
    },
    attention: att.slice(0, 10),
    week: [
      ...f.events.filter((e) => e.startDate <= sun && (e.endDate ?? e.startDate) >= mon).map((e) => ({ kind: 'evento' as const, id: e.id, title: e.name, date: e.startDate })),
      ...f.campaigns.filter((c) => c.startDate <= sun && (c.endDate ?? c.startDate) >= mon).map((c) => ({ kind: 'campanha' as const, id: c.id, title: c.name, date: c.startDate, status: c.status })),
      ...f.items.filter((i) => i.startDate <= sun && (i.endDate ?? i.startDate) >= mon).map((i) => ({ kind: 'item' as const, id: i.id, title: i.title, date: i.startDate })),
    ].sort((a, b) => a.date.localeCompare(b.date)),
    readiness: upcoming.map((c) => {
      const r = readiness(c, f.tasks.filter((t) => t.campaignId === c.id), today);
      return { id: c.id, name: c.name, startDate: c.startDate, status: c.status, score: r.score, missing: r.missing.map((m) => m.label), daysTo: Math.round((Date.parse(c.startDate) - Date.parse(today)) / 86_400_000) };
    }),
    events: f.events.filter((e) => e.startDate >= today).sort((a, b) => a.startDate.localeCompare(b.startDate)).slice(0, 5).map((e) => ({ ...e, daysTo: Math.round((Date.parse(e.startDate) - Date.parse(today)) / 86_400_000) })),
    recommendations: reco ? { id: reco.id, createdAt: reco.createdAt.toISOString(), model: reco.model, items: (reco.payload as unknown as RecoPayload).recomendacoes } : null,
  };
}
export type CommandCenterView = Awaited<ReturnType<typeof commandCenter>>;
export interface RecoPayload {
  recomendacoes: { titulo: string; porque: string; campanha: string | null; tarefa: { titulo: string; area: AreaKey; prazoDias: number } | null; estado?: 'aceita' | 'ignorada' }[];
}


/** Opções dos formulários do Marketing (pessoas, áreas, campanhas, eventos, modalidades). */
export async function mktOptions() {
  const [people, areas, campaigns, events, modalities, columns] = await Promise.all([
    marketingPeople(), listAreas(),
    prisma.mktCampaign.findMany({ where: { status: { notIn: ['FINALIZADA', 'ANALISE'] } }, select: { id: true, name: true }, orderBy: { startDate: 'asc' } }),
    prisma.mktEvent.findMany({ where: { status: { not: 'CANCELADO' } }, select: { id: true, name: true }, orderBy: { startDate: 'asc' } }),
    listModalities(), listColumns(),
  ]);
  return { people, areas: areas.map((a) => ({ id: a.id, key: a.key, name: a.name, color: a.color, defaultUserId: a.defaultUserId, coOwnerIds: a.coOwnerIds, question: a.question })), campaigns, events, modalities, columns };
}
export type MktOptions = Awaited<ReturnType<typeof mktOptions>>;
