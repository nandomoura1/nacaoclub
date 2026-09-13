import type { Leaderboard } from '@/lib/scoring/build';
import { CATEGORIES, CATEGORY_LABEL } from '@/types/domain';
import { standingsByCategory } from '@/lib/scoring/overall';
import { formatSeconds } from '@/lib/time';

/**
 * Exportação de resultados (§42).
 *
 * Uma linha por dupla com AS OITO PONTUAÇÕES separadas — 1A, 1B, 1C, 1D,
 * 2A, 2B, 2C e 3 — mais os totais por WOD e o total geral:
 *
 *   TOTAL = 1A + 1B + 1C + 1D + 2A + 2B + 2C + 3
 *
 * Cada prova leva seu resultado bruto (kg, km, tempo), sua posição e seus
 * pontos, para que a conferência do pódio seja feita na planilha sem
 * precisar recalcular nada.
 *
 * DUAS COLUNAS DE POSIÇÃO, e a diferença importa:
 *   posicao_categoria — a que vale, porque a disputa é dentro da categoria
 *   posicao_geral     — as 20 duplas ordenadas por pontos, só como referência
 */

export interface ExportRow {
  posicao_categoria: number | '';
  posicao_geral: number | '';
  numero: number;
  dupla: string;
  categoria: string;
  atleta_1: string;
  atleta_2: string;
  bateria: number;
  status: string;
  wod1_1a_strict_press: number | '';
  wod1_1a_posicao: number | '';
  wod1_1a_pontos: number | '';
  wod1_1b_back_squat: number | '';
  wod1_1b_posicao: number | '';
  wod1_1b_pontos: number | '';
  wod1_1c_deadlift: number | '';
  wod1_1c_posicao: number | '';
  wod1_1c_pontos: number | '';
  wod1_1d_carga_total: number | '';
  wod1_1d_posicao: number | '';
  wod1_1d_pontos: number | '';
  wod1_pontos: number | '';
  wod2_2a_corrida_km: number | '';
  wod2_2a_posicao: number | '';
  wod2_2a_pontos: number | '';
  wod2_2b_bike_km: number | '';
  wod2_2b_posicao: number | '';
  wod2_2b_pontos: number | '';
  wod2_2c_soma_km: number | '';
  wod2_2c_posicao: number | '';
  wod2_2c_pontos: number | '';
  wod2_pontos: number | '';
  wod3_tempo: string;
  wod3_concluiu: string;
  wod3_volume: number | '';
  wod3_posicao: number | '';
  wod3_pontos: number | '';
  total_pontos: number | '';
  wods_pontuados: number;
  empate: string;
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
      const w1 = board.wod1.get(team.id);
      const w2 = board.wod2.get(team.id);
      const w3 = board.wod3.get(team.id);

      return {
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
        wod1_1a_strict_press: w1?.hasResult ? w1.strictPress : '',
        wod1_1a_posicao: w1?.rankStrictPress ?? '',
        wod1_1a_pontos: w1?.pointsStrictPress ?? '',
        wod1_1b_back_squat: w1?.hasResult ? w1.backSquat : '',
        wod1_1b_posicao: w1?.rankBackSquat ?? '',
        wod1_1b_pontos: w1?.pointsBackSquat ?? '',
        wod1_1c_deadlift: w1?.hasResult ? w1.deadlift : '',
        wod1_1c_posicao: w1?.rankDeadlift ?? '',
        wod1_1c_pontos: w1?.pointsDeadlift ?? '',
        wod1_1d_carga_total: w1?.hasResult ? w1.totalLoad : '',
        wod1_1d_posicao: w1?.rankTotal ?? '',
        wod1_1d_pontos: w1?.pointsTotal ?? '',
        wod1_pontos: w1?.points ?? '',
        wod2_2a_corrida_km: w2?.hasResult ? w2.runKm : '',
        wod2_2a_posicao: w2?.rankRun ?? '',
        wod2_2a_pontos: w2?.pointsRun ?? '',
        wod2_2b_bike_km: w2?.hasResult ? w2.bikeKm : '',
        wod2_2b_posicao: w2?.rankBike ?? '',
        wod2_2b_pontos: w2?.pointsBike ?? '',
        wod2_2c_soma_km: w2?.hasResult ? w2.totalKm : '',
        wod2_2c_posicao: w2?.rankTotal ?? '',
        wod2_2c_pontos: w2?.pointsTotal ?? '',
        wod2_pontos: w2?.points ?? '',
        wod3_tempo: w3?.hasResult ? formatSeconds(w3.timeSeconds) : '',
        wod3_concluiu: w3?.hasResult ? (w3.completed ? 'sim' : 'não') : '',
        wod3_volume: w3?.volumeCompleted ?? '',
        wod3_posicao: w3?.rank ?? '',
        wod3_pontos: w3?.points ?? '',
        total_pontos: s && s.scoredWods > 0 ? s.totalPoints : '',
        wods_pontuados: s?.scoredWods ?? 0,
        empate: s?.tied ? 'sim' : 'não',
      };
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
    ...rows.map((row) =>
      headers.map((h) => escape((row as unknown as Record<string, unknown>)[h])).join(';'),
    ),
  ];

  return `﻿${linhas.join('\r\n')}`;
}
