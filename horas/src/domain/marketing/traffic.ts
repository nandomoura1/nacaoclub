/**
 * Tráfego Pago (puro): plataformas, rateio do gasto pelo período escolhido e
 * indicadores (CPL, custo por matrícula, CTR, CPC) cruzando gasto com os leads
 * que chegaram de fato no funil.
 */

export const AD_PLATFORMS = [
  { id: 'META', label: 'Meta (Instagram/Facebook)', leadSources: ['META_ADS'] },
  { id: 'GOOGLE', label: 'Google Ads', leadSources: ['GOOGLE'] },
  { id: 'TIKTOK', label: 'TikTok Ads', leadSources: [] as string[] },
  { id: 'OUTRO', label: 'Outro (impulsionamento, mídia local…)', leadSources: [] as string[] },
] as const;

const DAY = 86_400_000;
const t = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

/** Dias de [aStart, aEnd] dentro de [bStart, bEnd] (datas inclusivas). */
export function overlapDays(aStart: string, aEnd: string, bStart: string, bEnd: string): number {
  const s = Math.max(t(aStart), t(bStart));
  const e = Math.min(t(aEnd), t(bEnd));
  return e < s ? 0 : Math.round((e - s) / DAY) + 1;
}

export interface SpendLite { platform: string; campaignId: string | null; start: string; end: string; spendCents: number; impressions: number | null; clicks: number | null; platformLeads: number | null }
export interface LeadLite { source: string; campaignId: string | null; stage: string; createdAt: string }

/**
 * Parte do lançamento que cai no período: um gasto de 1 a 31/out olhado
 * de 16 a 31/out conta metade (rateio por dia). Contagens idem, arredondadas.
 */
export function prorate(s: SpendLite, from: string, to: string): SpendLite & { share: number } {
  const total = overlapDays(s.start, s.end, s.start, s.end);
  const share = total ? overlapDays(s.start, s.end, from, to) / total : 0;
  const r = (v: number | null) => (v === null ? null : Math.round(v * share));
  return { ...s, share, spendCents: Math.round(s.spendCents * share), impressions: r(s.impressions), clicks: r(s.clicks), platformLeads: r(s.platformLeads) };
}

export interface TrafficKpis { spendCents: number; impressions: number | null; clicks: number | null; platformLeads: number | null; leads: number; won: number; cpl: number | null; cac: number | null; ctr: number | null; cpc: number | null }

function kpis(spends: ReturnType<typeof prorate>[], leads: LeadLite[]): TrafficKpis {
  const sum = (k: 'impressions' | 'clicks' | 'platformLeads') => (spends.some((s) => s[k] !== null) ? spends.reduce((a, s) => a + (s[k] ?? 0), 0) : null);
  const spendCents = spends.reduce((a, s) => a + s.spendCents, 0);
  const impressions = sum('impressions');
  const clicks = sum('clicks');
  const won = leads.filter((l) => l.stage === 'MATRICULADO').length;
  return {
    spendCents, impressions, clicks, platformLeads: sum('platformLeads'), leads: leads.length, won,
    cpl: leads.length ? Math.round(spendCents / leads.length) : null,
    cac: won ? Math.round(spendCents / won) : null,
    ctr: impressions && clicks !== null ? clicks / impressions : null,
    cpc: clicks ? Math.round(spendCents / clicks) : null,
  };
}

/** Painel do período: total, por plataforma e por campanha. */
export function trafficReport(spends: SpendLite[], leads: LeadLite[], from: string, to: string) {
  const inRange = spends.map((s) => prorate(s, from, to)).filter((s) => s.share > 0);
  const paidSources = new Set<string>(AD_PLATFORMS.flatMap((p) => [...p.leadSources]));
  const periodLeads = leads.filter((l) => l.createdAt.slice(0, 10) >= from && l.createdAt.slice(0, 10) <= to);
  const paidCampaigns = new Set(inRange.map((s) => s.campaignId).filter(Boolean));
  // Lead "pago": veio de origem de anúncio OU de uma campanha que teve gasto no período.
  const paidLeads = periodLeads.filter((l) => paidSources.has(l.source) || (l.campaignId && paidCampaigns.has(l.campaignId)));
  const byPlatform = AD_PLATFORMS.map((p) => {
    const sp = inRange.filter((s) => s.platform === p.id);
    const src = new Set<string>(p.leadSources);
    const ld = paidLeads.filter((l) => src.has(l.source));
    return { id: p.id, label: p.label, ...kpis(sp, ld) };
  }).filter((p) => p.spendCents > 0 || p.leads > 0);
  const campaignIds = [...new Set([...inRange.map((s) => s.campaignId), ...paidLeads.map((l) => l.campaignId)].filter(Boolean))] as string[];
  const byCampaign = campaignIds.map((id) => ({ id, ...kpis(inRange.filter((s) => s.campaignId === id), paidLeads.filter((l) => l.campaignId === id)) }))
    .sort((a, b) => b.spendCents - a.spendCents);
  return { total: kpis(inRange, paidLeads), byPlatform, byCampaign };
}

/** Períodos rápidos (datas ISO, fuso já resolvido em `today`). */
export function presetRange(preset: string, today: string): { from: string; to: string } {
  const [y, m] = today.split('-').map(Number) as [number, number];
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const monthStart = (yy: number, mm: number) => iso(new Date(Date.UTC(yy, mm - 1, 1)));
  const monthEnd = (yy: number, mm: number) => iso(new Date(Date.UTC(yy, mm, 0)));
  if (preset === 'mes-passado') return { from: monthStart(m === 1 ? y - 1 : y, m === 1 ? 12 : m - 1), to: monthEnd(m === 1 ? y - 1 : y, m === 1 ? 12 : m - 1) };
  if (preset === '90d') return { from: iso(new Date(t(today) - 89 * DAY)), to: today };
  if (preset === 'ano') return { from: `${y}-01-01`, to: today };
  return { from: monthStart(y, m), to: monthEnd(y, m) };
}
