import type {
  ResultStatus,
  Team,
  TiePointsMode,
  Wod1Result,
  Wod1Score,
  Wod1ScoringMode,
} from '@/types/domain';
import { indexByTeam, rankValues, type RankInput } from './rank';
import { isCounted, isRankable, PUBLIC_STATUSES } from './eligibility';

/**
 * WOD 1 — STRENGTH · CAP 16 min
 *
 *   0–5 min    1RM Strict Press
 *   5–10 min   3RM Back Squat
 *   10–16 min  5RM Deadlift
 *
 * A dupla usa UMA barra só e é responsável por montar e trocar as cargas.
 * Cada atleta busca a maior carga válida em cada movimento.
 *
 * QUATRO PROVAS, QUATRO RANKINGS:
 *
 *   1A  Strict Press — soma dos dois atletas
 *   1B  Back Squat   — soma dos dois atletas
 *   1C  Deadlift     — soma dos dois atletas
 *   1D  Resultado total — soma das seis cargas
 *
 * Em todas, MAIOR resultado = melhor posição, e a posição vira pontos
 * (1º = 1 ponto, 2º = 2 pontos …).
 *
 * PONTUAÇÃO DO WOD 1 = Pts 1A + Pts 1B + Pts 1C + Pts 1D
 *
 * ...quando `wod1ScoringMode` é SUM_ALL, que é o padrão e o que a
 * organização pediu — a mesma lógica do WOD 2, que soma 2A + 2B + 2C.
 *
 * No modo TOTAL_ONLY, só a prova 1D pontua. Essa alternativa existe porque o
 * texto do regulamento diz "a dupla com maior resultado total ficará em 1º
 * lugar no Workout", o que contradiz a soma das quatro. Quem decide é a
 * organização, em /admin/settings.
 */

export const WOD1_LIFTS = [
  'strictPressAthlete1',
  'strictPressAthlete2',
  'backSquatAthlete1',
  'backSquatAthlete2',
  'deadliftAthlete1',
  'deadliftAthlete2',
] as const satisfies readonly (keyof Wod1Result)[];

/** Soma das seis cargas (prova 1D). Campos não preenchidos contam como 0. */
export function totalLoad(result: Pick<Wod1Result, (typeof WOD1_LIFTS)[number]>): number {
  return WOD1_LIFTS.reduce<number>((sum, key) => sum + (result[key] ?? 0), 0);
}

/** Uma dupla só entra no ranking se tiver ao menos uma carga lançada. */
export function hasAnyLoad(result: Wod1Result): boolean {
  return WOD1_LIFTS.some((key) => result[key] !== null && result[key] !== undefined);
}

/** Somatórios por movimento — as provas 1A, 1B e 1C. */
export function liftBreakdown(result: Pick<Wod1Result, (typeof WOD1_LIFTS)[number]>) {
  return {
    strictPress: (result.strictPressAthlete1 ?? 0) + (result.strictPressAthlete2 ?? 0),
    backSquat: (result.backSquatAthlete1 ?? 0) + (result.backSquatAthlete2 ?? 0),
    deadlift: (result.deadliftAthlete1 ?? 0) + (result.deadliftAthlete2 ?? 0),
  };
}

export function scoreWod1(
  teams: readonly Team[],
  results: readonly Wod1Result[],
  options: {
    tieMode?: TiePointsMode;
    statuses?: readonly ResultStatus[];
    scoringMode?: Wod1ScoringMode;
  } = {},
): Map<string, Wod1Score> {
  const {
    tieMode = 'COMPETITION',
    statuses = PUBLIC_STATUSES,
    scoringMode = 'SUM_ALL',
  } = options;

  const rankableIds = new Set(teams.filter(isRankable).map((t) => t.id));
  const eligible = results.filter(
    (r) => rankableIds.has(r.teamId) && isCounted(r.status, statuses) && hasAnyLoad(r),
  );

  const input = (pick: (r: Wod1Result) => number): RankInput[] =>
    eligible.map((r) => ({ teamId: r.teamId, value: pick(r) }));

  const rankA = indexByTeam(
    rankValues(input((r) => liftBreakdown(r).strictPress), 'HIGHER_IS_BETTER', tieMode),
  );
  const rankB = indexByTeam(
    rankValues(input((r) => liftBreakdown(r).backSquat), 'HIGHER_IS_BETTER', tieMode),
  );
  const rankC = indexByTeam(
    rankValues(input((r) => liftBreakdown(r).deadlift), 'HIGHER_IS_BETTER', tieMode),
  );
  const rankD = indexByTeam(
    rankValues(input(totalLoad), 'HIGHER_IS_BETTER', tieMode),
  );

  const scores = new Map<string, Wod1Score>();

  for (const result of results) {
    const lifts = liftBreakdown(result);
    const a = rankA.get(result.teamId);
    const b = rankB.get(result.teamId);
    const c = rankC.get(result.teamId);
    const d = rankD.get(result.teamId);
    const hasResult = a !== undefined && b !== undefined && c !== undefined && d !== undefined;

    // SUM_ALL soma as quatro provas; TOTAL_ONLY usa apenas a 1D.
    const points = hasResult
      ? scoringMode === 'TOTAL_ONLY'
        ? d.points
        : a.points + b.points + c.points + d.points
      : null;

    scores.set(result.teamId, {
      teamId: result.teamId,

      strictPress: lifts.strictPress,
      rankStrictPress: a?.rank ?? null,
      pointsStrictPress: a?.points ?? null,

      backSquat: lifts.backSquat,
      rankBackSquat: b?.rank ?? null,
      pointsBackSquat: b?.points ?? null,

      deadlift: lifts.deadlift,
      rankDeadlift: c?.rank ?? null,
      pointsDeadlift: c?.points ?? null,

      totalLoad: totalLoad(result),
      rankTotal: d?.rank ?? null,
      pointsTotal: d?.points ?? null,

      points,
      rank: d?.rank ?? null,

      tied:
        (a?.tied ?? false) || (b?.tied ?? false) || (c?.tied ?? false) || (d?.tied ?? false),
      hasResult,
    });
  }

  return scores;
}
