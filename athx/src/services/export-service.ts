import type { Leaderboard } from '@/lib/scoring/build';
import { CATEGORIES, CATEGORY_LABEL } from '@/types/domain';
import { standingsByCategory } from '@/lib/scoring/overall';
import { UNIDADE_SUFIXO } from '@/types/wod';
import type { Prova } from '@/types/wod';
import { formatSeconds } from '@/lib/time';

/**
 * Exportação de resultados (§42).
 *
 * Uma linha por dupla, com UMA COLUNA POR PROVA do evento — não oito fixas.
 * Se a organização cadastrar um quarto WOD com duas provas, a planilha
 * ganha as colunas novas sozinha.
 *
 * Cada prova leva seu resultado bruto, sua posição e seus pontos, para que a
 * conferência do pódio seja feita na planilha sem recalcular nada.
 *
 * DUAS COLUNAS DE POSIÇÃO, e a diferença importa:
 *   posicao_categoria — a que vale, porque a disputa é dentro da categoria
 *   posicao_geral     — todas as duplas ordenadas por pontos, só referência
 */

/** Linha da planilha: as colunas fixas mais as colunas de cada prova. */
export type ExportRow = Record<string, string | number>;

/** `1a_strict_press` — prefixo estável e legível para as colunas da prova. */
function prefixo(prova: Prova): string {
  const base = prova.descricao
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 28);
  return `${prova.codigo.toLowerCase()}_${base}`;
}

/** O valor bruto formatado para a planilha, na unidade da prova. */
function bruto(prova: Prova, valor: number | null): string | number {
  if (valor === null) return '';
  if (prova.unidade === 'SEGUNDOS') return formatSeconds(valor);
  return valor;
}

export function buildExportRows(board: Leaderboard): ExportRow[] {
  const porId = new Map(board.standings.map((s) => [s.team.id, s]));

  // Posição dentro da categoria — é a colocação que vai ao pódio.
  const posicaoNaCategoria = new Map<string, number>();
  for (const categoria of CATEGORIES) {
    for (const row of standingsByCategory(board.standings, categoria)) {
      posicaoNaCategoria.set(row.team.id, row.position);
    }
  }

  // Ordem da planilha: categoria, depois colocação dentro dela. Assim a
  // folha sai pronta para ler o pódio de cada categoria em sequência.
  const ordemCategoria = new Map(CATEGORIES.map((c, i) => [c, i] as const));

  return board.teams
    .slice()
    .sort((a, b) => {
      const ca = ordemCategoria.get(a.category) ?? 9;
      const cb = ordemCategoria.get(b.category) ?? 9;
      if (ca !== cb) return ca - cb;

      const pa = posicaoNaCategoria.get(a.id) ?? 9999;
      const pb = posicaoNaCategoria.get(b.id) ?? 9999;
      return pa - pb || a.teamNumber - b.teamNumber;
    })
    .map((team) => {
      const s = porId.get(team.id);

      const linha: ExportRow = {
        posicao_categoria:
          s && s.scoredWods > 0 ? (posicaoNaCategoria.get(team.id) ?? '') : '',
        posicao_geral: s && s.scoredWods > 0 ? s.position : '',
        numero: team.teamNumber,
        dupla: team.teamName,
        categoria: CATEGORY_LABEL[team.category],
        atleta_1: team.athlete1,
        atleta_2: team.athlete2,
        bateria: team.battery,
        status: team.status,
      };

      for (const wod of board.wods) {
        for (const prova of wod.provas) {
          const score = s?.provas[prova.id];
          const p = prefixo(prova);
          const sufixo = UNIDADE_SUFIXO[prova.unidade];

          linha[sufixo ? `${p}_${sufixo}` : p] = bruto(prova, score?.valor ?? null);
          linha[`${p}_posicao`] = score?.rank ?? '';
          linha[`${p}_pontos`] = score?.points ?? '';
        }

        const total = s?.wods[wod.id];
        linha[`wod${wod.numero}_pontos`] = total?.points ?? '';
        if (wod.permiteCap) {
          linha[`wod${wod.numero}_concluiu`] = total?.hasResult
            ? total.concluiu
              ? 'sim'
              : 'não'
            : '';
          linha[`wod${wod.numero}_volume`] = total?.volume ?? '';
        }
      }

      linha.total_pontos = s && s.scoredWods > 0 ? s.totalPoints : '';
      linha.wods_pontuados = s?.scoredWods ?? 0;
      linha.empate = s?.tied ? 'sim' : 'não';

      return linha;
    });
}

/** CSV com BOM e ponto e vírgula: abre direto no Excel em português. */
export function toCsv(rows: readonly ExportRow[]): string {
  if (rows.length === 0) return '﻿';

  const headers = Object.keys(rows[0] as ExportRow);
  const escape = (value: unknown) => {
    const text = String(value ?? '');
    return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const linhas = [
    headers.join(';'),
    ...rows.map((row) => headers.map((h) => escape(row[h])).join(';')),
  ];

  return `﻿${linhas.join('\r\n')}`;
}
