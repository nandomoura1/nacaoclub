import { describe, expect, it } from 'vitest';
import { buildLeaderboard } from '@/lib/scoring/build';
import { settings, team, w1, w2, w3 } from './helpers';
import input from './fixtures/parity-input.json';
import expected from './fixtures/parity-expected.json';

/**
 * PARIDADE ENTRE OS DOIS MOTORES (§25)
 *
 * `parity-expected.json` NÃO foi escrito à mão: é a saída real do motor SQL
 * (supabase/migrations/…_scoring.sql) rodando em um PostgreSQL 16 sobre o
 * dataset de `parity-input.json` — 20 duplas, empates propositais de carga e
 * de tempo, e duplas que não concluíram o WOD 3.
 *
 * Este teste roda o motor TypeScript sobre o MESMO dataset e exige resultado
 * idêntico. Se alguém mexer em um dos dois lados sem mexer no outro, quebra
 * aqui — que é exatamente o ponto: o público e o admin nunca podem ver
 * classificações diferentes.
 */

interface Row {
  n: number;
  sp1: number;
  sp2: number;
  bs1: number;
  bs2: number;
  dl1: number;
  dl2: number;
  runKm: number;
  bikeKm: number;
  finished: boolean;
  time: number;
  volume: number | null;
}

const rows = input as Row[];

describe('Motor TypeScript × motor SQL', () => {
  const board = buildLeaderboard({
    teams: rows.map((r) => team(r.n)),
    wod1: rows.map((r) => w1(`team-${r.n}`, [r.sp1, r.sp2, r.bs1, r.bs2, r.dl1, r.dl2])),
    wod2: rows.map((r) => w2(`team-${r.n}`, r.runKm, r.bikeKm)),
    wod3: rows.map((r) =>
      w3(`team-${r.n}`, r.time, r.finished, { volumeCompleted: r.volume }),
    ),
    settings: settings(),
  });

  const byNumber = new Map(board.standings.map((s) => [s.team.teamNumber, s]));

  it('produz a mesma classificação geral que o PostgreSQL', () => {
    const actual = board.standings.map((s) => ({
      team_number: s.team.teamNumber,
      position: s.position,
      total_points: s.totalPoints,
    }));

    const want = expected.map((e) => ({
      team_number: e.team_number,
      position: e.position,
      total_points: e.total_points,
    }));

    expect(actual).toEqual(want);
  });

  it('produz as mesmas posições e pontos em cada WOD', () => {
    for (const row of expected) {
      const s = byNumber.get(row.team_number);
      expect(s, `dupla ${row.team_number}`).toBeDefined();
      if (!s) continue;

      expect(s.wod1?.totalLoad, `carga total dupla ${row.team_number}`).toBe(row.total_load);
      expect(s.wod1?.rank, `WOD1 rank dupla ${row.team_number}`).toBe(row.wod1_rank);
      expect(s.wod1?.points, `WOD1 pts dupla ${row.team_number}`).toBe(row.wod1_points);

      expect(s.wod2?.totalKm, `WOD2 km dupla ${row.team_number}`).toBe(row.total_km);
      expect(s.wod2?.rankRun, `2A dupla ${row.team_number}`).toBe(row.rank_run);
      expect(s.wod2?.rankBike, `2B dupla ${row.team_number}`).toBe(row.rank_bike);
      expect(s.wod2?.rankTotal, `2C dupla ${row.team_number}`).toBe(row.rank_total);
      expect(s.wod2?.points, `WOD2 pts dupla ${row.team_number}`).toBe(row.wod2_points);

      expect(s.wod3?.rank, `WOD3 rank dupla ${row.team_number}`).toBe(row.wod3_rank);
      expect(s.wod3?.points, `WOD3 pts dupla ${row.team_number}`).toBe(row.wod3_points);
      expect(s.wod3?.needsDecision, `WOD3 decisão dupla ${row.team_number}`).toBe(
        row.needs_decision,
      );
    }
  });

  it('marca os mesmos empates que o banco', () => {
    for (const row of expected) {
      expect(byNumber.get(row.team_number)?.tied, `empate dupla ${row.team_number}`).toBe(
        row.tied,
      );
    }
  });
});
