import type { EventSettings, ResultStatus, StandingRow, Team } from '@/types/domain';
import type { Prova, ProvaResult, ProvaScore, Wod, WodEntry, WodScore } from '@/types/wod';
import { todasAsProvas } from '@/types/wod';
import { PUBLIC_STATUSES } from './eligibility';
import { pontuarEvento } from './motor';
import { computeStandings } from './overall';

export interface RawResults {
  teams: Team[];
  wods: Wod[];
  entries: WodEntry[];
  results: ProvaResult[];
  settings: EventSettings;
}

export interface Leaderboard {
  standings: StandingRow[];
  /** provaId -> teamId -> pontuação. */
  provas: Map<string, Map<string, ProvaScore>>;
  /** wodId -> teamId -> total do workout. */
  wodScores: Map<string, Map<string, WodScore>>;
  /** Os WODs do evento, na ordem de exibição. */
  wods: Wod[];
  /** Todas as provas, na ordem — é a ordem das colunas da tabela. */
  provaList: Prova[];
  settings: EventSettings;
  teams: Team[];
}

/**
 * Ponto único de verdade do cálculo (§25).
 *
 * Todo o app — leaderboard público, detalhe da dupla, páginas de WOD, telão,
 * conferência do admin e exportação — passa por aqui. Duas telas nunca podem
 * discordar porque nenhuma delas calcula nada por conta própria.
 *
 * O mesmo algoritmo está espelhado em SQL (supabase/migrations) para que o
 * banco também consiga materializar rank/points ao publicar um resultado.
 */
export function buildLeaderboard(
  raw: RawResults,
  options: { statuses?: readonly ResultStatus[] } = {},
): Leaderboard {
  const statuses = options.statuses ?? PUBLIC_STATUSES;
  const { teams, wods, entries, results, settings } = raw;

  const ordenados = [...wods].sort((a, b) => a.ordem - b.ordem || a.numero - b.numero);

  const motor = pontuarEvento({
    teams,
    wods: ordenados,
    entries,
    results,
    settings,
    statuses,
  });

  return {
    standings: computeStandings({
      teams,
      wods: ordenados,
      provas: motor.provas,
      totaisPorWod: motor.wods,
      settings,
    }),
    provas: motor.provas,
    wodScores: motor.wods,
    wods: ordenados,
    provaList: todasAsProvas(ordenados),
    settings,
    teams,
  };
}

/**
 * Atalho para as telas: monta a classificação a partir do snapshot.
 *
 * Toda tela faz exatamente isto, e repetir o desmonte do snapshot em oito
 * lugares é como uma delas acaba esquecendo de passar a agenda nova.
 */
export function leaderboardDoSnapshot(
  snapshot: import('@/services/snapshot').Snapshot,
  options: { statuses?: readonly ResultStatus[] } = {},
): Leaderboard {
  return buildLeaderboard(
    {
      teams: snapshot.teams,
      wods: snapshot.wods,
      entries: snapshot.entries,
      results: snapshot.results,
      settings: snapshot.settings,
    },
    options,
  );
}
