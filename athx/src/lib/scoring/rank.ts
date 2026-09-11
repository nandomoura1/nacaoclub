import type { RankedEntry, TiePointsMode } from '@/types/domain';

export type Direction = 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER';

export interface RankInput {
  teamId: string;
  value: number;
}

/**
 * Ranqueia valores e converte posição em pontos (1º = 1 ponto, 2º = 2 ...).
 *
 * EMPATES (§26): usa *standard competition ranking* — 100kg, 100kg, 95kg
 * produz 1º, 1º, 3º. NENHUM critério de desempate é inventado: as duas
 * duplas empatadas recebem a mesma posição e são marcadas com `tied`, para
 * que a interface exiba "EMPATE" e a organização decida (§15).
 *
 * A conversão posição -> pontos é configurável em /admin/settings:
 *   COMPETITION -> ambas recebem os pontos da posição (1, 1, 3)
 *   AVERAGE     -> ambas recebem a média das posições ocupadas (1.5, 1.5, 3)
 */
export function rankValues(
  entries: readonly RankInput[],
  direction: Direction,
  tieMode: TiePointsMode = 'COMPETITION',
): RankedEntry[] {
  const sorted = [...entries].sort((a, b) =>
    direction === 'HIGHER_IS_BETTER' ? b.value - a.value : a.value - b.value,
  );

  const result: RankedEntry[] = [];
  let index = 0;

  while (index < sorted.length) {
    const current = sorted[index];
    if (!current) break;

    // Agrupa todas as entradas com exatamente o mesmo valor.
    let groupEnd = index;
    while (groupEnd + 1 < sorted.length && sorted[groupEnd + 1]?.value === current.value) {
      groupEnd += 1;
    }

    const groupSize = groupEnd - index + 1;
    const rank = index + 1;
    const tied = groupSize > 1;

    // COMPETITION: todos com os pontos da posição do grupo.
    // AVERAGE: média das posições ocupadas pelo grupo.
    const points =
      tieMode === 'AVERAGE' && tied
        ? (rank + (rank + groupSize - 1)) / 2
        : rank;

    for (let i = index; i <= groupEnd; i += 1) {
      const entry = sorted[i];
      if (!entry) continue;
      result.push({
        teamId: entry.teamId,
        value: entry.value,
        rank,
        points,
        tied,
        needsDecision: tied,
      });
    }

    index = groupEnd + 1;
  }

  return result;
}

/** Índice teamId -> resultado ranqueado, para lookup O(1). */
export function indexByTeam(entries: readonly RankedEntry[]): Map<string, RankedEntry> {
  return new Map(entries.map((e) => [e.teamId, e]));
}
