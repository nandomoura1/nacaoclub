import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/server/db';
import { audit } from '@/server/audit';
import { assertCan } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import type { RequestMeta } from '@/server/auth/session';
import { AppError, NotFoundError } from '@/server/errors';
import { addDays, isIsoDate } from '@/domain/dates';
import { analyzePerformance, generateCopy, generatePauta, type AnaliseOut, type CopyOut, type PautaOut } from '@/server/marketing/ai/service';
import { FORMATS, PILLARS } from '@/domain/marketing/studio';
import { createTaskIn } from './mkt-task-service';
import { memoryContext } from './mkt-memory-service';
import { campaignBrief } from './mkt-ai-service';
import { performancePanel } from './mkt-performance-service';
import { dt, iso } from './marketing-service';

/**
 * IA Marketing: gera rascunhos (legendas/roteiros, pauta, leitura da
 * Performance) que ficam como sugestão. Nada é publicado nem vira tarefa sem
 * um humano aprovar. Sem dados pessoais: só campanhas, eventos e números agregados.
 */

type CopyPayload = CopyOut & { pedido: { formato: string; pilar: string; campanha: string | null; tema: string | null; instrucoes: string | null }; aprovada?: { index: number; texto: string } };
type PautaPayload = PautaOut & { pedido: { de: string; ate: string; foco: string | null }; tarefas?: Record<number, string> };
type AnalisePayload = AnaliseOut & { pedido: { de: string; ate: string }; tarefas?: Record<number, string> };
export type StudioItem =
  | { id: string; kind: 'COPY'; status: string; model: string | null; createdAt: string; createdBy: string | null; payload: CopyPayload }
  | { id: string; kind: 'PAUTA'; status: string; model: string | null; createdAt: string; createdBy: string | null; payload: PautaPayload }
  | { id: string; kind: 'ANALISE'; status: string; model: string | null; createdAt: string; createdBy: string | null; payload: AnalisePayload };

export async function listStudio(principal: Principal | null): Promise<StudioItem[]> {
  assertCan(principal, 'mkt.view');
  const rows = await prisma.mktAiSuggestion.findMany({ where: { kind: { in: ['COPY', 'PAUTA', 'ANALISE'] } }, orderBy: { createdAt: 'desc' }, take: 40 });
  const users = new Map((await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.createdById).filter(Boolean) as string[] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return rows.map((r) => ({ id: r.id, kind: r.kind, status: r.status, model: r.model, createdAt: r.createdAt.toISOString(), createdBy: r.createdById ? users.get(r.createdById) ?? null : null, payload: r.payload }) as unknown as StudioItem);
}

async function save(principal: Principal, kind: string, payload: unknown, version: string, model: string, campaignId: string | null, summary: string, meta: RequestMeta) {
  return prisma.$transaction(async (tx) => {
    const s = await tx.mktAiSuggestion.create({ data: { kind, campaignId, payload: payload as Prisma.InputJsonValue, promptVersion: version, model, createdById: principal.id } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'mkt.ai_suggested', entityType: 'mkt_ai_suggestion', entityId: s.id, after: { tipo: kind, prompt: version }, summary });
    return s.id;
  });
}

const copySchema = z.object({
  formato: z.enum(FORMATS.map((f) => f.id) as [string, ...string[]]),
  pilar: z.enum(PILLARS.map((p) => p.id) as [string, ...string[]]),
  campaignId: z.string().uuid().nullable(),
  tema: z.string().trim().max(300).nullable(),
  instrucoes: z.string().trim().max(800).nullable(),
});

export async function studioCopy(principal: Principal | null, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'mkt.ai');
  const r = copySchema.safeParse(input);
  if (!r.success) throw new AppError(r.error.issues[0]?.message ?? 'Dados inválidos.');
  const d = r.data;
  if (!d.campaignId && !d.tema) throw new AppError('Escolha uma campanha ou escreva o tema.');
  const brief = d.campaignId ? (await campaignBrief(d.campaignId)).brief : null;
  const { out, version, model } = await generateCopy({ formato: d.formato, pilar: d.pilar, campanha: brief, tema: d.tema || null, instrucoes: d.instrucoes || null }, await memoryContext(brief?.inicio ?? new Date().toISOString().slice(0, 10)));
  const payload: CopyPayload = { ...out, pedido: { formato: d.formato, pilar: d.pilar, campanha: brief?.nome ?? null, tema: d.tema || null, instrucoes: d.instrucoes || null } };
  return save(principal, 'COPY', payload, version, model, d.campaignId, `${principal.name} pediu à IA ${FORMATS.find((f) => f.id === d.formato)!.label.toLowerCase()} sobre ${brief?.nome ?? d.tema}`, meta);
}

export async function studioPauta(principal: Principal | null, input: { de: string; ate: string; foco: string | null }, meta: RequestMeta) {
  assertCan(principal, 'mkt.ai');
  if (!isIsoDate(input.de) || !isIsoDate(input.ate) || input.de > input.ate) throw new AppError('Período inválido.');
  if (input.ate > addDays(input.de, 31)) throw new AppError('Escolha até 31 dias.');
  const [de, ate] = [dt(input.de)!, dt(input.ate)!];
  const overlap = { startDate: { lte: ate }, OR: [{ endDate: { gte: de } }, { endDate: null, startDate: { gte: de } }] };
  const [events, campaigns, items] = await Promise.all([
    prisma.mktEvent.findMany({ where: { ...overlap, status: { not: 'CANCELADO' } }, select: { name: true, startDate: true, endDate: true }, take: 30 }),
    prisma.mktCampaign.findMany({ where: { ...overlap, status: { notIn: ['IDEIA', 'FINALIZADA'] } }, select: { name: true, type: true, startDate: true, endDate: true, offer: true }, take: 30 }),
    prisma.mktCalendarItem.findMany({ where: overlap, select: { title: true, kind: true, startDate: true, endDate: true }, take: 40 }),
  ]);
  const ctx = {
    de: input.de, ate: input.ate, foco: input.foco?.trim().slice(0, 300) || null,
    eventos: events.filter((e) => !/privad|loca[cç][aã]o/i.test(e.name)).map((e) => ({ nome: e.name, data: iso(e.startDate)!, fim: iso(e.endDate) })),
    campanhas: campaigns.map((c) => ({ nome: c.name, tipo: c.type, inicio: iso(c.startDate)!, fim: iso(c.endDate), oferta: c.offer })),
    // Locações/festas privadas não viram conteúdo.
    temas: items.filter((i) => !/privad|loca[cç][aã]o/i.test(i.title)).map((i) => ({ titulo: i.title, tipo: i.kind, data: iso(i.startDate)!, fim: iso(i.endDate) })),
  };
  const { out, version, model } = await generatePauta(ctx, await memoryContext(input.de));
  return save(principal, 'PAUTA', { ...out, pedido: { de: input.de, ate: input.ate, foco: ctx.foco } } satisfies PautaPayload, version, model, null, `${principal.name} pediu à IA a pauta de ${input.de} a ${input.ate}`, meta);
}

export async function studioAnalise(principal: Principal | null, input: { de: string; ate: string }, meta: RequestMeta) {
  assertCan(principal, 'mkt.ai');
  const r = await performancePanel(principal, input.de, input.ate);
  // Só agregados: números, nomes de campanha/origem/link — nenhum lead identificado.
  const facts = { periodo: r.range, periodoAnterior: r.prev, atual: r.current, anterior: r.previous, funil: r.funnel, perdidos: r.lost, origens: r.bySource, campanhas: r.byCampaign, links: r.topLinks.map(({ title, clicks, leads }) => ({ title, clicks, leads })), meses: r.months, valoresEmCentavos: true };
  const { out, version, model } = await analyzePerformance(facts);
  return save(principal, 'ANALISE', { ...out, pedido: { de: input.de, ate: input.ate } } satisfies AnalisePayload, version, model, null, `${principal.name} pediu à IA a leitura da Performance (${input.de} a ${input.ate})`, meta);
}

async function load(id: string, kind: string) {
  const s = await prisma.mktAiSuggestion.findUnique({ where: { id } });
  if (!s || s.kind !== kind) throw new NotFoundError('Sugestão não encontrada.');
  return s;
}

/** Aprova uma variação (com o texto do jeito que a equipe deixou). */
export async function approveCopy(principal: Principal | null, id: string, index: number, texto: string, meta: RequestMeta) {
  assertCan(principal, 'mkt.edit');
  const s = await load(id, 'COPY');
  const p = s.payload as unknown as CopyPayload;
  if (!p.variacoes[index]) throw new AppError('Variação inválida.');
  if (texto.trim().length < 5) throw new AppError('O texto aprovado está vazio.');
  await prisma.$transaction(async (tx) => {
    await tx.mktAiSuggestion.update({ where: { id }, data: { status: 'ACEITA', decidedById: principal.id, decidedAt: new Date(), payload: { ...p, aprovada: { index, texto: texto.trim().slice(0, 5000) } } as unknown as Prisma.InputJsonValue } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'mkt.ai_decided', entityType: 'mkt_ai_suggestion', entityId: id, after: { aprovada: index }, summary: `${principal.name} aprovou o texto “${p.variacoes[index]!.titulo}” da IA` });
  });
}

export async function discardStudio(principal: Principal | null, id: string, meta: RequestMeta) {
  assertCan(principal, 'mkt.edit');
  await prisma.$transaction(async (tx) => {
    const s = await tx.mktAiSuggestion.findUnique({ where: { id } });
    if (!s) throw new NotFoundError('Sugestão não encontrada.');
    await tx.mktAiSuggestion.update({ where: { id }, data: { status: 'RECUSADA', decidedById: principal.id, decidedAt: new Date() } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'mkt.ai_decided', entityType: 'mkt_ai_suggestion', entityId: id, after: { status: 'RECUSADA' }, summary: `${principal.name} descartou uma sugestão da IA (${s.kind})` });
  });
}

/** Pauta ou ação da análise → tarefa no Kanban (o humano escolhe qual). */
export async function studioToTask(principal: Principal | null, id: string, index: number, today: string, meta: RequestMeta) {
  assertCan(principal, 'mkt.edit');
  const s = await prisma.mktAiSuggestion.findUnique({ where: { id } });
  if (!s || !['PAUTA', 'ANALISE'].includes(s.kind)) throw new NotFoundError('Sugestão não encontrada.');
  const p = s.payload as unknown as PautaPayload & AnalisePayload;
  if (p.tarefas?.[index]) throw new AppError('Esta sugestão já virou tarefa.');
  let task: { title: string; description: string; areaKey: string; dueDate: string; campaignName: string | null };
  if (s.kind === 'PAUTA') {
    const i = p.ideias[index];
    if (!i) throw new AppError('Ideia inválida.');
    // Prazo de produção: 2 dias antes da publicação (nunca no passado).
    const due = addDays(i.data, -2) < today ? today : addDays(i.data, -2);
    task = { title: `[${i.formato}] ${i.titulo}`.slice(0, 200), description: `Publicar em ${i.data.split('-').reverse().join('/')} · pilar ${i.pilar.toLowerCase()}\nGancho: ${i.gancho}\nPor quê: ${i.porque}`, areaKey: 'CONTEUDO', dueDate: due, campaignName: i.campanha };
  } else {
    const a = p.acoes[index];
    if (!a?.tarefa) throw new AppError('Esta ação não tem tarefa sugerida.');
    task = { title: a.tarefa.titulo.slice(0, 200), description: `${a.titulo}\nPor quê: ${a.porque}`, areaKey: a.tarefa.area, dueDate: addDays(today, a.tarefa.prazoDias), campaignName: null };
  }
  const campaign = task.campaignName ? await prisma.mktCampaign.findFirst({ where: { name: task.campaignName }, select: { id: true } }) : null;
  return prisma.$transaction(async (tx) => {
    const t = await createTaskIn(tx, principal!, { title: task.title, description: task.description, areaKey: task.areaKey, dueDate: task.dueDate, campaignId: campaign?.id ?? null, origin: 'IA' });
    const tarefas = { ...(p.tarefas ?? {}), [index]: t.id };
    const total = s.kind === 'PAUTA' ? p.ideias.length : p.acoes.filter((a) => a.tarefa).length;
    await tx.mktAiSuggestion.update({ where: { id }, data: { payload: { ...p, tarefas } as unknown as Prisma.InputJsonValue, status: Object.keys(tarefas).length >= total ? 'ACEITA' : 'PARCIAL', decidedById: principal!.id, decidedAt: new Date() } });
    await audit(tx, { actorId: principal!.id, ...meta }, { action: 'mkt.ai_decided', entityType: 'mkt_ai_suggestion', entityId: id, after: { tarefa: t.id }, summary: `${principal!.name} transformou a sugestão da IA em tarefa: ${task.title}` });
    return t.id;
  });
}
