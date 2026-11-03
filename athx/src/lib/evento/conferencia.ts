import type { EventSettings } from '@/types/domain';
import type { Wod } from '@/types/wod';
import { todasAsProvas } from '@/types/wod';

/**
 * CONFERÊNCIA DA CONFIGURAÇÃO DO EVENTO.
 *
 * Existe porque uma etapa real passou por aqui com três problemas que só
 * apareceram numa simulação:
 *
 *   · o critério de desempate apontava para o WOD 3 porque, quando foi
 *     escolhido, o METCON ERA o WOD 3. Depois entrou um workout novo, o
 *     METCON virou o 4, e o critério ficou apontando para o ENDURANCE —
 *     decidindo pódio pelo workout errado, em silêncio
 *   · dois WODs com provas de códigos iguais (2A, 2B, 2C nos dois)
 *   · duas provas com a mesma ordem dentro do mesmo WOD
 *
 * Nenhum deles quebra o cálculo: o motor trabalha por identificador, não
 * por código. Todos confundem quem lê — e o terceiro decide campeonato.
 *
 * Nada aqui inventa regra. A conferência APONTA; quem decide é a
 * organização (§48).
 */

export type Gravidade = 'ERRO' | 'AVISO';

export interface Achado {
  gravidade: Gravidade;
  titulo: string;
  /** O que fazer. Uma conferência que não diz o caminho é só reclamação. */
  comoResolver: string;
  /** Para onde a tela manda a pessoa. */
  onde?: string;
}

/** "WOD3" -> 3. Qualquer outra coisa -> null. */
function numeroDoCriterio(criterio: string | null): number | null {
  const m = /^WOD(\d+)$/.exec(criterio ?? '');
  return m?.[1] ? Number(m[1]) : null;
}

export function conferirEvento(
  wods: readonly Wod[],
  settings: Pick<EventSettings, 'tieBreaker1' | 'tieBreaker2' | 'tieBreaker3'>,
  duplas: number,
): Achado[] {
  const achados: Achado[] = [];

  if (wods.length === 0) {
    achados.push({
      gravidade: 'ERRO',
      titulo: 'O evento não tem nenhum workout',
      comoResolver: 'Cadastre os WODs antes de abrir as inscrições.',
      onde: '/admin/wods',
    });
    return achados;
  }

  /* ---- WOD sem prova: existe, mas não pontua --------------------------- */
  for (const w of wods) {
    if (w.provas.length === 0) {
      achados.push({
        gravidade: 'ERRO',
        titulo: `O WOD ${w.numero} — ${w.nome} não tem nenhuma prova`,
        comoResolver:
          'Sem prova, o workout não gera posição nem pontos. Cadastre ao menos uma, ou exclua o WOD.',
        onde: '/admin/wods',
      });
    } else if (!w.provas.some((p) => p.pontua)) {
      achados.push({
        gravidade: 'AVISO',
        titulo: `Nenhuma prova do WOD ${w.numero} — ${w.nome} pontua`,
        comoResolver:
          'O workout aparece na tela, mas não entra no total do evento. Se for de propósito, ignore.',
        onde: '/admin/wods',
      });
    }
  }

  /* ---- Código repetido entre WODs: duas colunas com o mesmo nome ------- */
  const porCodigo = new Map<string, number[]>();
  for (const w of wods) {
    for (const p of w.provas) {
      const lista = porCodigo.get(p.codigo) ?? [];
      if (!lista.includes(w.numero)) lista.push(w.numero);
      porCodigo.set(p.codigo, lista);
    }
  }
  for (const [codigo, numeros] of porCodigo) {
    if (numeros.length > 1) {
      achados.push({
        gravidade: 'AVISO',
        titulo: `O código "${codigo}" se repete nos WODs ${numeros.join(' e ')}`,
        comoResolver:
          `A classificação ganha duas colunas chamadas "${codigo}", e a fórmula do total ` +
          'repete o código. O cálculo está certo, mas quem lê não distingue. ' +
          'O costume é prefixar com o número do workout — 2A no WOD 2, 3A no WOD 3.',
        onde: '/admin/wods',
      });
    }
  }

  /* ---- Mesma ordem no mesmo WOD: a tela desempata sozinha -------------- */
  for (const w of wods) {
    const porOrdem = new Map<number, string[]>();
    for (const p of w.provas) {
      porOrdem.set(p.ordem, [...(porOrdem.get(p.ordem) ?? []), p.codigo]);
    }
    for (const [ordem, codigos] of porOrdem) {
      if (codigos.length > 1) {
        achados.push({
          gravidade: 'AVISO',
          titulo: `No WOD ${w.numero}, as provas ${codigos.join(' e ')} têm a mesma ordem (${ordem})`,
          comoResolver:
            'A ordem das colunas e dos campos da súmula fica indefinida entre elas. ' +
            'Dê ordens diferentes para fixar o que aparece primeiro.',
          onde: '/admin/wods',
        });
      }
    }
  }

  /* ---- Prova calculada apontando para o nada --------------------------- */
  for (const w of wods) {
    const codigos = new Set(w.provas.map((p) => p.codigo));
    for (const p of w.provas) {
      if (p.origem !== 'SOMA') continue;
      const faltando = p.componentes.filter((c) => !codigos.has(c));
      if (faltando.length > 0) {
        achados.push({
          gravidade: 'ERRO',
          titulo: `A prova ${p.codigo} soma ${faltando.join(' e ')}, que não existe no WOD ${w.numero}`,
          comoResolver: 'Corrija os componentes, senão a prova fica sem valor para todas as duplas.',
          onde: '/admin/wods',
        });
      }
    }
  }

  /* ---- O desempate ------------------------------------------------------
     O mais perigoso da lista, porque não dá erro nenhum: aponta para um
     workout que existe, só não é o que a organização quis. ---------------- */
  const criterios = [
    ['1º critério', settings.tieBreaker1],
    ['2º critério', settings.tieBreaker2],
    ['3º critério', settings.tieBreaker3],
  ] as const;

  for (const [qual, criterio] of criterios) {
    if (!criterio || criterio === 'NENHUM') continue;

    const numero = numeroDoCriterio(criterio);
    const alvo = numero === null ? undefined : wods.find((w) => w.numero === numero);

    if (!alvo) {
      achados.push({
        gravidade: 'ERRO',
        titulo: `O ${qual} de desempate aponta para o ${criterio}, que não existe neste evento`,
        comoResolver:
          `Os workouts deste evento vão de 1 a ${Math.max(...wods.map((w) => w.numero))}. ` +
          'Escolha um deles, senão o empate não é desfeito.',
        onde: '/admin/settings',
      });
    }
  }

  if (duplas === 0) {
    achados.push({
      gravidade: 'AVISO',
      titulo: 'Nenhuma dupla inscrita',
      comoResolver: 'Cadastre as inscrições antes de colocar o evento no ar.',
      onde: '/admin/teams',
    });
  }

  if (todasAsProvas(wods).filter((p) => p.pontua).length === 0) {
    achados.push({
      gravidade: 'ERRO',
      titulo: 'Nenhuma prova do evento pontua',
      comoResolver: 'Sem prova que pontue, a classificação fica zerada para todo mundo.',
      onde: '/admin/wods',
    });
  }

  return achados;
}

/**
 * O WOD para onde o desempate aponta, com nome.
 *
 * Escrever só "WOD 3" esconde o erro: quem leu escolheu o METCON e vê o
 * número que o METCON tinha. Com o nome junto, "WOD 3 — ENDURANCE" denuncia
 * a troca na hora.
 */
export function criterioPorExtenso(criterio: string | null, wods: readonly Wod[]): string | null {
  if (!criterio || criterio === 'NENHUM') return null;
  const numero = numeroDoCriterio(criterio);
  const alvo = numero === null ? undefined : wods.find((w) => w.numero === numero);
  if (!alvo) return `${criterio} (não existe neste evento)`;
  return `WOD ${alvo.numero} — ${alvo.nome}`;
}
