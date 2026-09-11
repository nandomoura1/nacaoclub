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

  it('maior total = melhor posição; posição vira pontos', () => {
    const teams = [team(1), team(2), team(3)];
    const results = [
      w1('team-1', [100, 80, 180, 150, 220, 200]), // 930
      w1('team-2', [110, 90, 190, 160, 230, 210]), // 990
      w1('team-3', [90, 70, 170, 140, 210, 190]), // 870
    ];
    const scores = scoreWod1(teams, results, { tieMode: settings().tiePointsMode });

    expect(scores.get('team-2')).toMatchObject({ totalLoad: 990, rank: 1, points: 1 });
    expect(scores.get('team-1')).toMatchObject({ totalLoad: 930, rank: 2, points: 2 });
    expect(scores.get('team-3')).toMatchObject({ totalLoad: 870, rank: 3, points: 3 });
  });

  // §26 — empate numérico exato
  it('empate 100/100/95 produz 1º, 1º, 3º e sinaliza decisão manual', () => {
    const teams = [team(1), team(2), team(3)];
    const results = [w1('team-1', [100]), w1('team-2', [100]), w1('team-3', [95])];
    const scores = scoreWod1(teams, results);

    expect(scores.get('team-1')).toMatchObject({ rank: 1, points: 1, tied: true });
    expect(scores.get('team-2')).toMatchObject({ rank: 1, points: 1, tied: true });
    expect(scores.get('team-3')).toMatchObject({ rank: 3, points: 3, tied: false });
  });

  it('modo AVERAGE dá 1,5 ponto para cada dupla empatada', () => {
    const teams = [team(1), team(2), team(3)];
    const results = [w1('team-1', [100]), w1('team-2', [100]), w1('team-3', [95])];
    const scores = scoreWod1(teams, results, { tieMode: 'AVERAGE' });

    expect(scores.get('team-1')?.points).toBe(1.5);
    expect(scores.get('team-2')?.points).toBe(1.5);
    expect(scores.get('team-3')?.points).toBe(3);
  });

  it('dupla sem nenhum lançamento não entra no ranking', () => {
    const teams = [team(1), team(2)];
    const results = [w1('team-1', [100]), w1('team-2', [])];
    const scores = scoreWod1(teams, results);

    expect(scores.get('team-2')).toMatchObject({ rank: null, points: null, hasResult: false });
  });

  // §19 — somente resultados homologados entram no ranking público
  it('ignora resultados em DRAFT no cálculo público', () => {
    const teams = [team(1), team(2)];
    const results = [w1('team-1', [100], { status: 'DRAFT' }), w1('team-2', [90])];
    const scores = scoreWod1(teams, results);

    expect(scores.get('team-1')?.hasResult).toBe(false);
    expect(scores.get('team-2')).toMatchObject({ rank: 1, points: 1 });
  });

  // LOCKED é resultado homologado e travado: continua valendo para o público.
  // O banco também garante isso — travar congela o que foi lançado, mas o
  // motor segue reescrevendo posição e pontos (ver supabase/tests/rls.test.sql).
  it('conta resultado LOCKED normalmente no ranking público', () => {
    const teams = [team(1), team(2)];
    const results = [w1('team-1', [100], { status: 'LOCKED' }), w1('team-2', [90])];
    const scores = scoreWod1(teams, results);

    expect(scores.get('team-1')).toMatchObject({ rank: 1, points: 1, hasResult: true });
    expect(scores.get('team-2')).toMatchObject({ rank: 2, points: 2 });
  });

  it('inclui DRAFT quando o admin pede a prévia', () => {
    const teams = [team(1), team(2)];
    const results = [w1('team-1', [100], { status: 'DRAFT' }), w1('team-2', [90])];
    const scores = scoreWod1(teams, results, { statuses: ['DRAFT', 'PUBLISHED', 'LOCKED'] });

    expect(scores.get('team-1')).toMatchObject({ rank: 1, points: 1 });
  });

  it('dupla desclassificada fica fora do ranking', () => {
    const teams = [team(1, { status: 'DESCLASSIFICADA' }), team(2)];
    const results = [w1('team-1', [999]), w1('team-2', [90])];
    const scores = scoreWod1(teams, results);

    expect(scores.get('team-1')?.hasResult).toBe(false);
    expect(scores.get('team-2')?.rank).toBe(1);
  });
});
