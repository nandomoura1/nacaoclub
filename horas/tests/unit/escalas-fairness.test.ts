import { describe, expect, it } from 'vitest';
import { fairness, heavyKind } from '@/domain/escalas/fairness';

describe('contador de sábados, domingos e feriados', () => {
  const hol = new Set(['2026-11-02', '2026-11-15']); // 15/11/2026 é domingo

  it('classifica o dia; feriado no fim de semana conta só como feriado', () => {
    expect(heavyKind('2026-11-07', hol)).toBe('sat');
    expect(heavyKind('2026-11-08', hol)).toBe('sun');
    expect(heavyKind('2026-11-02', hol)).toBe('hol');
    expect(heavyKind('2026-11-15', hol)).toBe('hol');
    expect(heavyKind('2026-11-04', hol)).toBeNull();
  });

  it('soma mês + histórico e compara com a média por mês trabalhado', () => {
    const rows = fairness({
      memberIds: ['a', 'b', 'c'],
      prior: [
        { memberId: 'a', date: '2026-10-03' }, { memberId: 'a', date: '2026-10-04' }, { memberId: 'a', date: '2026-10-12' },
        { memberId: 'b', date: '2026-10-10' },
      ],
      current: [
        { memberId: 'a', date: '2026-11-02' }, { memberId: 'a', date: '2026-11-07' },
        { memberId: 'b', date: '2026-11-08' }, { memberId: 'b', date: '2026-11-04' },
        { memberId: 'c', date: '2026-11-04' },
      ],
      holidays: new Set([...hol, '2026-10-12']),
      priorMonths: { a: 1, b: 1 },
    });
    const by = Object.fromEntries(rows.map((r) => [r.memberId, r]));
    expect(by.a!.month).toEqual({ sat: 1, sun: 0, hol: 1, total: 2 });
    expect(by.a!.sum).toEqual({ sat: 2, sun: 1, hol: 2, total: 5 });
    expect([by.a!.months, by.b!.months, by.c!.months]).toEqual([2, 2, 1]);
    // Média do time: 7 dias pesados / 5 meses = 1,4 por mês.
    expect(by.a!.diff.total).toBe(2.2);
    expect(by.b!.diff.total).toBe(-0.8);
    expect(by.c!.diff.total).toBe(-1.4);
  });
});
