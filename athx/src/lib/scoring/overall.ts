import type { EventSettings, StandingRow, Team, TieBreaker } from '@/types/domain';
import { CATEGORIES, criteriosDeDesempate, wodDoCriterio } from '@/types/domain';
import type { ProvaScore, Wod, WodScore } from '@/types/wod';
import { provasQuePontuam } from '@/types/wod';
import { isRankable } from './eligibility';

/**
 * CLASSIFICAÇÃO (§14)
 *
 *   TOTAL = soma dos pontos de TODAS as provas que pontuam.
 *   MENOR total = melhor posição.
 *
 * Quais provas existem e quais pontuam é decisão da organização, cadastrada
 * em /admin/wods. O motor não sabe quantas são.
 *
 * ORDENAÇÃO — duas chaves:
 *
 *   1) `scoredWods` DESC — quantos WODs a dupla já tem pontuados.
 *   2) `totalPoints` ASC — a soma dos pontos.
 *
 * Por que a primeira chave existe: durante o evento algumas duplas têm
 * resultado lançado e outras não. Somando apenas o que existe, uma dupla com
 * 1 WOD pontuado teria total baixo e apareceria à frente de quem já fez 3 —
 * o ranking mentiria. Não é regra de competição: é integridade de dado.
 *
 * EMPATES (§15): o critério de desempate NÃO age na classificação geral.
 * A geral mistura as categorias e existe só como referência — ninguém
 * disputa contra outra categoria. A disputa, e portanto o desempate,
 * acontece DENTRO DA CATEGORIA.
 */

/** O que o desempate precisa olhar numa linha. */
type ParaDesempatar = Pick<StandingRow, 'wods'>;

/**
 * O valor de um critério para uma dupla: a pontuação dela no WOD escolhido.
 * Menor é melhor; null quando não há resultado naquele workout.
 */
function valorDoCriterio(
  row: ParaDesempatar,
  criterio: TieBreaker,
  wodsPorNumero: ReadonlyMap<number, Wod>,
): number | null {
  const numero = wodDoCriterio(criterio);
  if (numero === null) return null;

  const wod = wodsPorNumero.get(numero);
  if (!wod) return null;

  const score: WodScore | undefined = row.wods[wod.id];
  return score?.hasResult ? score.points : null;
}

/**
 * Compara duas duplas pelos critérios, na ordem escolhida. Devolve 0 quando
 * NENHUM critério separou — aí o empate é real e volta para a organização.
 */
export function compararDesempate(
  a: ParaDesempatar,
  b: ParaDesempatar,
  criterios: readonly TieBreaker[],
  wodsPorNumero: ReadonlyMap<number, Wod>,
): number {
  for (const criterio of criterios) {
    const va = valorDoCriterio(a, criterio, wodsPorNumero);
    const vb = valorDoCriterio(b, criterio, wodsPorNumero);
    if (va === vb) continue;
    // Sem resultado no WOD do critério vai para trás: não há o que comparar.
    if (va === null) return 1;
    if (vb === null) return -1;
    return va - vb;
  }
  return 0;
}

export interface StandingsInput {
  teams: readonly Team[];
  wods: readonly Wod[];
  provas: Map<string, Map<string, ProvaScore>>;
  totaisPorWod: Map<string, Map<string, WodScore>>;
  settings: Pick<EventSettings, 'tieBreaker1' | 'tieBreaker2' | 'tieBreaker3'>;
}

export function computeStandings(input: StandingsInput): StandingRow[] {
  const { teams, wods, provas, totaisPorWod, settings } = input;
  const criterios = criteriosDeDesempate(settings);
  const wodsPorNumero = new Map(wods.map((w) => [w.numero, w]));
  const queContam = provasQuePontuam(wods);

  type Base = Omit<
    StandingRow,
    'position' | 'categoryPosition' | 'tied' | 'needsDecision' | 'desempatadoPor'
  >;

  const rows = teams.filter(isRankable).map<Base>((team) => {
    const porProva: Record<string, ProvaScore> = {};
    for (const [provaId, porTime] of provas) {
      const score = porTime.get(team.id);
      if (score) porProva[provaId] = score;
    }

    const porWod: Record<string, WodScore> = {};
    let scoredWods = 0;
    for (const [wodId, porTime] of totaisPorWod) {
      const score = porTime.get(team.id);
      if (!score) continue;
      porWod[wodId] = score;
      if (score.hasResult) scoredWods += 1;
    }

    const totalPoints = queContam.reduce<number>((soma, prova) => {
      const s = porProva[prova.id];
      return soma + (s?.hasResult && s.points !== null ? s.points : 0);
    }, 0);

    return {
      team,
      provas: porProva,
      wods: porWod,
      totalPoints,
      scoredWods,
      totalWods: wods.length,
    };
  });

  // --- Classificação geral: completude, pontos, e nada mais ---------------
  rows.sort(ordemBase);

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

    const position = index + 1;
    for (let i = index; i <= groupEnd; i += 1) {
      const row = rows[i];
      if (!row) continue;
      standings.push({
        ...row,
        position,
        // Preenchidos pela passada por categoria, logo abaixo.
        categoryPosition: position,
        tied: false,
        needsDecision: false,
        desempatadoPor: null,
      });
    }

    index = groupEnd + 1;
  }

  return posicionarNasCategorias(standings, criterios, wodsPorNumero);
}

/** Completude primeiro, depois pontos. Número da dupla só para dar estabilidade. */
function ordemBase(
  a: Pick<StandingRow, 'scoredWods' | 'totalPoints' | 'team'>,
  b: Pick<StandingRow, 'scoredWods' | 'totalPoints' | 'team'>,
): number {
  if (a.scoredWods !== b.scoredWods) return b.scoredWods - a.scoredWods;
  if (a.totalPoints !== b.totalPoints) return a.totalPoints - b.totalPoints;
  return a.team.teamNumber - b.team.teamNumber;
}

/**
 * A CLASSIFICAÇÃO QUE VALE: a de cada categoria.
 *
 * Recorta as duplas de uma categoria por vez, ordena aplicando os critérios
 * de desempate e grava na linha a posição da categoria, o selo de empate e
 * qual critério decidiu. Rodar categoria a categoria é o que garante que uma
 * dupla masculina nunca seja desempatada contra uma feminina.
 */
function posicionarNasCategorias(
  standings: readonly StandingRow[],
  criterios: readonly TieBreaker[],
  wodsPorNumero: ReadonlyMap<number, Wod>,
): StandingRow[] {
  const porId = new Map<string, StandingRow>();

  for (const categoria of CATEGORIES) {
    const daCategoria = standings
      .filter((r) => r.team.category === categoria)
      .sort((a, b) => {
        if (a.scoredWods !== b.scoredWods || a.totalPoints !== b.totalPoints) {
          return ordemBase(a, b);
        }
        const criterio = compararDesempate(a, b, criterios, wodsPorNumero);
        return criterio !== 0 ? criterio : a.team.teamNumber - b.team.teamNumber;
      });

    let index = 0;
    while (index < daCategoria.length) {
      const atual = daCategoria[index];
      if (!atual) break;

      // O bloco de mesma pontuação — é dentro dele que o critério trabalha.
      let blocoFim = index;
      while (
        blocoFim + 1 < daCategoria.length &&
        daCategoria[blocoFim + 1]?.scoredWods === atual.scoredWods &&
        daCategoria[blocoFim + 1]?.totalPoints === atual.totalPoints
      ) {
        blocoFim += 1;
      }

      const empatouEmPontos = blocoFim > index && atual.scoredWods > 0;
      const bloco = daCategoria.slice(index, blocoFim + 1);

      // Qual critério separou este bloco? O primeiro em que nem todos têm o
      // mesmo valor. Se nenhum separou, o empate continua de pé.
      const criterioQueSeparou = empatouEmPontos
        ? (criterios.find((criterio) => {
            const valores = bloco.map((r) => valorDoCriterio(r, criterio, wodsPorNumero));
            return valores.some((v) => v !== valores[0]);
          }) ?? null)
        : null;

      let i = index;
      while (i <= blocoFim) {
        const inicio = daCategoria[i];
        if (!inicio) break;

        let fim = i;
        while (
          fim + 1 <= blocoFim &&
          compararDesempate(
            inicio,
            daCategoria[fim + 1] as ParaDesempatar,
            criterios,
            wodsPorNumero,
          ) === 0
        ) {
          fim += 1;
        }

        const aindaEmpatadas = fim > i && inicio.scoredWods > 0;
        const categoryPosition = i + 1;

        for (let k = i; k <= fim; k += 1) {
          const row = daCategoria[k];
          if (!row) continue;
          porId.set(row.team.id, {
            ...row,
            categoryPosition,
            tied: aindaEmpatadas,
            needsDecision: aindaEmpatadas,
            desempatadoPor: empatouEmPontos && !aindaEmpatadas ? criterioQueSeparou : null,
          });
        }

        i = fim + 1;
      }

      index = blocoFim + 1;
    }
  }

  // Devolve na ordem da classificação geral, com os dados de categoria dentro.
  return standings.map((r) => porId.get(r.team.id) ?? r);
}

/**
 * Reposiciona a classificação dentro de uma categoria (§29).
 *
 * A posição de categoria e o desempate já vieram calculados de
 * computeStandings — aqui é só recorte e ordenação. Reaplicar a regra nesta
 * função seria uma segunda implementação da mesma coisa, e duas
 * implementações acabam discordando.
 */
export function standingsByCategory(
  standings: readonly StandingRow[],
  category: StandingRow['team']['category'],
): StandingRow[] {
  return standings
    .filter((row) => row.team.category === category)
    .sort(
      (a, b) =>
        a.categoryPosition - b.categoryPosition || a.team.teamNumber - b.team.teamNumber,
    )
    .map((row) => ({ ...row, position: row.categoryPosition }));
}

/** Duplas desclassificadas — fora do ranking, mas visíveis na listagem. */
export function disqualifiedTeams(teams: readonly Team[]): Team[] {
  return teams.filter((t) => t.status === 'DESCLASSIFICADA');
}
