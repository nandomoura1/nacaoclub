import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { FinLine, Prisma } from '@prisma/client';
import { prisma, type Tx } from '@/server/db';
import { audit } from '@/server/audit';
import { assertCan } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import type { RequestMeta } from '@/server/auth/session';
import { AppError, NotFoundError } from '@/server/errors';
import { isMonth, monthLabel, type Month } from '@/domain/condominio/months';
import { computeMetrics, DEFAULT_TARGETS, type FinLineData, type Metrics, type Targets } from '@/domain/financeiro/metrics';
import { DATASETS, DEFAULT_CATEGORIES, DOC_KINDS, type CategoryDef, type Dataset, type DocKind } from '@/domain/financeiro/taxonomy';
import { ACCEPTED, MAX_FILE_BYTES, extractDocument, fileToBlocks, toLineInput, type Extraction } from '@/server/financeiro/extract';
import { analysisInput, generateAnalysis, type Analysis } from '@/server/financeiro/analysis';

/**
 * Relatório Financeiro: competência → documentos → extração (IA) →
 * conferência humana → aprovação (versão congelada) → indicadores (motor) →
 * análise (IA, só texto). Histórico e painel usam sempre a última versão aprovada.
 */

const num = (d: Prisma.Decimal | number | null | undefined) => (d === null || d === undefined ? null : Number(d));
function assertMonth(month: string): asserts month is Month {
  if (!isMonth(month)) throw new AppError('Competência inválida (use AAAA-MM).');
}
const DATASET_IDS = DATASETS.map((d) => d.id) as [Dataset, ...Dataset[]];

// ── Configurações ──────────────────────────────────────────

export async function getFinTargets(db: Tx = prisma): Promise<Targets> {
  const s = await db.finSettings.findUnique({ where: { id: 1 } });
  return { ...DEFAULT_TARGETS, ...((s?.targets ?? {}) as Partial<Targets>) };
}

const nullableNum = (schema: z.ZodNumber) => z.preprocess((v) => (v === null || v === undefined || v === '' ? null : Number(v)), schema.nullable());
const targetsSchema = z.object({
  cmvMaxPct: nullableNum(z.number().min(0).max(100)),
  personnelMaxPct: nullableNum(z.number().min(0).max(100)),
  cashMinCents: nullableNum(z.number().int().min(0)),
  payrollVarAlertPct: z.coerce.number().min(0).max(100),
  cmvVarAlertPp: z.coerce.number().min(0).max(100),
  tennisSharePct: z.coerce.number().min(0).max(100),
});

export async function saveFinTargets(principal: Principal | null, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'fin.admin');
  const p = targetsSchema.safeParse(input);
  if (!p.success) throw new AppError(p.error.issues[0]?.message ?? 'Dados inválidos.');
  await prisma.$transaction(async (tx) => {
    const before = await getFinTargets(tx);
    await tx.finSettings.upsert({ where: { id: 1 }, create: { id: 1, targets: p.data }, update: { targets: p.data } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'fin.targets', entityType: 'fin_settings', entityId: '1', before, after: p.data, summary: `${principal.name} alterou as metas do Relatório Financeiro` });
  });
}

export async function listCategories(db: Tx = prisma): Promise<(CategoryDef & { active: boolean })[]> {
  const rows = await db.finCategory.findMany({ orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }] });
  if (!rows.length) return DEFAULT_CATEGORIES.map((c) => ({ ...c, active: true }));
  return rows.map((r) => ({ key: r.key, label: r.label, kind: r.kind as CategoryDef['kind'], classification: r.classification as CategoryDef['classification'], personnel: r.personnel, operatingRevenue: r.operatingRevenue, sortOrder: r.sortOrder, active: r.active }));
}

const categorySchema = z.object({
  key: z.string().trim().regex(/^[a-z][a-z0-9_.]{2,60}$/, 'Chave: letras minúsculas, números, ponto e _ (ex.: desp.seguranca).'),
  label: z.string().trim().min(2).max(80),
  kind: z.enum(['RECEITA', 'DESPESA']),
  classification: z.enum(['RECEITA', 'OPEX', 'CAPEX', 'FINANCEIRO', 'DISTRIBUICAO', 'AJUSTE']),
  personnel: z.boolean(),
  operatingRevenue: z.boolean(),
  active: z.boolean(),
});

export async function saveCategory(principal: Principal | null, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'fin.admin');
  const p = categorySchema.safeParse(input);
  if (!p.success) throw new AppError(p.error.issues[0]?.message ?? 'Dados inválidos.');
  const d = p.data;
  if (d.kind === 'RECEITA' && d.personnel) throw new AppError('Receita não entra no custo de pessoal.');
  await prisma.$transaction(async (tx) => {
    const before = await tx.finCategory.findUnique({ where: { key: d.key } });
    const sortOrder = before?.sortOrder ?? ((await tx.finCategory.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? 0) + 1;
    await tx.finCategory.upsert({ where: { key: d.key }, create: { ...d, sortOrder }, update: d });
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: before ? 'fin.category_updated' : 'fin.category_created', entityType: 'fin_category', entityId: d.key, before, after: d,
      summary: `${principal.name} ${before ? 'alterou' : 'criou'} a categoria financeira "${d.label}" (${d.key})`,
    });
  });
}

// ── Leitura ────────────────────────────────────────────────

const toData = (l: FinLine): FinLineData => ({
  dataset: l.dataset as Dataset, key: l.key, label: l.label, unit: l.unit, amountCents: l.amountCents, quantity: num(l.quantity),
  classification: l.classification, meta: (l.meta as Record<string, unknown> | null) ?? null,
});

export interface VersionSnapshot {
  number: number;
  lines: (FinLineData & { status: string; sourceRef: string | null; documentId: string | null })[];
  metrics: Metrics;
  documents: { id: string; kind: string; filename: string; sha256: string }[];
  managerNotes: string | null;
  partnerDecisions: string | null;
  analysis: Analysis | null;
  targets: Targets;
}

/** Última versão aprovada antes do mês (para comparação e alertas de variação). */
async function previousApproved(db: Tx, month: Month): Promise<{ month: Month; m: Metrics } | null> {
  const p = await db.finPeriod.findFirst({ where: { month: { lt: month }, version: { gt: 0 } }, orderBy: { month: 'desc' } });
  if (!p) return null;
  const v = await db.finVersion.findUnique({ where: { periodId_number: { periodId: p.id, number: p.version } } });
  return v ? { month: p.month as Month, m: (v.snapshot as unknown as VersionSnapshot).metrics } : null;
}

async function liveMetrics(db: Tx, periodId: string, month: Month) {
  const [lines, cats, targets, prev] = await Promise.all([
    db.finLine.findMany({ where: { periodId } }), listCategories(db), getFinTargets(db), previousApproved(db, month),
  ]);
  return { metrics: computeMetrics(lines.map(toData), cats, targets, prev?.m ?? null), prev, targets, lines };
}

export async function listFinPeriods(principal: Principal | null) {
  assertCan(principal, 'fin.view');
  const rows = await prisma.finPeriod.findMany({
    orderBy: { month: 'desc' },
    include: { _count: { select: { documents: true, lines: true } }, lines: { where: { status: 'EXTRACTED' }, select: { id: true } } },
  });
  return rows.map((p) => ({ month: p.month as Month, status: p.status, version: p.version, documents: p._count.documents, lines: p._count.lines, pending: p.lines.length, approvedAt: p.approvedAt?.toISOString() ?? null }));
}

export async function getFinPeriod(principal: Principal | null, month: string) {
  assertCan(principal, 'fin.view');
  assertMonth(month);
  const p = await prisma.finPeriod.findUnique({
    where: { month },
    include: {
      documents: { orderBy: { createdAt: 'asc' }, select: { id: true, kind: true, filename: true, mimeType: true, sizeBytes: true, status: true, origin: true, version: true, notes: true, error: true, detectedMonth: true, createdAt: true, uploadedById: true, extraction: true } },
      versions: { orderBy: { number: 'desc' }, select: { number: true, reason: true, createdAt: true, createdById: true } },
      reconciliations: true,
    },
  });
  if (!p) throw new NotFoundError(`A competência ${monthLabel(month)} ainda não foi criada.`);
  const { metrics, prev, lines } = await liveMetrics(prisma, p.id, month);
  const userIds = [...new Set([...p.documents.map((d) => d.uploadedById), ...p.versions.map((v) => v.createdById), ...lines.map((l) => l.confirmedById)].filter((x): x is string => !!x))];
  const users = new Map((await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return {
    id: p.id, month, status: p.status, version: p.version, managerNotes: p.managerNotes, partnerDecisions: p.partnerDecisions,
    analysis: (p.analysis as unknown as Analysis | null) ?? null, approvedAt: p.approvedAt?.toISOString() ?? null,
    documents: p.documents.map((d) => ({
      id: d.id, kind: d.kind as DocKind, filename: d.filename, sizeBytes: d.sizeBytes, status: d.status, origin: d.origin, version: d.version, notes: d.notes, error: d.error,
      detectedMonth: d.detectedMonth, createdAt: d.createdAt.toISOString(), uploadedBy: d.uploadedById ? users.get(d.uploadedById) ?? null : null,
      warnings: ((d.extraction as unknown as Extraction | null)?.avisos ?? []), identified: (d.extraction as unknown as Extraction | null)?.tipoIdentificado ?? null,
    })),
    lines: lines.sort((a, b) => a.dataset.localeCompare(b.dataset) || (b.amountCents ?? 0) - (a.amountCents ?? 0)).map((l) => ({
      id: l.id, dataset: l.dataset as Dataset, key: l.key, label: l.label, unit: l.unit, amountCents: l.amountCents, quantity: num(l.quantity), classification: l.classification,
      meta: (l.meta as Record<string, unknown> | null) ?? null, documentId: l.documentId, sourceRef: l.sourceRef, sourceValue: l.sourceValue, rule: l.rule, status: l.status,
      confirmedBy: l.confirmedById ? users.get(l.confirmedById) ?? null : null,
    })),
    metrics,
    previous: prev,
    versions: p.versions.map((v) => ({ number: v.number, reason: v.reason, createdAt: v.createdAt.toISOString(), createdBy: v.createdById ? users.get(v.createdById) ?? null : null })),
    reconciliations: Object.fromEntries(p.reconciliations.map((r) => [r.key, r.justification])),
  };
}
export type FinPeriodView = Awaited<ReturnType<typeof getFinPeriod>>;

export async function getFinVersion(principal: Principal | null, month: string, number: number) {
  assertCan(principal, 'fin.view');
  assertMonth(month);
  const p = await prisma.finPeriod.findUnique({ where: { month } });
  if (!p) throw new NotFoundError('Competência não encontrada.');
  const v = await prisma.finVersion.findUnique({ where: { periodId_number: { periodId: p.id, number } } });
  if (!v) throw new NotFoundError('Versão não encontrada.');
  return { month, number, reason: v.reason, createdAt: v.createdAt.toISOString(), snapshot: v.snapshot as unknown as VersionSnapshot };
}

/** Série histórica: a última versão aprovada de cada mês. */
export async function finHistory(principal: Principal | null) {
  assertCan(principal, 'fin.view');
  const periods = await prisma.finPeriod.findMany({ where: { version: { gt: 0 } }, orderBy: { month: 'asc' } });
  const versions = await prisma.finVersion.findMany({ where: { OR: periods.map((p) => ({ periodId: p.id, number: p.version })) } });
  return periods.map((p) => {
    const v = versions.find((x) => x.periodId === p.id)!;
    const s = v.snapshot as unknown as VersionSnapshot;
    return { month: p.month as Month, version: p.version, status: p.status, m: s.metrics, notes: s.managerNotes, analysis: s.analysis };
  });
}

// ── Competência ────────────────────────────────────────────

export async function createFinPeriod(principal: Principal | null, month: string, meta: RequestMeta) {
  assertCan(principal, 'fin.edit');
  assertMonth(month);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.finPeriod.findUnique({ where: { month } });
    if (existing) return { month, existed: true };
    const p = await tx.finPeriod.create({ data: { month, createdById: principal.id } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'fin.period_created', entityType: 'fin_period', entityId: p.id, summary: `${principal.name} criou o Relatório Financeiro de ${monthLabel(month)} (rascunho)` });
    return { month, existed: false };
  });
}

export async function saveFinNotes(principal: Principal | null, month: string, input: { managerNotes?: string | null; partnerDecisions?: string | null }, meta: RequestMeta) {
  assertCan(principal, 'fin.edit');
  assertMonth(month);
  const clean = (v: string | null | undefined) => (v ?? '').trim().slice(0, 4000) || null;
  await prisma.$transaction(async (tx) => {
    const p = await tx.finPeriod.findUnique({ where: { month } });
    if (!p) throw new NotFoundError('Competência não encontrada.');
    const data = { managerNotes: clean(input.managerNotes), partnerDecisions: clean(input.partnerDecisions) };
    await tx.finPeriod.update({ where: { id: p.id }, data });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'fin.notes', entityType: 'fin_period', entityId: p.id, before: { managerNotes: p.managerNotes, partnerDecisions: p.partnerDecisions }, after: data, summary: `${principal.name} atualizou as observações/decisões de ${monthLabel(month)}` });
  });
}

export async function saveReconciliation(principal: Principal | null, month: string, key: string, justification: string, meta: RequestMeta) {
  assertCan(principal, 'fin.edit');
  assertMonth(month);
  const j = justification.trim().slice(0, 1000);
  await prisma.$transaction(async (tx) => {
    const p = await tx.finPeriod.findUnique({ where: { month } });
    if (!p) throw new NotFoundError('Competência não encontrada.');
    if (!j) await tx.finReconciliation.deleteMany({ where: { periodId: p.id, key } });
    else await tx.finReconciliation.upsert({ where: { periodId_key: { periodId: p.id, key } }, create: { periodId: p.id, key, justification: j, updatedById: principal.id }, update: { justification: j, updatedById: principal.id } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'fin.reconciliation', entityType: 'fin_period', entityId: p.id, after: { key, justification: j }, summary: `${principal.name} justificou a conciliação "${key}" de ${monthLabel(month)}` });
  });
}

// ── Documentos ─────────────────────────────────────────────

async function storeDocument(tx: Tx, principal: Principal, f: File, opts: { periodId: string | null; kind: DocKind; origin: 'UPLOAD' | 'HISTORICO'; notes?: string | null }) {
  if (!ACCEPTED.test(f.name)) throw new AppError(`Formato não aceito: ${f.name}. Use PDF, XLSX, CSV, PNG, JPG, DOCX, TXT, MD ou HTML (XLS antigo: salve como .xlsx).`);
  if (f.size > MAX_FILE_BYTES) throw new AppError(`${f.name} passa de 6 MB. Envie um arquivo menor (ou divida o PDF).`);
  const bytes = Buffer.from(await f.arrayBuffer());
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (opts.periodId) {
    const dup = await tx.finDocument.findFirst({ where: { periodId: opts.periodId, sha256 } });
    if (dup) throw new AppError(`Este arquivo já foi enviado nesta competência (${dup.filename}).`);
  }
  const version = opts.periodId ? (await tx.finDocument.count({ where: { periodId: opts.periodId, kind: opts.kind } })) + 1 : 1;
  return tx.finDocument.create({
    data: {
      periodId: opts.periodId, kind: opts.kind, filename: f.name.slice(0, 200), mimeType: f.type || 'application/octet-stream', sizeBytes: f.size, sha256,
      origin: opts.origin, version, notes: opts.notes?.trim().slice(0, 500) || null, uploadedById: principal.id, status: 'PROCESSING', file: { create: { data: bytes } },
    },
  });
}

export async function uploadFinDocument(principal: Principal | null, month: string, kind: string, file: File, notes: string | null, meta: RequestMeta) {
  assertCan(principal, 'fin.import');
  assertMonth(month);
  if (!DOC_KINDS.some((k) => k.id === kind)) throw new AppError('Tipo de documento inválido.');
  return prisma.$transaction(async (tx) => {
    const p = await tx.finPeriod.findUnique({ where: { month } });
    if (!p) throw new NotFoundError('Crie a competência antes de enviar documentos.');
    const d = await storeDocument(tx, principal, file, { periodId: p.id, kind: kind as DocKind, origin: 'UPLOAD', notes });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'fin.doc_uploaded', entityType: 'fin_document', entityId: d.id, after: { kind, filename: d.filename, sha256: d.sha256 }, summary: `${principal.name} enviou "${d.filename}" (${DOC_KINDS.find((k) => k.id === kind)!.label}) em ${monthLabel(month)}` });
    return d.id;
  });
}

const lineInputSchema = z.object({
  dataset: z.enum(DATASET_IDS),
  key: z.string().trim().max(80).nullable(),
  label: z.string().trim().min(1, 'Toda linha precisa de um rótulo.').max(200),
  unit: z.string().trim().max(120).nullable(),
  amountCents: z.number().int().min(-100_000_000_000).max(100_000_000_000).nullable(),
  quantity: z.number().min(-1e9).max(1e9).nullable(),
  classification: z.string().trim().max(20).nullable(),
  meta: z.record(z.unknown()).nullable(),
  sourceRef: z.string().max(200).nullable().optional(),
  sourceValue: z.string().max(300).nullable().optional(),
  rule: z.string().max(300).nullable().optional(),
}).refine((l) => l.amountCents !== null || l.quantity !== null, 'Linha sem valor nem quantidade.');

/** Extrai as linhas do documento (troca as ainda não conferidas desse documento). */
export async function processFinDocument(principal: Principal | null, documentId: string, meta: RequestMeta) {
  assertCan(principal, 'fin.import');
  const doc = await prisma.finDocument.findUnique({ where: { id: documentId }, include: { file: true, period: true } });
  if (!doc || !doc.file) throw new NotFoundError('Documento não encontrado.');
  if (!doc.period) throw new AppError('Documento sem competência.');
  let ex: Extraction;
  try {
    ex = await extractDocument(doc.kind as DocKind, await fileToBlocks({ bytes: Buffer.from(doc.file.data), mimeType: doc.mimeType, filename: doc.filename }), doc.period.month);
  } catch (e) {
    const msg = e instanceof AppError ? e.message : 'Falha ao ler o documento.';
    await prisma.finDocument.update({ where: { id: documentId }, data: { status: 'ERROR', error: msg } });
    throw e instanceof AppError ? e : new AppError(msg);
  }
  const month = doc.period.month as Month;
  const avisos = [...ex.avisos];
  if (ex.competencia && isMonth(ex.competencia) && ex.competencia !== month) avisos.unshift(`O documento parece ser de ${monthLabel(ex.competencia)}, não de ${monthLabel(month)}. Confira antes de aprovar.`);
  const valid = ex.linhas.map(toLineInput).map((l) => lineInputSchema.safeParse(l)).filter((r) => r.success).map((r) => r.data!);
  const dropped = ex.linhas.length - valid.length;
  if (dropped) avisos.push(`${dropped} linha(s) sem valor foram ignoradas.`);
  return prisma.$transaction(async (tx) => {
    await tx.finLine.deleteMany({ where: { documentId, status: 'EXTRACTED' } });
    await tx.finLine.createMany({ data: valid.map((l) => ({ ...l, meta: (l.meta ?? undefined) as Prisma.InputJsonValue | undefined, periodId: doc.periodId!, documentId, createdById: principal.id, status: 'EXTRACTED' as const })) });
    await tx.finDocument.update({
      where: { id: documentId },
      data: { status: avisos.length ? 'DIVERGENT' : 'PENDING_REVIEW', error: null, extraction: { ...ex, avisos } as unknown as Prisma.InputJsonValue, detectedMonth: ex.competencia && isMonth(ex.competencia) ? ex.competencia : null },
    });
    if (doc.period!.status !== 'REVIEW') await tx.finPeriod.update({ where: { id: doc.periodId! }, data: { status: 'REVIEW' } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'fin.doc_extracted', entityType: 'fin_document', entityId: documentId, after: { linhas: valid.length, avisos: avisos.length }, summary: `${principal.name} processou "${doc.filename}": ${valid.length} dado(s) para conferir${avisos.length ? `, ${avisos.length} aviso(s)` : ''}` });
    return { lines: valid.length, warnings: avisos };
  });
}

export async function deleteFinDocument(principal: Principal | null, documentId: string, meta: RequestMeta) {
  assertCan(principal, 'fin.import');
  await prisma.$transaction(async (tx) => {
    const d = await tx.finDocument.findUnique({ where: { id: documentId }, include: { lines: { where: { status: { in: ['CONFIRMED', 'EDITED'] } }, select: { id: true } } } });
    if (!d) throw new NotFoundError('Documento não encontrado.');
    if (d.lines.length) throw new AppError(`Há ${d.lines.length} dado(s) já conferido(s) deste documento. Exclua ou edite esses dados antes de remover o arquivo.`);
    await tx.finLine.deleteMany({ where: { documentId } });
    await tx.finDocument.delete({ where: { id: documentId } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'fin.doc_deleted', entityType: 'fin_document', entityId: documentId, before: { filename: d.filename, kind: d.kind, sha256: d.sha256 }, summary: `${principal.name} removeu o documento "${d.filename}"` });
  });
}

export async function getFinDocumentFile(principal: Principal | null, documentId: string) {
  assertCan(principal, 'fin.view');
  const d = await prisma.finDocument.findUnique({ where: { id: documentId }, include: { file: true } });
  if (!d || !d.file) throw new NotFoundError('Documento não encontrado.');
  return { filename: d.filename, mimeType: d.mimeType, data: Buffer.from(d.file.data) };
}

// ── Conferência ────────────────────────────────────────────

async function editablePeriod(tx: Tx, periodId: string) {
  const p = await tx.finPeriod.findUnique({ where: { id: periodId } });
  if (!p) throw new NotFoundError('Competência não encontrada.');
  return p;
}

export async function confirmFinLines(principal: Principal | null, month: string, ids: string[] | 'all', meta: RequestMeta) {
  assertCan(principal, 'fin.edit');
  assertMonth(month);
  return prisma.$transaction(async (tx) => {
    const p = await tx.finPeriod.findUnique({ where: { month } });
    if (!p) throw new NotFoundError('Competência não encontrada.');
    const r = await tx.finLine.updateMany({
      where: { periodId: p.id, status: 'EXTRACTED', ...(ids === 'all' ? {} : { id: { in: ids } }) },
      data: { status: 'CONFIRMED', confirmedById: principal.id, confirmedAt: new Date() },
    });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'fin.lines_confirmed', entityType: 'fin_period', entityId: p.id, after: { confirmados: r.count }, summary: `${principal.name} confirmou ${r.count} dado(s) de ${monthLabel(month)}` });
    return r.count;
  });
}

const editSchema = lineInputSchema.innerType().partial().extend({ reason: z.string().trim().max(300).optional() });

export async function updateFinLine(principal: Principal | null, lineId: string, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'fin.edit');
  const p = editSchema.safeParse(input);
  if (!p.success) throw new AppError(p.error.issues[0]?.message ?? 'Dados inválidos.');
  const { reason, ...patch } = p.data;
  await prisma.$transaction(async (tx) => {
    const l = await tx.finLine.findUnique({ where: { id: lineId } });
    if (!l) throw new NotFoundError('Dado não encontrado.');
    const period = await editablePeriod(tx, l.periodId);
    if (period.version > 0 && (!reason || reason.length < 3)) throw new AppError('Esta competência já foi aprovada: informe o motivo da alteração.');
    const next = { ...patch, meta: patch.meta === undefined ? undefined : ((patch.meta ?? undefined) as Prisma.InputJsonValue | undefined) };
    const after = await tx.finLine.update({ where: { id: lineId }, data: { ...next, status: l.status === 'MANUAL' ? 'MANUAL' : 'EDITED', confirmedById: principal.id, confirmedAt: new Date() } });
    if (after.amountCents === null && after.quantity === null) throw new AppError('O dado precisa de um valor ou quantidade.');
    if (period.status === 'APPROVED') await tx.finPeriod.update({ where: { id: period.id }, data: { status: 'REVIEW' } });
    const pick = (x: typeof l) => ({ dataset: x.dataset, key: x.key, label: x.label, unit: x.unit, amountCents: x.amountCents, quantity: num(x.quantity), classification: x.classification, meta: x.meta });
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: 'fin.line_edited', entityType: 'fin_line', entityId: lineId, before: pick(l), after: { ...pick(after), motivo: reason ?? null },
      summary: `${principal.name} corrigiu "${l.label}" em ${monthLabel(period.month as Month)}${reason ? ` — motivo: ${reason}` : ''}`,
    });
  });
}

export async function addFinLine(principal: Principal | null, month: string, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'fin.edit');
  assertMonth(month);
  const p = lineInputSchema.and(z.object({ reason: z.string().trim().max(300).optional() })).safeParse(input);
  if (!p.success) throw new AppError(p.error.issues[0]?.message ?? 'Dados inválidos.');
  const { reason, ...l } = p.data;
  return prisma.$transaction(async (tx) => {
    const period = await tx.finPeriod.findUnique({ where: { month } });
    if (!period) throw new NotFoundError('Competência não encontrada.');
    if (period.version > 0 && (!reason || reason.length < 3)) throw new AppError('Esta competência já foi aprovada: informe o motivo da inclusão.');
    const row = await tx.finLine.create({ data: { ...l, meta: (l.meta ?? undefined) as Prisma.InputJsonValue | undefined, periodId: period.id, status: 'MANUAL', rule: l.rule ?? 'Lançamento manual', createdById: principal.id, confirmedById: principal.id, confirmedAt: new Date() } });
    if (period.status !== 'REVIEW') await tx.finPeriod.update({ where: { id: period.id }, data: { status: 'REVIEW' } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'fin.line_added', entityType: 'fin_line', entityId: row.id, after: { ...l, motivo: reason ?? null }, summary: `${principal.name} incluiu "${l.label}" à mão em ${monthLabel(month)}` });
    return row.id;
  });
}

export async function deleteFinLine(principal: Principal | null, lineId: string, reason: string | null, meta: RequestMeta) {
  assertCan(principal, 'fin.edit');
  await prisma.$transaction(async (tx) => {
    const l = await tx.finLine.findUnique({ where: { id: lineId } });
    if (!l) throw new NotFoundError('Dado não encontrado.');
    const period = await editablePeriod(tx, l.periodId);
    if (period.version > 0 && (!reason || reason.trim().length < 3)) throw new AppError('Esta competência já foi aprovada: informe o motivo da exclusão.');
    await tx.finLine.delete({ where: { id: lineId } });
    if (period.status === 'APPROVED') await tx.finPeriod.update({ where: { id: period.id }, data: { status: 'REVIEW' } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'fin.line_deleted', entityType: 'fin_line', entityId: lineId, before: { label: l.label, dataset: l.dataset, key: l.key, amountCents: l.amountCents, quantity: num(l.quantity) }, after: { motivo: reason }, summary: `${principal.name} excluiu "${l.label}" de ${monthLabel(period.month as Month)}${reason ? ` — motivo: ${reason}` : ''}` });
  });
}

// ── Aprovação e versões ────────────────────────────────────

async function approveIn(tx: Tx, principal: Principal, periodId: string, reason: string | null) {
  const p = await tx.finPeriod.findUniqueOrThrow({ where: { id: periodId } });
  const pending = await tx.finLine.count({ where: { periodId, status: 'EXTRACTED' } });
  if (pending) throw new AppError(`Ainda há ${pending} dado(s) para conferir. Confirme ou corrija antes de aprovar.`);
  const { metrics, lines, targets } = await liveMetrics(tx, periodId, p.month as Month);
  if (!lines.length) throw new AppError('Não há dados para aprovar.');
  const docs = await tx.finDocument.findMany({ where: { periodId }, select: { id: true, kind: true, filename: true, sha256: true } });
  const number = p.version + 1;
  const snapshot: VersionSnapshot = {
    number,
    lines: lines.map((l) => ({ ...toData(l), status: l.status, sourceRef: l.sourceRef, documentId: l.documentId })),
    metrics, documents: docs, managerNotes: p.managerNotes, partnerDecisions: p.partnerDecisions,
    analysis: (p.analysis as unknown as Analysis | null) ?? null, targets,
  };
  await tx.finVersion.create({ data: { periodId, number, reason: reason?.trim().slice(0, 300) || null, snapshot: snapshot as unknown as Prisma.InputJsonValue, createdById: principal.id } });
  await tx.finPeriod.update({ where: { id: periodId }, data: { status: 'APPROVED', version: number, approvedAt: new Date(), approvedById: principal.id } });
  await tx.finDocument.updateMany({ where: { periodId, status: { in: ['PENDING_REVIEW', 'EXTRACTED', 'DIVERGENT'] } }, data: { status: 'APPROVED' } });
  return { number, metrics };
}

export async function approveFinPeriod(principal: Principal | null, month: string, reason: string | null, meta: RequestMeta) {
  assertCan(principal, 'fin.approve');
  assertMonth(month);
  return prisma.$transaction(async (tx) => {
    const p = await tx.finPeriod.findUnique({ where: { month } });
    if (!p) throw new NotFoundError('Competência não encontrada.');
    if (p.version > 0 && (!reason || reason.trim().length < 3)) throw new AppError('Informe o motivo da nova versão (ex.: "correção da folha").');
    const r = await approveIn(tx, principal, p.id, reason);
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'fin.period_approved', entityType: 'fin_period', entityId: p.id, after: { versao: r.number, motivo: reason }, summary: `${principal.name} aprovou ${monthLabel(month)} — versão ${r.number}${reason ? ` (${reason})` : ''}` });
    return r.number;
  }, { timeout: 30_000 });
}

// ── Análise (IA, só texto) ─────────────────────────────────

export async function runFinAnalysis(principal: Principal | null, month: string, meta: RequestMeta) {
  assertCan(principal, 'fin.edit');
  assertMonth(month);
  const p = await prisma.finPeriod.findUnique({ where: { month } });
  if (!p) throw new NotFoundError('Competência não encontrada.');
  const { metrics, prev, lines } = await liveMetrics(prisma, p.id, month);
  if (!lines.length) throw new AppError('Envie e confira os documentos antes de gerar a análise.');
  const analysis = await generateAnalysis(analysisInput(month, metrics, prev, p.managerNotes, p.partnerDecisions));
  await prisma.$transaction(async (tx) => {
    await tx.finPeriod.update({ where: { id: p.id }, data: { analysis: analysis as unknown as Prisma.InputJsonValue, analysisAt: new Date() } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'fin.analysis', entityType: 'fin_period', entityId: p.id, summary: `${principal.name} gerou a análise do Relatório Financeiro de ${monthLabel(month)}` });
  });
  return analysis;
}

// ── Importação de relatórios antigos ───────────────────────

export async function analyzeHistoricReport(principal: Principal | null, file: File, meta: RequestMeta) {
  assertCan(principal, 'fin.import');
  const doc = await prisma.$transaction((tx) => storeDocument(tx, principal!, file, { periodId: null, kind: 'RELATORIO_ANTERIOR', origin: 'HISTORICO' }));
  let ex: Extraction;
  try {
    ex = await extractDocument('RELATORIO_ANTERIOR', await fileToBlocks({ bytes: Buffer.from(await file.arrayBuffer()), mimeType: file.type, filename: file.name }), null);
  } catch (e) {
    await prisma.finDocument.update({ where: { id: doc.id }, data: { status: 'ERROR', error: e instanceof AppError ? e.message : 'Falha ao ler.' } });
    throw e;
  }
  const month = ex.competencia && isMonth(ex.competencia) ? ex.competencia : null;
  await prisma.$transaction(async (tx) => {
    await tx.finDocument.update({ where: { id: doc.id }, data: { status: 'PENDING_REVIEW', extraction: ex as unknown as Prisma.InputJsonValue, detectedMonth: month } });
    await audit(tx, { actorId: principal!.id, ...meta }, { action: 'fin.history_read', entityType: 'fin_document', entityId: doc.id, summary: `${principal!.name} leu o relatório antigo "${doc.filename}"${month ? ` (${monthLabel(month)})` : ''}` });
  });
  const existing = month ? await prisma.finPeriod.findUnique({ where: { month } }) : null;
  return {
    documentId: doc.id, filename: doc.filename, month, identified: ex.tipoIdentificado, notes: ex.observacoes, warnings: ex.avisos,
    lines: ex.linhas.map(toLineInput),
    existing: existing ? { month: existing.month, status: existing.status, version: existing.version } : null,
  };
}
export type HistoricAnalysis = Awaited<ReturnType<typeof analyzeHistoricReport>>;

/** Pré-visualização do que os dados importados dariam (para comparar com o mês existente). */
export async function previewMetrics(principal: Principal | null, lines: unknown) {
  assertCan(principal, 'fin.view');
  const parsed = z.array(lineInputSchema).safeParse(lines);
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  return computeMetrics(parsed.data.map((l) => ({ ...l, meta: l.meta ?? null })), await listCategories(), await getFinTargets());
}

const commitSchema = z.object({
  documentId: z.string().uuid(),
  month: z.string(),
  mode: z.enum(['novo', 'versao', 'atualizar']),
  notes: z.string().max(4000).nullable(),
  lines: z.array(lineInputSchema).min(1, 'Nenhum dado para importar.').max(2000),
});

/**
 * Grava o relatório antigo depois da conferência. Mês novo → competência aprovada (v1).
 * Mês existente: "versao" substitui os dados e aprova uma nova versão (as anteriores
 * ficam guardadas); "atualizar" junta os dados para conferência. Tudo em uma transação.
 */
export async function commitHistoricReport(principal: Principal | null, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'fin.import');
  const parsed = commitSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const d = parsed.data;
  const month = d.month;
  assertMonth(month);
  if (d.mode !== 'atualizar') assertCan(principal, 'fin.approve');
  return prisma.$transaction(async (tx) => {
    const doc = await tx.finDocument.findUnique({ where: { id: d.documentId } });
    if (!doc || doc.origin !== 'HISTORICO') throw new NotFoundError('Relatório não encontrado.');
    if (doc.periodId) throw new AppError('Este relatório já foi importado.');
    let period = await tx.finPeriod.findUnique({ where: { month: d.month } });
    if (d.mode === 'novo' && period) throw new AppError(`Já existe um relatório para ${monthLabel(month)}. Escolha comparar, criar nova versão ou atualizar.`);
    if (d.mode !== 'novo' && !period) throw new AppError(`Não existe relatório de ${monthLabel(month)} para atualizar.`);
    if (!period) period = await tx.finPeriod.create({ data: { month: d.month, createdById: principal.id } });
    if (d.mode === 'versao') await tx.finLine.deleteMany({ where: { periodId: period.id } });
    const status = d.mode === 'atualizar' ? ('EXTRACTED' as const) : ('CONFIRMED' as const);
    await tx.finLine.createMany({
      data: d.lines.map((l) => ({ ...l, meta: (l.meta ?? undefined) as Prisma.InputJsonValue | undefined, periodId: period!.id, documentId: doc.id, status, createdById: principal.id, ...(status === 'CONFIRMED' ? { confirmedById: principal.id, confirmedAt: new Date() } : {}) })),
    });
    if (d.notes && !period.managerNotes) await tx.finPeriod.update({ where: { id: period.id }, data: { managerNotes: `Do relatório importado: ${d.notes}`.slice(0, 4000) } });
    await tx.finDocument.update({ where: { id: doc.id }, data: { periodId: period.id, status: d.mode === 'atualizar' ? 'PENDING_REVIEW' : 'APPROVED' } });
    let version: number | null = null;
    if (d.mode === 'atualizar') await tx.finPeriod.update({ where: { id: period.id }, data: { status: 'REVIEW' } });
    else version = (await approveIn(tx, principal, period.id, d.mode === 'novo' ? `Importado do relatório "${doc.filename}"` : `Nova versão a partir do relatório "${doc.filename}"`)).number;
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: 'fin.history_imported', entityType: 'fin_period', entityId: period.id, after: { modo: d.mode, linhas: d.lines.length, versao: version, arquivo: doc.filename },
      summary: `${principal.name} importou o relatório "${doc.filename}" em ${monthLabel(month)} (${{ novo: 'novo mês', versao: `nova versão ${version}`, atualizar: 'dados para conferência' }[d.mode]})`,
    });
    return { month: d.month, version };
  }, { timeout: 30_000 });
}

export async function discardHistoricReport(principal: Principal | null, documentId: string, meta: RequestMeta) {
  assertCan(principal, 'fin.import');
  await prisma.$transaction(async (tx) => {
    const doc = await tx.finDocument.findUnique({ where: { id: documentId } });
    if (!doc || doc.origin !== 'HISTORICO' || doc.periodId) return;
    await tx.finDocument.delete({ where: { id: documentId } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'fin.history_discarded', entityType: 'fin_document', entityId: documentId, summary: `${principal.name} cancelou a importação de "${doc.filename}"` });
  });
}
