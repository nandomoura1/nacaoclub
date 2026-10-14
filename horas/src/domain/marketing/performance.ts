/**
 * Performance do Marketing (puro): junta cliques dos links, leads, matrículas
 * e investimento num painel só, com comparação ao período anterior e mês a mês.
 * Matrícula = lead que chegou no período e hoje está "Matriculado" (coorte),
 * o mesmo critério do Tráfego Pago — assim os números batem entre as telas.
 */
import { LEAD_SOURCES, LEAD_STAGES } from './leads';
import { prorate, type SpendLite } from './traffic';

export interface PerfLead { day: string; source: string; stage: string; campaignId: string | null; linkId: string | null }
export interface PerfClick { linkId: string; day: string; clicks: number }
export interface PerfLink { id: string; title: string; slug: string; campaignId: string | null }
export interface PerfInput { from: string; to: string; leads: PerfLead[]; clicks: PerfClick[]; links: PerfLink[]; spends: SpendLite[]; campaigns: { id: string; name: string }[] }

const DAY = 86_400_000;
const t = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const isoOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Período anterior de mesmo tamanho, colado antes do atual. */
export function previousRange(from: string, to: string) {
  const days = Math.round((t(to) - t(from)) / DAY) + 1;
  return { from: isoOf(t(from) - days * DAY), to: isoOf(t(from) - DAY), days };
}

/** Os N meses (AAAA-MM) que terminam no mês de `to`. */
export function lastMonths(to: string, n: number): { key: string; from: string; to: string; label: string }[] {
  const [y, m] = to.split('-').map(Number) as [number, number];
  const NAMES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1));
    const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
    return { key: isoOf(d.getTime()).slice(0, 7), from: isoOf(d.getTime()), to: isoOf(end.getTime()), label: `${NAMES[d.getUTCMonth()]}/${String(d.getUTCFullYear()).slice(2)}` };
  });
}

const within = (day: string, from: string, to: string) => day >= from && day <= to;
const ratio = (a: number, b: number) => (b ? a / b : null);
const per = (cents: number, n: number) => (n ? Math.round(cents / n) : null);

function totals(i: PerfInput, from: string, to: string) {
  const leads = i.leads.filter((l) => within(l.day, from, to));
  const won = leads.filter((l) => l.stage === 'MATRICULADO').length;
  const clicks = i.clicks.filter((c) => within(c.day, from, to)).reduce((s, c) => s + c.clicks, 0);
  const spendCents = i.spends.reduce((s, x) => s + prorate(x, from, to).spendCents, 0);
  return { clicks, leads: leads.length, won, conversion: ratio(won, leads.length), spendCents, cpl: per(spendCents, leads.length), cac: per(spendCents, won) };
}
export type PerfTotals = ReturnType<typeof totals>;

/** Variação relativa (null quando não dá para comparar). */
export const delta = (now: number | null, before: number | null) => (now === null || before === null || before === 0 ? null : (now - before) / before);

export function performanceReport(i: PerfInput) {
  const prev = previousRange(i.from, i.to);
  const current = totals(i, i.from, i.to);
  const previous = totals(i, prev.from, prev.to);
  const leads = i.leads.filter((l) => within(l.day, i.from, i.to));

  // Funil: até onde os leads do período chegaram (perdidos contam só em "chegaram").
  const order = LEAD_STAGES.filter((s) => s.id !== 'PERDIDO').map((s) => s.id as string);
  const funnel = order.map((id, idx) => ({
    id, label: LEAD_STAGES.find((s) => s.id === id)!.label,
    count: idx === 0 ? leads.length : leads.filter((l) => order.indexOf(l.stage) >= idx).length,
  }));
  const lost = leads.filter((l) => l.stage === 'PERDIDO').length;

  const bySource = LEAD_SOURCES.map((s) => {
    const list = leads.filter((l) => l.source === s.id);
    const won = list.filter((l) => l.stage === 'MATRICULADO').length;
    return { id: s.id, label: s.label, leads: list.length, won, conversion: ratio(won, list.length) };
  }).filter((s) => s.leads > 0).sort((a, b) => b.leads - a.leads || b.won - a.won);

  const linkCampaign = new Map(i.links.map((l) => [l.id, l.campaignId]));
  const byCampaign = i.campaigns.map((c) => {
    const list = leads.filter((l) => l.campaignId === c.id);
    const won = list.filter((l) => l.stage === 'MATRICULADO').length;
    const spendCents = i.spends.filter((s) => s.campaignId === c.id).reduce((s, x) => s + prorate(x, i.from, i.to).spendCents, 0);
    const clicks = i.clicks.filter((k) => linkCampaign.get(k.linkId) === c.id && within(k.day, i.from, i.to)).reduce((s, k) => s + k.clicks, 0);
    return { id: c.id, name: c.name, clicks, leads: list.length, won, conversion: ratio(won, list.length), spendCents, cac: per(spendCents, won) };
  }).filter((c) => c.leads || c.spendCents || c.clicks).sort((a, b) => b.won - a.won || b.leads - a.leads || b.spendCents - a.spendCents);

  const topLinks = i.links.map((l) => ({
    id: l.id, title: l.title, slug: l.slug,
    clicks: i.clicks.filter((k) => k.linkId === l.id && within(k.day, i.from, i.to)).reduce((s, k) => s + k.clicks, 0),
    leads: leads.filter((x) => x.linkId === l.id).length,
  })).filter((l) => l.clicks || l.leads).sort((a, b) => b.clicks - a.clicks).slice(0, 8);

  const months = lastMonths(i.to, 6).map((m) => ({ key: m.key, label: m.label, ...totals(i, m.from, m.to) }));

  return { range: { from: i.from, to: i.to }, prev, current, previous, funnel, lost, bySource, byCampaign, topLinks, months };
}
export type PerformanceReport = ReturnType<typeof performanceReport>;
