import { describe, expect, it } from 'vitest';
import { buildLeaderboard } from '@/lib/scoring/build';
import { standingsByCategory } from '@/lib/scoring/overall';
import type { Category } from '@/types/domain';
import { settings, team, w1, w2, w3 } from './helpers';
import input from './fixtures/parity-input.json';
import expected from './fixtures/parity-expected.json';

/**
 * PARIDADE ENTRE OS DOIS MOTORES (§25)
 *
 * `parity-expected.json` NÃO foi escrito à mão: é a saída real do motor SQL
 * (supabase/migrations/…_scoring.sql) rodando em um PostgreSQL 16 sobre o
 * dataset de `parity-input.json` — 20 duplas divididas em 5 Masculinas, 6
 * Femininas e 9 Mistas, com empates propositais de carga e de tempo, duplas
 * que não concluíram o WOD 3 e uma distância de corrida fora do múltiplo de
 * 500 m.
 *
 * A divisão desigual (5 · 6 · 9) é de propósito: é ela que prova que cada
 * prova é ranqueada DENTRO da categoria. Se os dois motores ranqueassem as
 * 20 duplas juntas, os tetos de pontuação sairiam iguais nas três e o teste
 * passaria sem provar nada.
 *
 * Este teste roda o motor TypeScript sobre o MESMO dataset e exige resultado
 * idêntico. Se alguém mexer em um dos dois lados sem mexer no outro, quebra
 * aqui — que é exatamente o ponto: o público e o admin nunca podem ver
 * classificações diferentes.
 */

interface Row {
  n: number;
  cat: Category;
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
    teams: rows.map((r) => team(r.n, { category: r.cat })),
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

      // WOD 1 — as quatro provas, uma a uma
      expect(s.wod1?.strictPress, `1A kg dupla ${row.team_number}`).toBe(row.strict_press);
      expect(s.wod1?.rankStrictPress, `1A pos dupla ${row.team_number}`).toBe(row.rank_strict_press);
      expect(s.wod1?.pointsStrictPress, `1A pts dupla ${row.team_number}`).toBe(row.points_strict_press);

      expect(s.wod1?.backSquat, `1B kg dupla ${row.team_number}`).toBe(row.back_squat);
      expect(s.wod1?.rankBackSquat, `1B pos dupla ${row.team_number}`).toBe(row.rank_back_squat);
      expect(s.wod1?.pointsBackSquat, `1B pts dupla ${row.team_number}`).toBe(row.points_back_squat);

      expect(s.wod1?.deadlift, `1C kg dupla ${row.team_number}`).toBe(row.deadlift);
      expect(s.wod1?.rankDeadlift, `1C pos dupla ${row.team_number}`).toBe(row.rank_deadlift);
      expect(s.wod1?.pointsDeadlift, `1C pts dupla ${row.team_number}`).toBe(row.points_deadlift);

      expect(s.wod1?.totalLoad, `1D kg dupla ${row.team_number}`).toBe(row.total_load);
      expect(s.wod1?.rankTotal, `1D pos dupla ${row.team_number}`).toBe(row.wod1_rank_total);
      expect(s.wod1?.pointsTotal, `1D pts dupla ${row.team_number}`).toBe(row.points_total);

      // PONTUAÇÃO DO WOD 1 = 1A + 1B + 1C + 1D
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

  it('coloca cada dupla na mesma posição de categoria que o banco', () => {
    for (const categoria of ['MASCULINA', 'FEMININA', 'MISTA'] as const) {
      const naCategoria = standingsByCategory(board.standings, categoria);
      for (const row of naCategoria) {
        const esperado = expected.find((e) => e.team_number === row.team.teamNumber);
        expect(esperado, `dupla ${row.team.teamNumber}`).toBeDefined();
        expect(esperado?.category, `categoria da dupla ${row.team.teamNumber}`).toBe(categoria);
        expect(row.position, `posição na categoria da dupla ${row.team.teamNumber}`).toBe(
          esperado?.category_position,
        );
      }
    }
  });

  it('nenhuma pontuação de prova passa do tamanho da categoria', () => {
    for (const categoria of ['MASCULINA', 'FEMININA', 'MISTA'] as const) {
      const naCategoria = standingsByCategory(board.standings, categoria);
      const teto = naCategoria.length;

      for (const row of naCategoria) {
        const pontos = [
          row.wod1?.pointsStrictPress,
          row.wod1?.pointsBackSquat,
          row.wod1?.pointsDeadlift,
          row.wod1?.pointsTotal,
          row.wod2?.pointsRun,
          row.wod2?.pointsBike,
          row.wod2?.pointsTotal,
          row.wod3?.points,
        ];
        for (const pts of pontos) {
          if (pts === null || pts === undefined) continue;
          expect(pts, `dupla ${row.team.teamNumber} em ${categoria}`).toBeLessThanOrEqual(teto);
        }
      }
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
