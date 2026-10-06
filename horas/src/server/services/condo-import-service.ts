import { prisma } from '@/server/db';
import { audit } from '@/server/audit';
import { assertCan } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import type { RequestMeta } from '@/server/auth/session';
import { AppError } from '@/server/errors';
import { toUtc } from '@/domain/dates';
import { DEFAULT_FLAG_FACTORS } from '@/domain/condominio/energy';
import { importCheck, parseCondoWorkbook, type ImportBundle } from '@/domain/condominio/import';
import { formatBRL } from '@/domain/condominio/money';
import { defaultDueDate, firstDay, lastDay, monthLabel } from '@/domain/condominio/months';
import { readCondoWorkbook } from '@/server/import/condo-xlsx';
import { DEFAULT_TARIFF, freeze } from './condo-period-service';

/**
 * Importação única da planilha "Condomínio Nação Club": cadastros (centros de
 * custo, áreas, relógios com todas as leituras, IPTU, itens fixos) e as
 * competências mensais já fechadas, com as cobranças como foram cobradas.
 * Só roda com o Condomínio vazio: depois, tudo se lança pelo sistema.
 */

const FACTOR = 1.15;

async function parse(file: File): Promise<ImportBundle> {
  if (!/\.xlsx$/i.test(file.name)) throw new AppError('Envie a planilha em .xlsx (Arquivo → Fazer download → Microsoft Excel).');
  try {
    return parseCondoWorkbook(await readCondoWorkbook(await file.arrayBuffer()));
  } catch (e) {
    throw new AppError(`Não consegui ler a planilha: ${e instanceof Error ? e.message : 'formato inesperado'}.`);
  }
}

export async function analyzeCondoImport(principal: Principal | null, file: File) {
  assertCan(principal, 'condo.edit');
  const b = await parse(file);
  const latest = b.periods.at(-1)!;
  return {
    alreadyImported: (await prisma.condoCenter.count()) > 0 || (await prisma.condoPeriod.count()) > 0,
    months: b.periods.map((p) => ({ month: p.month, tab: p.tab, expensesCents: p.expenses.reduce((s, e) => s + e.amountCents, 0), charges: p.charges.length, chargesCents: p.charges.reduce((s, c) => s + c.totalCents, 0) })),
    partners: b.centers.filter((c) => c.kind === 'PARTNER' && c.lastMonth === latest.month).map((c) => c.displayName ?? c.name),
    internal: b.centers.filter((c) => c.kind === 'INTERNAL' && c.lastMonth === latest.month).map((c) => c.name),
    former: b.centers.filter((c) => c.lastMonth !== latest.month).map((c) => c.displayName ?? c.name),
    meters: b.meters.map((m) => ({ name: m.name, readings: m.readings.length, estimated: m.readings.filter((r) => r.estimated).map((r) => r.month) })),
    iptu: b.iptu,
    recurring: b.recurring.map((i) => ({ center: b.centers.find((c) => c.key === i.centerKey)?.displayName ?? i.centerKey, description: i.description, amountCents: i.amountCents, unitCents: i.unitCents, qty: i.qty })),
    check: { month: latest.month, rows: importCheck(b, latest.month, DEFAULT_TARIFF, FACTOR) },
    warnings: b.warnings,
  };
}
export type CondoImportAnalysis = Awaited<ReturnType<typeof analyzeCondoImport>>;

export async function commitCondoImport(principal: Principal | null, file: File, meta: RequestMeta) {
  assertCan(principal, 'condo.edit');
  const b = await parse(file);
  const latest = b.periods.at(-1)!.month;
  return prisma.$transaction(async (tx) => {
    if ((await tx.condoCenter.count()) || (await tx.condoPeriod.count())) throw new AppError('O Condomínio já tem dados: a importação da planilha só pode ser feita uma vez, com tudo vazio.');
    await tx.condoSettings.upsert({ where: { id: 1 }, create: { id: 1, flagFactors: DEFAULT_FLAG_FACTORS }, update: {} });

    const ids = new Map<string, string>();
    const order = [...b.centers].sort((a, c) => (a.kind === c.kind ? 0 : a.kind === 'PARTNER' ? -1 : 1));
    for (const [i, c] of order.entries()) {
      const row = await tx.condoCenter.create({
        data: {
          name: c.name, displayName: c.displayName, kind: c.kind, isSnackBar: c.isSnackBar, areaM2: c.areaM2, iptuSharePct: c.iptuSharePct, sortOrder: i,
          activeFrom: toUtc(firstDay(c.firstMonth)), activeTo: c.lastMonth < latest ? toUtc(lastDay(c.lastMonth)) : null,
        },
      });
      ids.set(c.key, row.id);
    }
    for (const m of b.meters) {
      const first = m.readings[0]!;
      const meter = await tx.condoMeter.create({ data: { centerId: ids.get(m.centerKey)!, name: m.name, installReading: first.reading, activeFrom: toUtc(firstDay(first.month)) } });
      await tx.condoMeterReading.createMany({ data: m.readings.map((r) => ({ meterId: meter.id, month: r.month, reading: r.reading, estimated: r.estimated })) });
    }
    if (b.iptu) await tx.condoIptuYear.create({ data: b.iptu });
    const recurring = new Map<string, string>();
    for (const [i, it] of b.recurring.entries()) {
      const row = await tx.condoRecurringItem.create({
        data: { centerId: ids.get(it.centerKey)!, description: it.description, amountCents: it.amountCents, unitCents: it.unitCents, defaultQty: it.qty, activeFrom: toUtc(firstDay(latest)), sortOrder: i },
      });
      recurring.set(`${it.centerKey}|${it.description}`, row.id);
    }

    for (const p of b.periods) {
      const inPeriod = new Set([...Object.keys(p.headcounts), ...p.charges.map((c) => c.centerKey)]);
      const period = await tx.condoPeriod.create({
        data: {
          month: p.month, dueDate: toUtc(defaultDueDate(p.month, 20)), tariff: DEFAULT_TARIFF, flag: 'VERDE', flagFactor: FACTOR, snackBarPct: p.snackBarPct,
          imported: true, createdById: principal.id, notes: `Importada da aba "${p.tab}" da planilha.`,
          expenses: { create: p.expenses.map((e, i) => ({ ...e, confirmed: true, sortOrder: i })) },
          centers: { create: [...inPeriod].filter((k) => ids.has(k)).map((k) => ({ centerId: ids.get(k)!, headcount: p.headcounts[k] ?? 0 })) },
          items: {
            create: p.items.filter((it) => ids.has(it.centerKey)).map((it, i) => ({
              centerId: ids.get(it.centerKey)!, description: it.description, qty: it.qty, unitCents: it.unitCents, amountCents: it.amountCents, sortOrder: i,
              recurringItemId: p.month === latest ? recurring.get(`${it.centerKey}|${it.description}`) ?? null : null,
            })),
          },
        },
      });
      await freeze(tx, p.month, {
        closedById: principal.id,
        asBilled: p.charges.filter((c) => ids.has(c.centerKey)).map((c) => ({ centerId: ids.get(c.centerKey)!, name: c.name, lines: c.lines, totalCents: c.totalCents, prorata: null })),
      });
      // Meses anteriores ao último já foram cobrados e pagos (presumido); o último fica pendente para conferir.
      if (p.month !== latest) {
        await tx.$executeRaw`UPDATE "condo_charges" SET "status" = 'PAID', "paid_at" = "due_date", "paid_cents" = "total_cents", "payment_note" = 'Importada da planilha: pagamento presumido' WHERE "period_id" = ${period.id}::uuid`;
      }
    }
    const billed = b.periods.at(-1)!.charges.reduce((s, c) => s + c.totalCents, 0);
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: 'condo.imported', entityType: 'condo_period', entityId: latest,
      after: { competencias: b.periods.length, centros: b.centers.length, relogios: b.meters.length },
      summary: `${principal.name} importou a planilha do Condomínio: ${b.periods.length} competência(s) (${monthLabel(b.periods[0]!.month)} a ${monthLabel(latest)}), ${b.centers.length} centros de custo, ${b.meters.length} relógios; ${monthLabel(latest)} cobrou ${formatBRL(billed)}`,
    });
    return { periods: b.periods.length, latest };
  }, { timeout: 180_000, maxWait: 20_000 });
}
