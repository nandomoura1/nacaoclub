import { z } from 'zod';
import { prisma, type Tx } from '@/server/db';
import { audit } from '@/server/audit';
import { assertCan, can } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import type { RequestMeta } from '@/server/auth/session';
import { AppError, NotFoundError } from '@/server/errors';
import type { IsoDate } from '@/domain/dates';
import { CHANNELS, FORMATS, POST_STATUSES, isMonth, matchByName, monthDays, parsePlanText, planText, postTask, taskDue, type PlanPost } from '@/domain/marketing/cronograma';
import { generateCronograma } from '@/server/marketing/ai/service';
import { createTaskIn } from './mkt-task-service';
import { memoryContext } from './mkt-memory-service';
import { dt, iso, marketingPeople } from './marketing-service';

/**
 * Cronograma do mês (Marketing → Cronograma do mês; decisão 24/11): objetivos + um post planejado por dia,
 * montado a partir do calendário (eventos, campanhas, avisos), com sugestão da IA, aprovado no sistema.
 * Cada post pode ligar a campanha/evento e virar tarefa no Kanban (responsável padrão: dono da área Planejamento).
 * Texto no formato do Docs sai (`planText`) e volta (`importPlanText`).
 */

type P = Principal;
const parse = <S extends z.ZodType>(s: S, v: unknown): z.output<S> => {
  const r = s.safeParse(v);
  if (!r.success) throw new AppError(r.error.issues[0]?.message ?? 'Dados inválidos.');
  return r.data;
};

const monthRange = (m: string) => ({ from: dt(`${m}-01`)!, to: dt(monthDays(m).at(-1)!)! });
const overlap = (m: string) => { const { from, to } = monthRange(m); return { startDate: { lte: to }, OR: [{ endDate: { gte: from } }, { endDate: null, startDate: { gte: from } }] }; };
const PRIVATE = /privad|loca[cç][aã]o/i;

async function ensurePlan(tx: Tx, principal: P, month: string) {
  const found = await tx.mktContentPlan.findUnique({ where: { month } });
  if (found) return found;
  const area = await tx.mktArea.findUnique({ where: { key: 'PLANEJAMENTO' }, select: { defaultUserId: true } });
  return tx.mktContentPlan.create({ data: { month, ownerId: area?.defaultUserId ?? null, createdBy: principal.id } });
}
async function draftPlan(tx: Tx, principal: P, month: string) {
  const plan = await ensurePlan(tx, principal, month);
  if (plan.status === 'APROVADO') throw new AppError('O cronograma deste mês está aprovado. Reabra para editar.');
  return plan;
}
const checkMonth = (m: string) => { if (!isMonth(m)) throw new AppError('Mês inválido.'); return m; };

// ── Leitura ───────────────────────────────────────────────

export async function getCronograma(principal: Principal | null, month: string) {
  assertCan(principal, 'mkt.view');
  checkMonth(month);
  const { from, to } = monthRange(month);
  const [plan, events, campaigns, items, people, holidays] = await Promise.all([
    prisma.mktContentPlan.findUnique({ where: { month }, include: { posts: { orderBy: [{ date: 'asc' }, { position: 'asc' }, { createdAt: 'asc' }] } } }),
    prisma.mktEvent.findMany({ where: { ...overlap(month), status: { not: 'CANCELADO' } }, select: { id: true, name: true, startDate: true, endDate: true }, orderBy: { startDate: 'asc' } }),
    prisma.mktCampaign.findMany({ where: { ...overlap(month), status: { notIn: ['FINALIZADA', 'ANALISE'] } }, select: { id: true, name: true, startDate: true, endDate: true, status: true }, orderBy: { startDate: 'asc' } }),
    prisma.mktCalendarItem.findMany({ where: overlap(month), select: { id: true, title: true, kind: true, startDate: true, endDate: true }, orderBy: { startDate: 'asc' } }),
    marketingPeople(),
    prisma.holiday.findMany({ where: { date: { gte: from, lte: to } }, select: { date: true, name: true }, orderBy: { date: 'asc' } }),
  ]);
  const posts = plan?.posts ?? [];
  const taskIds = posts.map((p) => p.taskId).filter((x): x is string => !!x);
  const tasks = new Map((await prisma.mktTask.findMany({ where: { id: { in: taskIds } }, select: { id: true, column: true, assigneeId: true } })).map((t) => [t.id, t]));
  const names = new Map(people.map((u) => [u.id, u.name]));
  const userIds = [plan?.approvedBy].filter((x): x is string => !!x && !names.has(x));
  for (const u of await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })) names.set(u.id, u.name);
  return {
    month,
    plan: plan ? { id: plan.id, objectives: plan.objectives, status: plan.status, ownerId: plan.ownerId, approvedBy: plan.approvedBy ? names.get(plan.approvedBy) ?? null : null, approvedAt: plan.approvedAt?.toISOString() ?? null } : null,
    posts: posts.map((p) => ({
      id: p.id, date: iso(p.date) as IsoDate, channel: p.channel, topic: p.topic, format: p.format, title: p.title, body: p.body, cta: p.cta, stories: p.stories, pending: p.pending,
      campaignId: p.campaignId, eventId: p.eventId, taskId: p.taskId, status: p.status, views: p.views, origin: p.origin,
      task: p.taskId ? (tasks.get(p.taskId) ? { column: tasks.get(p.taskId)!.column, assignee: names.get(tasks.get(p.taskId)!.assigneeId ?? '') ?? null } : null) : null,
    })),
    events: events.map((e) => ({ id: e.id, name: e.name, start: iso(e.startDate)!, end: iso(e.endDate) })),
    campaigns: campaigns.map((c) => ({ id: c.id, name: c.name, start: iso(c.startDate)!, end: iso(c.endDate), status: c.status })),
    items: items.map((i) => ({ id: i.id, title: i.title, kind: i.kind, start: iso(i.startDate)!, end: iso(i.endDate) })),
    holidays: holidays.map((h) => ({ date: iso(h.date)!, name: h.name })),
    people,
    range: { from: iso(from)!, to: iso(to)! },
  };
}
export type CronogramaView = Awaited<ReturnType<typeof getCronograma>>;

// ── Edição ────────────────────────────────────────────────

const infoSchema = z.object({ objectives: z.string().max(8000).nullable(), ownerId: z.string().uuid().nullable() });

export async function savePlanInfo(principal: Principal | null, month: string, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'mkt.edit');
  checkMonth(month);
  const d = parse(infoSchema, input);
  if (d.ownerId && !(await marketingPeople()).some((u) => u.id === d.ownerId)) throw new AppError('Responsável precisa ter acesso ao Marketing.');
  return prisma.$transaction(async (tx) => {
    const plan = await draftPlan(tx, principal, month);
    await tx.mktContentPlan.update({ where: { id: plan.id }, data: { objectives: d.objectives?.trim() || null, ownerId: d.ownerId } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'mkt.plan_saved', entityType: 'mkt_content_plan', entityId: plan.id, before: { objectives: plan.objectives, ownerId: plan.ownerId }, after: d, summary: `${principal.name} salvou os objetivos do cronograma de ${month}` });
  });
}

const ids = (list: readonly { id: string }[]) => list.map((x) => x.id) as [string, ...string[]];
const postSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  channel: z.enum(ids(CHANNELS)),
  topic: z.string().trim().min(1, 'Informe o assunto.').max(60),
  format: z.enum(ids(FORMATS)),
  title: z.string().trim().min(1, 'Informe o título.').max(200),
  body: z.string().max(6000).nullable(),
  cta: z.string().max(300).nullable(),
  stories: z.string().max(1000).nullable(),
  pending: z.string().max(600).nullable(),
  campaignId: z.string().uuid().nullable(),
  eventId: z.string().uuid().nullable(),
});
const blank = (s: string | null | undefined) => (s?.trim() ? s.trim() : null);

export async function savePost(principal: Principal | null, month: string, id: string | null, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'mkt.edit');
  checkMonth(month);
  const d = parse(postSchema, input);
  if (!d.date.startsWith(month)) throw new AppError('A data precisa estar no mês do cronograma.');
  const data = { date: dt(d.date)!, channel: d.channel, topic: d.topic.toUpperCase(), format: d.format, title: d.title, body: blank(d.body), cta: blank(d.cta), stories: blank(d.stories), pending: blank(d.pending), campaignId: d.campaignId, eventId: d.eventId };
  return prisma.$transaction(async (tx) => {
    const plan = await draftPlan(tx, principal, month);
    if (d.campaignId && !(await tx.mktCampaign.findUnique({ where: { id: d.campaignId }, select: { id: true } }))) throw new AppError('Campanha não encontrada.');
    if (d.eventId && !(await tx.mktEvent.findUnique({ where: { id: d.eventId }, select: { id: true } }))) throw new AppError('Evento não encontrado.');
    if (!id) {
      const p = await tx.mktContentPost.create({ data: { ...data, planId: plan.id, origin: 'MANUAL', createdBy: principal.id } });
      await audit(tx, { actorId: principal.id, ...meta }, { action: 'mkt.post_created', entityType: 'mkt_content_post', entityId: p.id, after: { data: d.date, titulo: d.title }, summary: `${principal.name} incluiu o post "${d.title}" (${d.date}) no cronograma` });
      return p.id;
    }
    const before = await tx.mktContentPost.findUnique({ where: { id } });
    if (!before || before.planId !== plan.id) throw new NotFoundError('Post não encontrado.');
    await tx.mktContentPost.update({ where: { id }, data });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'mkt.post_saved', entityType: 'mkt_content_post', entityId: id, before: { data: iso(before.date), titulo: before.title }, after: { data: d.date, titulo: d.title }, summary: `${principal.name} editou o post "${d.title}" do cronograma` });
    return id;
  });
}

export async function deletePost(principal: Principal | null, month: string, id: string, meta: RequestMeta) {
  assertCan(principal, 'mkt.edit');
  checkMonth(month);
  await prisma.$transaction(async (tx) => {
    const plan = await draftPlan(tx, principal, month);
    const p = await tx.mktContentPost.findUnique({ where: { id } });
    if (!p || p.planId !== plan.id) throw new NotFoundError('Post não encontrado.');
    await tx.mktContentPost.delete({ where: { id } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'mkt.post_deleted', entityType: 'mkt_content_post', entityId: id, before: { data: iso(p.date), titulo: p.title, tarefa: p.taskId }, summary: `${principal.name} tirou o post "${p.title}" do cronograma${p.taskId ? ' (a tarefa do Kanban continua)' : ''}` });
  });
}

/** Depois de publicar: publicado / não publicado e as views (vale também com o mês aprovado). */
export async function markPost(principal: Principal | null, id: string, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'mkt.edit');
  const d = parse(z.object({ status: z.enum(ids(POST_STATUSES)), views: z.number().int().min(0).max(100_000_000).nullable() }), input);
  await prisma.$transaction(async (tx) => {
    const p = await tx.mktContentPost.findUnique({ where: { id } });
    if (!p) throw new NotFoundError('Post não encontrado.');
    await tx.mktContentPost.update({ where: { id }, data: { status: d.status, views: d.views } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'mkt.post_result', entityType: 'mkt_content_post', entityId: id, before: { status: p.status, views: p.views }, after: d, summary: `${principal.name} marcou o post "${p.title}" como ${POST_STATUSES.find((s) => s.id === d.status)!.label.toLowerCase()}${d.views != null ? ` (${d.views} views)` : ''}` });
  });
}

// ── Kanban ────────────────────────────────────────────────

export async function postToTask(principal: Principal | null, id: string, assigneeId: string | null, today: IsoDate, meta: RequestMeta) {
  assertCan(principal, 'mkt.edit');
  if (assigneeId && !(await marketingPeople()).some((u) => u.id === assigneeId)) throw new AppError('Responsável precisa ter acesso ao Marketing.');
  return prisma.$transaction(async (tx) => {
    const p = await tx.mktContentPost.findUnique({ where: { id }, include: { plan: { select: { ownerId: true } } } });
    if (!p) throw new NotFoundError('Post não encontrado.');
    if (p.taskId && (await tx.mktTask.findUnique({ where: { id: p.taskId }, select: { id: true } }))) throw new AppError('Este post já tem tarefa no Kanban.');
    const date = iso(p.date) as IsoDate;
    const t = postTask({ ...p, date });
    const task = await createTaskIn(tx, principal!, {
      title: t.title, description: t.description, areaKey: 'CONTEUDO', assigneeId: assigneeId ?? p.plan.ownerId ?? null,
      dueDate: taskDue(date, today), campaignId: p.campaignId, eventId: p.eventId, origin: 'MANUAL', tags: ['cronograma'],
    });
    await tx.mktContentPost.update({ where: { id }, data: { taskId: task.id } });
    await audit(tx, { actorId: principal!.id, ...meta }, { action: 'mkt.task_created', entityType: 'mkt_task', entityId: task.id, after: { titulo: task.title, prazo: taskDue(date, today), origem: 'cronograma', post: id }, summary: `${principal!.name} mandou o post "${p.title}" para o Kanban` });
    return task.id;
  });
}

// ── Aprovação ─────────────────────────────────────────────

export async function approvePlan(principal: Principal | null, month: string, meta: RequestMeta) {
  assertCan(principal, 'mkt.approve');
  checkMonth(month);
  await prisma.$transaction(async (tx) => {
    const plan = await tx.mktContentPlan.findUnique({ where: { month }, include: { _count: { select: { posts: true } } } });
    if (!plan || plan._count.posts === 0) throw new AppError('Monte o cronograma antes de aprovar.');
    if (plan.status === 'APROVADO') throw new AppError('Este cronograma já está aprovado.');
    await tx.mktContentPlan.update({ where: { id: plan.id }, data: { status: 'APROVADO', approvedBy: principal.id, approvedAt: new Date() } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'mkt.plan_approved', entityType: 'mkt_content_plan', entityId: plan.id, after: { posts: plan._count.posts }, summary: `${principal.name} aprovou o cronograma de ${month} (${plan._count.posts} posts)` });
  });
}

export async function reopenPlan(principal: Principal | null, month: string, reason: string, meta: RequestMeta) {
  assertCan(principal, 'mkt.edit');
  checkMonth(month);
  const why = reason.trim();
  if (why.length < 3) throw new AppError('Informe o motivo para reabrir.');
  await prisma.$transaction(async (tx) => {
    const plan = await tx.mktContentPlan.findUnique({ where: { month } });
    if (!plan || plan.status !== 'APROVADO') throw new AppError('Este cronograma não está aprovado.');
    await tx.mktContentPlan.update({ where: { id: plan.id }, data: { status: 'RASCUNHO' } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'mkt.plan_reopened', entityType: 'mkt_content_plan', entityId: plan.id, after: { motivo: why }, summary: `${principal.name} reabriu o cronograma de ${month}: ${why}` });
  });
}

// ── IA e Docs ─────────────────────────────────────────────

/** IA sugere um post para cada dia ainda vazio (os já planejados não mudam). */
export async function generatePlan(principal: Principal | null, month: string, meta: RequestMeta) {
  assertCan(principal, 'mkt.ai');
  assertCan(principal, 'mkt.edit');
  checkMonth(month);
  const view = await getCronograma(principal, month);
  if (view.plan?.status === 'APROVADO') throw new AppError('O cronograma deste mês está aprovado. Reabra para editar.');
  const taken = new Set(view.posts.map((p) => p.date));
  const free = monthDays(month).filter((d) => !taken.has(d));
  if (!free.length) throw new AppError('Todos os dias do mês já têm post. Tire algum para a IA sugerir de novo.');
  const ctx = {
    mes: month, objetivos: view.plan?.objectives ?? null, diasLivres: free,
    eventos: view.events.filter((e) => !PRIVATE.test(e.name)).map((e) => ({ nome: e.name, data: e.start, fim: e.end })),
    campanhas: view.campaigns.map((c) => ({ nome: c.name, tipo: c.status, inicio: c.start, fim: c.end, oferta: null })),
    datas: [
      ...view.holidays.map((h) => ({ titulo: h.name, tipo: 'FERIADO', data: h.date, fim: null })),
      ...view.items.filter((i) => !PRIVATE.test(i.title)).map((i) => ({ titulo: i.title, tipo: i.kind, data: i.start, fim: i.end })),
    ],
    jaPlanejados: view.posts.map((p) => ({ data: p.date, assunto: p.topic, formato: p.format, titulo: p.title })),
  };
  const { out, model } = await generateCronograma(ctx, await memoryContext(`${month}-01`));
  const freeSet = new Set(free);
  const byName = <T extends { id: string; name: string }>(list: T[], name: string | null) => (name ? list.find((x) => x.name === name)?.id ?? null : null);
  const rows = out.posts.filter((p) => freeSet.has(p.data)).map((p, i) => ({
    date: dt(p.data)!, channel: p.canal, topic: p.assunto.toUpperCase().slice(0, 60), format: p.formato, title: p.titulo.slice(0, 200),
    body: p.roteiro || null, cta: p.cta, stories: p.stories, pending: p.confirmar,
    campaignId: byName(view.campaigns, p.campanha), eventId: byName(view.events, p.evento), origin: 'IA', position: i, createdBy: principal!.id,
  }));
  return prisma.$transaction(async (tx) => {
    const plan = await draftPlan(tx, principal!, month);
    await tx.mktContentPost.createMany({ data: rows.map((r) => ({ ...r, planId: plan.id })) });
    await audit(tx, { actorId: principal!.id, ...meta }, { action: 'mkt.plan_generated', entityType: 'mkt_content_plan', entityId: plan.id, after: { posts: rows.length, diasLivres: free.length, modelo: model }, summary: `${principal!.name} pediu à IA o cronograma de ${month}: ${rows.length} posts sugeridos` });
    return { created: rows.length, note: out.observacao };
  });
}

/** Cola o cronograma do Google Docs (formato da equipe): entra nos dias, sem repetir título no mesmo dia. */
export async function importPlanText(principal: Principal | null, month: string, text: string, meta: RequestMeta) {
  assertCan(principal, 'mkt.edit');
  checkMonth(month);
  if (text.length > 200_000) throw new AppError('Texto grande demais.');
  const parsed = parsePlanText(text, month);
  if (!parsed.posts.length) throw new AppError('Não achei dias no formato "01/12, TERÇA". Confira se o mês do texto é o mesmo do cronograma.');
  const view = await getCronograma(principal, month);
  const seen = new Set(view.posts.map((p) => `${p.date}|${p.title.toLowerCase()}`));
  const rows = parsed.posts.filter((p) => !seen.has(`${p.date}|${p.title.toLowerCase()}`));
  return prisma.$transaction(async (tx) => {
    const plan = await draftPlan(tx, principal, month);
    if (!plan.objectives && parsed.objectives) await tx.mktContentPlan.update({ where: { id: plan.id }, data: { objectives: parsed.objectives } });
    await tx.mktContentPost.createMany({
      data: rows.map((p: PlanPost, i) => ({
        planId: plan.id, date: dt(p.date)!, channel: p.channel, topic: p.topic.slice(0, 60), format: p.format, title: p.title.slice(0, 200),
        body: p.body, cta: p.cta, stories: p.stories, pending: p.pending,
        campaignId: matchByName(p, view.campaigns)?.id ?? null, eventId: matchByName(p, view.events)?.id ?? null,
        origin: 'DOCS', position: i, createdBy: principal.id,
      })),
    });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'mkt.plan_imported', entityType: 'mkt_content_plan', entityId: plan.id, after: { posts: rows.length, repetidos: parsed.posts.length - rows.length }, summary: `${principal.name} colou o cronograma de ${month} do Docs: ${rows.length} posts` });
    return { created: rows.length, repeated: parsed.posts.length - rows.length, skipped: parsed.skipped.length };
  });
}

/** Texto no formato do Docs (copiar / colar no Google Docs). */
export async function cronogramaText(principal: Principal | null, month: string) {
  const v = await getCronograma(principal, month);
  return planText(month, v.plan?.objectives ?? null, v.posts, Object.fromEntries(v.holidays.map((h) => [h.date, h.name])));
}

export const canApprove = (p: Principal | null) => can(p, 'mkt.approve');
