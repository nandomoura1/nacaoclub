import { z } from 'zod';
import type Anthropic from '@anthropic-ai/sdk';
import { prisma, type Tx } from '@/server/db';
import { audit } from '@/server/audit';
import { assertCan } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import type { RequestMeta } from '@/server/auth/session';
import { AppError, NotFoundError } from '@/server/errors';
import { addDays } from '@/domain/dates';
import { CALENDAR_KINDS, CAMPAIGN_TYPES, labelOf } from '@/domain/marketing/constants';
import { fileToBlocks, MAX_FILE_BYTES } from '@/server/financeiro/extract';
import { draftMemory, type MemoryContext } from '@/server/marketing/ai/service';
import { dt, iso } from './marketing-service';

/**
 * Memória da Nação: aprendizados de marketing aprovados pela equipe (de
 * documentos ou escritos à mão) + histórico do mesmo período do ano anterior.
 * É o contexto que a IA recebe ao sugerir tarefas e recomendações.
 */

const MEMORY_CAP = 12_000;
type Block = Anthropic.Beta.BetaContentBlockParam;

/** Documento enviado ou texto colado → blocos para o modelo. */
export async function docBlocks(input: { file: File | null; text: string | null }): Promise<{ blocks: Block[]; source: string }> {
  if (input.file && input.file.size) {
    if (input.file.size > MAX_FILE_BYTES) throw new AppError('Arquivo acima de 6 MB. Exporte só o texto (.docx, .txt) ou divida.');
    if (!/\.(pdf|docx|txt|md|markdown|html?|png|jpe?g|webp)$/i.test(input.file.name)) throw new AppError('Use .docx (Google Docs → Arquivo → Fazer download → Microsoft Word), PDF, TXT ou cole o texto.');
    return { blocks: await fileToBlocks({ bytes: Buffer.from(await input.file.arrayBuffer()), mimeType: input.file.type, filename: input.file.name }), source: input.file.name.slice(0, 200) };
  }
  const t = (input.text ?? '').trim();
  if (t.length < 40) throw new AppError('Envie o documento ou cole o texto (pelo menos algumas linhas).');
  if (t.length > 200_000) throw new AppError('Texto longo demais para uma leitura. Divida em partes.');
  return { blocks: [{ type: 'text', text: t }], source: 'texto colado' };
}

/** Contexto da IA: memória ativa + o que a Nação fez em volta desta data no ano anterior. */
export async function memoryContext(refDate: string, db: Tx = prisma): Promise<MemoryContext> {
  const from = dt(addDays(refDate, -365 - 20))!;
  const to = dt(addDays(refDate, -365 + 45))!;
  const range = { startDate: { gte: from, lte: to } };
  const [notes, events, camps, items] = await Promise.all([
    db.mktKnowledge.findMany({ where: { active: true }, orderBy: { updatedAt: 'desc' } }),
    db.mktEvent.findMany({ where: { ...range, status: { not: 'CANCELADO' } }, orderBy: { startDate: 'asc' }, take: 40 }),
    db.mktCampaign.findMany({ where: range, orderBy: { startDate: 'asc' }, take: 30 }),
    db.mktCalendarItem.findMany({ where: { ...range, kind: { in: ['TEMA_DO_MES', 'SAUDE', 'ACAO_COMERCIAL', 'CONTEUDO', 'DATA_COMEMORATIVA'] } }, orderBy: { startDate: 'asc' }, take: 40 }),
  ]);
  let memoria = '';
  for (const n of notes) {
    const block = `### ${n.title}\n${n.content.trim()}\n\n`;
    if (memoria.length + block.length > MEMORY_CAP) break;
    memoria += block;
  }
  const types = Object.fromEntries(CAMPAIGN_TYPES.map((t) => [t.id, t.label]));
  const historico = [
    ...events.map((e) => ({ d: iso(e.startDate)!, t: `Evento · ${e.name}${e.status === 'CANCELADO' ? ' (cancelado)' : ''}` })),
    ...camps.map((c) => ({ d: iso(c.startDate)!, t: `Campanha (${types[c.type] ?? c.type}) · ${c.name} · status ${c.status.toLowerCase()}` })),
    ...items.map((i) => ({ d: iso(i.startDate)!, t: `${labelOf(CALENDAR_KINDS, i.kind)} · ${i.title}` })),
  ].sort((a, b) => a.d.localeCompare(b.d)).map((x) => `${x.d} · ${x.t}`);
  return { memoria: memoria.trim() || null, historico };
}

// ── CRUD da memória ──────────────────────────────────────────

export async function listKnowledge(principal: Principal | null) {
  assertCan(principal, 'mkt.view');
  const rows = await prisma.mktKnowledge.findMany({ orderBy: [{ active: 'desc' }, { updatedAt: 'desc' }] });
  return rows.map((r) => ({ id: r.id, title: r.title, source: r.source, content: r.content, active: r.active, updatedAt: r.updatedAt.toISOString() }));
}
export type KnowledgeRow = Awaited<ReturnType<typeof listKnowledge>>[number];

export async function draftKnowledge(principal: Principal | null, input: { file: File | null; text: string | null }, meta: RequestMeta) {
  assertCan(principal, 'mkt.admin');
  assertCan(principal, 'mkt.ai');
  const { blocks, source } = await docBlocks(input);
  const d = await draftMemory(blocks);
  await prisma.$transaction((tx) => audit(tx, { actorId: principal.id, ...meta }, { action: 'mkt.memory_draft', entityType: 'mkt_knowledge', after: { fonte: source, prompt: d.version, modelo: d.model }, summary: `${principal.name} pediu à IA os aprendizados de "${source}"` }));
  return { title: d.titulo.slice(0, 140), content: d.aprendizados.slice(0, 8000), source };
}

const knowledgeSchema = z.object({
  title: z.string().trim().min(3, 'Dê um título.').max(140),
  content: z.string().trim().min(20, 'Escreva os aprendizados (pelo menos uma linha).').max(8000),
  source: z.string().trim().max(200).nullable().optional(),
  active: z.boolean().default(true),
});

export async function saveKnowledge(principal: Principal | null, id: string | null, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'mkt.admin');
  const r = knowledgeSchema.safeParse(input);
  if (!r.success) throw new AppError(r.error.issues[0]?.message ?? 'Dados inválidos.');
  const d = r.data;
  return prisma.$transaction(async (tx) => {
    const k = id
      ? await tx.mktKnowledge.update({ where: { id }, data: { title: d.title, content: d.content, active: d.active, updatedById: principal.id } })
      : await tx.mktKnowledge.create({ data: { title: d.title, content: d.content, source: d.source || 'manual', active: d.active, createdById: principal.id, updatedById: principal.id } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: id ? 'mkt.memory_updated' : 'mkt.memory_created', entityType: 'mkt_knowledge', entityId: k.id, after: { titulo: k.title, ativa: k.active, caracteres: k.content.length }, summary: `${principal.name} ${id ? 'editou' : 'incluiu'} a memória "${k.title}"${k.active ? '' : ' (inativa)'}` });
    return k.id;
  });
}

export async function deleteKnowledge(principal: Principal | null, id: string, meta: RequestMeta) {
  assertCan(principal, 'mkt.admin');
  await prisma.$transaction(async (tx) => {
    const k = await tx.mktKnowledge.findUnique({ where: { id } });
    if (!k) throw new NotFoundError('Memória não encontrada.');
    await tx.mktKnowledge.delete({ where: { id } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'mkt.memory_deleted', entityType: 'mkt_knowledge', entityId: id, before: { titulo: k.title }, summary: `${principal.name} excluiu a memória "${k.title}"` });
  });
}
