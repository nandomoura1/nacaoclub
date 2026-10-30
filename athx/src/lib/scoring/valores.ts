import type { ResultStatus, Team } from '@/types/domain';
import type { Prova, ProvaResult, Wod, WodEntry } from '@/types/wod';

/**
 * O VALOR BRUTO DE CADA PROVA.
 *
 * É o número que vai para o ranking — já somado, já calculado. Separado do
 * ranqueamento de propósito: aqui não existe posição nem ponto, só "quanto a
 * dupla fez nesta prova".
 *
 * Três origens:
 *
 *   DIGITADA por atleta   soma os dois campos (as cargas: cada atleta busca
 *                         a sua, e a prova é a soma)
 *   DIGITADA              o número lançado
 *   SOMA                  soma outras provas do mesmo WOD, resolvidas antes
 *
 * Prova calculada nunca é digitada. É o que impede a 1D de divergir de
 * 1A + 1B + 1C por um erro de digitação.
 */

export type ValoresPorProva = Map<string, Map<string, number | null>>;

/** Chave de busca rápida em prova_results. */
function chave(provaId: string, teamId: string): string {
  return `${provaId}#${teamId}`;
}

/**
 * Resolve o valor de todas as provas de todas as duplas.
 *
 * Provas calculadas são resolvidas por recursão com memória, e uma fórmula
 * circular (A soma B, B soma A) devolve null em vez de travar — o formulário
 * impede criar isso, mas dado ruim não pode derrubar o leaderboard.
 */
export function resolverValores(
  wods: readonly Wod[],
  teams: readonly Team[],
  results: readonly ProvaResult[],
): ValoresPorProva {
  const porChave = new Map<string, ProvaResult>();
  for (const r of results) porChave.set(chave(r.provaId, r.teamId), r);

  // Código -> prova, por WOD. Os componentes de uma soma são sempre do mesmo
  // workout: somar a corrida com a carga não faria sentido nem de unidade.
  const porCodigo = new Map<string, Prova>();
  for (const wod of wods) {
    for (const prova of wod.provas) porCodigo.set(`${wod.id}#${prova.codigo}`, prova);
  }

  const saida: ValoresPorProva = new Map();
  for (const wod of wods) {
    for (const prova of wod.provas) saida.set(prova.id, new Map());
  }

  function resolver(prova: Prova, teamId: string, visitadas: Set<string>): number | null {
    const jaFeito = saida.get(prova.id)?.get(teamId);
    if (jaFeito !== undefined) return jaFeito;

    // Fórmula circular: devolve null e não derruba a tela.
    if (visitadas.has(prova.id)) return null;
    visitadas.add(prova.id);

    let valor: number | null;

    if (prova.origem === 'SOMA') {
      const partes = prova.componentes
        .map((codigo) => porCodigo.get(`${prova.wodId}#${codigo}`))
        .filter((p): p is Prova => p !== undefined)
        .map((p) => resolver(p, teamId, visitadas));

      // Sem nenhuma parcela lançada, a soma não existe — é diferente de zero.
      valor = partes.some((v) => v !== null)
        ? partes.reduce<number>((soma, v) => soma + (v ?? 0), 0)
        : null;
    } else {
      const lancado = porChave.get(chave(prova.id, teamId));
      if (!lancado) {
        valor = null;
      } else if (prova.porAtleta) {
        const a1 = lancado.valorAtleta1;
        const a2 = lancado.valorAtleta2;
        valor = a1 === null && a2 === null ? null : (a1 ?? 0) + (a2 ?? 0);
      } else {
        valor = lancado.valor;
      }
    }

    saida.get(prova.id)?.set(teamId, arredondar(valor));
    return valor;
  }

  for (const wod of wods) {
    for (const prova of wod.provas) {
      for (const team of teams) resolver(prova, team.id, new Set());
    }
  }

  return saida;
}

/**
 * Três casas decimais. Distância em km precisa delas (2,410 km), e sem o
 * arredondamento a soma de ponto flutuante criaria empates que não existem
 * — 15.000000000000002 contra 15.
 */
function arredondar(valor: number | null): number | null {
  if (valor === null) return null;
  return Math.round(valor * 1000) / 1000;
}

/** Homologação de uma dupla num WOD, indexada para busca O(1). */
export type EntradasPorWod = Map<string, WodEntry>;

export function indexarEntradas(entries: readonly WodEntry[]): EntradasPorWod {
  return new Map(entries.map((e) => [chave(e.wodId, e.teamId), e]));
}

export function buscarEntrada(
  entradas: EntradasPorWod,
  wodId: string,
  teamId: string,
): WodEntry | undefined {
  return entradas.get(chave(wodId, teamId));
}

/**
 * A dupla conta nesta prova?
 *
 * Precisa de homologação aceita no WOD e de um valor. Em workout com CAP,
 * quem não concluiu também conta — entra pela política de incompletos, não
 * pelo tempo.
 */
export function contaNaProva(
  entrada: WodEntry | undefined,
  valor: number | null,
  statusAceitos: readonly ResultStatus[],
  wod: Wod,
): boolean {
  if (!entrada) return false;
  if (!statusAceitos.includes(entrada.status)) return false;
  if (valor !== null) return true;
  // Workout com CAP: quem não concluiu pode não ter tempo e ainda assim
  // precisa aparecer no ranking, atrás de quem concluiu.
  return wod.permiteCap && !entrada.concluiu && entrada.volume !== null;
}
