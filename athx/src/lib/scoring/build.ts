import type {
  EventSettings,
  ResultStatus,
  StandingRow,
  Team,
  Wod1Result,
  Wod1Score,
  Wod2Result,
  Wod2Score,
  Wod3Result,
  Wod3Score,
} from '@/types/domain';
import { PUBLIC_STATUSES } from './eligibility';
import { scoreWod1 } from './wod1';
import { scoreWod2 } from './wod2';
import { scoreWod3 } from './wod3';
import { computeStandings } from './overall';

export interface RawResults {
  teams: Team[];
  wod1: Wod1Result[];
  wod2: Wod2Result[];
  wod3: Wod3Result[];
  settings: EventSettings;
}

export interface Leaderboard {
  standings: StandingRow[];
  wod1: Map<string, Wod1Score>;
  wod2: Map<string, Wod2Score>;
  wod3: Map<string, Wod3Score>;
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
  const { teams, settings } = raw;
  const tieMode = settings.tiePointsMode;

  const wod1 = scoreWod1(teams, raw.wod1, {
    tieMode,
    statuses,
    scoringMode: settings.wod1ScoringMode,
  });
  const wod2 = scoreWod2(teams, raw.wod2, { tieMode, statuses });
  const wod3 = scoreWod3(teams, raw.wod3, {
    tieMode,
    statuses,
    dnfPolicy: settings.dnfPolicy,
  });

  return {
    standings: computeStandings(teams, wod1, wod2, wod3, settings),
    wod1,
    wod2,
    wod3,
    settings,
    teams,
  };
}
