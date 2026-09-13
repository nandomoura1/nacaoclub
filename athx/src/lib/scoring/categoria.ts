import type { Team } from '@/types/domain';
import { CATEGORIES } from '@/types/domain';

/**
 * A DISPUTA ACONTECE DENTRO DA CATEGORIA.
 *
 * Uma Dupla Masculina não briga por posição com uma Dupla Feminina, então
 * ranquear as 20 duplas juntas e depois só separar a exibição estaria
 * errado: a dupla que ficasse em 12º no geral carregaria 12 pontos para a
 * classificação da própria categoria, mesmo que a categoria dela tenha
 * apenas 5 duplas.
 *
 * A regra é: se a categoria tem 5 duplas, a pior pontuação possível em uma
 * prova é 5. O motor roda UMA VEZ POR CATEGORIA, sobre o subconjunto de
 * duplas daquela categoria, e os mapas são costurados no fim.
 *
 * Isso vale para as oito provas — 1A, 1B, 1C, 1D, 2A, 2B, 2C e 3 — porque
 * todas passam por aqui. E resolve de graça o WOD 3: o "atrás de quem
 * concluiu" passa a contar os finalizadores DA CATEGORIA, não do evento.
 */
export function pontuarPorCategoria<R extends { teamId: string }, S>(
  teams: readonly Team[],
  results: readonly R[],
  pontuar: (teams: readonly Team[], results: readonly R[]) => Map<string, S>,
): Map<string, S> {
  const categoriaDe = new Map(teams.map((t) => [t.id, t.category] as const));
  const saida = new Map<string, S>();

  for (const categoria of CATEGORIES) {
    const daCategoria = teams.filter((t) => t.category === categoria);
    if (daCategoria.length === 0) continue;

    const resultados = results.filter((r) => categoriaDe.get(r.teamId) === categoria);
    for (const [teamId, score] of pontuar(daCategoria, resultados)) {
      saida.set(teamId, score);
    }
  }

  // Resultado cuja dupla sumiu da lista (dado inconsistente): continua
  // aparecendo no mapa, sem pontuação — mesmo comportamento de antes, para
  // que a tela não quebre por causa de uma linha órfã no banco.
  const orfaos = results.filter((r) => !categoriaDe.has(r.teamId));
  if (orfaos.length > 0) {
    for (const [teamId, score] of pontuar([], orfaos)) saida.set(teamId, score);
  }

  return saida;
}
