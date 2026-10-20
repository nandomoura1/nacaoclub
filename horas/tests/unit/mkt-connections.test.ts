import { describe, expect, it } from 'vitest';
import { isFresh, pipeStatus, summary } from '@/domain/marketing/connections';
import { NAV_MARKETING } from '@/components/shell/nav';

describe('Conexões do Marketing', () => {
  const now = new Date('2026-10-20T12:00:00Z');
  const ago = (d: number) => new Date(now.getTime() - d * 86_400_000);
  it('status da coleta: automático, aguardando, manual ou desligado', () => {
    expect(isFresh(ago(2), now, 3)).toBe(true);
    expect(isFresh(ago(4), now, 3)).toBe(false);
    expect(pipeStatus({ configured: true, lastAuto: ago(1), lastManual: null, now, freshDays: 3 })).toBe('auto');
    expect(pipeStatus({ configured: true, lastAuto: ago(10), lastManual: ago(1), now, freshDays: 3 })).toBe('waiting');
    expect(pipeStatus({ configured: false, lastAuto: null, lastManual: ago(40), now, freshDays: 3 })).toBe('manual');
    expect(pipeStatus({ configured: false, lastAuto: null, lastManual: null, now, freshDays: 3 })).toBe('off');
    expect(summary([{ status: 'auto' }, { status: 'off' }, { status: 'off' }])).toEqual({ auto: 1, waiting: 0, manual: 0, off: 2, total: 3 });
  });
  it('menu: visão geral e conexões no topo, o resto em blocos; nada de "breve"', () => {
    expect(NAV_MARKETING.slice(0, 2).map((i) => [i.label, i.group])).toEqual([['Visão geral', undefined], ['Conexões', undefined]]);
    expect([...new Set(NAV_MARKETING.map((i) => i.group).filter(Boolean))]).toEqual(['Planejar', 'Produzir', 'Divulgar', 'Resultados', 'Ajustes']);
    expect(NAV_MARKETING.some((i) => i.soon)).toBe(false);
    expect(NAV_MARKETING.filter((i) => i.group === 'Ajustes').every((i) => i.permission === 'mkt.admin')).toBe(true);
  });
});
