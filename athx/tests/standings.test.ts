import { describe, expect, it } from 'vitest';
import { buildLeaderboard } from '@/lib/scoring/build';
import { standingsByCategory } from '@/lib/scoring/overall';
import { settings, team, w1, w2, w3 } from './helpers';

describe('Classificação geral', () => {
  // §14 — exemplo do enunciado: 2 + 4 + 1 = 7
  it('soma os pontos dos três WODs; menor total = melhor posição', () => {
    const teams = [team(1), team(2), team(3)];

    const board = buildLeaderboard({
      teams,
      // WOD 1: t2 (990) 1º=1, t1 (930) 2º=2, t3 (870) 3º=3
      wod1: [
        w1('team-1', [100, 80, 180, 150, 220, 200]),
        w1('team-2', [110, 90, 190, 160, 230, 210]),
        w1('team-3', [90, 70, 170, 140, 210, 190]),
      ],
      // WOD 2
      wod2: [w2('team-1', 3.5, 8.45), w2('team-2', 4.0, 7.0), w2('team-3', 3.0, 9.5)],
      // WOD 3: t1 1º, t2 2º, t3 3º
      wod3: [w3('team-1', 838), w3('team-2', 872), w3('team-3', 910)],
      settings: settings(),
    });

    const t1 = board.standings.find((r) => r.team.id === 'team-1');
    expect(t1?.wod1?.points).toBe(2);
    expect(t1?.wod2?.points).toBe(6);
    expect(t1?.wod3?.points).toBe(1);
    expect(t1?.totalPoints).toBe(9);

    const totals = board.standings.map((r) => r.totalPoints);
    expect(totals).toEqual([...totals].sort((a, b) => a - b));
    expect(board.standings[0]?.position).toBe(1);
  });

  it('reproduz o exemplo 2 + 4 + 1 = 7 pontos', () => {
    // Construção direta: 4 duplas onde a dupla-alvo faz 2º, 4º e 1º.
    const teams = [team(1), team(2), team(3), team(4)];
    const board = buildLeaderboard({
      teams,
      wod1: [w1('team-1', [900]), w1('team-2', [1000]), w1('team-3', [800]), w1('team-4', [700])],
      wod2: [w2('team-1', 1, 1), w2('team-2', 4, 4), w2('team-3', 3, 3), w2('team-4', 2, 2)],
      wod3: [w3('team-1', 800), w3('team-2', 900), w3('team-3', 1000), w3('team-4', 1100)],
      settings: settings(),
    });

    const t1 = board.standings.find((r) => r.team.id === 'team-1');
    expect(t1?.wod1?.points).toBe(2); // 2º no WOD 1
    expect(t1?.wod2?.points).toBe(12); // último nas três provas: 4+4+4
    expect(t1?.wod3?.points).toBe(1); // 1º no WOD 3
    expect(t1?.totalPoints).toBe(15);
  });

  // §15 — empate na geral
  it('empate na pontuação total gera mesma posição e pede decisão manual', () => {
    const teams = [team(1), team(2)];
    const board = buildLeaderboard({
      teams,
      wod1: [w1('team-1', [100]), w1('team-2', [200])], // t2=1, t1=2
      wod2: [],
      wod3: [w3('team-1', 800), w3('team-2', 900)], // t1=1, t2=2
      settings: settings(),
    });

    expect(board.standings[0]?.totalPoints).toBe(3);
    expect(board.standings[1]?.totalPoints).toBe(3);
    expect(board.standings[0]?.position).toBe(1);
    expect(board.standings[1]?.position).toBe(1);
    expect(board.standings[0]?.tied).toBe(true);
    expect(board.standings[0]?.needsDecision).toBe(true);
  });

  it('com critério de desempate configurado, o empate deixa de exigir decisão', () => {
    const teams = [team(1), team(2)];
    const board = buildLeaderboard({
      teams,
      wod1: [w1('team-1', [100]), w1('team-2', [200])],
      wod2: [],
      wod3: [w3('team-1', 800), w3('team-2', 900)],
      settings: settings({ tieBreaker1: 'Melhor posição no WOD 3' }),
    });

    expect(board.standings[0]?.tied).toBe(true);
    expect(board.standings[0]?.needsDecision).toBe(false);
  });

  // Integridade: quem tem menos WODs lançados não pode "furar a fila"
  it('dupla com menos WODs pontuados não ultrapassa quem tem mais', () => {
    const teams = [team(1), team(2)];
    const board = buildLeaderboard({
      teams,
      // team-2 só tem WOD 1 (1 ponto). team-1 tem os três (2+3+1 = 6).
      wod1: [w1('team-1', [100]), w1('team-2', [200])],
      wod2: [w2('team-1', 3, 3)],
      wod3: [w3('team-1', 800)],
      settings: settings(),
    });

    expect(board.standings[0]?.team.id).toBe('team-1');
    expect(board.standings[0]?.scoredWods).toBe(3);
    expect(board.standings[1]?.team.id).toBe('team-2');
    expect(board.standings[1]?.scoredWods).toBe(1);
  });

  it('duplas sem nenhum resultado ficam no fim e não são marcadas como empate', () => {
    const teams = [team(1), team(2), team(3)];
    const board = buildLeaderboard({
      teams,
      wod1: [w1('team-1', [100])],
      wod2: [],
      wod3: [],
      settings: settings(),
    });

    const semResultado = board.standings.filter((r) => r.scoredWods === 0);
    expect(semResultado).toHaveLength(2);
    expect(semResultado.every((r) => r.tied === false)).toBe(true);
  });

  it('desclassificada não aparece na classificação', () => {
    const teams = [team(1), team(2, { status: 'DESCLASSIFICADA' })];
    const board = buildLeaderboard({
      teams,
      wod1: [w1('team-1', [100]), w1('team-2', [999])],
      wod2: [],
      wod3: [],
      settings: settings(),
    });

    expect(board.standings.map((r) => r.team.id)).toEqual(['team-1']);
  });

  // §29 — filtro por categoria recalcula a posição dentro da categoria
  it('recalcula posições dentro da categoria', () => {
    const teams = [
      team(1, { category: 'MASCULINA' }),
      team(2, { category: 'FEMININA' }),
      team(3, { category: 'MASCULINA' }),
    ];
    const board = buildLeaderboard({
      teams,
      wod1: [w1('team-1', [300]), w1('team-2', [200]), w1('team-3', [100])],
      wod2: [],
      wod3: [],
      settings: settings(),
    });

    const masculina = standingsByCategory(board.standings, 'MASCULINA');
    expect(masculina.map((r) => r.team.id)).toEqual(['team-1', 'team-3']);
    expect(masculina.map((r) => r.position)).toEqual([1, 2]);
  });

  it('leaderboard público ignora DRAFT; prévia do admin inclui', () => {
    const teams = [team(1), team(2)];
    const raw = {
      teams,
      wod1: [w1('team-1', [100], { status: 'DRAFT' as const }), w1('team-2', [90])],
      wod2: [],
      wod3: [],
      settings: settings(),
    };

    expect(buildLeaderboard(raw).standings[0]?.team.id).toBe('team-2');
    const preview = buildLeaderboard(raw, { statuses: ['DRAFT', 'PUBLISHED', 'LOCKED'] });
    expect(preview.standings[0]?.team.id).toBe('team-1');
  });
});
