import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma, type Tx } from '@/server/db';
import { audit } from '@/server/audit';
import { assertCan } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import type { RequestMeta } from '@/server/auth/session';
import { AppError, NotFoundError } from '@/server/errors';
import { isIsoDate } from '@/domain/dates';
import { CAMPAIGN_TYPES } from '@/domain/marketing/constants';
import { dupKey, IMPORT_KINDS, importKind, nextYearSameWeekday, planScheduleImport, type ScheduleItem } from '@/domain/marketing/schedule-import';
import { extractSchedule } from '@/server/marketing/ai/service';
import { dt, iso } from './marketing-service';
import { docBlocks } from './mkt-memory-service';

/**
 * Importação do cronograma de marketing: documento → (IA lê) → revisão humana
 * → eventos, campanhas e datas do calendário. Cada lote pode ser desfeito.
 */

const KIND = 'IMPORTACAO_CRONOGRAMA';
interface Payload { source: string; itens: ScheduleItem[]; avisos: string[] }

async function existingKeys(db: Tx, items: { data: string }[]) {
  if (!items.length) return new Set<string>();
  const dates = items.map((i) => i.data).sort();
  const range = { startDate: { gte: dt(dates[0]!)!, lte: dt(dates.at(-1)!)! } };
  const [ev, ca, it] = await Promise.all([
    db.mktEvent.findMany({ where: range, select: { name: true, startDate: true } }),
    db.mktCampaign.findMany({ where: range, select: { name: true, startDate: true } }),
    db.mktCalendarItem.findMany({ where: range, select: { title: true, startDate: true } }),
  ]);
  return new Set([...ev.map((e) => dupKey(e.name, iso(e.startDate)!)), ...ca.map((c) => dupKey(c.name, iso(c.startDate)!)), ...it.map((i) => dupKey(i.title, iso(i.startDate)!))]);
}

export async function analyzeSchedule(principal: Principal | null, input: { file: File | null; text: string | null }, today: string, meta: RequestMeta) {
  assertCan(principal, 'mkt.admin');
  assertCan(principal, 'mkt.ai');
  const { blocks, source } = await docBlocks(input);
  const { out, version, model } = await extractSchedule(blocks, today);
  const kinds = new Set<string>(IMPORT_KINDS.map((k) => k.id));
  const itens = out.itens.filter((i) => isIsoDate(i.data) && i.titulo?.trim() && kinds.has(i.tipo))
    .map((i) => ({ ...i, titulo: i.titulo.trim(), dataFim: i.dataFim && isIsoDate(i.dataFim) ? i.dataFim : null }));
  const dropped = out.itens.length - itens.length;
  if (!itens.length) throw new AppError('Não encontrei itens com data neste documento.');
  const payload: Payload = { source, itens, avisos: [...out.avisos, ...(dropped ? [`${dropped} item(ns) sem data válida foram ignorados.`] : [])] };
  return prisma.$transaction(async (tx) => {
    const s = await tx.mktAiSuggestion.create({ data: { kind: KIND, payload: payload as unknown as Prisma.InputJsonValue, promptVersion: version, model, createdById: principal.id } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'mkt.schedule_read', entityType: 'mkt_ai_suggestion', entityId: s.id, after: { fonte: source, itens: itens.length }, summary: `${principal.name} pediu à IA a leitura do cronograma "${source}": ${itens.length} item(ns)` });
    return s.id;
  });
}

export async function getScheduleReview(principal: Principal | null, suggestionId: string, today: string) {
  assertCan(principal, 'mkt.admin');
  const s = await prisma.mktAiSuggestion.findUnique({ where: { id: suggestionId } });
  if (!s || s.kind !== KIND) throw new NotFoundError('Leitura não encontrada.');
  const p = s.payload as unknown as Payload;
  return {
    id: s.id, status: s.status, source: p.source, avisos: p.avisos, model: s.model, createdAt: s.createdAt.toISOString(),
    rows: planScheduleImport(p.itens, today, await existingKeys(prisma, p.itens), p.source),
  };
}
export type ScheduleReview = Awaited<ReturnType<typeof getScheduleReview>>;

const decisionSchema = z.array(z.object({
  index: z.number().int().min(0),
  kind: z.enum(IMPORT_KINDS.map((k) => k.id) as [string, ...string[]]),
  title: z.string().trim().min(2, 'Todo item precisa de título.').max(140),
  startDate: z.string().refine(isIsoDate, 'Data inválida.'),
  endDate: z.string().refine(isIsoDate).nullable(),
  status: z.string().max(30),
  campaignType: z.enum(CAMPAIGN_TYPES.map((t) => t.id) as [string, ...string[]]),
})).max(2000);

const EVENT_ST = new Set(['PLANEJADO', 'CONFIRMADO', 'REALIZADO', 'CANCELADO']);
const CAMP_ST = new Set(['IDEIA', 'PLANEJAMENTO', 'FINALIZADA', 'ANALISE']);

/** Grava os itens escolhidos (já revisados) num lote desfazível. Duplicados são pulados. */
export async function commitSchedule(principal: Principal | null, suggestionId: string, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'mkt.admin');
  const r = decisionSchema.safeParse(input);
  if (!r.success) throw new AppError(r.error.issues[0]?.message ?? 'Itens inválidos.');
  if (!r.data.length) throw new AppError('Marque pelo menos um item para importar.');
  return prisma.$transaction(async (tx) => {
    const s = await tx.mktAiSuggestion.findUnique({ where: { id: suggestionId } });
    if (!s || s.kind !== KIND) throw new NotFoundError('Leitura não encontrada.');
    if (s.status !== 'PENDENTE') throw new AppError('Esta leitura já foi importada.');
    const p = s.payload as unknown as Payload;
    const existing = await existingKeys(tx, r.data.map((d) => ({ data: d.startDate })));
    const imp = await tx.mktImport.create({ data: { source: p.source, counts: {}, createdById: principal.id } });
    const counts = { eventos: 0, campanhas: 0, datas: 0, duplicados: 0 };
    for (const d of r.data) {
      const key = dupKey(d.title, d.startDate);
      if (existing.has(key)) { counts.duplicados++; continue; }
      existing.add(key);
      const k = importKind(d.kind);
      const src = p.itens[d.index];
      const notes = [src?.detalhes, src?.parceiro ? `Parceiro/patrocínio: ${src.parceiro}` : null, src?.aConfirmar ? 'A confirmar (no cronograma).' : null, `Importado de: ${p.source}`].filter(Boolean).join('\n').slice(0, 2000);
      const dates = { startDate: dt(d.startDate)!, endDate: d.endDate && d.endDate > d.startDate ? dt(d.endDate) : null };
      if (k.target === 'evento') {
        await tx.mktEvent.create({ data: { name: d.title, ...dates, status: (EVENT_ST.has(d.status) ? d.status : 'PLANEJADO') as 'PLANEJADO', notes, createdById: principal.id, importId: imp.id } });
        counts.eventos++;
      } else if (k.target === 'campanha') {
        await tx.mktCampaign.create({ data: { name: d.title, type: d.campaignType as 'INSTITUCIONAL', status: (CAMP_ST.has(d.status) ? d.status : 'IDEIA') as 'IDEIA', ...dates, objective: src?.detalhes ?? null, notes, createdById: principal.id, importId: imp.id } });
        counts.campanhas++;
      } else {
        await tx.mktCalendarItem.create({ data: { title: d.title, kind: ('calendar' in k ? k.calendar : 'OUTRO') as 'OUTRO', ...dates, description: notes, createdById: principal.id, importId: imp.id } });
        counts.datas++;
      }
    }
    const created = counts.eventos + counts.campanhas + counts.datas;
    if (!created) throw new AppError('Todos os itens marcados já existem no sistema.');
    await tx.mktImport.update({ where: { id: imp.id }, data: { counts } });
    await tx.mktAiSuggestion.update({ where: { id: s.id }, data: { status: created === p.itens.length ? 'ACEITA' : 'PARCIAL', decidedById: principal.id, decidedAt: new Date() } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'mkt.schedule_imported', entityType: 'mkt_import', entityId: imp.id, after: counts, summary: `${principal.name} importou o cronograma "${p.source}": ${counts.eventos} evento(s), ${counts.campanhas} campanha(s), ${counts.datas} data(s)` });
    return { importId: imp.id, ...counts };
  }, { timeout: 60_000, maxWait: 10_000 });
}

export async function listImports(principal: Principal | null) {
  assertCan(principal, 'mkt.admin');
  const rows = await prisma.mktImport.findMany({ orderBy: { createdAt: 'desc' }, take: 20 });
  return rows.map((r) => ({ id: r.id, source: r.source, counts: r.counts as Record<string, number>, createdAt: r.createdAt.toISOString(), undoneAt: r.undoneAt?.toISOString() ?? null }));
}

/** Desfaz um lote: remove o que ainda não foi usado (campanha com tarefas e evento com campanha/tarefas ficam). */
export async function undoImport(principal: Principal | null, importId: string, meta: RequestMeta) {
  assertCan(principal, 'mkt.admin');
  return prisma.$transaction(async (tx) => {
    const imp = await tx.mktImport.findUnique({ where: { id: importId } });
    if (!imp) throw new NotFoundError('Importação não encontrada.');
    if (imp.undoneAt) throw new AppError('Esta importação já foi desfeita.');
    const items = await tx.mktCalendarItem.deleteMany({ where: { importId } });
    const camps = await tx.mktCampaign.deleteMany({ where: { importId, tasks: { none: {} } } });
    const events = await tx.mktEvent.deleteMany({ where: { importId, campaigns: { none: {} }, tasks: { none: {} } } });
    const kept = (await tx.mktCampaign.count({ where: { importId } })) + (await tx.mktEvent.count({ where: { importId } }));
    await tx.mktImport.update({ where: { id: importId }, data: { undoneAt: new Date() } });
    const r = { removidos: items.count + camps.count + events.count, mantidos: kept };
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'mkt.schedule_undone', entityType: 'mkt_import', entityId: importId, after: r, summary: `${principal.name} desfez a importação "${imp.source}": ${r.removidos} removido(s)${kept ? `, ${kept} mantido(s) por já estarem em uso` : ''}` });
    return r;
  });
}

/** Usa um evento do ano como modelo: cria o do ano seguinte no mesmo dia da semana. */
export async function repeatEventNextYear(principal: Principal | null, eventId: string, meta: RequestMeta) {
  assertCan(principal, 'mkt.edit');
  return prisma.$transaction(async (tx) => {
    const e = await tx.mktEvent.findUnique({ where: { id: eventId } });
    if (!e) throw new NotFoundError('Evento não encontrado.');
    const start = nextYearSameWeekday(iso(e.startDate)!);
    if (await tx.mktEvent.findFirst({ where: { name: e.name, startDate: dt(start)! } })) throw new AppError(`Já existe "${e.name}" em ${start.split('-').reverse().join('/')}.`);
    const end = e.endDate ? nextYearSameWeekday(iso(e.endDate)!) : null;
    const n = await tx.mktEvent.create({
      data: {
        name: e.name, startDate: dt(start)!, endDate: dt(end), location: e.location, audience: e.audience, modalityId: e.modalityId, ownerId: e.ownerId, status: 'PLANEJADO',
        notes: [`Modelo: ${e.name} de ${iso(e.startDate)!.split('-').reverse().join('/')} (confirme a data).`, e.notes].filter(Boolean).join('\n').slice(0, 2000), createdById: principal.id,
      },
    });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'mkt.event_repeated', entityType: 'mkt_event', entityId: n.id, after: { modelo: e.id, data: start }, summary: `${principal.name} repetiu "${e.name}" para ${start.split('-').reverse().join('/')}` });
    return { id: n.id, date: start };
  });
}
