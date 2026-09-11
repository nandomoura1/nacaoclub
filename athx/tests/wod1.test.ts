import { describe, expect, it } from 'vitest';
import { liftBreakdown, scoreWod1, totalLoad } from '@/lib/scoring/wod1';
import { settings, team, w1 } from './helpers';

describe('WOD 1 — STRENGTH', () => {
  // §45 — caso do enunciado
  it('soma as seis cargas: 100+80 + 180+150 + 220+200 = 930', () => {
    const result = w1('team-1', [100, 80, 180, 150, 220, 200]);
    expect(totalLoad(result)).toBe(930);
  });

  it('trata campos não lançados como zero', () => {
    expect(totalLoad(w1('team-1', [100, 80]))).toBe(180);
    expect(totalLoad(w1('team-1', []))).toBe(0);
  });

  it('separa as provas 1A, 1B e 1C', () => {
    expect(liftBreakdown(w1('team-1', [100, 80, 180, 150, 220, 200]))).toEqual({
      strictPress: 180,
      backSquat: 330,
      deadlift: 420,
    });
  });

  it('gera QUATRO rankings — 1A, 1B, 1C e 1D', () => {
    const teams = [team(1), team(2), team(3)];
    // Cada dupla é a melhor em um movimento diferente, de propósito.
    const results = [
      //          SP1  SP2  BS1  BS2  DL1  DL2     1A   1B   1C    1D
      w1('team-1', [60, 40, 80, 70, 100, 90]), // 100  150  190   440
      w1('team-2', [50, 40, 120, 100, 110, 100]), //  90  220  210   520
      w1('team-3', [40, 40, 100, 90, 150, 140]), //  80  190  290   560
    ];
    const scores = scoreWod1(teams, results);

    // 1A — Strict Press
    expect(scores.get('team-1')).toMatchObject({ strictPress: 100, rankStrictPress: 1, pointsStrictPress: 1 });
    expect(scores.get('team-2')).toMatchObject({ strictPress: 90, rankStrictPress: 2, pointsStrictPress: 2 });
    expect(scores.get('team-3')).toMatchObject({ strictPress: 80, rankStrictPress: 3, pointsStrictPress: 3 });

    // 1B — Back Squat
    expect(scores.get('team-2')).toMatchObject({ backSquat: 220, rankBackSquat: 1, pointsBackSquat: 1 });
    expect(scores.get('team-3')).toMatchObject({ backSquat: 190, rankBackSquat: 2, pointsBackSquat: 2 });
    expect(scores.get('team-1')).toMatchObject({ backSquat: 150, rankBackSquat: 3, pointsBackSquat: 3 });

    // 1C — Deadlift
    expect(scores.get('team-3')).toMatchObject({ deadlift: 290, rankDeadlift: 1, pointsDeadlift: 1 });
    expect(scores.get('team-2')).toMatchObject({ deadlift: 210, rankDeadlift: 2, pointsDeadlift: 2 });
    expect(scores.get('team-1')).toMatchObject({ deadlift: 190, rankDeadlift: 3, pointsDeadlift: 3 });

    // 1D — Total de cargas
    expect(scores.get('team-3')).toMatchObject({ totalLoad: 560, rankTotal: 1, pointsTotal: 1 });
    expect(scores.get('team-2')).toMatchObject({ totalLoad: 520, rankTotal: 2, pointsTotal: 2 });
    expect(scores.get('team-1')).toMatchObject({ totalLoad: 440, rankTotal: 3, pointsTotal: 3 });
  });

  it('PONTUAÇÃO DO WOD 1 = Pts 1A + Pts 1B + Pts 1C + Pts 1D', () => {
    const teams = [team(1), team(2), team(3)];
    const results = [
      w1('team-1', [60, 40, 80, 70, 100, 90]),
      w1('team-2', [50, 40, 120, 100, 110, 100]),
      w1('team-3', [40, 40, 100, 90, 150, 140]),
    ];
    const scores = scoreWod1(teams, results, { tieMode: settings().tiePointsMode });

    expect(scores.get('team-1')?.points).toBe(1 + 3 + 3 + 3); // 10
    expect(scores.get('team-2')?.points).toBe(2 + 1 + 2 + 2); // 7
    expect(scores.get('team-3')?.points).toBe(3 + 2 + 1 + 1); // 7
  });

  it('modo TOTAL_ONLY pontua apenas pela prova 1D', () => {
    const teams = [team(1), team(2), team(3)];
    const results = [
      w1('team-1', [60, 40, 80, 70, 100, 90]),
      w1('team-2', [50, 40, 120, 100, 110, 100]),
      w1('team-3', [40, 40, 100, 90, 150, 140]),
    ];
    const scores = scoreWod1(teams, results, { scoringMode: 'TOTAL_ONLY' });

    expect(scores.get('team-3')?.points).toBe(1);
    expect(scores.get('team-2')?.points).toBe(2);
    expect(scores.get('team-1')?.points).toBe(3);
    // As quatro provas continuam registradas, só não somam.
    expect(scores.get('team-1')?.pointsStrictPress).toBe(1);
  });

  // §26 — empate numérico exato
  it('empate 100/100/95 produz 1º, 1º, 3º e sinaliza decisão manual', () => {
    const teams = [team(1), team(2), team(3)];
    // Cargas completas: o empate acontece só onde deve acontecer.
    const results = [
      w1('team-1', [50, 50, 100, 100, 150, 150]), // 1A 100 · 1D 600
      w1('team-2', [50, 50, 100, 100, 150, 150]), // idêntica à team-1
      w1('team-3', [50, 45, 100, 95, 150, 145]), // 1A 95 · 1D 585
    ];
    const scores = scoreWod1(teams, results);

    expect(scores.get('team-1')).toMatchObject({ rankTotal: 1, pointsTotal: 1, tied: true });
    expect(scores.get('team-2')).toMatchObject({ rankTotal: 1, pointsTotal: 1, tied: true });
    expect(scores.get('team-3')).toMatchObject({ rankTotal: 3, pointsTotal: 3, tied: false });

    // Empatadas em TUDO: as duas somam 1+1+1+1 nas quatro provas.
    expect(scores.get('team-1')?.points).toBe(4);
    expect(scores.get('team-3')?.points).toBe(12);
  });

  it('uma prova sem carga lançada deixa todas as duplas empatadas em zero', () => {
    const teams = [team(1), team(2)];
    // Ninguém lançou Deadlift: as duas empatam em 1º na prova 1C.
    const results = [w1('team-1', [60, 40, 100, 90]), w1('team-2', [50, 40, 95, 85])];
    const scores = scoreWod1(teams, results);

    expect(scores.get('team-1')).toMatchObject({ deadlift: 0, rankDeadlift: 1, pointsDeadlift: 1 });
    expect(scores.get('team-2')).toMatchObject({ deadlift: 0, rankDeadlift: 1, pointsDeadlift: 1 });
    // É um empate de verdade e fica sinalizado como tal.
    expect(scores.get('team-1')?.tied).toBe(true);
  });

  it('modo AVERAGE dá 1,5 ponto para cada dupla empatada em cada prova', () => {
    const teams = [team(1), team(2), team(3)];
    const results = [w1('team-1', [100]), w1('team-2', [100]), w1('team-3', [95])];
    const scores = scoreWod1(teams, results, { tieMode: 'AVERAGE' });

    expect(scores.get('team-1')?.pointsTotal).toBe(1.5);
    expect(scores.get('team-2')?.pointsTotal).toBe(1.5);
    expect(scores.get('team-3')?.pointsTotal).toBe(3);
  });

  it('dupla sem nenhum lançamento não entra no ranking', () => {
    const teams = [team(1), team(2)];
    const results = [w1('team-1', [100]), w1('team-2', [])];
    const scores = scoreWod1(teams, results);

    expect(scores.get('team-2')).toMatchObject({ rankTotal: null, points: null, hasResult: false });
  });

  // §19 — somente resultados homologados entram no ranking público
  it('ignora resultados em DRAFT no cálculo público', () => {
    const teams = [team(1), team(2)];
    const results = [w1('team-1', [100], { status: 'DRAFT' }), w1('team-2', [90])];
    const scores = scoreWod1(teams, results);

    expect(scores.get('team-1')?.hasResult).toBe(false);
    expect(scores.get('team-2')).toMatchObject({ rankTotal: 1, points: 4 });
  });

  // LOCKED é resultado homologado e travado: continua valendo para o público.
  // O banco também garante isso — travar congela o que foi lançado, mas o
  // motor segue reescrevendo posição e pontos (ver supabase/tests/rls.test.sql).
  it('conta resultado LOCKED normalmente no ranking público', () => {
    const teams = [team(1), team(2)];
    const results = [w1('team-1', [100], { status: 'LOCKED' }), w1('team-2', [90])];
    const scores = scoreWod1(teams, results);

    expect(scores.get('team-1')).toMatchObject({ rankTotal: 1, hasResult: true });
    expect(scores.get('team-2')).toMatchObject({ rankTotal: 2 });
  });

  it('inclui DRAFT quando o admin pede a prévia', () => {
    const teams = [team(1), team(2)];
    const results = [w1('team-1', [100], { status: 'DRAFT' }), w1('team-2', [90])];
    const scores = scoreWod1(teams, results, { statuses: ['DRAFT', 'PUBLISHED', 'LOCKED'] });

    expect(scores.get('team-1')).toMatchObject({ rankTotal: 1, pointsTotal: 1 });
  });

  it('dupla desclassificada fica fora do ranking', () => {
    const teams = [team(1, { status: 'DESCLASSIFICADA' }), team(2)];
    const results = [w1('team-1', [999]), w1('team-2', [90])];
    const scores = scoreWod1(teams, results);

    expect(scores.get('team-1')?.hasResult).toBe(false);
    expect(scores.get('team-2')?.rankTotal).toBe(1);
  });
});
