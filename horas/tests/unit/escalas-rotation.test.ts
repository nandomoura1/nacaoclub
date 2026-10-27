import { describe, expect, it } from 'vitest';
import { cycleIndex } from '@/domain/escalas/calendar';
import { buildRotation } from '@/domain/escalas/rotation';

describe('rodízio de posições', () => {
  it('cada pessoa avança uma posição por semana e passa por todas', () => {
    const P = [0, 1, 2, 3, 4, 5].map((i) => [[i, i + 1, 0], null, null, null, null, null, null] as never);
    const c = buildRotation(P);
    expect(c[0]).toEqual(P);
    expect(c[5]![0]).toBe(P[5]);
    expect(c[5]![1]).toBe(P[0]);
    for (let k = 0; k < 6; k++) expect(new Set(c.map((x) => x[k])).size).toBe(6); // toda semana, cada posição com 1 pessoa
  });
  it('semana do ciclo continua entre os meses', () => {
    expect(cycleIndex('2026-10-26', '2026-10-26', 6)).toBe(0);
    expect(cycleIndex('2026-11-01', '2026-10-26', 6)).toBe(0);
    expect(cycleIndex('2026-11-02', '2026-10-26', 6)).toBe(1);
    expect(cycleIndex('2026-12-07', '2026-10-26', 6)).toBe(0);
    expect(cycleIndex('2026-10-19', '2026-10-26', 6)).toBe(5);
  });
});
