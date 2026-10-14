import { describe, expect, it } from 'vitest';
import { overlapDays, presetRange, prorate, trafficReport } from '@/domain/marketing/traffic';

const s = (o: Partial<Parameters<typeof prorate>[0]> = {}) => ({ platform: 'META', campaignId: null, start: '2026-10-01', end: '2026-10-31', spendCents: 310_00, impressions: 31_000, clicks: 620, platformLeads: 31, ...o });

describe('Tráfego Pago — regras puras', () => {
  it('rateia o gasto pelos dias do período', () => {
    expect(overlapDays('2026-10-01', '2026-10-31', '2026-10-16', '2026-11-15')).toBe(16);
    expect(overlapDays('2026-10-01', '2026-10-10', '2026-11-01', '2026-11-30')).toBe(0);
    const p = prorate(s(), '2026-10-01', '2026-10-10');
    expect(p.spendCents).toBe(100_00);
    expect(p.clicks).toBe(200);
  });
  it('CPL e custo por matrícula usam os leads reais do funil', () => {
    const leads = [
      { source: 'META_ADS', campaignId: null, stage: 'MATRICULADO', createdAt: '2026-10-05T12:00:00Z' },
      { source: 'META_ADS', campaignId: null, stage: 'NOVO', createdAt: '2026-10-06T12:00:00Z' },
      { source: 'SITE', campaignId: 'c1', stage: 'MATRICULADO', createdAt: '2026-10-07T12:00:00Z' }, // campanha com gasto → pago
      { source: 'SITE', campaignId: null, stage: 'NOVO', createdAt: '2026-10-07T12:00:00Z' }, // orgânico
      { source: 'GOOGLE', campaignId: null, stage: 'NOVO', createdAt: '2026-09-30T12:00:00Z' }, // fora do período
    ];
    const r = trafficReport([s(), s({ platform: 'GOOGLE', campaignId: 'c1', spendCents: 90_00, impressions: null, clicks: 90, platformLeads: null })], leads, '2026-10-01', '2026-10-31');
    expect(r.total).toMatchObject({ spendCents: 400_00, leads: 3, won: 2, cpl: 133_33, cac: 200_00 });
    const meta = r.byPlatform.find((p) => p.id === 'META')!;
    expect(meta).toMatchObject({ spendCents: 310_00, leads: 2, won: 1, cpl: 155_00, cac: 310_00, ctr: 0.02, cpc: 50 });
    expect(r.byCampaign[0]).toMatchObject({ id: 'c1', spendCents: 90_00, leads: 1, won: 1 });
  });
  it('períodos rápidos', () => {
    expect(presetRange('mes', '2026-10-14')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(presetRange('mes-passado', '2026-01-14')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    expect(presetRange('90d', '2026-10-14').from).toBe('2026-07-17');
  });
});
