import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/server/db';
import { audit } from '@/server/audit';
import { assertCan, can } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import type { RequestMeta } from '@/server/auth/session';
import { AppError, NotFoundError } from '@/server/errors';
import { PLAN_STATUS, ROUNDINGS, adjustPrice, changePct, tableTsv, totalOf, type PlanRow, type PlanStatus, type Rounding } from '@/domain/planos';
import sheet from '@/server/planos/planilha-2026.json';

/**
 * Planos Nação (Administração → Planos Nação). Quem tem `plans.view` consulta a tabela VIGENTE (e as
 * arquivadas); rascunhos e qualquer edição são de `plans.edit` (Administrador). Tabela vigente é
 * travada: para mudar preço cria-se um rascunho a partir dela, ajusta-se e publica-se.
 */

type P = Principal;
const dec = (n: number | null) => (n === null ? null : new Prisma.Decimal(n.toFixed(2)));
const num = (v: Prisma.Decimal | null) => (v === null ? null : Number(v));
const parse = <S extends z.ZodType>(s: S, v: unknown): z.output<S> => {
  const r = s.safeParse(v);
  if (!r.success) throw new AppError(r.error.issues[0]?.message ?? 'Dados inválidos.');
  return r.data;
};
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// ── Leitura ───────────────────────────────────────────────

/** Tabelas que a pessoa pode ver (rascunho só com plans.edit), da mais nova para a mais antiga. */
export async function listPlanTables(principal: P | null) {
  assertCan(principal, 'plans.view');
  const edit = can(principal, 'plans.edit');
  const rows = await prisma.planTable.findMany({
    where: edit ? {} : { status: { in: ['VIGENTE', 'ARQUIVADA'] } },
    orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
    select: { id: true, name: true, year: true, status: true, baseTableId: true, publishedAt: true, _count: { select: { items: true } } },
  });
  return rows.map((t) => ({ id: t.id, name: t.name, year: t.year, status: t.status, baseTableId: t.baseTableId, plans: t._count.items }));
}

async function visibleTable(principal: P, id: string) {
  const t = await prisma.planTable.findUnique({ where: { id } });
  if (!t || (t.status === 'RASCUNHO' && !can(principal, 'plans.edit'))) throw new NotFoundError('Tabela não encontrada.');
  return t;
}

/** Tabela com planos, opções e a comparação com a tabela-base (mesmo plano, mesma opção pelo nome). */
export async function planTable(principal: P | null, id: string) {
  assertCan(principal, 'plans.view');
  const t = await visibleTable(principal, id);
  const items = await prisma.planItem.findMany({ where: { tableId: t.id }, include: { options: { orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }] } }, orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }] });
  const base = t.baseTableId ? await prisma.planTable.findUnique({ where: { id: t.baseTableId }, select: { id: true, name: true } }) : null;
  const baseItems = base ? await prisma.planItem.findMany({ where: { tableId: base.id }, include: { options: true } }) : [];
  const baseById = new Map(baseItems.map((b) => [b.id, b]));
  const plans = items.map((i) => {
    const b = i.baseItemId ? baseById.get(i.baseItemId) : undefined;
    return {
      id: i.id,
      group: i.groupName,
      name: i.name,
      modalities: i.modalities,
      commonClasses: i.commonClasses,
      specificClasses: i.specificClasses,
      checkin: i.checkin,
      status: i.status as PlanStatus,
      note: i.note,
      baseName: b?.name ?? null,
      options: i.options.map((o) => {
        const bo = b?.options.find((x) => norm(x.label) === norm(o.label));
        const card = num(o.cardMonthly), recurring = num(o.recurringMonthly);
        const baseCard = bo ? num(bo.cardMonthly) : null;
        return {
          id: o.id, label: o.label, months: o.months, card, recurring,
          cardTotal: totalOf(card, o.months), recurringTotal: totalOf(recurring, o.months),
          baseCard, baseRecurring: bo ? num(bo.recurringMonthly) : null,
          cardChange: changePct(card, baseCard),
          recurringChange: changePct(recurring, (bo ? num(bo.recurringMonthly) : null) ?? baseCard),
        };
      }),
    };
  });
  const groups = [...new Set(plans.map((p) => p.group))];
  const counts = Object.fromEntries(PLAN_STATUS.map((s) => [s.id, plans.filter((p) => p.status === s.id).length])) as Record<PlanStatus, number>;
  // Plano da base que não foi levado para esta tabela (nem como "sai"): aparece como lembrete.
  const linked = new Set(items.map((i) => i.baseItemId).filter(Boolean));
  const missingFromBase = baseItems.filter((b) => !linked.has(b.id)).map((b) => b.name);
  return {
    table: { id: t.id, name: t.name, year: t.year, status: t.status, note: t.note, publishedAt: t.publishedAt?.toISOString() ?? null, editable: t.status === 'RASCUNHO' && can(principal, 'plans.edit') },
    base, plans, groups, counts, missingFromBase,
  };
}
export type PlanTableView = Awaited<ReturnType<typeof planTable>>;

/** A tabela no formato de planilha (TSV) — "Copiar para planilha". */
export async function planTableTsv(principal: P | null, id: string) {
  const v = await planTable(principal, id);
  const rows: PlanRow[] = v.plans.map((p) => ({ ...p, options: p.options.map((o) => ({ label: o.label, months: o.months, card: o.card, recurring: o.recurring })) }));
  return tableTsv(v.table.status === 'RASCUNHO' ? rows : rows.filter((p) => p.status !== 'EXCLUIR'), { withStatus: v.table.status === 'RASCUNHO' });
}

// ── Importação da planilha (uma vez) ──────────────────────

interface SheetPlan { group: string; name: string; modalities: string; commonClasses: string; specificClasses: string; checkin: string; options: { label: string; months: number | null; card: number | null; recurring?: number | null }[] }

/**
 * Primeira carga, da planilha de planos (13/11/2026): "Planos 2026" vira a tabela VIGENTE e o
 * rascunho "Planos 2027" nasce do repasse de nov/2026 (cartão + recorrência). Plano de 2026 que
 * não está no repasse entra no rascunho como "A decidir", com os preços de 2026.
 */
export async function importFromSheet(principal: P | null, meta: RequestMeta) {
  assertCan(principal, 'plans.edit');
  if (await prisma.planTable.count()) throw new AppError('A planilha já foi importada: as tabelas já existem.');
  const p2026 = (sheet as { plans2026: SheetPlan[] }).plans2026;
  const repasse = new Map((sheet as { repasse: SheetPlan[] }).repasse.map((p) => [p.name, p]));
  return prisma.$transaction(async (tx) => {
    const t26 = await tx.planTable.create({ data: { name: 'Planos 2026', year: 2026, status: 'VIGENTE', publishedAt: new Date(), createdById: principal.id, note: 'Importada da planilha "Planos 2026".' } });
    const t27 = await tx.planTable.create({ data: { name: 'Planos 2027', year: 2027, status: 'RASCUNHO', baseTableId: t26.id, createdById: principal.id, note: 'Rascunho a partir do repasse de preço de nov/2026.' } });
    let sort = 0;
    for (const p of p2026) {
      sort += 10;
      const base = await tx.planItem.create({ data: itemData(t26.id, p, sort, 'MANTEM', null) });
      await tx.planOption.createMany({ data: p.options.map((o, i) => ({ itemId: base.id, label: o.label, months: o.months, cardMonthly: dec(o.card), recurringMonthly: null, sort: i })) });
      const r = repasse.get(p.name);
      const src = r ?? p;
      const missingOpts = r ? p.options.filter((o) => !r.options.some((x) => norm(x.label) === norm(o.label))).map((o) => o.label) : [];
      const note = !r ? 'Não está na aba de repasse de nov/2026: decidir se fica (preços de 2026).'
        : missingOpts.length ? `Opção fora do repasse: ${missingOpts.join(', ')}.` : null;
      const next = await tx.planItem.create({ data: { ...itemData(t27.id, src, sort, r ? 'MANTEM' : 'A_DECIDIR', note), baseItemId: base.id } });
      await tx.planOption.createMany({ data: src.options.map((o, i) => ({ itemId: next.id, label: o.label, months: o.months, cardMonthly: dec(o.card), recurringMonthly: dec(o.recurring ?? null), sort: i })) });
    }
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'plans.import', entityType: 'plan_table', entityId: t27.id, after: { plans: p2026.length, base: t26.id }, summary: `${principal.name} importou a planilha de planos: Planos 2026 (vigente) e rascunho Planos 2027` });
    return { vigente: t26.id, rascunho: t27.id };
  });
}

const itemData = (tableId: string, p: SheetPlan, sort: number, status: PlanStatus, note: string | null) => ({
  tableId, groupName: p.group, name: p.name, modalities: p.modalities || null, commonClasses: p.commonClasses || null,
  specificClasses: p.specificClasses || null, checkin: p.checkin || null, status, note, sort,
});

// ── Rascunho ─────────────────────────────────────────────

async function draft(tx: Prisma.TransactionClient, tableId: string) {
  const t = await tx.planTable.findUnique({ where: { id: tableId } });
  if (!t) throw new NotFoundError('Tabela não encontrada.');
  if (t.status !== 'RASCUNHO') throw new AppError('Tabela vigente ou arquivada não se edita: crie um rascunho a partir dela.');
  return t;
}
async function itemOfDraft(tx: Prisma.TransactionClient, itemId: string) {
  const i = await tx.planItem.findUnique({ where: { id: itemId } });
  if (!i) throw new NotFoundError('Plano não encontrado.');
  await draft(tx, i.tableId);
  return i;
}

/** Novo rascunho copiando uma tabela (planos ficam "Mantém" e são comparados com ela). */
export async function createDraft(principal: P | null, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'plans.edit');
  const v = parse(z.object({ fromTableId: z.string().uuid(), name: z.string().trim().min(3, 'Dê um nome à tabela.').max(80), year: z.number().int().min(2020).max(2100) }), input);
  return prisma.$transaction(async (tx) => {
    const from = await tx.planTable.findUnique({ where: { id: v.fromTableId }, include: { items: { include: { options: true }, orderBy: { sort: 'asc' } } } });
    if (!from) throw new NotFoundError('Tabela não encontrada.');
    const t = await tx.planTable.create({ data: { name: v.name, year: v.year, status: 'RASCUNHO', baseTableId: from.id, createdById: principal.id, note: `Cópia de ${from.name}.` } });
    for (const i of from.items.filter((x) => x.status !== 'EXCLUIR')) {
      const n = await tx.planItem.create({ data: { tableId: t.id, baseItemId: i.id, groupName: i.groupName, name: i.name, modalities: i.modalities, commonClasses: i.commonClasses, specificClasses: i.specificClasses, checkin: i.checkin, status: 'MANTEM', sort: i.sort } });
      await tx.planOption.createMany({ data: i.options.map((o) => ({ itemId: n.id, label: o.label, months: o.months, cardMonthly: o.cardMonthly, recurringMonthly: o.recurringMonthly, sort: o.sort })) });
    }
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'plans.draft_created', entityType: 'plan_table', entityId: t.id, after: { from: from.id }, summary: `${principal.name} criou o rascunho "${v.name}" a partir de ${from.name}` });
    return t.id;
  });
}

const money = z.number().min(0).max(999_999).nullable();
const optionSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  label: z.string().trim().min(1, 'Dê um nome a cada opção (ex.: Mensal).').max(60),
  months: z.number().int().min(1).max(60).nullable(),
  card: money,
  recurring: money,
});
const planSchema = z.object({
  tableId: z.string().uuid(),
  id: z.string().uuid().optional().nullable(),
  group: z.string().trim().min(2, 'Escolha ou escreva o grupo.').max(60),
  name: z.string().trim().min(2, 'Dê um nome ao plano.').max(120),
  modalities: z.string().trim().max(400).nullable().optional(),
  commonClasses: z.string().trim().max(400).nullable().optional(),
  specificClasses: z.string().trim().max(600).nullable().optional(),
  checkin: z.string().trim().max(80).nullable().optional(),
  status: z.enum(PLAN_STATUS.map((s) => s.id) as [PlanStatus, ...PlanStatus[]]),
  note: z.string().trim().max(500).nullable().optional(),
  options: z.array(optionSchema).max(20),
});

/** Cria ou edita um plano do rascunho, com as opções de preço (substitui as opções). */
export async function savePlan(principal: P | null, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'plans.edit');
  const v = parse(planSchema, input);
  const labels = v.options.map((o) => norm(o.label));
  if (new Set(labels).size !== labels.length) throw new AppError('Duas opções com o mesmo nome no plano.');
  return prisma.$transaction(async (tx) => {
    await draft(tx, v.tableId);
    const dup = await tx.planItem.findFirst({ where: { tableId: v.tableId, name: { equals: v.name, mode: 'insensitive' }, ...(v.id ? { NOT: { id: v.id } } : {}) } });
    if (dup) throw new AppError('Já existe um plano com esse nome nesta tabela.');
    const data = { groupName: v.group, name: v.name, modalities: v.modalities || null, commonClasses: v.commonClasses || null, specificClasses: v.specificClasses || null, checkin: v.checkin || null, status: v.status, note: v.note || null };
    let id = v.id ?? null;
    let before: unknown = null;
    if (id) {
      const cur = await tx.planItem.findUnique({ where: { id }, include: { options: true } });
      if (!cur || cur.tableId !== v.tableId) throw new NotFoundError('Plano não encontrado.');
      before = { ...cur, options: cur.options.map((o) => ({ label: o.label, months: o.months, card: num(o.cardMonthly), recurring: num(o.recurringMonthly) })) };
      await tx.planItem.update({ where: { id }, data });
    } else {
      const last = await tx.planItem.findFirst({ where: { tableId: v.tableId, groupName: v.group }, orderBy: { sort: 'desc' } });
      const max = await tx.planItem.aggregate({ where: { tableId: v.tableId }, _max: { sort: true } });
      id = (await tx.planItem.create({ data: { ...data, tableId: v.tableId, sort: last ? last.sort + 1 : (max._max.sort ?? 0) + 10 } })).id;
    }
    const keep = v.options.filter((o) => o.id).map((o) => o.id!);
    await tx.planOption.deleteMany({ where: { itemId: id, id: { notIn: keep } } });
    for (const [i, o] of v.options.entries()) {
      const d = { label: o.label, months: o.months, cardMonthly: dec(o.card), recurringMonthly: dec(o.recurring), sort: i };
      if (o.id) await tx.planOption.updateMany({ where: { id: o.id, itemId: id }, data: d });
      else await tx.planOption.create({ data: { ...d, itemId: id } });
    }
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: v.id ? 'plans.plan_updated' : 'plans.plan_created', entityType: 'plan_item', entityId: id, before,
      after: { ...data, options: v.options.map((o) => ({ label: o.label, months: o.months, card: o.card, recurring: o.recurring })) },
      summary: `${principal.name} ${v.id ? 'editou' : 'criou'} o plano "${v.name}"`,
    });
    return id;
  });
}

/** Muda só a situação (Mantém / Novo / Simplificado / A decidir / Sai). */
export async function setPlanStatus(principal: P | null, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'plans.edit');
  const v = parse(z.object({ itemId: z.string().uuid(), status: z.enum(PLAN_STATUS.map((s) => s.id) as [PlanStatus, ...PlanStatus[]]) }), input);
  await prisma.$transaction(async (tx) => {
    const i = await itemOfDraft(tx, v.itemId);
    await tx.planItem.update({ where: { id: i.id }, data: { status: v.status } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'plans.plan_status', entityType: 'plan_item', entityId: i.id, before: { status: i.status }, after: { status: v.status }, summary: `${principal.name} marcou "${i.name}" como ${PLAN_STATUS.find((s) => s.id === v.status)!.label}` });
  });
}

/** Edita um preço direto na tabela (cartão ou recorrência, por mês). */
export async function setOptionPrice(principal: P | null, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'plans.edit');
  const v = parse(z.object({ optionId: z.string().uuid(), field: z.enum(['card', 'recurring']), value: money }), input);
  return prisma.$transaction(async (tx) => {
    const o = await tx.planOption.findUnique({ where: { id: v.optionId }, include: { item: true } });
    if (!o) throw new NotFoundError('Opção não encontrada.');
    await draft(tx, o.item.tableId);
    const col = v.field === 'card' ? 'cardMonthly' : 'recurringMonthly';
    const before = num(o[col]);
    await tx.planOption.update({ where: { id: o.id }, data: { [col]: dec(v.value) } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'plans.price', entityType: 'plan_option', entityId: o.id, before: { [v.field]: before }, after: { [v.field]: v.value }, summary: `${principal.name} mudou ${o.item.name} · ${o.label} (${v.field === 'card' ? 'cartão' : 'recorrência'}): ${before ?? '—'} → ${v.value ?? '—'}` });
    return v.value;
  });
}

/** Tira de vez um plano do rascunho (só plano criado nele — os que vieram da base se marcam como "Sai"). */
export async function deletePlan(principal: P | null, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'plans.edit');
  const { itemId } = parse(z.object({ itemId: z.string().uuid() }), input);
  await prisma.$transaction(async (tx) => {
    const i = await itemOfDraft(tx, itemId);
    if (i.baseItemId) throw new AppError('Plano que veio da tabela anterior não se apaga: marque como "Sai" (fica registrado).');
    await tx.planItem.delete({ where: { id: i.id } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'plans.plan_deleted', entityType: 'plan_item', entityId: i.id, before: { name: i.name, group: i.groupName }, summary: `${principal.name} apagou o plano novo "${i.name}" do rascunho` });
  });
}

const adjustSchema = z.object({
  tableId: z.string().uuid(),
  itemIds: z.array(z.string().uuid()).min(1, 'Marque ao menos um plano.').max(500),
  labels: z.array(z.string().max(60)).max(20), // tipos de opção (vazio = todas)
  target: z.enum(['CARD', 'RECURRING', 'BOTH', 'RECURRING_FROM_CARD']),
  from: z.enum(['ATUAL', 'BASE']),
  pct: z.number().min(-90).max(300),
  rounding: z.enum(ROUNDINGS.map((r) => r.id) as [Rounding, ...Rounding[]]),
});

/**
 * Reajuste em lote dos planos marcados (não linear: cada lote com o seu %).
 * - ATUAL: % sobre o preço que está no rascunho; BASE: % sobre o preço da tabela-base (ex.: 2026).
 * - RECURRING_FROM_CARD: recorrência = cartão × (1 + %), como no repasse (+10%).
 */
export async function adjustPrices(principal: P | null, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'plans.edit');
  const v = parse(adjustSchema, input);
  return prisma.$transaction(async (tx) => {
    const t = await draft(tx, v.tableId);
    const items = await tx.planItem.findMany({ where: { id: { in: v.itemIds }, tableId: t.id }, include: { options: true } });
    const baseIds = items.map((i) => i.baseItemId).filter((x): x is string => !!x);
    const baseOpts = v.from === 'BASE' ? await tx.planOption.findMany({ where: { itemId: { in: baseIds } } }) : [];
    const wanted = new Set(v.labels.map(norm));
    let changed = 0;
    for (const i of items) {
      for (const o of i.options) {
        if (wanted.size && !wanted.has(norm(o.label))) continue;
        const bo = baseOpts.find((b) => b.itemId === i.baseItemId && norm(b.label) === norm(o.label));
        const src = (field: 'cardMonthly' | 'recurringMonthly') => (v.from === 'BASE' ? (bo ? num(bo.cardMonthly) : null) : num(o[field]));
        const data: { cardMonthly?: Prisma.Decimal | null; recurringMonthly?: Prisma.Decimal | null } = {};
        if (v.target === 'CARD' || v.target === 'BOTH') { const s = src('cardMonthly'); if (s !== null) data.cardMonthly = dec(adjustPrice(s, v.pct, v.rounding)); }
        if (v.target === 'RECURRING' || v.target === 'BOTH') { const s = v.from === 'BASE' ? src('cardMonthly') : num(o.recurringMonthly); if (s !== null) data.recurringMonthly = dec(adjustPrice(s, v.pct, v.rounding)); }
        if (v.target === 'RECURRING_FROM_CARD') { const c = num(o.cardMonthly); if (c !== null && (o.months ?? 1) > 1) data.recurringMonthly = dec(adjustPrice(c, v.pct, v.rounding)); }
        if (Object.keys(data).length) { await tx.planOption.update({ where: { id: o.id }, data }); changed++; }
      }
    }
    const what = { CARD: 'cartão', RECURRING: 'recorrência', BOTH: 'cartão e recorrência', RECURRING_FROM_CARD: 'recorrência a partir do cartão' }[v.target];
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: 'plans.adjust', entityType: 'plan_table', entityId: t.id, after: { ...v, changed },
      summary: `${principal.name} reajustou ${what} em ${v.pct > 0 ? '+' : ''}${v.pct}% (${v.from === 'BASE' ? `sobre a tabela-base` : 'sobre o preço atual'}) de ${items.length} plano(s) de ${t.name}: ${changed} opção(ões)`,
    });
    return changed;
  });
}

/** Publica o rascunho: vira a tabela VIGENTE (travada) e a anterior é arquivada. */
export async function publishTable(principal: P | null, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'plans.edit');
  const { tableId } = parse(z.object({ tableId: z.string().uuid() }), input);
  return prisma.$transaction(async (tx) => {
    const t = await draft(tx, tableId);
    const pending = await tx.planItem.count({ where: { tableId: t.id, status: 'A_DECIDIR' } });
    if (pending) throw new AppError(`Ainda há ${pending} plano(s) "A decidir": defina se ficam ou saem antes de publicar.`);
    const noPrice = await tx.planOption.count({ where: { item: { tableId: t.id, status: { not: 'EXCLUIR' } }, cardMonthly: null, recurringMonthly: null } });
    if (noPrice) throw new AppError(`Há ${noPrice} opção(ões) sem preço nos planos que ficam.`);
    const prev = await tx.planTable.findFirst({ where: { status: 'VIGENTE' } });
    if (prev) await tx.planTable.update({ where: { id: prev.id }, data: { status: 'ARQUIVADA' } });
    await tx.planTable.update({ where: { id: t.id }, data: { status: 'VIGENTE', publishedAt: new Date() } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'plans.published', entityType: 'plan_table', entityId: t.id, before: { vigente: prev?.id ?? null }, summary: `${principal.name} publicou ${t.name} como tabela vigente${prev ? ` (${prev.name} foi arquivada)` : ''}` });
  });
}

