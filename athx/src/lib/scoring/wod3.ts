import type {
  DnfPolicy,
  ResultStatus,
  Team,
  TiePointsMode,
  Wod3Result,
  Wod3Score,
} from '@/types/domain';
import { WOD_META } from '@/types/domain';
import { rankValues, type RankInput } from './rank';
import { isCounted, isRankable, PUBLIC_STATUSES } from './eligibility';
import { pontuarPorCategoria } from './categoria';

/**
 * WOD 3 — METCON · FOR TIME · CAP 20:00
 *
 *   120 m Burpee Broad Jumps
 *   120 Box Jump Over
 *   60 m Sandbag Walking Lunge   (M 20 kg / F 10 kg)
 *   240 m 2DB Farm Carry         (M 50 lb cada / F 35 lb cada)
 *   120 Wall Ball                (M 20 lb / F 14 lb)
 *   120 m Burpee Broad Jumps
 *
 * MENOR tempo válido = melhor posição.
 *
 * NÃO CONCLUIU DENTRO DO CAP:
 *   O tempo é registrado como CAP (20:00 = 1200 s) e o volume concluído é
 *   armazenado. >>> O critério de ordenação dos incompletos NÃO é inventado
 *   aqui (§13 e §48). <<< Ele vem de `settings.dnfPolicy`, configurável em
 *   /admin/settings:
 *
 *     PENDING_DEFINITION (padrão) — todos os incompletos ficam atrás dos que
 *       concluíram, empatados entre si e marcados para decisão manual.
 *     VOLUME_DESC — maior volume concluído fica à frente.
 *     TIED_LAST — todos os incompletos ocupam a última posição.
 *
 * TUDO ISSO DENTRO DA CATEGORIA (ver ./categoria.ts): "atrás de quem
 * concluiu" significa atrás de quem concluiu NA CATEGORIA, e "última
 * posição" é a última da categoria.
 */

export const WOD3_CAP_SECONDS = WOD_META[3].capSeconds; // 1200

export function hasResult(result: Wod3Result): boolean {
  return result.timeSeconds !== null || result.completed || result.volumeCompleted !== null;
}

/** Tempo efetivo usado no ranking: quem não concluiu vale CAP. */
export function effectiveTime(result: Wod3Result): number {
  if (!result.completed) return WOD3_CAP_SECONDS;
  return result.timeSeconds ?? WOD3_CAP_SECONDS;
}

export function scoreWod3(
  teams: readonly Team[],
  results: readonly Wod3Result[],
  options: {
    tieMode?: TiePointsMode;
    dnfPolicy?: DnfPolicy;
    statuses?: readonly ResultStatus[];
  } = {},
): Map<string, Wod3Score> {
  return pontuarPorCategoria(teams, results, (t, r) => pontuarNaCategoria(t, r, options));
}

/** O ranking propriamente dito, já restrito às duplas de UMA categoria. */
function pontuarNaCategoria(
  teams: readonly Team[],
  results: readonly Wod3Result[],
  options: {
    tieMode?: TiePointsMode;
    dnfPolicy?: DnfPolicy;
    statuses?: readonly ResultStatus[];
  },
): Map<string, Wod3Score> {
  const {
    tieMode = 'COMPETITION',
    dnfPolicy = 'PENDING_DEFINITION',
    statuses = PUBLIC_STATUSES,
  } = options;

  const rankableIds = new Set(teams.filter(isRankable).map((t) => t.id));
  const eligible = results.filter(
    (r) => rankableIds.has(r.teamId) && isCounted(r.status, statuses) && hasResult(r),
  );

  const finishers = eligible.filter((r) => r.completed && r.timeSeconds !== null);
  const dnf = eligible.filter((r) => !(r.completed && r.timeSeconds !== null));

  const scores = new Map<string, Wod3Score>();

  const base = (result: Wod3Result): Wod3Score => ({
    teamId: result.teamId,
    timeSeconds: effectiveTime(result),
    completed: result.completed,
    volumeCompleted: result.volumeCompleted,
    rank: null,
    points: null,
    tied: false,
    needsDecision: false,
    hasResult: false,
  });

  for (const result of results) scores.set(result.teamId, base(result));

  // --- 1) Quem concluiu: menor tempo = melhor ---------------------------
  const finisherInputs: RankInput[] = finishers.map((r) => ({
    teamId: r.teamId,
    value: r.timeSeconds ?? WOD3_CAP_SECONDS,
  }));

  for (const ranked of rankValues(finisherInputs, 'LOWER_IS_BETTER', tieMode)) {
    const current = scores.get(ranked.teamId);
    if (!current) continue;
    scores.set(ranked.teamId, {
      ...current,
      rank: ranked.rank,
      points: ranked.points,
      tied: ranked.tied,
      needsDecision: ranked.tied,
      hasResult: true,
    });
  }

  // --- 2) Quem não concluiu: conforme a política configurada -------------
  const offset = finishers.length;
  const totalEligible = eligible.length;

  if (dnf.length > 0) {
    if (dnfPolicy === 'VOLUME_DESC') {
      const volumeInputs: RankInput[] = dnf.map((r) => ({
        teamId: r.teamId,
        value: r.volumeCompleted ?? 0,
      }));
      for (const ranked of rankValues(volumeInputs, 'HIGHER_IS_BETTER', tieMode)) {
        const current = scores.get(ranked.teamId);
        if (!current) continue;
        scores.set(ranked.teamId, {
          ...current,
          rank: ranked.rank + offset,
          points: ranked.points + offset,
          tied: ranked.tied,
          needsDecision: ranked.tied,
          hasResult: true,
        });
      }
    } else if (dnfPolicy === 'TIED_LAST') {
      // Todos os incompletos ocupam literalmente a última posição.
      for (const result of dnf) {
        const current = scores.get(result.teamId);
        if (!current) continue;
        scores.set(result.teamId, {
          ...current,
          rank: totalEligible,
          points: totalEligible,
          tied: dnf.length > 1,
          needsDecision: false,
          hasResult: true,
        });
      }
    } else {
      // PENDING_DEFINITION — padrão honesto: atrás dos finalizadores,
      // empatados entre si, sinalizados para decisão da organização.
      const rank = offset + 1;
      const points =
        tieMode === 'AVERAGE' && dnf.length > 1
          ? (rank + (rank + dnf.length - 1)) / 2
          : rank;

      for (const result of dnf) {
        const current = scores.get(result.teamId);
        if (!current) continue;
        scores.set(result.teamId, {
          ...current,
          rank,
          points,
          tied: dnf.length > 1,
          needsDecision: true,
          hasResult: true,
        });
      }
    }
  }

  return scores;
}
