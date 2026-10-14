import { describe, expect, it } from 'vitest';
import { delta, lastMonths, performanceReport, previousRange } from '@/domain/marketing/performance';

describe('Performance — regras puras', () => {
  it('período anterior e últimos meses', () => {
    expect(previousRange('2026-10-01', '2026-10-31')).toEqual({ from: '2026-08-31', to: '2026-09-30', days: 31 });
    const m = lastMonths('2026-02-10', 3);
    expect(m.map((x) => x.key)).toEqual(['2025-12', '2026-01', '2026-02']);
    expect(m[2]).toMatchObject({ from: '2026-02-01', to: '2026-02-28', label: 'fev/26' });
    expect(delta(15, 10)).toBeCloseTo(0.5);
    expect(delta(5, 0)).toBeNull();
  });

  it('junta cliques, leads, matrículas e investimento, com comparação', () => {
    const lead = (day: string, stage: string, o: Partial<{ source: string; campaignId: string | null; linkId: string | null }> = {}) => ({ day, stage, source: 'SITE', campaignId: null, linkId: null, ...o });
    const r = performanceReport({
      from: '2026-10-01', to: '2026-10-31',
      leads: [
        lead('2026-10-02', 'MATRICULADO', { source: 'INSTAGRAM', campaignId: 'c1', linkId: 'l1' }),
        lead('2026-10-03', 'EXPERIMENTAL', { source: 'INSTAGRAM', campaignId: 'c1', linkId: 'l1' }),
        lead('2026-10-04', 'CONTATO'),
        lead('2026-10-05', 'PERDIDO'),
        lead('2026-09-20', 'MATRICULADO'), // período anterior
      ],
      clicks: [{ linkId: 'l1', day: '2026-10-02', clicks: 40 }, { linkId: 'l1', day: '2026-09-15', clicks: 10 }],
      links: [{ id: 'l1', title: 'Bio', slug: 'bio', campaignId: 'c1' }],
      spends: [{ platform: 'META', campaignId: 'c1', start: '2026-10-01', end: '2026-10-31', spendCents: 300_00, impressions: null, clicks: null, platformLeads: null }],
      campaigns: [{ id: 'c1', name: 'Verão' }, { id: 'c2', name: 'Parada' }],
    });
    expect(r.current).toMatchObject({ clicks: 40, leads: 4, won: 1, conversion: 0.25, spendCents: 300_00, cpl: 75_00, cac: 300_00 });
    expect(r.previous).toMatchObject({ clicks: 10, leads: 1, won: 1, spendCents: 0 });
    expect(r.funnel.map((f) => f.count)).toEqual([4, 3, 2, 1, 1]); // chegaram, contato+, experimental+, negociação+, matriculado
    expect(r.lost).toBe(1);
    expect(r.bySource[0]).toMatchObject({ id: 'INSTAGRAM', leads: 2, won: 1 });
    expect(r.byCampaign).toHaveLength(1);
    expect(r.byCampaign[0]).toMatchObject({ id: 'c1', clicks: 40, leads: 2, won: 1, cac: 300_00 });
    expect(r.topLinks[0]).toMatchObject({ id: 'l1', clicks: 40, leads: 2 });
    expect(r.months.at(-1)).toMatchObject({ key: '2026-10', leads: 4 });
    expect(r.months.at(-2)).toMatchObject({ key: '2026-09', leads: 1, clicks: 10 });
  });
});
