import type {
  EventSettings,
  StandingRow,
  Team,
  TieBreaker,
  Wod1Score,
  Wod2Score,
  Wod3Score,
} from '@/types/domain';
import { CATEGORIES, criteriosDeDesempate } from '@/types/domain';
import { isRankable } from './eligibility';

/** O que um critério vale para uma dupla. Menor é melhor; null = sem resultado. */
type ParaDesempatar = Pick<StandingRow, 'wod1' | 'wod2' | 'wod3'>;

function valorDoCriterio(row: ParaDesempatar, criterio: TieBreaker): number | null {
  switch (criterio) {
    case 'WOD1':
      return row.wod1?.hasResult ? row.wod1.points : null;
    case 'WOD2':
      return row.wod2?.hasResult ? row.wod2.points : null;
    case 'WOD3':
      return row.wod3?.hasResult ? row.wod3.points : null;
    default:
      return null;
  }
}

/**
 * Compara duas duplas pelos critérios de desempate, na ordem escolhida.
 * Devolve 0 quando NENHUM critério separou as duas — aí o empate é real e
 * volta para a mesa da organização.
 */
export function compararDesempate(
  a: ParaDesempatar,
  b: ParaDesempatar,
  criterios: readonly TieBreaker[],
): number {
  for (const criterio of criterios) {
    const va = valorDoCriterio(a, criterio);
    const vb = valorDoCriterio(b, criterio);
    if (va === vb) continue;
    // Sem resultado no WOD do critério vai para trás: não há o que comparar.
    if (va === null) return 1;
    if (vb === null) return -1;
    return va - vb;
  }
  return 0;
}

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
 * EMPATES (§15): o critério de desempate NÃO age aqui.
 *
 * A classificação geral mistura as três categorias e existe só como
 * referência — não é disputada por ninguém. Duas duplas com a mesma
 * pontuação dividem a posição geral, ponto.
 *
 * A DISPUTA, e portanto o desempate, acontece DENTRO DA CATEGORIA: é lá que
 * "melhor colocação no WOD 3" decide quem sobe no pódio. Por isso a posição
 * de categoria, o selo de empate e o registro de qual critério decidiu são
 * calculados por `posicionarNasCategorias`, logo abaixo, e viajam prontos na
 * linha — `standingsByCategory` só recorta e exibe.
 */
export function computeStandings(
  teams: readonly Team[],
  wod1: Map<string, Wod1Score>,
  wod2: Map<string, Wod2Score>,
  wod3: Map<string, Wod3Score>,
  settings: Pick<EventSettings, 'tieBreaker1' | 'tieBreaker2' | 'tieBreaker3'>,
): StandingRow[] {
  const criterios = criteriosDeDesempate(settings);

  type Base = Omit<
    StandingRow,
    'position' | 'categoryPosition' | 'tied' | 'needsDecision' | 'desempatadoPor'
  >;

  const rows = teams.filter(isRankable).map<Base>((team) => {
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

  return posicionarNasCategorias(standings, criterios);
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
): StandingRow[] {
  const porId = new Map<string, StandingRow>();

  for (const categoria of CATEGORIES) {
    const daCategoria = standings
      .filter((r) => r.team.category === categoria)
      .sort((a, b) => {
        const base = ordemBase(a, b);
        if (base !== 0 && (a.scoredWods !== b.scoredWods || a.totalPoints !== b.totalPoints)) {
          return base;
        }
        const criterio = compararDesempate(a, b, criterios);
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
            const valores = bloco.map((r) => valorDoCriterio(r, criterio));
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
          compararDesempate(inicio, daCategoria[fim + 1] as ParaDesempatar, criterios) === 0
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
 * A posição exibida passa a ser a posição NA CATEGORIA — a interface deve
 * deixar isso explícito ("Classificação da categoria").
 */
export function standingsByCategory(
  standings: readonly StandingRow[],
  category: StandingRow['team']['category'],
): StandingRow[] {
  // A posição de categoria e o desempate já vieram calculados de
  // computeStandings — aqui é só recorte e ordenação. Reaplicar a regra
  // nesta função seria uma segunda implementação da mesma coisa, e duas
  // implementações acabam discordando.
  return standings
    .filter((row) => row.team.category === category)
    .sort((a, b) => a.categoryPosition - b.categoryPosition || a.team.teamNumber - b.team.teamNumber)
    .map((row) => ({ ...row, position: row.categoryPosition }));
}

/** Duplas desclassificadas — fora do ranking, mas visíveis na listagem. */
export function disqualifiedTeams(teams: readonly Team[]): Team[] {
  return teams.filter((t) => t.status === 'DESCLASSIFICADA');
}
