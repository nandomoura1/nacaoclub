import { describe, expect, it } from 'vitest';
import { isValidRunKm, scoreWod2, totalKm } from '@/lib/scoring/wod2';
import { team, w2 } from './helpers';

describe('WOD 2 — ENDURANCE', () => {
  // §46 — caso do enunciado
  it('soma corrida + bike: 3.20 + 8.45 = 11.65 km', () => {
    expect(totalKm({ runKm: 3.2, bikeKm: 8.45 })).toBe(11.65);
  });

  it('não acumula erro de ponto flutuante', () => {
    expect(totalKm({ runKm: 0.1, bikeKm: 0.2 })).toBe(0.3);
  });

  // A troca acontece a cada 500 m, mas o AMRAP para no minuto 22 no meio de
  // um trecho: a distância registrada é livre.
  it('aceita qualquer distância de corrida', () => {
    for (const valido of [0, 0.5, 2.41, 3.2, 3.5, 10.375]) {
      expect(isValidRunKm(valido), `${valido} km`).toBe(true);
    }
  });

  it('recusa distância negativa', () => {
    expect(isValidRunKm(-1)).toBe(false);
  });

  it('soma distâncias quebradas sem erro de arredondamento', () => {
    // O caso real: 2.410 m de corrida + 2.590 m de bike = 5,00 km.
    expect(totalKm({ runKm: 2.41, bikeKm: 2.59 })).toBe(5);
  });

  it('gera três rankings independentes e soma os pontos', () => {
    const teams = [team(1), team(2), team(3)];
    const results = [
      w2('team-1', 3.5, 8.45), // total 11.95
      w2('team-2', 4.0, 7.0), //  total 11.00
      w2('team-3', 3.0, 9.5), //  total 12.50
    ];
    const scores = scoreWod2(teams, results);

    // 2A — corrida: team-2 (4.0) > team-1 (3.5) > team-3 (3.0)
    expect(scores.get('team-2')).toMatchObject({ rankRun: 1, pointsRun: 1 });
    expect(scores.get('team-1')).toMatchObject({ rankRun: 2, pointsRun: 2 });
    expect(scores.get('team-3')).toMatchObject({ rankRun: 3, pointsRun: 3 });

    // 2B — bike: team-3 (9.5) > team-1 (8.45) > team-2 (7.0)
    expect(scores.get('team-3')).toMatchObject({ rankBike: 1, pointsBike: 1 });
    expect(scores.get('team-1')).toMatchObject({ rankBike: 2, pointsBike: 2 });
    expect(scores.get('team-2')).toMatchObject({ rankBike: 3, pointsBike: 3 });

    // 2C — soma: team-3 (12.50) > team-1 (11.95) > team-2 (11.00)
    expect(scores.get('team-3')).toMatchObject({ rankTotal: 1, pointsTotal: 1 });
    expect(scores.get('team-1')).toMatchObject({ rankTotal: 2, pointsTotal: 2 });
    expect(scores.get('team-2')).toMatchObject({ rankTotal: 3, pointsTotal: 3 });

    // PONTUAÇÃO DO WOD 2 = 2A + 2B + 2C
    expect(scores.get('team-1')?.points).toBe(2 + 2 + 2); // 6
    expect(scores.get('team-2')?.points).toBe(1 + 3 + 3); // 7
    expect(scores.get('team-3')?.points).toBe(3 + 1 + 1); // 5
  });

  it('empate em uma das provas mantém a mesma posição nas duas duplas', () => {
    const teams = [team(1), team(2)];
    const scores = scoreWod2(teams, [w2('team-1', 3.5, 8.0), w2('team-2', 3.5, 9.0)]);

    expect(scores.get('team-1')).toMatchObject({ rankRun: 1, pointsRun: 1, tied: true });
    expect(scores.get('team-2')).toMatchObject({ rankRun: 1, pointsRun: 1, tied: true });
    expect(scores.get('team-2')?.rankBike).toBe(1);
    expect(scores.get('team-1')?.rankBike).toBe(2);
  });

  it('dupla sem lançamento fica sem pontuação', () => {
    const teams = [team(1), team(2)];
    const scores = scoreWod2(teams, [w2('team-1', 3.5, 8.0), w2('team-2', null, null)]);

    expect(scores.get('team-2')).toMatchObject({ points: null, hasResult: false });
  });
});
