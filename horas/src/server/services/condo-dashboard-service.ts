import { prisma } from '@/server/db';
import { assertCan } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import { fromUtc } from '@/domain/dates';
import { consumption } from '@/domain/condominio/energy';
import { addMonths, type Month } from '@/domain/condominio/months';
import type { PeriodSnapshot } from './condo-period-service';
import { num } from './condo-service';

/**
 * Painel do Condomínio: evolução das despesas comuns, quanto os parceiros
 * cobrem, energia por parceiro e a situação das cobranças. Usa só as
 * competências fechadas (o resultado congelado de cada mês).
 */
export async function condoDashboard(principal: Principal | null, months: number, today: string) {
  assertCan(principal, 'condo.view');
  const all = await prisma.condoPeriod.findMany({
    orderBy: { month: 'asc' },
    include: { charges: { select: { id: true, centerName: true, totalCents: true, status: true, dueDate: true, paidCents: true } } },
  });
  const closed = all.filter((p) => p.status === 'CLOSED' && p.snapshot);
  const last = closed.at(-1)?.month as Month | undefined;
  const from = last ? addMonths(last, -(months - 1)) : null;
  const window = closed.filter((p) => from && p.month >= from);

  const series = window.map((p) => {
    const s = p.snapshot as unknown as PeriodSnapshot;
    const partnerIds = new Set(s.centers.filter((c) => c.kind === 'PARTNER').map((c) => c.id));
    const groups = new Map<string, number>();
    for (const e of s.expenses) groups.set(e.group, (groups.get(e.group) ?? 0) + e.amountCents);
    return {
      month: p.month as Month,
      expensesCents: s.result.totalCents,
      chargesCents: p.charges.reduce((t, c) => t + c.totalCents, 0),
      partnerCondoCents: s.result.allocation.filter((a) => partnerIds.has(a.id)).reduce((t, a) => t + a.cents, 0),
      groups: [...groups.entries()].map(([group, cents]) => ({ group, cents })).sort((a, b) => b.cents - a.cents),
      expenses: s.expenses,
      charges: p.charges.map((c) => ({ name: c.centerName, cents: c.totalCents })),
    };
  });

  // Despesas que mais subiram: último mês × média dos 3 anteriores (mesma descrição e grupo).
  const latest = series.at(-1);
  const risers = latest ? latest.expenses.map((e) => {
    const prev = series.slice(-4, -1).map((s) => s.expenses.find((x) => x.group === e.group && x.description === e.description)?.amountCents).filter((v): v is number => v !== undefined);
    const avg = prev.length ? prev.reduce((a, b) => a + b, 0) / prev.length : null;
    return { label: `${e.description}${e.description === e.group ? '' : ` · ${e.group}`}`, cents: e.amountCents, deltaCents: avg === null ? null : Math.round(e.amountCents - avg) };
  }).filter((x) => x.deltaCents !== null && x.deltaCents > 0).sort((a, b) => b.deltaCents! - a.deltaCents!).slice(0, 5) : [];

  // Energia: consumo mensal (kWh) de cada relógio ativo, na janela.
  const meters = await prisma.condoMeter.findMany({
    where: { activeTo: null },
    include: { readings: { orderBy: { month: 'asc' } }, center: { select: { name: true, displayName: true } } },
    orderBy: { name: 'asc' },
  });
  const energy = meters.map((m) => {
    let prev = num(m.installReading);
    const points: { month: Month; kwh: number }[] = [];
    for (const r of m.readings) {
      const kwh = consumption({ previous: prev, current: num(r.reading), reset: r.isReset ? { oldFinal: r.oldFinal === null ? null : num(r.oldFinal), baseline: num(r.baseline) } : null });
      if (!from || r.month >= from) points.push({ month: r.month as Month, kwh: Math.max(0, kwh) });
      prev = num(r.reading);
    }
    return { name: m.center.displayName || m.center.name, points };
  }).filter((e) => e.points.length);

  const open = all.flatMap((p) => p.charges.filter((c) => c.status !== 'PAID').map((c) => ({
    id: c.id, month: p.month as Month, name: c.centerName, cents: c.totalCents, dueDate: fromUtc(c.dueDate), status: c.status, overdue: fromUtc(c.dueDate) < today,
  }))).sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const avg12 = series.length > 1 ? series.slice(0, -1).reduce((t, s) => t + s.expensesCents, 0) / (series.length - 1) : null;
  return { series, risers, energy, open, avgPrevCents: avg12, draft: all.find((p) => p.status === 'DRAFT')?.month as Month | undefined };
}
export type CondoDashboard = Awaited<ReturnType<typeof condoDashboard>>;
