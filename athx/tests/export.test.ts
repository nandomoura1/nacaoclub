import { describe, expect, it } from 'vitest';
import { buildLeaderboard } from '@/lib/scoring/build';
import { buildExportRows, toCsv } from '@/services/export-service';
import { cargas, cenario, distancias, team, tempo } from './helpers';

const board = buildLeaderboard(
  cenario({
    teams: [team(1, { teamName: 'Cerrado' }), team(2, { teamName: 'Buriti' })],
    wod1: [
      ...cargas('team-1', [100, 80, 180, 150, 220, 200]),
      ...cargas('team-2', [90, 80, 170, 140, 210, 190]),
    ],
    wod2: [...distancias('team-1', 3.5, 8.45), ...distancias('team-2', 3, 7)],
    wod3: [tempo('team-1', 872), tempo('team-2', null, false, 300)],
  }),
);

describe('Exportação (§42)', () => {
  const rows = buildExportRows(board);

  it('exporta uma linha por dupla, em ordem de classificação', () => {
    expect(rows).toHaveLength(2);
    expect(rows[0]?.posicao_categoria).toBe(1);
    expect(rows[0]?.posicao_geral).toBe(1);
  });

  it('cria uma coluna por prova do evento — não oito cravadas', () => {
    const cabecalho = Object.keys(rows[0] ?? {});

    for (const prova of board.provaList) {
      const p = prova.codigo.toLowerCase();
      expect(
        cabecalho.some((c) => c.startsWith(`${p}_`) && c.endsWith('_pontos')),
        `coluna de pontos da prova ${prova.codigo}`,
      ).toBe(true);
    }
  });

  it('o total da planilha é a soma das colunas de pontos das provas', () => {
    const cerrado = rows.find((r) => r.dupla === 'Cerrado');
    const soma = board.provaList
      .filter((p) => p.pontua)
      .reduce((acc, p) => {
        const valor = cerrado?.[`${prefixoDe(p.codigo, cerrado)}_pontos`];
        return acc + (typeof valor === 'number' ? valor : 0);
      }, 0);

    expect(cerrado?.total_pontos).toBe(soma);
  });

  it('o tempo sai como mm:ss, não como segundos', () => {
    const cerrado = rows.find((r) => r.dupla === 'Cerrado');
    const coluna = Object.keys(cerrado ?? {}).find((c) => c.startsWith('3a_'));
    expect(cerrado?.[coluna ?? '']).toBe('14:32');
  });

  it('workout com CAP leva as colunas de conclusão e volume', () => {
    const buriti = rows.find((r) => r.dupla === 'Buriti');
    expect(buriti?.wod3_concluiu).toBe('não');
    expect(buriti?.wod3_volume).toBe(300);
  });

  it('workout sem CAP não cria colunas de conclusão', () => {
    const cabecalho = Object.keys(rows[0] ?? {});
    expect(cabecalho).not.toContain('wod1_concluiu');
    expect(cabecalho).not.toContain('wod2_volume');
  });

  it('CSV sai com BOM e ponto e vírgula, para abrir no Excel', () => {
    const csv = toCsv(rows);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv.split('\r\n')[0]).toContain('posicao_categoria;posicao_geral;numero;dupla');
  });

  it('CSV escapa o que precisa ser escapado', () => {
    const comPontoEVirgula = buildExportRows(
      buildLeaderboard(
        cenario({
          teams: [team(1, { teamName: 'Dupla; perigosa' })],
          wod1: cargas('team-1', [100, 100, 100, 100, 100, 100]),
        }),
      ),
    );
    expect(toCsv(comPontoEVirgula)).toContain('"Dupla; perigosa"');
  });
});

/** Descobre o prefixo gerado para um código de prova dentro de uma linha. */
function prefixoDe(codigo: string, linha: Record<string, unknown> | undefined): string {
  const alvo = Object.keys(linha ?? {}).find(
    (c) => c.startsWith(`${codigo.toLowerCase()}_`) && c.endsWith('_pontos'),
  );
  return alvo ? alvo.replace(/_pontos$/, '') : codigo.toLowerCase();
}
