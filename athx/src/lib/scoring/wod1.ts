import type {
  ResultStatus,
  Team,
  TiePointsMode,
  Wod1Result,
  Wod1Score,
} from '@/types/domain';
import { indexByTeam, rankValues, type RankInput } from './rank';
import { isCounted, isRankable, PUBLIC_STATUSES } from './eligibility';

/**
 * WOD 1 — STRENGTH · CAP 15 min
 *   0–5 min   1RM Strict Press
 *   5–10 min  3RM Back Squat
 *   10–15 min 5RM Deadlift
 *
 * Prova 1D — RESULTADO TOTAL DE CARGAS:
 *   SP(a1) + SP(a2) + BS(a1) + BS(a2) + DL(a1) + DL(a2)
 * MAIOR total = melhor posição. 1º = 1 ponto, 2º = 2 pontos, ...
 *
 * As provas 1A/1B/1C (Strict Press, Back Squat, Deadlift isolados) são
 * exibidas no detalhe da dupla; a pontuação do WOD 1 na classificação geral
 * vem de 1D, conforme a especificação do evento.
 */

export const WOD1_LIFTS = [
  'strictPressAthlete1',
  'strictPressAthlete2',
  'backSquatAthlete1',
  'backSquatAthlete2',
  'deadliftAthlete1',
  'deadliftAthlete2',
] as const satisfies readonly (keyof Wod1Result)[];

/** Soma das seis cargas. Campos não preenchidos contam como 0. */
export function totalLoad(result: Pick<Wod1Result, (typeof WOD1_LIFTS)[number]>): number {
  return WOD1_LIFTS.reduce<number>((sum, key) => sum + (result[key] ?? 0), 0);
}

/** Uma dupla só entra no ranking se tiver ao menos uma carga lançada. */
export function hasAnyLoad(result: Wod1Result): boolean {
  return WOD1_LIFTS.some((key) => result[key] !== null && result[key] !== undefined);
}

/** Somatórios por levantamento (provas 1A, 1B, 1C) — usados no detalhe. */
export function liftBreakdown(result: Wod1Result) {
  return {
    strictPress: (result.strictPressAthlete1 ?? 0) + (result.strictPressAthlete2 ?? 0),
    backSquat: (result.backSquatAthlete1 ?? 0) + (result.backSquatAthlete2 ?? 0),
    deadlift: (result.deadliftAthlete1 ?? 0) + (result.deadliftAthlete2 ?? 0),
  };
}

export function scoreWod1(
  teams: readonly Team[],
  results: readonly Wod1Result[],
  options: { tieMode?: TiePointsMode; statuses?: readonly ResultStatus[] } = {},
): Map<string, Wod1Score> {
  const { tieMode = 'COMPETITION', statuses = PUBLIC_STATUSES } = options;

  const rankableIds = new Set(teams.filter(isRankable).map((t) => t.id));
  const eligible = results.filter(
    (r) => rankableIds.has(r.teamId) && isCounted(r.status, statuses) && hasAnyLoad(r),
  );

  const inputs: RankInput[] = eligible.map((r) => ({ teamId: r.teamId, value: totalLoad(r) }));
  const ranked = indexByTeam(rankValues(inputs, 'HIGHER_IS_BETTER', tieMode));

  const scores = new Map<string, Wod1Score>();
  for (const result of results) {
    const r = ranked.get(result.teamId);
    scores.set(result.teamId, {
      teamId: result.teamId,
      totalLoad: totalLoad(result),
      rank: r?.rank ?? null,
      points: r?.points ?? null,
      tied: r?.tied ?? false,
      hasResult: r !== undefined,
    });
  }
  return scores;
}
