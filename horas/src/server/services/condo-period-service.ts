import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma, type Tx } from '@/server/db';
import { audit } from '@/server/audit';
import { assertCan } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import type { RequestMeta } from '@/server/auth/session';
import { AppError, NotFoundError } from '@/server/errors';
import { fromUtc, isIsoDate, toUtc } from '@/domain/dates';
import { FLAGS, consumption, type Flag } from '@/domain/condominio/energy';
import { formatBRL } from '@/domain/condominio/money';
import { addMonths, defaultDueDate, firstDay, isMonth, lastDay, monthLabel, type Month } from '@/domain/condominio/months';
import { computePeriod, type Billing, type PeriodInput, type PeriodResult } from '@/domain/condominio/period';
import { getCondoSettings, num } from './condo-service';
import type { ChargeDoc } from '@/server/condominio/pdf';

/**
 * Competência do Condomínio: abre copiando o mês anterior (despesas, alunos,
 * itens, tarifa e bandeira), o coordenador revisa e lança as leituras, e o
 * fechamento congela o resultado (snapshot) e gera as cobranças.
 */

/** Tarifa usada pela Nação desde 2024 (R$/kWh, aba ENERGIA). Só vale para a 1ª competência. */
export const DEFAULT_TARIFF = 0.9564346;

const active = (from: Date, to: Date | null, month: Month) => fromUtc(from) <= lastDay(month) && (!to || fromUtc(to) >= firstDay(month));

function assertMonth(month: string): asserts month is Month {
  if (!isMonth(month)) throw new AppError('Competência inválida (use AAAA-MM).');
}

export interface PeriodSnapshot {
  result: PeriodResult;
  centers: { id: string; name: string; displayName: string | null; kind: 'INTERNAL' | 'PARTNER' }[];
  expenses: { group: string; description: string; amountCents: number; memo: string | null }[];
  params: { tariff: number; flag: string; flagFactor: number; snackBarPct: number };
  dueDate: string;
}

/** Carrega tudo o que o motor precisa (e o que a tela mostra). */
async function load(db: Tx, month: Month) {
  const p = await db.condoPeriod.findUnique({
    where: { month },
    include: {
      expenses: { orderBy: { sortOrder: 'asc' } },
      centers: { include: { center: true } },
      items: { orderBy: [{ sortOrder: 'asc' }] },
      charges: { orderBy: { centerName: 'asc' } },
    },
  });
  if (!p) return null;
  const centerIds = p.centers.map((c) => c.centerId);
  const meters = await db.condoMeter.findMany({
    where: { centerId: { in: centerIds } },
    include: { readings: { where: { month: { lte: month } }, orderBy: { month: 'asc' } } },
    orderBy: { name: 'asc' },
  });
  const iptuRow = await db.condoIptuYear.findUnique({ where: { year: Number(month.slice(0, 4)) } });
  return { p, meters: meters.filter((m) => active(m.activeFrom, m.activeTo, month)), iptuRow };
}

function toInput(month: Month, l: NonNullable<Awaited<ReturnType<typeof load>>>): PeriodInput {
  const { p, meters, iptuRow } = l;
  return {
    month,
    tariff: num(p.tariff),
    flagFactor: num(p.flagFactor),
    snackBarPct: num(p.snackBarPct),
    expenses: p.expenses.map((e) => ({ amountCents: e.amountCents, confirmed: e.confirmed, description: e.description })),
    centers: p.centers
      .sort((a, b) => a.center.sortOrder - b.center.sortOrder || a.center.name.localeCompare(b.center.name))
      .map((c) => ({
        id: c.centerId, name: c.center.displayName || c.center.name, kind: c.center.kind, isSnackBar: c.center.isSnackBar, chargesCondo: c.center.chargesCondo,
        areaM2: num(c.center.areaM2), iptuSharePct: num(c.center.iptuSharePct), headcount: c.headcount, billing: c.billing as Billing,
        activeFrom: fromUtc(c.center.activeFrom), activeTo: c.center.activeTo ? fromUtc(c.center.activeTo) : null,
      })),
    meters: meters.map((m) => {
      const before = m.readings.filter((r) => r.month < month);
      const cur = m.readings.find((r) => r.month === month) ?? null;
      const prevReading = before.length ? num(before.at(-1)!.reading) : num(m.installReading);
      // Consumos dos meses anteriores, para o alerta de ±50%.
      const history: number[] = [];
      let last = num(m.installReading);
      for (const r of before) {
        history.push(consumption({ previous: last, current: num(r.reading), reset: r.isReset ? { oldFinal: r.oldFinal === null ? null : num(r.oldFinal), baseline: num(r.baseline) } : null }));
        last = num(r.reading);
      }
      return {
        id: m.id, centerId: m.centerId, name: m.name, previous: prevReading, current: cur ? num(cur.reading) : null, estimated: cur?.estimated ?? false,
        reset: cur?.isReset ? { oldFinal: cur.oldFinal === null ? null : num(cur.oldFinal), baseline: num(cur.baseline) } : null,
        history: history.slice(-3),
      };
    }),
    iptu: iptuRow ? { year: iptuRow.year, totalCents: iptuRow.totalCents, totalAreaM2: num(iptuRow.totalAreaM2), firstMonth: iptuRow.firstMonth, parcels: iptuRow.parcels } : null,
    items: p.items.map((i) => ({
      id: i.id, centerId: i.centerId, description: i.description, qty: i.qty === null ? null : num(i.qty), unitCents: i.unitCents, amountCents: i.amountCents, adhoc: i.adhoc,
    })),
  };
}

export async function listPeriods(principal: Principal | null) {
  assertCan(principal, 'condo.view');
  const rows = await prisma.condoPeriod.findMany({
    orderBy: { month: 'desc' },
    include: { expenses: { select: { amountCents: true } }, charges: { select: { totalCents: true, status: true, paidCents: true } } },
  });
  return rows.map((p) => ({
    month: p.month as Month, status: p.status, imported: p.imported, dueDate: fromUtc(p.dueDate),
    expensesCents: p.expenses.reduce((s, e) => s + e.amountCents, 0),
    chargesCents: p.charges.reduce((s, c) => s + c.totalCents, 0),
    charges: p.charges.length,
    paid: p.charges.filter((c) => c.status === 'PAID').length,
  }));
}

/** Tela da competência: dados editáveis + resultado (ao vivo no rascunho, congelado no fechado). */
export async function getPeriod(principal: Principal | null, month: string) {
  assertCan(principal, 'condo.view');
  assertMonth(month);
  const l = await load(prisma, month);
  if (!l) throw new NotFoundError(`A competência ${monthLabel(month)} ainda não foi aberta.`);
  const { p } = l;
  const input = toInput(month, l);
  const snapshot = p.snapshot as unknown as PeriodSnapshot | null;
  const result = p.status === 'CLOSED' && snapshot ? snapshot.result : computePeriod(input);
  const prev = await prisma.condoPeriod.findFirst({ where: { month: { lt: month } }, orderBy: { month: 'desc' }, include: { centers: { select: { centerId: true } } } });
  const prevIds = new Set(prev?.centers.map((c) => c.centerId) ?? []);
  const nowIds = new Set(p.centers.map((c) => c.centerId));
  const allCenters = await prisma.condoCenter.findMany({ where: { id: { in: [...prevIds, ...nowIds] } }, select: { id: true, name: true } });
  const nameOf = (id: string) => allCenters.find((c) => c.id === id)?.name ?? '';
  return {
    id: p.id, month, status: p.status, imported: p.imported, dueDate: fromUtc(p.dueDate), notes: p.notes,
    tariff: num(p.tariff), flag: p.flag as Flag, flagFactor: num(p.flagFactor), snackBarPct: num(p.snackBarPct),
    closedAt: p.closedAt?.toISOString() ?? null,
    expenses: p.expenses.map((e) => ({ id: e.id, group: e.group, description: e.description, amountCents: e.amountCents, kind: e.kind, confirmed: e.confirmed, memo: e.memo })),
    centers: input.centers.map((c) => ({ ...c, displayName: c.name, contactPhone: p.centers.find((x) => x.centerId === c.id)?.center.contactPhone ?? null })),
    meters: input.meters,
    items: p.items.map((i) => ({ id: i.id, centerId: i.centerId, recurringItemId: i.recurringItemId, description: i.description, qty: i.qty === null ? null : num(i.qty), unitCents: i.unitCents, amountCents: i.amountCents, adhoc: i.adhoc })),
    iptu: input.iptu,
    result,
    charges: p.charges.map((c) => ({ id: c.id, centerId: c.centerId, number: c.number, centerName: c.centerName, totalCents: c.totalCents, status: c.status, paidAt: c.paidAt ? fromUtc(c.paidAt) : null, paidCents: c.paidCents, sentAt: c.sentAt?.toISOString() ?? null })),
    changes: {
      previous: (prev?.month ?? null) as Month | null,
      entered: [...nowIds].filter((id) => prev && !prevIds.has(id)).map(nameOf),
      left: [...prevIds].filter((id) => !nowIds.has(id)).map(nameOf),
    },
  };
}
export type CondoPeriodView = Awaited<ReturnType<typeof getPeriod>>;

/**
 * Abre a competência copiando a anterior: despesas fixas com o valor anterior,
 * variáveis "a confirmar", alunos, itens (com a quantidade anterior), tarifa e
 * bandeira. Entra quem está ativo no mês; quem entrou/saiu no meio do mês vem proporcional.
 */
export async function openPeriod(principal: Principal | null, month: string, meta: RequestMeta): Promise<Month> {
  assertCan(principal, 'condo.edit');
  assertMonth(month);
  const settings = await getCondoSettings();
  return prisma.$transaction(async (tx) => {
    if (await tx.condoPeriod.findUnique({ where: { month } })) return month;
    const prev = await tx.condoPeriod.findFirst({
      where: { month: { lt: month } }, orderBy: { month: 'desc' },
      include: { expenses: { orderBy: { sortOrder: 'asc' } }, centers: true, items: true },
    });
    const centers = (await tx.condoCenter.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] })).filter((c) => active(c.activeFrom, c.activeTo, month));
    if (!centers.length) throw new AppError('Cadastre os centros de custo (ou importe a planilha) antes de abrir a primeira competência.');
    const flag = (prev?.flag ?? 'VERDE') as Flag;
    const p = await tx.condoPeriod.create({
      data: {
        month, dueDate: toUtc(defaultDueDate(month, settings.dueDay)), createdById: principal.id,
        tariff: prev?.tariff ?? DEFAULT_TARIFF, flag, flagFactor: prev?.flagFactor ?? settings.flagFactors[flag], snackBarPct: prev?.snackBarPct ?? 30,
        expenses: {
          create: (prev?.expenses ?? []).map((e) => ({
            group: e.group, description: e.description, amountCents: e.amountCents, kind: e.kind, memo: e.memo, sortOrder: e.sortOrder,
            confirmed: e.kind === 'FIXED',
          })),
        },
        centers: {
          create: centers.map((c) => {
            const before = prev?.centers.find((x) => x.centerId === c.id);
            const partial = fromUtc(c.activeFrom) > firstDay(month) || (c.activeTo && fromUtc(c.activeTo) < lastDay(month));
            return { centerId: c.id, headcount: before?.headcount ?? 0, billing: partial ? 'PRORATA' : 'FULL' };
          }),
        },
      },
    });
    const items = await tx.condoRecurringItem.findMany({ where: { centerId: { in: centers.map((c) => c.id) } }, orderBy: [{ sortOrder: 'asc' }] });
    let order = 0;
    for (const it of items.filter((i) => active(i.activeFrom, i.activeTo, month))) {
      const before = prev?.items.find((x) => x.recurringItemId === it.id);
      await tx.condoPeriodItem.create({
        data: {
          periodId: p.id, centerId: it.centerId, recurringItemId: it.id, description: it.description, sortOrder: order++,
          unitCents: it.unitCents, qty: it.unitCents !== null ? (before?.qty ?? it.defaultQty ?? 0) : null, amountCents: it.unitCents !== null ? 0 : it.amountCents,
        },
      });
    }
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: 'condo.period_opened', entityType: 'condo_period', entityId: p.id,
      summary: `${principal.name} abriu a competência ${monthLabel(month)} do Condomínio${prev ? ` (copiando ${monthLabel(prev.month as Month)})` : ''}`,
    });
    return month;
  });
}

/** Número opcional: vazio/null fica null (z.coerce.number() transformaria null em 0). */
const nullNum = (schema: z.ZodNumber) => z.preprocess((v) => (v === null || v === undefined || v === '' ? null : Number(v)), schema.nullable());
const cents = z.coerce.number().int().min(-100_000_000).max(100_000_000);
const saveSchema = z.object({
  dueDate: z.string().refine(isIsoDate, 'Vencimento inválido.'),
  tariff: z.coerce.number().positive('Informe a tarifa (R$/kWh).').max(10),
  flag: z.enum(FLAGS.map((f) => f.id) as [Flag, ...Flag[]]),
  flagFactor: z.coerce.number().min(0.5).max(3),
  snackBarPct: z.coerce.number().min(0).max(100),
  notes: z.string().trim().max(500).nullable().optional().transform((v) => v || null),
  expenses: z.array(z.object({
    group: z.string().trim().min(1, 'Toda despesa precisa de um grupo.').max(60),
    description: z.string().trim().min(1, 'Toda despesa precisa de descrição.').max(80),
    amountCents: cents,
    kind: z.enum(['FIXED', 'VARIABLE']),
    confirmed: z.boolean(),
    memo: z.string().trim().max(300).nullable().optional().transform((v) => v || null),
  })).max(120),
  centers: z.array(z.object({ centerId: z.string().uuid(), headcount: z.coerce.number().int().min(0).max(100_000), billing: z.enum(['FULL', 'PRORATA', 'NONE']) })),
  readings: z.array(z.object({
    meterId: z.string().uuid(),
    reading: nullNum(z.number().min(0).max(100_000_000)),
    estimated: z.boolean(),
    isReset: z.boolean(),
    oldFinal: nullNum(z.number().min(0)),
    baseline: nullNum(z.number().min(0)),
  })),
  items: z.array(z.object({
    centerId: z.string().uuid(),
    recurringItemId: z.string().uuid().nullable(),
    description: z.string().trim().min(1, 'Descreva o item.').max(80),
    qty: nullNum(z.number().min(0).max(100_000)),
    unitCents: nullNum(z.number().int().min(-100_000_000).max(100_000_000)),
    amountCents: cents,
    adhoc: z.boolean(),
  })).max(200),
});

async function draft(tx: Tx, month: Month) {
  const p = await tx.condoPeriod.findUnique({ where: { month } });
  if (!p) throw new NotFoundError(`A competência ${monthLabel(month)} ainda não foi aberta.`);
  if (p.status === 'CLOSED') throw new AppError(`A competência ${monthLabel(month)} está fechada. Reabra para alterar.`);
  return p;
}

/** Salva a competência inteira (como o Cadastro de Treino): cabeçalho, despesas, alunos, leituras e itens. */
export async function savePeriod(principal: Principal | null, month: string, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'condo.edit');
  assertMonth(month);
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const d = parsed.data;
  await prisma.$transaction(async (tx) => {
    const p = await draft(tx, month);
    await tx.condoPeriod.update({ where: { id: p.id }, data: { dueDate: toUtc(d.dueDate), tariff: d.tariff, flag: d.flag, flagFactor: d.flagFactor, snackBarPct: d.snackBarPct, notes: d.notes } });
    await tx.condoExpense.deleteMany({ where: { periodId: p.id } });
    await tx.condoExpense.createMany({ data: d.expenses.map((e, i) => ({ ...e, periodId: p.id, sortOrder: i })) });
    const inPeriod = new Set((await tx.condoPeriodCenter.findMany({ where: { periodId: p.id } })).map((c) => c.centerId));
    for (const c of d.centers) {
      if (!inPeriod.has(c.centerId)) continue;
      await tx.condoPeriodCenter.update({ where: { periodId_centerId: { periodId: p.id, centerId: c.centerId } }, data: { headcount: c.headcount, billing: c.billing } });
    }
    for (const r of d.readings) {
      if (r.reading === null) { await tx.condoMeterReading.deleteMany({ where: { meterId: r.meterId, month } }); continue; }
      const data = { reading: r.reading, estimated: r.estimated, isReset: r.isReset, oldFinal: r.isReset ? r.oldFinal : null, baseline: r.isReset ? r.baseline ?? 0 : null };
      await tx.condoMeterReading.upsert({ where: { meterId_month: { meterId: r.meterId, month } }, create: { meterId: r.meterId, month, ...data }, update: data });
    }
    await tx.condoPeriodItem.deleteMany({ where: { periodId: p.id } });
    await tx.condoPeriodItem.createMany({ data: d.items.filter((i) => inPeriod.has(i.centerId)).map((i, n) => ({ ...i, periodId: p.id, sortOrder: n })) });
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: 'condo.period_saved', entityType: 'condo_period', entityId: p.id,
      after: { despesas: d.expenses.length, total: d.expenses.reduce((s, e) => s + e.amountCents, 0) },
      summary: `${principal.name} salvou a competência ${monthLabel(month)} do Condomínio (despesas ${formatBRL(d.expenses.reduce((s, e) => s + e.amountCents, 0))})`,
    });
  });
}

/** Grava o resultado congelado e as cobranças (mantém nº e status de pagamento ao refechar). */
export async function freeze(tx: Tx, month: Month, opts: { closedById: string | null; asBilled?: PeriodResult['charges'] }) {
  const l = await load(tx, month);
  if (!l) throw new NotFoundError('Competência não encontrada.');
  const result = computePeriod(toInput(month, l));
  if (opts.asBilled) result.charges = opts.asBilled;
  const snapshot: PeriodSnapshot = {
    result,
    centers: l.p.centers.map((c) => ({ id: c.centerId, name: c.center.name, displayName: c.center.displayName, kind: c.center.kind })),
    expenses: l.p.expenses.map((e) => ({ group: e.group, description: e.description, amountCents: e.amountCents, memo: e.memo })),
    params: { tariff: num(l.p.tariff), flag: l.p.flag, flagFactor: num(l.p.flagFactor), snackBarPct: num(l.p.snackBarPct) },
    dueDate: fromUtc(l.p.dueDate),
  };
  await tx.condoPeriod.update({
    where: { id: l.p.id },
    data: { status: 'CLOSED', snapshot: snapshot as unknown as Prisma.InputJsonValue, closedAt: new Date(), closedById: opts.closedById },
  });
  const keep = new Set(result.charges.map((c) => c.centerId));
  await tx.condoCharge.deleteMany({ where: { periodId: l.p.id, centerId: { notIn: [...keep] }, status: 'PENDING' } });
  for (const c of result.charges) {
    const data = { centerName: c.name, totalCents: c.totalCents, lines: c.lines as unknown as Prisma.InputJsonValue, dueDate: l.p.dueDate };
    await tx.condoCharge.upsert({ where: { periodId_centerId: { periodId: l.p.id, centerId: c.centerId } }, create: { periodId: l.p.id, centerId: c.centerId, ...data }, update: data });
  }
  return result;
}

export async function closePeriod(principal: Principal | null, month: string, meta: RequestMeta) {
  assertCan(principal, 'condo.close');
  assertMonth(month);
  return prisma.$transaction(async (tx) => {
    const p = await draft(tx, month);
    const l = await load(tx, month);
    const check = computePeriod(toInput(month, l!));
    if (check.issues.length) throw new AppError(`Ainda não dá para fechar: ${check.issues.join(' ')}`);
    const r = await freeze(tx, month, { closedById: principal.id });
    const total = r.charges.reduce((s, c) => s + c.totalCents, 0);
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: 'condo.period_closed', entityType: 'condo_period', entityId: p.id,
      after: { cobrancas: r.charges.length, total },
      summary: `${principal.name} fechou a competência ${monthLabel(month)} do Condomínio: ${r.charges.length} cobrança(s), ${formatBRL(total)}`,
    });
    return { charges: r.charges.length, totalCents: total };
  });
}

export async function reopenPeriod(principal: Principal | null, month: string, meta: RequestMeta) {
  assertCan(principal, 'condo.close');
  assertMonth(month);
  await prisma.$transaction(async (tx) => {
    const p = await tx.condoPeriod.findUnique({ where: { month } });
    if (!p) throw new NotFoundError('Competência não encontrada.');
    if (p.status !== 'CLOSED') return;
    if (p.imported) throw new AppError('Competência importada da planilha: os valores ficam como foram cobrados e não podem ser reabertos.');
    const next = await tx.condoPeriod.findFirst({ where: { month: { gt: month } }, select: { month: true } });
    await tx.condoPeriod.update({ where: { id: p.id }, data: { status: 'DRAFT', closedAt: null, closedById: null } });
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: 'condo.period_reopened', entityType: 'condo_period', entityId: p.id,
      summary: `${principal.name} reabriu a competência ${monthLabel(month)} do Condomínio${next ? ` (já existe ${monthLabel(next.month as Month)}: confira as leituras de energia)` : ''}`,
    });
  });
}

/** Próxima competência a abrir (o mês vencido, ou a seguinte à última aberta). */
export async function nextMonthToOpen(today: string): Promise<Month> {
  const last = await prisma.condoPeriod.findFirst({ orderBy: { month: 'desc' }, select: { month: true } });
  const due = addMonths(today.slice(0, 7) as Month, -1);
  if (!last) return due;
  const after = addMonths(last.month as Month, 1);
  return after <= due ? after : due;
}

/** Cobrança: enviada / paga (com data e valor). */
export async function markCharge(
  principal: Principal | null, id: string,
  input: { status: 'PENDING' | 'SENT' | 'PAID'; paidAt?: string | null; paidCents?: number | null; note?: string | null },
  meta: RequestMeta,
) {
  assertCan(principal, 'condo.payments');
  if (input.status === 'PAID' && (!input.paidAt || !isIsoDate(input.paidAt))) throw new AppError('Informe a data do pagamento.');
  await prisma.$transaction(async (tx) => {
    const c = await tx.condoCharge.findUnique({ where: { id }, include: { period: { select: { month: true } } } });
    if (!c) throw new NotFoundError('Cobrança não encontrada.');
    const paid = input.status === 'PAID';
    await tx.condoCharge.update({
      where: { id },
      data: {
        status: input.status,
        sentAt: input.status === 'PENDING' ? null : c.sentAt ?? new Date(),
        paidAt: paid ? toUtc(input.paidAt!) : null,
        paidCents: paid ? input.paidCents ?? c.totalCents : null,
        paymentNote: input.note?.trim().slice(0, 200) || null,
      },
    });
    const what = { PENDING: 'voltou para pendente', SENT: 'marcou como enviada', PAID: `registrou o pagamento (${formatBRL(input.paidCents ?? c.totalCents)} em ${input.paidAt})` }[input.status];
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: 'condo.charge_status', entityType: 'condo_charge', entityId: id,
      summary: `${principal.name} ${what} a cobrança de ${c.centerName} · ${monthLabel(c.period.month as Month)}`,
    });
  });
}

/** Documentos de cobrança de uma competência fechada (todos ou um). */
export async function chargeDocs(principal: Principal | null, month: string, chargeId: string | null, today: string): Promise<ChargeDoc[]> {
  assertCan(principal, 'condo.view');
  assertMonth(month);
  const p = await prisma.condoPeriod.findUnique({ where: { month }, include: { charges: { include: { center: true }, orderBy: { centerName: 'asc' } } } });
  if (!p) throw new NotFoundError('Competência não encontrada.');
  if (p.status !== 'CLOSED' || !p.snapshot) throw new AppError('Feche a competência para gerar os documentos de cobrança.');
  const snap = p.snapshot as unknown as PeriodSnapshot;
  const settings = await getCondoSettings();
  const charges = p.charges.filter((c) => !chargeId || c.id === chargeId);
  if (!charges.length) throw new NotFoundError('Cobrança não encontrada.');
  const snackIds = new Set((await prisma.condoCenter.findMany({ where: { isSnackBar: true }, select: { id: true } })).map((c) => c.id));
  return charges.map((c) => ({
    number: c.number,
    name: c.centerName,
    legalName: c.center.legalName,
    document: c.center.document,
    month,
    dueDate: fromUtc(c.dueDate),
    totalCents: c.totalCents,
    lines: c.lines as unknown as ChargeDoc['lines'],
    allocation: snap.result.allocation.map((a) => ({ name: a.name, headcount: a.headcount, cents: a.cents, ratio: a.ratio, mine: a.id === c.centerId, snackBar: snackIds.has(a.id) })),
    perHeadCents: Math.round(snap.result.perHead * 100),
    headcount: snap.result.headcount,
    expenses: snap.expenses,
    expensesCents: snap.result.totalCents,
    payee: { name: settings.payeeName, document: settings.payeeDocument, pixKey: settings.pixKey, pixCity: settings.pixCity, bankInfo: settings.bankInfo, instructions: settings.instructions },
    emittedAt: today,
  }));
}
