import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/server/db';
import { audit } from '@/server/audit';
import { assertCan } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import type { RequestMeta } from '@/server/auth/session';
import { AppError, NotFoundError } from '@/server/errors';
import { addDays, isIsoDate } from '@/domain/dates';
import { AREAS, PRIORITIES, type AreaKey } from '@/domain/marketing/constants';
import { attention, weeklyAgenda, type AgendaSection } from '@/domain/marketing/agenda';
import { readiness } from '@/domain/marketing/readiness';
import { dueFromOffset } from '@/domain/marketing/tasks';
import { generateMeetingMinutes, generateTasks, recommendActions, type CampaignBrief, type MeetingOut } from '@/server/marketing/ai/service';
import { createTaskIn } from './mkt-task-service';
import { memoryContext } from './mkt-memory-service';
import { dt, iso, listAreas, marketingFacts, type RecoPayload, type SuggestedTasksPayload } from './marketing-service';

/**
 * A IA do Marketing só SUGERE: toda saída vira um registro pendente em
 * mkt_ai_suggestions; tarefas só nascem quando alguém aceita (auditado).
 */

export type MinutesPayload = Omit<MeetingOut, 'decisoes'> & { decisoes: (MeetingOut['decisoes'][number] & { decisao?: 'aceita' | 'recusada' })[] };

const AREA_KEYS = AREAS.map((a) => a.key) as [AreaKey, ...AreaKey[]];
const PRIORITY_IDS = PRIORITIES.map((p) => p.id) as [string, ...string[]];

// ── Tarefas sugeridas para a campanha ────────────────────────

/** Contexto enxuto da campanha para a IA (sem dados pessoais). */
async function campaignBrief(campaignId: string) {
  const c = await prisma.mktCampaign.findUnique({ where: { id: campaignId }, include: { event: true, tasks: { select: { title: true } } } });
  if (!c) throw new NotFoundError('Campanha não encontrada.');
  const modality = c.modalityId ? await prisma.modality.findUnique({ where: { id: c.modalityId }, select: { name: true } }) : null;
  const brief: CampaignBrief = {
    nome: c.name, tipo: c.type, objetivo: c.objective, publico: c.audience, produto: c.product, oferta: c.offer, mensagem: c.message, cta: c.cta,
    canais: c.channels, inicio: iso(c.startDate)!, fim: iso(c.endDate), modalidade: modality?.name ?? null,
    evento: c.event ? { nome: c.event.name, data: iso(c.event.startDate)!, local: c.event.location, inscricao: c.event.registrationUrl } : null,
  };
  return { c, brief, existing: c.tasks.map((t) => t.title) };
}

export async function suggestCampaignTasks(principal: Principal | null, campaignId: string, today: string, meta: RequestMeta) {
  assertCan(principal, 'mkt.ai');
  assertCan(principal, 'mkt.edit');
  const { c, brief, existing } = await campaignBrief(campaignId);
  const { out, version, model } = await generateTasks(brief, existing, today, await memoryContext(brief.inicio));
  if (!out.tarefas.length) throw new AppError('A IA não encontrou tarefas novas para sugerir.');
  return prisma.$transaction(async (tx) => {
    const s = await tx.mktAiSuggestion.create({ data: { kind: 'TAREFAS_CAMPANHA', campaignId, payload: out as unknown as Prisma.InputJsonValue, promptVersion: version, model, createdById: principal.id } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'mkt.ai_suggested', entityType: 'mkt_campaign', entityId: campaignId, after: { sugestao: s.id, tarefas: out.tarefas.length, prompt: version }, summary: `${principal.name} pediu à IA tarefas para ${c.name}: ${out.tarefas.length} sugerida(s)` });
    return s.id;
  });
}

const decisionSchema = z.array(z.object({
  index: z.number().int().min(0),
  accept: z.boolean(),
  title: z.string().trim().min(2, 'Toda tarefa aceita precisa de título.').max(200).optional(),
  area: z.enum(AREA_KEYS).optional(),
  dueDate: z.string().refine(isIsoDate, 'Prazo inválido.').optional(),
  priority: z.enum(PRIORITY_IDS).optional(),
  assigneeId: z.string().uuid().nullable().optional(),
})).min(1);

/**
 * Aceitar todas, algumas, editar ou descartar. Tudo numa transação: se uma
 * tarefa aceita for inválida, nenhuma é criada.
 */
export async function decideTaskSuggestion(principal: Principal | null, suggestionId: string, input: unknown, today: string, meta: RequestMeta) {
  assertCan(principal, 'mkt.edit');
  const p = decisionSchema.safeParse(input);
  if (!p.success) throw new AppError(p.error.issues[0]?.message ?? 'Dados inválidos.');
  return prisma.$transaction(async (tx) => {
    const s = await tx.mktAiSuggestion.findUnique({ where: { id: suggestionId }, include: { campaign: true } });
    if (!s || s.kind !== 'TAREFAS_CAMPANHA' || !s.campaign) throw new NotFoundError('Sugestão não encontrada.');
    if (s.status !== 'PENDENTE') throw new AppError('Esta sugestão já foi decidida.');
    const payload = s.payload as unknown as SuggestedTasksPayload;
    const start = iso(s.campaign.startDate)!;
    let created = 0;
    for (const d of p.data) {
      const item = payload.tarefas[d.index];
      if (!item) throw new AppError('Sugestão inválida.');
      item.decisao = d.accept ? 'aceita' : 'recusada';
      if (!d.accept) continue;
      await createTaskIn(tx, principal, {
        title: d.title ?? item.titulo, description: item.descricao, campaignId: s.campaign.id, eventId: s.campaign.eventId,
        areaKey: d.area ?? item.area, assigneeId: d.assigneeId ?? undefined, dueDate: d.dueDate ?? dueFromOffset(start, item.offsetDias, today),
        priority: d.priority ?? item.prioridade, column: 'BACKLOG', origin: 'IA', milestone: item.offsetDias === 0 ? 'Dia D' : item.offsetDias < 0 ? `D${item.offsetDias}` : `D+${item.offsetDias}`,
      });
      created++;
    }
    const status = created === 0 ? 'RECUSADA' : created === payload.tarefas.length ? 'ACEITA' : 'PARCIAL';
    await tx.mktAiSuggestion.update({ where: { id: s.id }, data: { status, payload: payload as unknown as Prisma.InputJsonValue, decidedById: principal.id, decidedAt: new Date() } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'mkt.ai_decided', entityType: 'mkt_campaign', entityId: s.campaign.id, after: { sugestao: s.id, aceitas: created, total: payload.tarefas.length }, summary: `${principal.name} aceitou ${created} de ${payload.tarefas.length} tarefa(s) sugerida(s) pela IA em ${s.campaign.name}` });
    return { created, status };
  });
}

// ── Reunião semanal ──────────────────────────────────────────

export async function createMeeting(principal: Principal | null, date: string, meta: RequestMeta) {
  assertCan(principal, 'mkt.edit');
  if (!isIsoDate(date)) throw new AppError('Data inválida.');
  const f = await marketingFacts();
  const areas = await listAreas();
  const agenda = weeklyAgenda({ today: date, campaigns: f.campaigns, tasks: f.tasks, events: f.events, items: f.items, areaNames: Object.fromEntries(areas.map((a) => [a.key, a.name])) });
  return prisma.$transaction(async (tx) => {
    const m = await tx.mktMeeting.create({ data: { date: dt(date)!, agenda: agenda as unknown as Prisma.InputJsonValue, createdById: principal.id } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'mkt.meeting_created', entityType: 'mkt_meeting', entityId: m.id, summary: `${principal.name} abriu a reunião semanal de ${date.split('-').reverse().join('/')}` });
    return m.id;
  });
}

export async function refreshMeetingAgenda(principal: Principal | null, id: string) {
  assertCan(principal, 'mkt.edit');
  const m = await prisma.mktMeeting.findUnique({ where: { id } });
  if (!m) throw new NotFoundError('Reunião não encontrada.');
  const [f, areas] = await Promise.all([marketingFacts(), listAreas()]);
  const agenda = weeklyAgenda({ today: iso(m.date)!, campaigns: f.campaigns, tasks: f.tasks, events: f.events, items: f.items, areaNames: Object.fromEntries(areas.map((a) => [a.key, a.name])) });
  await prisma.mktMeeting.update({ where: { id }, data: { agenda: agenda as unknown as Prisma.InputJsonValue } });
}

export async function saveMeetingNotes(principal: Principal | null, id: string, notes: string, minutes: string | null, meta: RequestMeta) {
  assertCan(principal, 'mkt.edit');
  await prisma.$transaction(async (tx) => {
    const m = await tx.mktMeeting.update({ where: { id }, data: { notes: notes.slice(0, 20000) || null, ...(minutes !== null ? { minutes: minutes.slice(0, 40000) || null } : {}) } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'mkt.meeting_notes', entityType: 'mkt_meeting', entityId: m.id, summary: `${principal.name} atualizou as anotações/ata da reunião de ${iso(m.date)!.split('-').reverse().join('/')}` });
  });
}

export async function listMeetings(principal: Principal | null) {
  assertCan(principal, 'mkt.view');
  const rows = await prisma.mktMeeting.findMany({ orderBy: { date: 'desc' }, take: 50, include: { suggestions: { select: { status: true } } } });
  return rows.map((m) => ({ id: m.id, date: iso(m.date)!, hasMinutes: !!m.minutes, sections: (m.agenda as unknown as AgendaSection[]).reduce((s, x) => s + x.items.length, 0) }));
}

export async function getMeeting(principal: Principal | null, id: string) {
  assertCan(principal, 'mkt.view');
  const m = await prisma.mktMeeting.findUnique({ where: { id }, include: { suggestions: { orderBy: { createdAt: 'desc' } } } });
  if (!m) throw new NotFoundError('Reunião não encontrada.');
  return {
    id: m.id, date: iso(m.date)!, agenda: m.agenda as unknown as AgendaSection[], notes: m.notes, minutes: m.minutes,
    suggestions: m.suggestions.map((s) => ({ id: s.id, status: s.status, model: s.model, createdAt: s.createdAt.toISOString(), payload: s.payload as unknown as MinutesPayload })),
  };
}
export type MeetingView = Awaited<ReturnType<typeof getMeeting>>;

export async function generateMinutes(principal: Principal | null, id: string, meta: RequestMeta) {
  assertCan(principal, 'mkt.ai');
  const m = await prisma.mktMeeting.findUnique({ where: { id } });
  if (!m) throw new NotFoundError('Reunião não encontrada.');
  const { out, version, model } = await generateMeetingMinutes(m.agenda as unknown as AgendaSection[], m.notes, iso(m.date)!);
  return prisma.$transaction(async (tx) => {
    const s = await tx.mktAiSuggestion.create({ data: { kind: 'ATA_REUNIAO', meetingId: id, payload: out as unknown as Prisma.InputJsonValue, promptVersion: version, model, createdById: principal.id } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'mkt.ai_suggested', entityType: 'mkt_meeting', entityId: id, after: { sugestao: s.id, decisoes: out.decisoes.length }, summary: `${principal.name} gerou a ata da reunião com IA (${out.decisoes.length} encaminhamento(s))` });
    return s.id;
  });
}

/** Aceita a ata (editável) e transforma as decisões escolhidas em tarefas. */
export async function decideMinutes(principal: Principal | null, suggestionId: string, input: { minutes: string; accept: number[] }, meta: RequestMeta) {
  assertCan(principal, 'mkt.edit');
  return prisma.$transaction(async (tx) => {
    const s = await tx.mktAiSuggestion.findUnique({ where: { id: suggestionId }, include: { meeting: true } });
    if (!s || s.kind !== 'ATA_REUNIAO' || !s.meeting) throw new NotFoundError('Sugestão não encontrada.');
    if (s.status !== 'PENDENTE') throw new AppError('Esta ata já foi decidida.');
    const payload = s.payload as unknown as MinutesPayload;
    const date = iso(s.meeting.date)!;
    let created = 0;
    for (const [i, d] of payload.decisoes.entries()) {
      d.decisao = input.accept.includes(i) ? 'aceita' : 'recusada';
      if (d.decisao !== 'aceita') continue;
      await createTaskIn(tx, principal, { title: d.titulo, areaKey: d.area, dueDate: addDays(date, d.prazoDias), priority: d.prioridade, column: 'SEMANA', origin: 'REUNIAO' });
      created++;
    }
    await tx.mktMeeting.update({ where: { id: s.meeting.id }, data: { minutes: input.minutes.slice(0, 40000) } });
    await tx.mktAiSuggestion.update({ where: { id: s.id }, data: { status: created === payload.decisoes.length ? 'ACEITA' : created ? 'PARCIAL' : 'RECUSADA', payload: payload as unknown as Prisma.InputJsonValue, decidedById: principal.id, decidedAt: new Date() } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'mkt.ai_decided', entityType: 'mkt_meeting', entityId: s.meeting.id, after: { tarefas: created }, summary: `${principal.name} aprovou a ata da reunião de ${date.split('-').reverse().join('/')} e criou ${created} tarefa(s)` });
    return created;
  });
}

// ── Recomendações (Command Center) ───────────────────────────

export async function refreshRecommendations(principal: Principal | null, today: string, meta: RequestMeta) {
  assertCan(principal, 'mkt.ai');
  const f = await marketingFacts();
  const att = attention(f.campaigns, f.tasks, today);
  const soon = f.campaigns.filter((c) => c.startDate >= today && c.startDate <= addDays(today, 45));
  const ctx = {
    hoje: today,
    alertas: att.slice(0, 25).map((a) => `${a.level === 'critico' ? '[crítico]' : '[atenção]'} ${a.text}`),
    campanhas: soon.map((c) => {
      const r = readiness(c, f.tasks.filter((t) => t.campaignId === c.id), today);
      return { nome: c.name, status: c.status, diasParaInicio: Math.round((Date.parse(c.startDate) - Date.parse(today)) / 86_400_000), readiness: r.score, faltando: r.missing.map((m) => m.label) };
    }),
    tarefasAtrasadas: f.tasks.filter((t) => t.dueDate && t.dueDate < today && !['EXECUTADO', 'RESULTADOS'].includes(t.column)).length,
  };
  const { out, version, model } = await recommendActions(ctx, att, await memoryContext(today));
  return prisma.$transaction(async (tx) => {
    const s = await tx.mktAiSuggestion.create({ data: { kind: 'RECOMENDACOES', payload: out as unknown as Prisma.InputJsonValue, promptVersion: version, model, createdById: principal.id } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'mkt.ai_suggested', entityType: 'mkt_ai_suggestion', entityId: s.id, after: { recomendacoes: out.recomendacoes.length }, summary: `${principal.name} atualizou as recomendações da IA (${out.recomendacoes.length})` });
    return s.id;
  });
}

/** Aceitar uma recomendação cria a tarefa sugerida; ignorar só marca. */
export async function decideRecommendation(principal: Principal | null, suggestionId: string, index: number, accept: boolean, today: string, meta: RequestMeta) {
  assertCan(principal, 'mkt.edit');
  return prisma.$transaction(async (tx) => {
    const s = await tx.mktAiSuggestion.findUnique({ where: { id: suggestionId } });
    if (!s || s.kind !== 'RECOMENDACOES') throw new NotFoundError('Recomendação não encontrada.');
    const payload = s.payload as unknown as RecoPayload;
    const r = payload.recomendacoes[index];
    if (!r) throw new AppError('Recomendação inválida.');
    if (r.estado) throw new AppError('Esta recomendação já foi decidida.');
    r.estado = accept ? 'aceita' : 'ignorada';
    let taskId: string | null = null;
    if (accept && r.tarefa) {
      const camp = r.campanha ? await tx.mktCampaign.findFirst({ where: { name: r.campanha }, select: { id: true } }) : null;
      taskId = (await createTaskIn(tx, principal, { title: r.tarefa.titulo, description: r.porque, areaKey: r.tarefa.area, campaignId: camp?.id ?? null, dueDate: addDays(today, r.tarefa.prazoDias), priority: 'ALTA', column: 'SEMANA', origin: 'IA' })).id;
    }
    const all = payload.recomendacoes.every((x) => x.estado);
    await tx.mktAiSuggestion.update({ where: { id: s.id }, data: { payload: payload as unknown as Prisma.InputJsonValue, ...(all ? { status: payload.recomendacoes.some((x) => x.estado === 'aceita') ? 'PARCIAL' : 'RECUSADA', decidedById: principal.id, decidedAt: new Date() } : {}) } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'mkt.ai_decided', entityType: 'mkt_ai_suggestion', entityId: s.id, after: { recomendacao: r.titulo, aceita: accept, tarefa: taskId }, summary: `${principal.name} ${accept ? 'aceitou' : 'ignorou'} a recomendação "${r.titulo}"` });
    return taskId;
  });
}
