import { describe, expect, it } from 'vitest';
import { buildLeaderboard } from '@/lib/scoring/build';
import { standingsByCategory } from '@/lib/scoring/overall';
import { settings, team, w1, w2, w3 } from './helpers';

/**
 * CRITÉRIOS DE DESEMPATE (§15)
 *
 * A organização escolhe em /admin/settings e o sistema APLICA. Antes desta
 * versão o campo era texto livre: registrava a regra e a classificação
 * continuava mostrando EMPATE.
 */

/**
 * Três duplas masculinas com EXATAMENTE a mesma pontuação total (12), que só
 * o WOD 3 separa.
 *
 *   WOD 1   as cargas por movimento se cruzam de propósito: a soma das seis
 *           é 600 nas três (1D empata), mas 1A, 1B e 1C ordenam diferente,
 *           dando 6 · 7 · 8 pontos
 *   WOD 2   idêntico nas três → 3 pontos para cada
 *   WOD 3   800 s · 900 s · 1000 s → 1 · 2 · 3 pontos
 *
 *   dupla 1  6 + 3 + 3 = 12     (3ª no WOD 3)
 *   dupla 2  8 + 3 + 1 = 12     (1ª no WOD 3)
 *   dupla 3  7 + 3 + 2 = 12     (2ª no WOD 3)
 */
function cenarioEmpate() {
  return {
    teams: [1, 2, 3].map((n) => team(n, { category: 'MASCULINA' })),
    wod1: [
      w1('team-1', [125, 125, 50, 50, 125, 125]), // press 250 · squat 100 · dead 250
      w1('team-2', [75, 75, 150, 150, 75, 75]), //  press 150 · squat 300 · dead 150
      w1('team-3', [100, 100, 100, 100, 100, 100]), // press 200 · squat 200 · dead 200
    ],
    wod2: [w2('team-1', 5, 10), w2('team-2', 5, 10), w2('team-3', 5, 10)],
    wod3: [w3('team-1', 1000), w3('team-2', 800), w3('team-3', 900)],
  };
}

/** O padrão do evento é WOD3; para testar o caso "nenhum" é preciso pedir. */
const semCriterio = () => settings({ tieBreaker1: 'NENHUM' });

describe('O cenário de teste é mesmo um empate', () => {
  it('as três duplas somam 12 pontos', () => {
    const board = buildLeaderboard({ ...cenarioEmpate(), settings: semCriterio() });
    expect(board.standings.map((r) => r.totalPoints)).toEqual([12, 12, 12]);
  });
});

describe('Com a organização optando por NENHUM', () => {
  const board = buildLeaderboard({ ...cenarioEmpate(), settings: semCriterio() });

  it('as três dividem a 1ª posição e ficam marcadas para decisão manual', () => {
    expect(board.standings.map((r) => r.position)).toEqual([1, 1, 1]);
    expect(board.standings.every((r) => r.tied)).toBe(true);
    expect(board.standings.every((r) => r.needsDecision)).toBe(true);
    expect(board.standings.every((r) => r.desempatadoPor === null)).toBe(true);
  });
});

describe('Critério: melhor colocação no WOD 3', () => {
  const board = buildLeaderboard({
    ...cenarioEmpate(),
    settings: settings({ tieBreaker1: 'WOD3' }),
  });

  it('ordena pela colocação no WOD 3', () => {
    expect(board.standings.map((r) => r.team.id)).toEqual(['team-2', 'team-3', 'team-1']);
    expect(board.standings.map((r) => r.position)).toEqual([1, 2, 3]);
  });

  it('ninguém continua empatado nem aguardando decisão', () => {
    expect(board.standings.every((r) => !r.tied)).toBe(true);
    expect(board.standings.every((r) => !r.needsDecision)).toBe(true);
  });

  it('registra qual critério resolveu, para a tela poder explicar', () => {
    expect(board.standings.every((r) => r.desempatadoPor === 'WOD3')).toBe(true);
  });

  it('o total continua 12 nas três — o desempate ordena, não pontua', () => {
    expect(board.standings.map((r) => r.totalPoints)).toEqual([12, 12, 12]);
  });
});

describe('Critério: melhor colocação no WOD 1', () => {
  it('o mesmo empate, outro critério, outra ordem', () => {
    const board = buildLeaderboard({
      ...cenarioEmpate(),
      settings: settings({ tieBreaker1: 'WOD1' }),
    });

    // No WOD 1 a ordem é 6 · 7 · 8 → dupla 1, dupla 3, dupla 2.
    expect(board.standings.map((r) => r.team.id)).toEqual(['team-1', 'team-3', 'team-2']);
    expect(board.standings[0]?.desempatadoPor).toBe('WOD1');
  });
});

describe('O desempate vale também dentro da categoria', () => {
  it('a classificação da categoria herda a ordem desempatada', () => {
    const base = cenarioEmpate();
    // Uma dupla mista no meio da classificação geral, para provar que o
    // recorte por categoria acontece DEPOIS e não refaz o desempate.
    const board = buildLeaderboard({
      teams: [...base.teams, team(9, { category: 'MISTA' })],
      wod1: [...base.wod1, w1('team-9', [90, 90, 90, 90, 90, 90])],
      wod2: [...base.wod2, w2('team-9', 4, 9)],
      wod3: [...base.wod3, w3('team-9', 950)],
      settings: settings({ tieBreaker1: 'WOD3' }),
    });

    const masculinas = standingsByCategory(board.standings, 'MASCULINA');

    expect(masculinas.map((r) => r.team.id)).toEqual(['team-2', 'team-3', 'team-1']);
    expect(masculinas.map((r) => r.position)).toEqual([1, 2, 3]);
    expect(masculinas.every((r) => !r.tied)).toBe(true);
  });

  it('com NENHUM, a categoria continua mostrando as três empatadas em 1º', () => {
    const board = buildLeaderboard({ ...cenarioEmpate(), settings: semCriterio() });
    const masculinas = standingsByCategory(board.standings, 'MASCULINA');

    expect(masculinas.map((r) => r.position)).toEqual([1, 1, 1]);
    expect(masculinas.every((r) => r.needsDecision)).toBe(true);
  });
});

describe('Critérios em cascata', () => {
  /**
   * Duas duplas com 11 pontos cada, empatadas também no WOD 3 (mesmo tempo).
   * O WOD 2 é o único que as separa.
   */
  const entrada = {
    teams: [1, 2].map((n) => team(n, { category: 'MASCULINA' })),
    wod1: [
      w1('team-1', [100, 100, 50, 50, 100, 100]), // 500 kg · WOD 1 = 5
      w1('team-2', [75, 75, 90, 90, 75, 75]), //     480 kg · WOD 1 = 7
    ],
    wod2: [
      w2('team-1', 5, 10), // 15 km · WOD 2 = 5
      w2('team-2', 6, 10), // 16 km · WOD 2 = 3
    ],
    wod3: [w3('team-1', 900), w3('team-2', 900)], // empatadas: 1 ponto cada
  };

  it('o cenário empata em 11 pontos e também no WOD 3', () => {
    const board = buildLeaderboard({ ...entrada, settings: semCriterio() });
    expect(board.standings.map((r) => r.totalPoints)).toEqual([11, 11]);
  });

  it('só o WOD 3 não resolve: o empate continua de pé', () => {
    const board = buildLeaderboard({
      ...entrada,
      settings: settings({ tieBreaker1: 'WOD3' }),
    });
    expect(board.standings.every((r) => r.tied)).toBe(true);
    expect(board.standings.every((r) => r.needsDecision)).toBe(true);
  });

  it('o critério 2 entra quando o 1 empata', () => {
    const board = buildLeaderboard({
      ...entrada,
      settings: settings({ tieBreaker1: 'WOD3', tieBreaker2: 'WOD2' }),
    });

    expect(board.standings[0]?.team.id).toBe('team-2');
    expect(board.standings.every((r) => !r.tied)).toBe(true);
    expect(board.standings[0]?.desempatadoPor).toBe('WOD2');
  });
});

describe('O critério não mexe em quem não estava empatado', () => {
  it('duplas com totais diferentes ficam como estavam', () => {
    const board = buildLeaderboard({
      teams: [1, 2].map((n) => team(n, { category: 'MASCULINA' })),
      wod1: [
        w1('team-1', [100, 100, 100, 100, 100, 100]),
        w1('team-2', [50, 50, 50, 50, 50, 50]),
      ],
      wod2: [w2('team-1', 6, 11), w2('team-2', 5, 10)],
      // A dupla 2 vence o WOD 3, mas já perdeu os outros dois por pontos.
      wod3: [w3('team-1', 800), w3('team-2', 1000)],
      settings: settings({ tieBreaker1: 'WOD3' }),
    });

    expect(board.standings[0]?.team.id).toBe('team-1');
    expect(board.standings.every((r) => r.desempatadoPor === null)).toBe(true);
  });
});

describe('O padrão do evento', () => {
  it('sem nada configurado, o desempate já é o WOD 3', () => {
    const board = buildLeaderboard({ ...cenarioEmpate(), settings: settings() });

    expect(board.standings.map((r) => r.team.id)).toEqual(['team-2', 'team-3', 'team-1']);
    expect(board.standings.every((r) => r.desempatadoPor === 'WOD3')).toBe(true);
  });
});

describe('Texto livre antigo não vira critério', () => {
  it('o motor ignora o que não for um código conhecido', () => {
    const board = buildLeaderboard({
      ...cenarioEmpate(),
      // É o que estava guardado antes: uma frase, não um código.
      settings: settings({ tieBreaker1: 'Melhor colocação no WOD 3' as never }),
    });

    // O sistema não adivinha o que a frase queria dizer. Aqui a frase chega
    // direto ao motor (o serviço já a teria trocado pelo padrão do evento):
    // como não é um código, nenhum valor é comparado e o empate fica de pé.
    expect(board.standings.every((r) => r.tied)).toBe(true);
    expect(board.standings.every((r) => r.needsDecision)).toBe(true);
  });
});
