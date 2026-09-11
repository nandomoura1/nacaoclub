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
    expect(rows[0]?.posicao).toBe(1);
  });

  it('inclui dupla, categoria, atletas, os três WODs, total e posição', () => {
    const primeira = rows[0];
    expect(primeira).toMatchObject({
      dupla: expect.any(String),
      categoria: expect.any(String),
      atleta_1: expect.any(String),
      atleta_2: expect.any(String),
    });
    expect(primeira?.wod1_carga_total).toBe(930);
    expect(primeira?.wod2_soma_km).toBe(11.95);
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
