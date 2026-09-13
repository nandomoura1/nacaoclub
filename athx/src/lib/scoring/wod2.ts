import type {
  ResultStatus,
  Team,
  TiePointsMode,
  Wod2Result,
  Wod2Score,
} from '@/types/domain';
import { indexByTeam, rankValues, type RankInput } from './rank';
import { isCounted, isRankable, PUBLIC_STATUSES } from './eligibility';
import { pontuarPorCategoria } from './categoria';

/**
 * WOD 2 — ENDURANCE · AMRAP 22'
 *
 *   Atleta 1 inicia no SHUTTLE RUN  (500 m = 10 × 50 m)
 *   Atleta 2 inicia na ASSAULT BIKE (máximo de km)
 *   A dupla define a estratégia de troca.
 *
 * A TROCA entre os atletas acontece a cada 500 m — é regra de pista, dita no
 * briefing e cobrada pelo juiz. Mas a DISTÂNCIA REGISTRADA é livre: o AMRAP
 * para no minuto 22, no meio de um trecho, e a dupla pode terminar com 2.410 m.
 * Exigir múltiplo de 500 no lançamento tornaria impossível registrar o
 * resultado real.
 *
 * TRÊS PROVAS, TRÊS RANKINGS:
 *   2A  maior KM de corrida
 *   2B  maior KM de assault bike
 *   2C  maior SOMA (corrida + bike)
 *
 * PONTUAÇÃO DO WOD 2 = Pts 2A + Pts 2B + Pts 2C
 *
 * Cada um dos três rankings é DENTRO DA CATEGORIA (ver ./categoria.ts).
 */

/** Intervalo de troca entre os atletas na corrida — regra de pista. */
export const RUN_SWITCH_INTERVAL_M = 500;

/** Só checa se é uma distância possível. Qualquer valor não negativo serve. */
export function isValidRunKm(km: number): boolean {
  return Number.isFinite(km) && km >= 0;
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
  return pontuarPorCategoria(teams, results, (t, r) => pontuarNaCategoria(t, r, options));
}

/** O ranking propriamente dito, já restrito às duplas de UMA categoria. */
function pontuarNaCategoria(
  teams: readonly Team[],
  results: readonly Wod2Result[],
  options: { tieMode?: TiePointsMode; statuses?: readonly ResultStatus[] },
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
