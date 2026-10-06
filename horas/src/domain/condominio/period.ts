import { allocate, type RateioRow } from './rateio';
import { consumptionAlert, energyCharge } from './energy';
import { iptuLabel, iptuParcelCents, parcelOf, type IptuYear } from './iptu';
import { roundCents } from './money';
import { daysInMonth, firstDay, lastDay, type Month } from './months';

/**
 * Uma competência inteira, puro: Tabela 1 (despesas) → Tabela 2 (rateio) →
 * Tabela 3 (cobrança de cada parceiro). O serviço só carrega, chama e grava.
 */

export type CenterKind = 'INTERNAL' | 'PARTNER';
/** Entrada/saída no meio do mês: cobra proporcional, o mês cheio ou nada. */
export type Billing = 'FULL' | 'PRORATA' | 'NONE';

export interface PeriodCenter {
  id: string;
  name: string;
  kind: CenterKind;
  isSnackBar: boolean;
  /** Fora do rateio (ex.: centro só para cobrar energia). */
  chargesCondo: boolean;
  areaM2: number;
  iptuSharePct: number;
  headcount: number;
  billing: Billing;
  activeFrom: string;
  activeTo: string | null;
}
export interface PeriodMeter {
  id: string;
  centerId: string;
  name: string;
  previous: number;
  current: number | null;
  estimated: boolean;
  reset: { oldFinal: number | null; baseline: number } | null;
  /** Consumos dos meses anteriores (kWh), do mais antigo ao mais recente. */
  history: number[];
}
export interface PeriodItem {
  id: string;
  centerId: string;
  description: string;
  /** Item "quantidade × valor unitário" (Check In Funcional 28 × R$ 25). */
  qty: number | null;
  unitCents: number | null;
  amountCents: number;
  /** Avulso do mês (ajuste, desconto): não entra no proporcional. */
  adhoc: boolean;
}
export interface PeriodInput {
  month: Month;
  tariff: number;
  flagFactor: number;
  snackBarPct: number;
  expenses: { amountCents: number; confirmed: boolean; description: string }[];
  centers: PeriodCenter[];
  meters: PeriodMeter[];
  iptu: IptuYear | null;
  items: PeriodItem[];
}

export type LineKind = 'ENERGIA' | 'CONDOMINIO' | 'IPTU' | 'ITEM' | 'AVULSO';
export interface ChargeLine {
  kind: LineKind;
  description: string;
  cents: number;
  /** Memória do cálculo, para o PDF: "39.376 − 37.998 = 1.378 kWh × R$ 0,9564346 × 1,15". */
  detail?: string;
}
export interface PartnerCharge {
  centerId: string;
  name: string;
  lines: ChargeLine[];
  totalCents: number;
  prorata: { days: number; of: number } | null;
}
export interface EnergyRow { meterId: string; centerId: string; name: string; previous: number; current: number | null; kwh: number; cents: number; estimated: boolean; error: string | null; alert: string | null }
export interface PeriodResult {
  totalCents: number;
  allocation: (RateioRow & { name: string; kind: CenterKind })[];
  perHead: number;
  headcount: number;
  energy: EnergyRow[];
  iptuParcel: number | null;
  charges: PartnerCharge[];
  /** Impedem o fechamento. */
  issues: string[];
  /** Avisos (não impedem). */
  warnings: string[];
}

const fmtKwh = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

/** Dias do centro de custo dentro da competência (entrada/saída no meio do mês). */
export function activeDays(month: Month, from: string, to: string | null): number {
  const start = from > firstDay(month) ? from : firstDay(month);
  const end = to && to < lastDay(month) ? to : lastDay(month);
  if (end < start) return 0;
  return Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86_400_000) + 1;
}

export function computePeriod(p: PeriodInput): PeriodResult {
  const issues: string[] = [];
  const warnings: string[] = [];
  const totalCents = p.expenses.reduce((s, e) => s + e.amountCents, 0);
  const pending = p.expenses.filter((e) => !e.confirmed);
  if (pending.length) issues.push(`${pending.length} despesa(s) variável(is) a confirmar: ${pending.slice(0, 4).map((e) => e.description).join(', ')}${pending.length > 4 ? '…' : ''}.`);

  const inRateio = p.centers.filter((c) => c.chargesCondo);
  const r = allocate(totalCents, inRateio.map((c) => ({ id: c.id, headcount: c.headcount, isSnackBar: c.isSnackBar })), p.snackBarPct);
  if (r.error) issues.push(r.error);
  const byId = new Map(r.rows.map((x) => [x.id, x]));
  const allocation = inRateio.map((c) => ({ ...byId.get(c.id)!, name: c.name, kind: c.kind }));

  const energy: EnergyRow[] = p.meters.map((m) => {
    if (m.current === null) {
      issues.push(`Falta a leitura do relógio "${m.name}".`);
      return { meterId: m.id, centerId: m.centerId, name: m.name, previous: m.previous, current: null, kwh: 0, cents: 0, estimated: m.estimated, error: 'Sem leitura', alert: null };
    }
    const e = energyCharge({ previous: m.previous, current: m.current, reset: m.reset }, p.tariff, p.flagFactor);
    if (e.error) issues.push(`${m.name}: ${e.error}`);
    const alert = e.error ? null : consumptionAlert(e.kwh, m.history);
    if (alert) warnings.push(`${m.name}: ${alert}`);
    if (m.estimated) warnings.push(`${m.name}: leitura estimada — acerte quando chegar a leitura real.`);
    return { meterId: m.id, centerId: m.centerId, name: m.name, previous: m.previous, current: m.current, kwh: e.kwh, cents: e.cents, estimated: m.estimated, error: e.error, alert };
  });

  const parcel = p.iptu ? parcelOf(p.iptu, p.month) : null;
  const of = daysInMonth(p.month);
  const charges: PartnerCharge[] = [];
  for (const c of p.centers.filter((x) => x.kind === 'PARTNER')) {
    if (c.billing === 'NONE') continue;
    const days = activeDays(p.month, c.activeFrom, c.activeTo);
    const partial = days < of;
    const factor = c.billing === 'PRORATA' && partial ? days / of : 1;
    const prorate = (cents: number) => roundCents(cents * factor);
    const lines: ChargeLine[] = [];
    const meters = energy.filter((e) => e.centerId === c.id);
    for (const e of meters) {
      lines.push({
        kind: 'ENERGIA',
        description: meters.length > 1 ? `Energia · ${e.name}` : 'Energia',
        cents: e.cents,
        detail: e.current === null ? undefined
          : `${fmtKwh(e.previous)} → ${fmtKwh(e.current)} = ${fmtKwh(e.kwh)} kWh × R$ ${String(p.tariff).replace('.', ',')} × ${String(p.flagFactor).replace('.', ',')}${e.estimated ? ' (leitura estimada)' : ''}`,
      });
    }
    const condo = byId.get(c.id);
    if (c.chargesCondo && condo) lines.push({ kind: 'CONDOMINIO', description: 'Condomínio', cents: prorate(condo.cents) });
    if (p.iptu && parcel && c.areaM2 > 0 && c.iptuSharePct > 0) {
      lines.push({ kind: 'IPTU', description: iptuLabel(parcel, p.iptu.parcels, c.iptuSharePct), cents: prorate(iptuParcelCents(p.iptu, c.areaM2, c.iptuSharePct)) });
    }
    for (const it of p.items.filter((x) => x.centerId === c.id)) {
      const base = it.qty !== null && it.unitCents !== null ? roundCents(it.qty * it.unitCents) : it.amountCents;
      const desc = it.qty !== null && it.unitCents !== null ? `${it.description} (${String(it.qty).replace('.', ',')})` : it.description;
      lines.push({ kind: it.adhoc ? 'AVULSO' : 'ITEM', description: desc, cents: it.adhoc ? base : prorate(base) });
    }
    if (partial && c.billing === 'PRORATA') warnings.push(`${c.name}: ${days} de ${of} dias na competência — condomínio, IPTU e itens fixos proporcionais.`);
    charges.push({ centerId: c.id, name: c.name, lines, totalCents: lines.reduce((s, l) => s + l.cents, 0), prorata: partial && c.billing === 'PRORATA' ? { days, of } : null });
  }
  return { totalCents, allocation, perHead: r.perHead, headcount: r.headcount, energy, iptuParcel: parcel, charges, issues, warnings };
}
