import type {
  EventSettings,
  StandingRow,
  Team,
  Wod1Score,
  Wod2Score,
  Wod3Score,
} from '@/types/domain';
import { isRankable } from './eligibility';

/**
 * CLASSIFICAÇÃO GERAL (§14)
 *
 *   TOTAL = Pontos WOD 1 + Pontos WOD 2 + Pontos WOD 3
 *   MENOR total = melhor posição.
 *
 * ORDENAÇÃO — duas chaves, nesta ordem:
 *
 *   1) `scoredWods` DESC — quantos WODs a dupla já tem pontuados.
 *   2) `totalPoints` ASC — a soma dos pontos.
 *
 * Por que a primeira chave existe: durante o evento algumas duplas têm
 * resultado lançado e outras não. Somando apenas o que existe, uma dupla com
 * 1 WOD pontuado teria total baixo e apareceria à frente de quem já fez 3 —
 * o ranking mentiria. Ordenar primeiro por completude impede isso. Não é uma
 * regra de competição: é integridade de dado. Está documentada em
 * docs/regras-pendentes.md para confirmação da organização.
 *
 * EMPATES (§15): duplas com a mesma completude E a mesma pontuação recebem a
 * MESMA posição e são marcadas com `tied`. Nenhum critério de desempate é
 * inventado — enquanto `settings.tieBreaker1` estiver vazio, a interface
 * mostra "EMPATE" e a organização decide.
 */
export function computeStandings(
  teams: readonly Team[],
  wod1: Map<string, Wod1Score>,
  wod2: Map<string, Wod2Score>,
  wod3: Map<string, Wod3Score>,
  settings: Pick<EventSettings, 'tieBreaker1'>,
): StandingRow[] {
  const hasTieBreaker = Boolean(settings.tieBreaker1 && settings.tieBreaker1.trim());

  const rows = teams.filter(isRankable).map<Omit<StandingRow, 'position' | 'tied' | 'needsDecision'>>((team) => {
    const s1 = wod1.get(team.id) ?? null;
    const s2 = wod2.get(team.id) ?? null;
    const s3 = wod3.get(team.id) ?? null;

    const points = [
      s1?.hasResult ? s1.points : null,
      s2?.hasResult ? s2.points : null,
      s3?.hasResult ? s3.points : null,
    ].filter((p): p is number => p !== null);

    return {
      team,
      wod1: s1,
      wod2: s2,
      wod3: s3,
      totalPoints: points.reduce((a, b) => a + b, 0),
      scoredWods: points.length,
    };
  });

  rows.sort((a, b) => {
    if (a.scoredWods !== b.scoredWods) return b.scoredWods - a.scoredWods;
    if (a.totalPoints !== b.totalPoints) return a.totalPoints - b.totalPoints;
    return a.team.teamNumber - b.team.teamNumber; // ordem estável, não é desempate
  });

  const standings: StandingRow[] = [];
  let index = 0;

  while (index < rows.length) {
    const current = rows[index];
    if (!current) break;

    let groupEnd = index;
    while (
      groupEnd + 1 < rows.length &&
      rows[groupEnd + 1]?.scoredWods === current.scoredWods &&
      rows[groupEnd + 1]?.totalPoints === current.totalPoints
    ) {
      groupEnd += 1;
    }

    // Duplas ainda sem nenhum resultado não "empatam": apenas aguardam.
    const isTie = groupEnd > index && current.scoredWods > 0;
    const position = index + 1;

    for (let i = index; i <= groupEnd; i += 1) {
      const row = rows[i];
      if (!row) continue;
      standings.push({
        ...row,
        position,
        tied: isTie,
        needsDecision: isTie && !hasTieBreaker,
      });
    }

    index = groupEnd + 1;
  }

  return standings;
}

/**
 * Reposiciona a classificação dentro de uma categoria (§29).
 * A posição exibida passa a ser a posição NA CATEGORIA — a interface deve
 * deixar isso explícito ("Classificação da categoria").
 */
export function standingsByCategory(
  standings: readonly StandingRow[],
  category: StandingRow['team']['category'],
): StandingRow[] {
  const filtered = standings.filter((row) => row.team.category === category);

  const result: StandingRow[] = [];
  let index = 0;

  while (index < filtered.length) {
    const current = filtered[index];
    if (!current) break;

    let groupEnd = index;
    while (
      groupEnd + 1 < filtered.length &&
      filtered[groupEnd + 1]?.scoredWods === current.scoredWods &&
      filtered[groupEnd + 1]?.totalPoints === current.totalPoints
    ) {
      groupEnd += 1;
    }

    for (let i = index; i <= groupEnd; i += 1) {
      const row = filtered[i];
      if (!row) continue;
      result.push({ ...row, position: index + 1 });
    }
    index = groupEnd + 1;
  }

  return result;
}

/** Duplas desclassificadas — fora do ranking, mas visíveis na listagem. */
export function disqualifiedTeams(teams: readonly Team[]): Team[] {
  return teams.filter((t) => t.status === 'DESCLASSIFICADA');
}
