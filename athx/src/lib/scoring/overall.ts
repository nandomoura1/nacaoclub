import type {
  EventSettings,
  StandingRow,
  Team,
  TieBreaker,
  Wod1Score,
  Wod2Score,
  Wod3Score,
} from '@/types/domain';
import { criteriosDeDesempate } from '@/types/domain';
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
 * EMPATES (§15): duplas com a mesma completude E a mesma pontuação passam
 * pelos CRITÉRIOS DE DESEMPATE escolhidos em /admin/settings — por exemplo,
 * "melhor colocação no WOD 3". Os critérios são consultados em ordem: o 2 só
 * entra quando o 1 empata.
 *
 * Nenhum critério é inventado. Enquanto a organização deixar os três em
 * NENHUM, ou quando nenhum deles separar as duplas, elas dividem a posição, a
 * tela mostra "EMPATE" e a decisão é de gente.
 */
export function computeStandings(
  teams: readonly Team[],
  wod1: Map<string, Wod1Score>,
  wod2: Map<string, Wod2Score>,
  wod3: Map<string, Wod3Score>,
  settings: Pick<EventSettings, 'tieBreaker1' | 'tieBreaker2' | 'tieBreaker3'>,
): StandingRow[] {
  const criterios = criteriosDeDesempate(settings);

  const rows = teams.filter(isRankable).map<Omit<StandingRow, 'position' | 'tied' | 'needsDecision' | 'tieGroup' | 'desempatadoPor'>>((team) => {
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
    const criterio = compararDesempate(a, b, criterios);
    if (criterio !== 0) return criterio;
    return a.team.teamNumber - b.team.teamNumber; // ordem estável, não é desempate
  });

  const standings: StandingRow[] = [];
  let index = 0;
  let tieGroup = 0;

  while (index < rows.length) {
    const current = rows[index];
    if (!current) break;

    // Primeiro o bloco de mesma pontuação — é dentro dele que o desempate
    // trabalha e é ele que a tela chama de "empate de pontos".
    let blocoFim = index;
    while (
      blocoFim + 1 < rows.length &&
      rows[blocoFim + 1]?.scoredWods === current.scoredWods &&
      rows[blocoFim + 1]?.totalPoints === current.totalPoints
    ) {
      blocoFim += 1;
    }

    const empatouEmPontos = blocoFim > index && current.scoredWods > 0;
    const bloco = rows.slice(index, blocoFim + 1);

    // Qual critério separou este bloco? O primeiro em que nem todos têm o
    // mesmo valor. Se nenhum separou, o empate continua de pé.
    const criterioQueSeparou = empatouEmPontos
      ? (criterios.find((criterio) => {
          const valores = bloco.map((r) => valorDoCriterio(r, criterio));
          return valores.some((v) => v !== valores[0]);
        }) ?? null)
      : null;

    // Agora as posições dentro do bloco, já na ordem desempatada.
    let i = index;
    while (i <= blocoFim) {
      const atual = rows[i];
      if (!atual) break;

      let fim = i;
      while (
        fim + 1 <= blocoFim &&
        compararDesempate(atual, rows[fim + 1] as ParaDesempatar, criterios) === 0
      ) {
        fim += 1;
      }

      // Ainda dividem a posição: ou não havia critério, ou ele não separou.
      const aindaEmpatadas = fim > i && atual.scoredWods > 0;
      const position = i + 1;
      tieGroup += 1;

      for (let k = i; k <= fim; k += 1) {
        const row = rows[k];
        if (!row) continue;
        standings.push({
          ...row,
          position,
          tied: aindaEmpatadas,
          needsDecision: aindaEmpatadas,
          tieGroup,
          desempatadoPor: empatouEmPontos && !aindaEmpatadas ? criterioQueSeparou : null,
        });
      }

      i = fim + 1;
    }

    index = blocoFim + 1;
  }

  return marcarEmpatesDaCategoria(standings);
}

/**
 * EMPATE SÓ EXISTE DENTRO DA CATEGORIA.
 *
 * A varredura acima trabalha na lista inteira, então uma dupla masculina e
 * uma feminina com o mesmo total caem no mesmo tieGroup e sairiam as duas
 * marcadas como empatadas — numa disputa que não existe. O selo EMPATE na
 * tela do pódio precisa dizer "empatada com alguém que disputa comigo".
 */
function marcarEmpatesDaCategoria(standings: readonly StandingRow[]): StandingRow[] {
  const quantos = new Map<string, number>();
  for (const row of standings) {
    const chave = `${row.team.category}#${row.tieGroup}`;
    quantos.set(chave, (quantos.get(chave) ?? 0) + 1);
  }

  return standings.map((row) => {
    const naCategoria = quantos.get(`${row.team.category}#${row.tieGroup}`) ?? 1;
    const empatada = naCategoria > 1 && row.scoredWods > 0;
    return { ...row, tied: empatada, needsDecision: empatada };
  });
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

    // Agrupa pelo tieGroup, não por pontuação: quem o critério de desempate
    // separou lá na classificação geral continua separado aqui. Reaplicar o
    // desempate nesta função seria uma segunda implementação da mesma regra —
    // e duas implementações acabam discordando.
    let groupEnd = index;
    while (
      groupEnd + 1 < filtered.length &&
      filtered[groupEnd + 1]?.tieGroup === current.tieGroup
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
