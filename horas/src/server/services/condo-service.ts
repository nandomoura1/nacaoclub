import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma, type Tx } from '@/server/db';
import { audit } from '@/server/audit';
import { assertCan } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import type { RequestMeta } from '@/server/auth/session';
import { AppError, NotFoundError } from '@/server/errors';
import { fromUtc, isIsoDate, toUtc } from '@/domain/dates';
import { DEFAULT_FLAG_FACTORS, FLAGS, type Flag } from '@/domain/condominio/energy';
import { formatBRL } from '@/domain/condominio/money';

/**
 * Condomínio Nação — cadastros: dados de recebimento, centros de custo
 * (operações internas e parceiros), áreas, relógios de energia, itens fixos
 * das cobranças e IPTU do ano. A competência mensal fica em condo-period-service.
 */

/** Número opcional: vazio/null fica null (z.coerce.number() transformaria null em 0). */
const nullNum = (schema: z.ZodNumber) => z.preprocess((v) => (v === null || v === undefined || v === '' ? null : Number(v)), schema.nullable());
export const num = (d: Prisma.Decimal | number | null | undefined): number => (d === null || d === undefined ? 0 : Number(d));
const optText = (max: number) => z.string().trim().max(max).nullable().optional().transform((v) => v || null);
const isoDate = z.string().refine(isIsoDate, 'Data inválida.');
const optIsoDate = z.union([isoDate, z.literal('').transform(() => null), z.null()]).optional().transform((v) => v ?? null);

// ── Dados de recebimento ─────────────────────────────────────

export async function getCondoSettings(db: Tx = prisma) {
  const s = await db.condoSettings.findUnique({ where: { id: 1 } });
  const factors = { ...DEFAULT_FLAG_FACTORS, ...((s?.flagFactors ?? {}) as Partial<Record<Flag, number>>) };
  return {
    payeeName: s?.payeeName ?? 'Nação Club Recreações Esportivas Ltda',
    payeeDocument: s?.payeeDocument ?? '17.179.101/0001-74',
    pixKey: s?.pixKey ?? null,
    pixCity: s?.pixCity ?? 'BRASILIA',
    bankInfo: s?.bankInfo ?? null,
    instructions: s?.instructions ?? null,
    dueDay: s?.dueDay ?? 20,
    flagFactors: factors,
  };
}
export type CondoSettingsView = Awaited<ReturnType<typeof getCondoSettings>>;

const settingsSchema = z.object({
  payeeName: z.string().trim().min(3, 'Informe a razão social.').max(120),
  payeeDocument: z.string().trim().min(11, 'Informe o CNPJ.').max(30),
  pixKey: optText(120),
  pixCity: z.string().trim().min(2).max(40).transform((v) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().slice(0, 15)),
  bankInfo: optText(300),
  instructions: optText(300),
  dueDay: z.coerce.number().int().min(1, 'Dia entre 1 e 28.').max(28, 'Dia entre 1 e 28.'),
  flagFactors: z.record(z.enum(FLAGS.map((f) => f.id) as [Flag, ...Flag[]]), z.coerce.number().min(0.5, 'Fator muito baixo.').max(3, 'Fator muito alto.')),
});

export async function saveCondoSettings(principal: Principal | null, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'condo.edit');
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const d = parsed.data;
  await prisma.$transaction(async (tx) => {
    const data = { ...d, flagFactors: d.flagFactors as Prisma.InputJsonValue };
    await tx.condoSettings.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: 'condo.settings', entityType: 'condo_settings', entityId: '1',
      summary: `${principal.name} alterou os dados de recebimento do Condomínio${d.pixKey ? ' (com chave PIX)' : ''}`,
    });
  });
}

// ── Centros de custo ─────────────────────────────────────────

export async function listCenters(principal: Principal | null) {
  assertCan(principal, 'condo.view');
  const rows = await prisma.condoCenter.findMany({
    orderBy: [{ kind: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    include: {
      meters: { orderBy: { activeFrom: 'asc' }, include: { readings: { orderBy: { month: 'desc' }, take: 1 } } },
      items: { orderBy: [{ sortOrder: 'asc' }, { description: 'asc' }] },
    },
  });
  return rows.map((c) => ({
    id: c.id, name: c.name, displayName: c.displayName, kind: c.kind, isSnackBar: c.isSnackBar, chargesCondo: c.chargesCondo,
    areaM2: num(c.areaM2), iptuSharePct: num(c.iptuSharePct), legalName: c.legalName, document: c.document,
    contactName: c.contactName, contactPhone: c.contactPhone, contactEmail: c.contactEmail,
    activeFrom: fromUtc(c.activeFrom), activeTo: c.activeTo ? fromUtc(c.activeTo) : null, sortOrder: c.sortOrder,
    meters: c.meters.map((m) => ({
      id: m.id, name: m.name, installReading: num(m.installReading), activeFrom: fromUtc(m.activeFrom), activeTo: m.activeTo ? fromUtc(m.activeTo) : null,
      last: m.readings[0] ? { month: m.readings[0].month, reading: num(m.readings[0].reading) } : null,
    })),
    items: c.items.map((i) => ({
      id: i.id, description: i.description, amountCents: i.amountCents, unitCents: i.unitCents, defaultQty: i.defaultQty === null ? null : num(i.defaultQty),
      activeFrom: fromUtc(i.activeFrom), activeTo: i.activeTo ? fromUtc(i.activeTo) : null,
    })),
  }));
}
export type CondoCenterView = Awaited<ReturnType<typeof listCenters>>[number];

const centerSchema = z.object({
  name: z.string().trim().min(2, 'Dê um nome ao centro de custo.').max(60),
  displayName: optText(80),
  kind: z.enum(['INTERNAL', 'PARTNER']),
  isSnackBar: z.coerce.boolean().optional().default(false),
  chargesCondo: z.coerce.boolean().optional().default(true),
  areaM2: z.coerce.number().min(0).max(100_000),
  iptuSharePct: z.coerce.number().min(0).max(100),
  legalName: optText(120),
  document: optText(30),
  contactName: optText(80),
  contactPhone: optText(30),
  contactEmail: z.union([z.string().trim().email('E-mail inválido.'), z.literal('').transform(() => null), z.null()]).optional().transform((v) => v ?? null),
  activeFrom: isoDate,
  activeTo: optIsoDate,
});

export async function saveCenter(principal: Principal | null, id: string | null, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'condo.edit');
  const parsed = centerSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const d = parsed.data;
  if (d.activeTo && d.activeTo < d.activeFrom) throw new AppError('A saída não pode ser antes da entrada.');
  return prisma.$transaction(async (tx) => {
    if (d.isSnackBar) {
      const other = await tx.condoCenter.findFirst({ where: { isSnackBar: true, ...(id ? { NOT: { id } } : {}) } });
      if (other) throw new AppError(`${other.name} já é a Lanchonete (percentual fixo). Só pode haver uma.`);
    }
    const dup = await tx.condoCenter.findFirst({ where: { name: { equals: d.name, mode: 'insensitive' }, ...(id ? { NOT: { id } } : {}) } });
    if (dup) throw new AppError(`Já existe um centro de custo chamado ${dup.name}.`);
    const data = { ...d, activeFrom: toUtc(d.activeFrom), activeTo: d.activeTo ? toUtc(d.activeTo) : null };
    const before = id ? await tx.condoCenter.findUnique({ where: { id } }) : null;
    if (id && !before) throw new NotFoundError('Centro de custo não encontrado.');
    const c = id ? await tx.condoCenter.update({ where: { id }, data }) : await tx.condoCenter.create({ data });
    const left = d.activeTo && (!before?.activeTo || fromUtc(before.activeTo) !== d.activeTo);
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: id ? 'condo.center_updated' : 'condo.center_created', entityType: 'condo_center', entityId: c.id,
      summary: `${principal.name} ${id ? 'alterou' : 'cadastrou'} ${d.kind === 'PARTNER' ? 'o parceiro' : 'a operação'} ${d.name}${left ? ` (saída em ${d.activeTo})` : ''}`,
    });
    return c.id;
  });
}

// ── Relógios de energia ──────────────────────────────────────

const meterSchema = z.object({
  centerId: z.string().uuid(),
  name: z.string().trim().min(2, 'Dê um nome ao relógio.').max(60),
  installReading: z.coerce.number().min(0).max(10_000_000),
  activeFrom: isoDate,
  activeTo: optIsoDate,
});

export async function saveMeter(principal: Principal | null, id: string | null, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'condo.edit');
  const parsed = meterSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const d = parsed.data;
  return prisma.$transaction(async (tx) => {
    const center = await tx.condoCenter.findUnique({ where: { id: d.centerId } });
    if (!center) throw new NotFoundError('Centro de custo não encontrado.');
    const data = { ...d, activeFrom: toUtc(d.activeFrom), activeTo: d.activeTo ? toUtc(d.activeTo) : null };
    const m = id ? await tx.condoMeter.update({ where: { id }, data }) : await tx.condoMeter.create({ data });
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: id ? 'condo.meter_updated' : 'condo.meter_created', entityType: 'condo_meter', entityId: m.id,
      summary: `${principal.name} ${id ? 'alterou' : 'cadastrou'} o relógio "${d.name}" de ${center.name} (leitura inicial ${d.installReading})`,
    });
    return m.id;
  });
}

// ── Itens fixos da cobrança ──────────────────────────────────

const itemSchema = z.object({
  centerId: z.string().uuid(),
  description: z.string().trim().min(2, 'Descreva o item.').max(80),
  amountCents: z.coerce.number().int().min(-10_000_000).max(10_000_000).default(0),
  unitCents: nullNum(z.number().int().min(0).max(10_000_000)),
  defaultQty: nullNum(z.number().min(0).max(100_000)),
  activeFrom: isoDate,
  activeTo: optIsoDate,
});

export async function saveRecurringItem(principal: Principal | null, id: string | null, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'condo.edit');
  const parsed = itemSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const d = parsed.data;
  return prisma.$transaction(async (tx) => {
    const center = await tx.condoCenter.findUnique({ where: { id: d.centerId } });
    if (!center) throw new NotFoundError('Centro de custo não encontrado.');
    const data = { ...d, activeFrom: toUtc(d.activeFrom), activeTo: d.activeTo ? toUtc(d.activeTo) : null };
    const it = id ? await tx.condoRecurringItem.update({ where: { id }, data }) : await tx.condoRecurringItem.create({ data });
    const value = d.unitCents !== null ? `${d.defaultQty ?? 0} × ${formatBRL(d.unitCents)}` : formatBRL(d.amountCents);
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: id ? 'condo.item_updated' : 'condo.item_created', entityType: 'condo_recurring_item', entityId: it.id,
      summary: `${principal.name} ${id ? 'alterou' : 'cadastrou'} o item fixo "${d.description}" de ${center.name} (${value})`,
    });
    return it.id;
  });
}

export async function deleteRecurringItem(principal: Principal | null, id: string, meta: RequestMeta) {
  assertCan(principal, 'condo.edit');
  await prisma.$transaction(async (tx) => {
    const it = await tx.condoRecurringItem.findUnique({ where: { id }, include: { center: { select: { name: true } } } });
    if (!it) throw new NotFoundError('Item não encontrado.');
    await tx.condoRecurringItem.delete({ where: { id } });
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: 'condo.item_deleted', entityType: 'condo_recurring_item', entityId: id,
      summary: `${principal.name} excluiu o item fixo "${it.description}" de ${it.center.name}`,
    });
  });
}

// ── IPTU do ano ──────────────────────────────────────────────

export async function listIptuYears(principal: Principal | null) {
  assertCan(principal, 'condo.view');
  const rows = await prisma.condoIptuYear.findMany({ orderBy: { year: 'desc' } });
  return rows.map((r) => ({ year: r.year, totalCents: r.totalCents, totalAreaM2: num(r.totalAreaM2), firstMonth: r.firstMonth, parcels: r.parcels }));
}

const iptuSchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  totalCents: z.coerce.number().int().min(0).max(1_000_000_000),
  totalAreaM2: z.coerce.number().positive('Informe a área total.').max(1_000_000),
  firstMonth: z.coerce.number().int().min(1).max(12),
  parcels: z.coerce.number().int().min(1).max(12),
});

export async function saveIptuYear(principal: Principal | null, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'condo.edit');
  const parsed = iptuSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const d = parsed.data;
  if (d.firstMonth + d.parcels - 1 > 12) throw new AppError('As parcelas passam de dezembro: ajuste o mês da 1ª parcela ou o nº de parcelas.');
  await prisma.$transaction(async (tx) => {
    await tx.condoIptuYear.upsert({ where: { year: d.year }, create: d, update: d });
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: 'condo.iptu', entityType: 'condo_iptu_year', entityId: String(d.year),
      summary: `${principal.name} lançou o IPTU ${d.year}: ${formatBRL(d.totalCents)} sobre ${d.totalAreaM2} m², ${d.parcels} parcela(s) a partir do mês ${d.firstMonth}`,
    });
  });
}
