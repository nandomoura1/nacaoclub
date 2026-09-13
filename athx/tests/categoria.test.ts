import { describe, expect, it } from 'vitest';
import { buildLeaderboard } from '@/lib/scoring/build';
import { scoreWod1, scoreWod2, scoreWod3 } from '@/lib/scoring';
import { settings, team, w1, w2, w3 } from './helpers';

/**
 * A DISPUTA É DENTRO DA CATEGORIA.
 *
 * Regra dita pela organização: se a Dupla Masculina tem 5 duplas, o máximo
 * que uma dupla masculina pode receber numa prova é 5 pontos. O tamanho da
 * Feminina não pode influenciar a pontuação da Masculina — e vice-versa.
 */

/** 5 masculinas (cargas decrescentes) + 3 femininas (cargas decrescentes). */
function cenario() {
  const masculinas = [1, 2, 3, 4, 5].map((n) => team(n, { category: 'MASCULINA' }));
  const femininas = [6, 7, 8].map((n) => team(n, { category: 'FEMININA' }));
  return [...masculinas, ...femininas];
}

describe('WOD 1 — cada prova é ranqueada dentro da categoria', () => {
  const teams = cenario();

  // Masculinas: 200, 190, 180, 170, 160 kg de strict press (dupla 1 é a mais forte)
  // Femininas:  120, 110, 100 kg
  const results = [
    w1('team-1', [100, 100, 100, 100, 100, 100]),
    w1('team-2', [95, 95, 95, 95, 95, 95]),
    w1('team-3', [90, 90, 90, 90, 90, 90]),
    w1('team-4', [85, 85, 85, 85, 85, 85]),
    w1('team-5', [80, 80, 80, 80, 80, 80]),
    w1('team-6', [60, 60, 60, 60, 60, 60]),
    w1('team-7', [55, 55, 55, 55, 55, 55]),
    w1('team-8', [50, 50, 50, 50, 50, 50]),
  ];

  const scores = scoreWod1(teams, results);

  it('a última masculina recebe 5 pontos em 1A, não 8', () => {
    expect(scores.get('team-5')?.pointsStrictPress).toBe(5);
    expect(scores.get('team-5')?.rankStrictPress).toBe(5);
  });

  it('a última feminina recebe 3 pontos em 1A — o tamanho da categoria dela', () => {
    expect(scores.get('team-8')?.pointsStrictPress).toBe(3);
    expect(scores.get('team-8')?.rankStrictPress).toBe(3);
  });

  it('cada categoria tem o seu 1º lugar', () => {
    expect(scores.get('team-1')?.rankStrictPress).toBe(1);
    expect(scores.get('team-6')?.rankStrictPress).toBe(1);
  });

  it('nenhuma pontuação de prova passa do tamanho da categoria', () => {
    for (const t of teams) {
      const s = scores.get(t.id);
      const teto = t.category === 'MASCULINA' ? 5 : 3;
      for (const pts of [
        s?.pointsStrictPress,
        s?.pointsBackSquat,
        s?.pointsDeadlift,
        s?.pointsTotal,
      ]) {
        expect(pts).not.toBeNull();
        expect(pts!).toBeLessThanOrEqual(teto);
      }
    }
  });

  it('1º em tudo na categoria = 4 pontos no WOD 1', () => {
    expect(scores.get('team-1')?.points).toBe(4);
    expect(scores.get('team-6')?.points).toBe(4);
  });
});

describe('WOD 2 — as três provas também são por categoria', () => {
  const teams = cenario();
  const results = [
    w2('team-1', 5, 12),
    w2('team-2', 4.5, 11),
    w2('team-3', 4, 10),
    w2('team-4', 3.5, 9),
    w2('team-5', 3, 8),
    w2('team-6', 2.5, 7),
    w2('team-7', 2, 6),
    w2('team-8', 1.5, 5),
  ];

  const scores = scoreWod2(teams, results);

  it('a última masculina fica com 5 pontos em cada prova', () => {
    const s = scores.get('team-5');
    expect(s?.pointsRun).toBe(5);
    expect(s?.pointsBike).toBe(5);
    expect(s?.pointsTotal).toBe(5);
    expect(s?.points).toBe(15);
  });

  it('a última feminina fica com 3, mesmo tendo a menor distância do evento', () => {
    const s = scores.get('team-8');
    expect(s?.pointsRun).toBe(3);
    expect(s?.pointsBike).toBe(3);
    expect(s?.points).toBe(9);
  });
});

describe('WOD 3 — quem não concluiu fica atrás de quem concluiu NA CATEGORIA', () => {
  const teams = cenario();

  // Masculinas: 3 concluíram, 2 não. Femininas: 1 concluiu, 2 não.
  const results = [
    w3('team-1', 800),
    w3('team-2', 850),
    w3('team-3', 900),
    w3('team-4', null, false, { volumeCompleted: 300 }),
    w3('team-5', null, false, { volumeCompleted: 200 }),
    w3('team-6', 1000),
    w3('team-7', null, false, { volumeCompleted: 150 }),
    w3('team-8', null, false, { volumeCompleted: 100 }),
  ];

  it('PENDING_DEFINITION conta os finalizadores da própria categoria', () => {
    const scores = scoreWod3(teams, results);

    // Masculina: 3 concluíram -> os incompletos entram na 4ª posição
    expect(scores.get('team-4')?.rank).toBe(4);
    expect(scores.get('team-5')?.rank).toBe(4);

    // Feminina: 1 concluiu -> os incompletos entram na 2ª, não na 4ª
    expect(scores.get('team-7')?.rank).toBe(2);
    expect(scores.get('team-8')?.rank).toBe(2);
  });

  it('TIED_LAST usa o tamanho da categoria como última posição', () => {
    const scores = scoreWod3(teams, results, { dnfPolicy: 'TIED_LAST' });
    expect(scores.get('team-5')?.points).toBe(5); // 5 masculinas
    expect(scores.get('team-8')?.points).toBe(3); // 3 femininas
  });

  it('VOLUME_DESC desempata por volume dentro da categoria', () => {
    const scores = scoreWod3(teams, results, { dnfPolicy: 'VOLUME_DESC' });
    expect(scores.get('team-4')?.rank).toBe(4); // maior volume entre as masculinas
    expect(scores.get('team-5')?.rank).toBe(5);
    expect(scores.get('team-7')?.rank).toBe(2); // maior volume entre as femininas
    expect(scores.get('team-8')?.rank).toBe(3);
  });
});

describe('Dupla desclassificada não conta para o teto da categoria', () => {
  it('com uma das 5 masculinas fora, o teto vira 4', () => {
    const teams = [
      ...[1, 2, 3, 4].map((n) => team(n, { category: 'MASCULINA' })),
      team(5, { category: 'MASCULINA', status: 'DESCLASSIFICADA' }),
    ];
    const results = [100, 95, 90, 85, 80].map((kg, i) =>
      w1(`team-${i + 1}`, [kg, kg, kg, kg, kg, kg]),
    );

    const scores = scoreWod1(teams, results);
    expect(scores.get('team-4')?.pointsStrictPress).toBe(4);
    expect(scores.get('team-5')?.pointsStrictPress).toBeNull();
  });
});

describe('Total da competição', () => {
  it('vencer as oito provas da categoria dá 8 pontos', () => {
    const teams = cenario();

    const board = buildLeaderboard({
      teams,
      wod1: [
        w1('team-1', [100, 100, 100, 100, 100, 100]),
        w1('team-2', [90, 90, 90, 90, 90, 90]),
        w1('team-3', [80, 80, 80, 80, 80, 80]),
        w1('team-4', [70, 70, 70, 70, 70, 70]),
        w1('team-5', [60, 60, 60, 60, 60, 60]),
        w1('team-6', [55, 55, 55, 55, 55, 55]),
        w1('team-7', [50, 50, 50, 50, 50, 50]),
        w1('team-8', [45, 45, 45, 45, 45, 45]),
      ],
      wod2: [
        w2('team-1', 5, 12),
        w2('team-2', 4.5, 11),
        w2('team-3', 4, 10),
        w2('team-4', 3.5, 9),
        w2('team-5', 3, 8),
        w2('team-6', 2.5, 7),
        w2('team-7', 2, 6),
        w2('team-8', 1.5, 5),
      ],
      wod3: [
        w3('team-1', 800),
        w3('team-2', 850),
        w3('team-3', 900),
        w3('team-4', 950),
        w3('team-5', 1000),
        w3('team-6', 1050),
        w3('team-7', 1100),
        w3('team-8', 1150),
      ],
      settings: settings(),
    });

    const porId = new Map(board.standings.map((s) => [s.team.id, s]));

    // 1A+1B+1C+1D+2A+2B+2C+3 = oito primeiros lugares
    expect(porId.get('team-1')?.totalPoints).toBe(8);
    expect(porId.get('team-6')?.totalPoints).toBe(8);

    // A última masculina: oito quintos lugares
    expect(porId.get('team-5')?.totalPoints).toBe(40);
    // A última feminina: oito terceiros lugares — não oito oitavos
    expect(porId.get('team-8')?.totalPoints).toBe(24);
  });
});
