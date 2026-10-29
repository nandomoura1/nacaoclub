import type { Shift3, WeekPattern } from './types';

/** Horário fixo da pessoa num dia útil; se ela não costuma trabalhar nesse dia, o do dia útil mais próximo (antes, depois depois). */
function ownShift(own: WeekPattern, d: number): Shift3 | null {
  if (own[d]) return own[d]!;
  for (let k = 1; k < 5; k++) {
    if (d - k >= 0 && own[d - k]) return own[d - k]!;
    if (d + k <= 4 && own[d + k]) return own[d + k]!;
  }
  return null;
}

/**
 * Rodízio das FOLGAS (não do horário). Cada grade fixa define um padrão de folga
 * (ex.: folga sáb+dom; folga sexta e trabalha sábado; folga quinta e trabalha domingo).
 * Pessoa i, semana k → padrão de folga (i + k) mod n, sempre no PRÓPRIO horário fixo
 * de segunda a sexta. No sábado/domingo trabalhado, faz o turno de fim de semana do padrão
 * (abertura/fechamento do fim de semana continuam cobertos).
 */
export function buildRotation(own: WeekPattern[]): WeekPattern[][] {
  const n = own.length;
  return own.map((mine, i) => Array.from({ length: n }, (_, k) => {
    const pattern = own[(i + k) % n]!;
    return Array.from({ length: 7 }, (_, d) => {
      if (!pattern[d]) return null;
      return d <= 4 ? ownShift(mine, d) ?? pattern[d]! : pattern[d]!;
    });
  }));
}
