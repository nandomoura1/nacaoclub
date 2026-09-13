import { describe, expect, it } from 'vitest';
import { buildLeaderboard } from '@/lib/scoring/build';
import { buildExportRows, toCsv } from '@/services/export-service';
import { settings, team, w1, w2, w3 } from './helpers';

const board = buildLeaderboard({
  teams: [team(1, { teamName: 'Cerrado' }), team(2, { teamName: 'Buriti' })],
  wod1: [w1('team-1', [100, 80, 180, 150, 220, 200]), w1('team-2', [90])],
  wod2: [w2('team-1', 3.5, 8.45), w2('team-2', 3, 7)],
  wod3: [w3('team-1', 872), w3('team-2', 1200, false, { volumeCompleted: 300 })],
  settings: settings(),
});

describe('Exportação (§42)', () => {
  const rows = buildExportRows(board);

  it('exporta uma linha por dupla, em ordem de classificação', () => {
    expect(rows).toHaveLength(2);
    expect(rows[0]?.posicao_categoria).toBe(1);
    expect(rows[0]?.posicao_geral).toBe(1);
  });

  it('agrupa a planilha por categoria, na ordem da colocação de cada uma', () => {
    const misto = buildLeaderboard({
      teams: [
        team(1, { teamName: 'Cerrado', category: 'MISTA' }),
        team(2, { teamName: 'Buriti', category: 'MASCULINA' }),
        team(3, { teamName: 'Savana', category: 'MASCULINA' }),
      ],
      wod1: [
        w1('team-1', [100, 100, 100, 100, 100, 100]),
        w1('team-2', [90, 90, 90, 90, 90, 90]),
        w1('team-3', [80, 80, 80, 80, 80, 80]),
      ],
      wod2: [w2('team-1', 3, 7), w2('team-2', 3, 7), w2('team-3', 2, 6)],
      wod3: [w3('team-1', 900), w3('team-2', 900), w3('team-3', 1000)],
      settings: settings(),
    });

    const linhas = buildExportRows(misto);

    // Masculinas primeiro (ordem de CATEGORIES), 1ª e 2ª da categoria.
    expect(linhas.map((l) => l.dupla)).toEqual(['Buriti', 'Savana', 'Cerrado']);
    expect(linhas.map((l) => l.posicao_categoria)).toEqual([1, 2, 1]);
  });

  it('exporta as OITO pontuações separadamente', () => {
    const cerrado = rows.find((r) => r.dupla === 'Cerrado');
    const oito = [
      cerrado?.wod1_1a_pontos,
      cerrado?.wod1_1b_pontos,
      cerrado?.wod1_1c_pontos,
      cerrado?.wod1_1d_pontos,
      cerrado?.wod2_2a_pontos,
      cerrado?.wod2_2b_pontos,
      cerrado?.wod2_2c_pontos,
      cerrado?.wod3_pontos,
    ];

    // Todas as oito presentes e numéricas.
    expect(oito.every((p) => typeof p === 'number')).toBe(true);

    // E o total da planilha é exatamente a soma delas.
    const soma = oito.reduce<number>((a, b) => a + (typeof b === 'number' ? b : 0), 0);
    expect(cerrado?.total_pontos).toBe(soma);
  });

  it('exporta as quatro provas do WOD 1 separadamente', () => {
    const cerrado = rows.find((r) => r.dupla === 'Cerrado');
    expect(cerrado?.wod1_1a_strict_press).toBe(180); // 100 + 80
    expect(cerrado?.wod1_1b_back_squat).toBe(330); // 180 + 150
    expect(cerrado?.wod1_1c_deadlift).toBe(420); // 220 + 200
    expect(cerrado?.wod1_1d_carga_total).toBe(930);
    // Cada prova leva sua posição e seus pontos para a planilha.
    expect(cerrado?.wod1_1a_posicao).toBe(1);
    expect(cerrado?.wod1_pontos).toBe(4); // 1º nas quatro provas
  });

  it('inclui dupla, categoria, atletas, os três WODs, total e posição', () => {
    const primeira = rows[0];
    expect(primeira).toMatchObject({
      dupla: expect.any(String),
      categoria: expect.any(String),
      atleta_1: expect.any(String),
      atleta_2: expect.any(String),
    });
    expect(primeira?.wod1_1d_carga_total).toBe(930);
    expect(primeira?.wod2_2c_soma_km).toBe(11.95);
    expect(typeof primeira?.total_pontos).toBe('number');
  });

  it('formata o tempo do WOD 3 como MM:SS', () => {
    const cerrado = rows.find((r) => r.dupla === 'Cerrado');
    expect(cerrado?.wod3_tempo).toBe('14:32');
    expect(cerrado?.wod3_concluiu).toBe('sim');

    const buriti = rows.find((r) => r.dupla === 'Buriti');
    expect(buriti?.wod3_tempo).toBe('20:00');
    expect(buriti?.wod3_concluiu).toBe('não');
    expect(buriti?.wod3_volume).toBe(300);
  });

  it('gera CSV com BOM e ponto e vírgula (abre no Excel em português)', () => {
    const csv = toCsv(rows);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv.split('\r\n')[0]).toContain('dupla;categoria');
    expect(csv.split('\r\n')).toHaveLength(3); // cabeçalho + 2 duplas
  });

  it('escapa valores que contêm o separador', () => {
    const csv = toCsv([{ ...rows[0]!, dupla: 'Dupla; com ponto e vírgula' }]);
    expect(csv).toContain('"Dupla; com ponto e vírgula"');
  });
});
