import { describe, expect, it } from 'vitest';
import { cycleIndex } from '@/domain/escalas/calendar';
import { buildRotation } from '@/domain/escalas/rotation';

describe('rodízio de posições', () => {
  it('gira só as folgas: cada pessoa mantém o próprio horário de segunda a sexta', () => {
    const W = (a: number, b: number) => [a * 60, b * 60, 60] as [number, number, number];
    // Grades fixas: Duda abre (05–13, folga sáb+dom); Manu folga sexta e abre o sábado; Igor folga quinta e faz o domingo.
    const duda = [W(5, 13), W(5, 13), W(5, 13), W(5, 13), W(5, 14), null, null];
    const manu = [W(13, 21), W(13, 21), W(13, 21), W(13, 21), null, W(7, 16), null];
    const igor = [W(14, 22), W(14, 22), W(14, 22), null, W(13, 22), null, W(8, 14)];
    const c = buildRotation([duda, manu, igor] as never);
    expect(c[0]![0]).toEqual(duda); // semana 1 = grade fixa
    // Semana 2: Duda no padrão da Manu (folga sexta, sábado 07–16), no horário dela seg–qui.
    expect(c[0]![1]).toEqual([W(5, 13), W(5, 13), W(5, 13), W(5, 13), null, W(7, 16), null]);
    // Semana 3: Duda no padrão do Igor (folga quinta, domingo 08–14); sexta no horário fixo dela (05–14).
    expect(c[0]![2]).toEqual([W(5, 13), W(5, 13), W(5, 13), null, W(5, 14), null, W(8, 14)]);
    // Igor no padrão de quem trabalha seg–sex: quinta no horário dele (14–22, como os outros dias).
    expect(c[2]![1]).toEqual([W(14, 22), W(14, 22), W(14, 22), W(14, 22), W(13, 22), null, null]);
    // Toda semana: cada padrão de folga com 1 pessoa (1 no sábado, 1 no domingo).
    for (let k = 0; k < 3; k++) {
      expect(c.filter((x) => x[k]![5]).length).toBe(1);
      expect(c.filter((x) => x[k]![6]).length).toBe(1);
    }
  });
  it('semana do ciclo continua entre os meses', () => {
    expect(cycleIndex('2026-10-26', '2026-10-26', 6)).toBe(0);
    expect(cycleIndex('2026-11-01', '2026-10-26', 6)).toBe(0);
    expect(cycleIndex('2026-11-02', '2026-10-26', 6)).toBe(1);
    expect(cycleIndex('2026-12-07', '2026-10-26', 6)).toBe(0);
    expect(cycleIndex('2026-10-19', '2026-10-26', 6)).toBe(5);
  });
});
