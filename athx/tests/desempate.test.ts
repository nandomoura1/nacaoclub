import { describe, expect, it } from 'vitest';
import { buildLeaderboard } from '@/lib/scoring/build';
import { standingsByCategory } from '@/lib/scoring/overall';
import { cargas, cenario, distancias, settings, team, tempo } from './helpers';

/**
 * CRITÉRIOS DE DESEMPATE (§15)
 *
 * A organização escolhe em /admin/settings e o sistema APLICA — e aplica
 * APENAS na classificação de cada categoria. A classificação geral mistura
 * as três e não é disputada por ninguém.
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
 */
function cenarioEmpate() {
  return cenario({
    teams: [1, 2, 3].map((n) => team(n, { category: 'MASCULINA' })),
    wod1: [
      ...cargas('team-1', [125, 125, 50, 50, 125, 125]), // press 250 · squat 100 · dead 250
      ...cargas('team-2', [75, 75, 150, 150, 75, 75]), //   press 150 · squat 300 · dead 150
      ...cargas('team-3', [100, 100, 100, 100, 100, 100]), // press 200 · squat 200 · dead 200
    ],
    wod2: [
      ...distancias('team-1', 5, 10),
      ...distancias('team-2', 5, 10),
      ...distancias('team-3', 5, 10),
    ],
    wod3: [tempo('team-1', 1000), tempo('team-2', 800), tempo('team-3', 900)],
  });
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
  // A disputa é na categoria: é essa lista que o pódio usa.
  const masculinas = standingsByCategory(board.standings, 'MASCULINA');

  it('ordena a categoria pela colocação no WOD 3', () => {
    expect(masculinas.map((r) => r.team.id)).toEqual(['team-2', 'team-3', 'team-1']);
    expect(masculinas.map((r) => r.position)).toEqual([1, 2, 3]);
  });

  it('a classificação geral continua sem desempate: as três dividem o 1º', () => {
    expect(board.standings.map((r) => r.position)).toEqual([1, 1, 1]);
  });

  it('ninguém continua empatado nem aguardando decisão', () => {
    expect(masculinas.every((r) => !r.tied)).toBe(true);
    expect(masculinas.every((r) => !r.needsDecision)).toBe(true);
  });

  it('registra qual critério resolveu, para a tela poder explicar', () => {
    expect(masculinas.every((r) => r.desempatadoPor === 'WOD3')).toBe(true);
  });

  it('o total continua 12 nas três — o desempate ordena, não pontua', () => {
    expect(masculinas.map((r) => r.totalPoints)).toEqual([12, 12, 12]);
  });
});

describe('Critério: melhor colocação no WOD 1', () => {
  it('o mesmo empate, outro critério, outra ordem', () => {
    const board = buildLeaderboard({
      ...cenarioEmpate(),
      settings: settings({ tieBreaker1: 'WOD1' }),
    });

    const masculinas = standingsByCategory(board.standings, 'MASCULINA');
    // No WOD 1 a ordem é 6 · 7 · 8 → dupla 1, dupla 3, dupla 2.
    expect(masculinas.map((r) => r.team.id)).toEqual(['team-1', 'team-3', 'team-2']);
    expect(masculinas[0]?.desempatadoPor).toBe('WOD1');
  });
});

describe('O critério NÃO age na classificação geral', () => {
  it('duplas com o mesmo total dividem a posição geral, mesmo com critério ativo', () => {
    const board = buildLeaderboard({
      ...cenarioEmpate(),
      settings: settings({ tieBreaker1: 'WOD3' }),
    });

    expect(board.standings.map((r) => r.position)).toEqual([1, 1, 1]);
    expect(standingsByCategory(board.standings, 'MASCULINA').map((r) => r.position)).toEqual([
      1, 2, 3,
    ]);
  });

  it('dupla de outra categoria não interfere no desempate da categoria', () => {
    const base = cenarioEmpate();

    const sozinhas = standingsByCategory(
      buildLeaderboard({ ...base, settings: settings({ tieBreaker1: 'WOD3' }) }).standings,
      'MASCULINA',
    );

    // A mesma disputa masculina, agora com uma dupla mista no meio do evento.
    const comMista = standingsByCategory(
      buildLeaderboard(
        cenario({
          teams: [...base.teams, team(9, { category: 'MISTA' })],
          wod1: [
            ...base.results.filter((r) => r.valorAtleta1 !== null || r.valorAtleta2 !== null),
            ...cargas('team-9', [130, 130, 40, 40, 130, 130]),
          ],
          wod2: [
            ...base.results.filter((r) => r.valor !== null && r.valor < 100),
            ...distancias('team-9', 7, 12),
          ],
          wod3: [
            tempo('team-1', 1000),
            tempo('team-2', 800),
            tempo('team-3', 900),
            tempo('team-9', 850),
          ],
          settings: settings({ tieBreaker1: 'WOD3' }),
        }),
      ).standings,
      'MASCULINA',
    );

    expect(comMista.map((r) => r.team.id)).toEqual(sozinhas.map((r) => r.team.id));
    expect(comMista.map((r) => r.position)).toEqual(sozinhas.map((r) => r.position));
  });
});

describe('Critérios em cascata', () => {
  /**
   * Duas duplas com 11 pontos cada, empatadas também no WOD 3 (mesmo tempo).
   * O WOD 2 é o único que as separa.
   */
  const entrada = () =>
    cenario({
      teams: [1, 2].map((n) => team(n, { category: 'MASCULINA' })),
      wod1: [
        ...cargas('team-1', [100, 100, 50, 50, 100, 100]), // 500 kg · WOD 1 = 5
        ...cargas('team-2', [75, 75, 90, 90, 75, 75]), //     480 kg · WOD 1 = 7
      ],
      wod2: [
        ...distancias('team-1', 5, 10), // 15 km · WOD 2 = 5
        ...distancias('team-2', 6, 10), // 16 km · WOD 2 = 3
      ],
      wod3: [tempo('team-1', 900), tempo('team-2', 900)], // empatadas: 1 ponto cada
    });

  it('o cenário empata em 11 pontos e também no WOD 3', () => {
    const board = buildLeaderboard({ ...entrada(), settings: semCriterio() });
    expect(board.standings.map((r) => r.totalPoints)).toEqual([11, 11]);
  });

  it('só o WOD 3 não resolve: o empate continua de pé', () => {
    const board = buildLeaderboard({
      ...entrada(),
      settings: settings({ tieBreaker1: 'WOD3' }),
    });
    expect(board.standings.every((r) => r.tied)).toBe(true);
    expect(board.standings.every((r) => r.needsDecision)).toBe(true);
  });

  it('o critério 2 entra quando o 1 empata', () => {
    const board = buildLeaderboard({
      ...entrada(),
      settings: settings({ tieBreaker1: 'WOD3', tieBreaker2: 'WOD2' }),
    });

    const masculinas = standingsByCategory(board.standings, 'MASCULINA');
    expect(masculinas[0]?.team.id).toBe('team-2');
    expect(masculinas.every((r) => !r.tied)).toBe(true);
    expect(masculinas[0]?.desempatadoPor).toBe('WOD2');
  });
});

describe('O critério não mexe em quem não estava empatado', () => {
  it('duplas com totais diferentes ficam como estavam', () => {
    const board = buildLeaderboard(
      cenario({
        teams: [1, 2].map((n) => team(n, { category: 'MASCULINA' })),
        wod1: [
          ...cargas('team-1', [100, 100, 100, 100, 100, 100]),
          ...cargas('team-2', [50, 50, 50, 50, 50, 50]),
        ],
        wod2: [...distancias('team-1', 6, 11), ...distancias('team-2', 5, 10)],
        // A dupla 2 vence o WOD 3, mas já perdeu os outros dois por pontos.
        wod3: [tempo('team-1', 800), tempo('team-2', 1000)],
        settings: settings({ tieBreaker1: 'WOD3' }),
      }),
    );

    expect(board.standings[0]?.team.id).toBe('team-1');
    expect(board.standings.every((r) => r.desempatadoPor === null)).toBe(true);
  });
});

describe('O padrão do evento', () => {
  it('sem nada configurado, o desempate já é o WOD 3', () => {
    const board = buildLeaderboard({ ...cenarioEmpate(), settings: settings() });
    const masculinas = standingsByCategory(board.standings, 'MASCULINA');

    expect(masculinas.map((r) => r.team.id)).toEqual(['team-2', 'team-3', 'team-1']);
    expect(masculinas.every((r) => r.desempatadoPor === 'WOD3')).toBe(true);
  });

  it('critério que aponta para um WOD inexistente não desempata nada', () => {
    const board = buildLeaderboard({
      ...cenarioEmpate(),
      settings: settings({ tieBreaker1: 'WOD9' }),
    });
    expect(board.standings.every((r) => r.tied)).toBe(true);
  });
});
