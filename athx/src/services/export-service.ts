import type { Leaderboard } from '@/lib/scoring/build';
import { CATEGORY_LABEL } from '@/types/domain';
import { formatSeconds } from '@/lib/time';

/**
 * Exportação de resultados (§42).
 * Uma linha por dupla, com tudo que a organização precisa para conferir,
 * arquivar ou mandar para a assessoria: dupla, categoria, atletas, os três
 * WODs, total e posição.
 */

export interface ExportRow {
  posicao: number | '';
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
  wod2_corrida_km: number | '';
  wod2_bike_km: number | '';
  wod2_soma_km: number | '';
  wod2_posicao: number | '';
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

  return board.teams
    .slice()
    .sort((a, b) => {
      const pa = porId.get(a.id)?.position ?? 9999;
      const pb = porId.get(b.id)?.position ?? 9999;
      return pa - pb || a.teamNumber - b.teamNumber;
    })
    .map((team) => {
      const s = porId.get(team.id);
      const w1 = board.wod1.get(team.id);
      const w2 = board.wod2.get(team.id);
      const w3 = board.wod3.get(team.id);

      return {
        posicao: s && s.scoredWods > 0 ? s.position : '',
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
        wod2_corrida_km: w2?.hasResult ? w2.runKm : '',
        wod2_bike_km: w2?.hasResult ? w2.bikeKm : '',
        wod2_soma_km: w2?.hasResult ? w2.totalKm : '',
        wod2_posicao: w2?.rankTotal ?? '',
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
