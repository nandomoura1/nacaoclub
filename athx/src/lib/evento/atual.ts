/**
 * QUAL EVENTO O SITE MOSTRA.
 *
 * A mesma regra existe em athx_evento_atual(), no Postgres. Duas
 * implementações, como o resto deste projeto: o motor de pontuação em
 * TypeScript também é espelhado por views em SQL, e a paridade é verificada
 * por teste (§25).
 *
 * Por que o app usa ESTA, e não a função do banco:
 *
 * Chamar a função é um POST em /rest/v1/rpc/… — uma segunda ida à rede, com
 * um modo de falha próprio. Em produção ela devolveu 401 quando a sessão de
 * quem estava logado expirou, e o site anunciou "nenhum evento cadastrado"
 * para uma organização que tinha dois. A leitura da tabela de eventos, que
 * é pública e já acontece de qualquer jeito, não falhou nenhuma vez.
 *
 * Uma etapa inteira depender de uma chamada a mais não se paga. A função
 * continua no banco para quem consulta por SQL.
 */

export interface EventoOrdenavel {
  status: 'DRAFT' | 'LIVE' | 'FINISHED';
  date: string;
  createdAt?: string | null;
}

/**
 * A ordem de preferência, e o porquê de cada degrau:
 *
 *   1. o que está NO AR — é a resposta normal
 *   2. o ARQUIVADO mais recente — enquanto a próxima etapa é montada, o
 *      público deve ver o resultado final da anterior, não uma tela vazia
 *   3. qualquer um — só para uma instalação nova, que só tem rascunho, não
 *      quebrar com "nenhum evento cadastrado"
 *
 * O degrau 2 é o que falta numa regra ingênua: ordenar só por data faz um
 * RASCUNHO de etapa futura, ainda sem duplas, roubar o lugar do evento que
 * acabou de acontecer. DRAFT quer dizer "o público não vê".
 */
export function escolherEventoAtual<T extends EventoOrdenavel>(
  eventos: readonly T[],
): T | null {
  if (eventos.length === 0) return null;

  const peso = (e: T) => (e.status === 'LIVE' ? 2 : e.status === 'FINISHED' ? 1 : 0);

  return [...eventos].sort((a, b) => {
    if (peso(a) !== peso(b)) return peso(b) - peso(a);
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
  })[0]!;
}
