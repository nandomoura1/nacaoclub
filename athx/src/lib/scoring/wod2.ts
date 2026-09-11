import type {
  ResultStatus,
  Team,
  TiePointsMode,
  Wod2Result,
  Wod2Score,
} from '@/types/domain';
import { indexByTeam, rankValues, type RankInput } from './rank';
import { isCounted, isRankable, PUBLIC_STATUSES } from './eligibility';

/**
 * WOD 2 — ENDURANCE · AMRAP 22'
 *
 *   Atleta 1 inicia no SHUTTLE RUN  (500 m = 10 × 50 m)
 *   Atleta 2 inicia na ASSAULT BIKE (máximo de km)
 *   A dupla define a estratégia de troca.
 *
 * REGRA CRÍTICA: a troca do atleta da corrida só pode ocorrer a cada 500 m
 * (500, 1000, 1500, 2000 ...). Nunca em 300, 700, 1200 m. O sistema valida
 * isso no lançamento — ver `isValidRunSwitchDistance` e o schema em
 * `src/lib/validation.ts`.
 *
 * TRÊS PROVAS, TRÊS RANKINGS:
 *   2A  maior KM de corrida
 *   2B  maior KM de assault bike
 *   2C  maior SOMA (corrida + bike)
 *
 * PONTUAÇÃO DO WOD 2 = Pts 2A + Pts 2B + Pts 2C
 */

/** Múltiplo de 500 m: a troca da corrida só é válida nesses pontos. */
export const RUN_SWITCH_INTERVAL_M = 500;

export function isValidRunSwitchDistance(meters: number): boolean {
  return Number.isFinite(meters) && meters >= 0 && meters % RUN_SWITCH_INTERVAL_M === 0;
}

/**
 * A corrida é registrada em km e só avança em blocos de 500 m (0,5 km).
 * Aceita uma tolerância de ponto flutuante de 1 mm para não rejeitar 3.5
 * por causa de binário.
 */
export function isValidRunKm(km: number): boolean {
  if (!Number.isFinite(km) || km < 0) return false;
  const meters = Math.round(km * 1000);
  return Math.abs(km * 1000 - meters) < 1 && isValidRunSwitchDistance(meters);
}

export function totalKm(result: Pick<Wod2Result, 'runKm' | 'bikeKm'>): number {
  return round2((result.runKm ?? 0) + (result.bikeKm ?? 0));
}

export function hasAnyDistance(result: Wod2Result): boolean {
  return result.runKm !== null || result.bikeKm !== null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function scoreWod2(
  teams: readonly Team[],
  results: readonly Wod2Result[],
  options: { tieMode?: TiePointsMode; statuses?: readonly ResultStatus[] } = {},
): Map<string, Wod2Score> {
  const { tieMode = 'COMPETITION', statuses = PUBLIC_STATUSES } = options;

  const rankableIds = new Set(teams.filter(isRankable).map((t) => t.id));
  const eligible = results.filter(
    (r) => rankableIds.has(r.teamId) && isCounted(r.status, statuses) && hasAnyDistance(r),
  );

  const runInputs: RankInput[] = eligible.map((r) => ({ teamId: r.teamId, value: r.runKm ?? 0 }));
  const bikeInputs: RankInput[] = eligible.map((r) => ({ teamId: r.teamId, value: r.bikeKm ?? 0 }));
  const totalInputs: RankInput[] = eligible.map((r) => ({ teamId: r.teamId, value: totalKm(r) }));

  const runRank = indexByTeam(rankValues(runInputs, 'HIGHER_IS_BETTER', tieMode));
  const bikeRank = indexByTeam(rankValues(bikeInputs, 'HIGHER_IS_BETTER', tieMode));
  const totalRank = indexByTeam(rankValues(totalInputs, 'HIGHER_IS_BETTER', tieMode));

  const scores = new Map<string, Wod2Score>();
  for (const result of results) {
    const a = runRank.get(result.teamId);
    const b = bikeRank.get(result.teamId);
    const c = totalRank.get(result.teamId);
    const hasResult = a !== undefined && b !== undefined && c !== undefined;

    scores.set(result.teamId, {
      teamId: result.teamId,
      runKm: result.runKm ?? 0,
      bikeKm: result.bikeKm ?? 0,
      totalKm: totalKm(result),
      rankRun: a?.rank ?? null,
      pointsRun: a?.points ?? null,
      rankBike: b?.rank ?? null,
      pointsBike: b?.points ?? null,
      rankTotal: c?.rank ?? null,
      pointsTotal: c?.points ?? null,
      points: hasResult ? a.points + b.points + c.points : null,
      tied: (a?.tied ?? false) || (b?.tied ?? false) || (c?.tied ?? false),
      hasResult,
    });
  }
  return scores;
}
