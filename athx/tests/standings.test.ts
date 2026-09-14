import { describe, expect, it } from 'vitest';
import { buildLeaderboard } from '@/lib/scoring/build';
import { standingsByCategory } from '@/lib/scoring/overall';
import { settings, team, w1, w2, w3 } from './helpers';

describe('Classificação geral', () => {
  /**
   * A REGRA DA COMPETIÇÃO, por extenso:
   *
   *   TOTAL = 1A + 1B + 1C + 1D + 2A + 2B + 2C + 3
   *
   * São OITO pontuações independentes. Este teste não confere a soma por
   * atalho (wod1.points + wod2.points + wod3.points): ele soma as oito
   * parcelas uma a uma e exige que batam com o total da classificação.
   */
  it('TOTAL = 1A + 1B + 1C + 1D + 2A + 2B + 2C + 3 (oito pontuações)', () => {
    const teams = [team(1), team(2), team(3), team(4)];
    const board = buildLeaderboard({
      teams,
      wod1: [
        w1('team-1', [60, 40, 80, 70, 100, 90]),
        w1('team-2', [50, 40, 120, 100, 110, 100]),
        w1('team-3', [40, 40, 100, 90, 150, 140]),
        w1('team-4', [70, 60, 90, 80, 120, 110]),
      ],
      wod2: [
        w2('team-1', 3.5, 8.45),
        w2('team-2', 4.0, 7.0),
        w2('team-3', 3.0, 9.5),
        w2('team-4', 2.5, 10.2),
      ],
      wod3: [w3('team-1', 838), w3('team-2', 872), w3('team-3', 910), w3('team-4', 955)],
      settings: settings(),
    });

    for (const row of board.standings) {
      const w1s = row.wod1;
      const w2s = row.wod2;
      const w3s = row.wod3;
      expect(w1s?.hasResult, row.team.teamName).toBe(true);
      expect(w2s?.hasResult, row.team.teamName).toBe(true);
      expect(w3s?.hasResult, row.team.teamName).toBe(true);
      if (!w1s || !w2s || !w3s) continue;

      const oitoParcelas =
        (w1s.pointsStrictPress ?? 0) + // 1A
        (w1s.pointsBackSquat ?? 0) + //   1B
        (w1s.pointsDeadlift ?? 0) + //    1C
        (w1s.pointsTotal ?? 0) + //       1D
        (w2s.pointsRun ?? 0) + //         2A
        (w2s.pointsBike ?? 0) + //        2B
        (w2s.pointsTotal ?? 0) + //       2C
        (w3s.points ?? 0); //             3

      expect(row.totalPoints, `total da ${row.team.teamName}`).toBe(oitoParcelas);
    }

    // E cada bloco é a soma das suas parcelas.
    const alvo = board.standings.find((r) => r.team.id === 'team-1');
    expect(alvo?.wod1?.points).toBe(
      (alvo?.wod1?.pointsStrictPress ?? 0) +
        (alvo?.wod1?.pointsBackSquat ?? 0) +
        (alvo?.wod1?.pointsDeadlift ?? 0) +
        (alvo?.wod1?.pointsTotal ?? 0),
    );
    expect(alvo?.wod2?.points).toBe(
      (alvo?.wod2?.pointsRun ?? 0) +
        (alvo?.wod2?.pointsBike ?? 0) +
        (alvo?.wod2?.pointsTotal ?? 0),
    );
  });

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
    // Estas cargas escalam juntas, então a dupla faz 2º nas QUATRO provas do
    // WOD 1: 2 + 2 + 2 + 2 = 8.
    expect(t1?.wod1?.points).toBe(8);
    expect(t1?.wod2?.points).toBe(6);
    expect(t1?.wod3?.points).toBe(1);
    expect(t1?.totalPoints).toBe(15);

    const totals = board.standings.map((r) => r.totalPoints);
    expect(totals).toEqual([...totals].sort((a, b) => a - b));
    expect(board.standings[0]?.position).toBe(1);
  });

  it('WOD 1 soma as quatro provas e WOD 2 soma as três', () => {
    const teams = [team(1), team(2), team(3), team(4)];
    const board = buildLeaderboard({
      teams,
      // Só o Strict Press lançado: a dupla faz a mesma posição nas 4 provas.
      wod1: [w1('team-1', [900]), w1('team-2', [1000]), w1('team-3', [800]), w1('team-4', [700])],
      wod2: [w2('team-1', 1, 1), w2('team-2', 4, 4), w2('team-3', 3, 3), w2('team-4', 2, 2)],
      wod3: [w3('team-1', 800), w3('team-2', 900), w3('team-3', 1000), w3('team-4', 1100)],
      settings: settings(),
    });

    const t1 = board.standings.find((r) => r.team.id === 'team-1');
    // Só o Strict Press tem carga. Back Squat e Deadlift ficam 0 para todas,
    // então as quatro duplas EMPATAM em 1º nessas duas provas e levam 1 ponto
    // cada. A dupla-alvo faz 2º em 1A e em 1D: 2 + 1 + 1 + 2 = 6.
    expect(t1?.wod1?.points).toBe(2 + 1 + 1 + 2);
    expect(t1?.wod2?.points).toBe(4 + 4 + 4); // último nas três provas
    expect(t1?.wod3?.points).toBe(1); // 1º no WOD 3
    expect(t1?.totalPoints).toBe(19);
  });

  // §15 — empate na geral
  it('empate na pontuação total gera mesma posição e pede decisão manual', () => {
    const teams = [team(1), team(2)];
    const board = buildLeaderboard({
      teams,
      // Cenário montado para dar empate exato com as quatro provas somando:
      //   1A  t1 vence          -> 1 / 2
      //   1B  empatam           -> 1 / 1
      //   1C  t2 vence          -> 2 / 1
      //   1D  t2 vence          -> 2 / 1
      //   WOD 1 ................. 6 / 5
      //   WOD 3  t1 vence ....... 1 / 2
      //   TOTAL ................. 7 / 7
      wod1: [
        w1('team-1', [50, 50, 50, 50, 25, 25]), // 1A 100 · 1B 100 · 1C  50 · 1D 250
        w1('team-2', [25, 25, 50, 50, 100, 100]), // 1A  50 · 1B 100 · 1C 200 · 1D 350
      ],
      wod2: [],
      wod3: [w3('team-1', 800), w3('team-2', 900)],
      settings: settings(),
    });

    expect(board.standings[0]?.totalPoints).toBe(7);
    expect(board.standings[1]?.totalPoints).toBe(7);
    expect(board.standings[0]?.position).toBe(1);
    expect(board.standings[1]?.position).toBe(1);
    expect(board.standings[0]?.tied).toBe(true);
    expect(board.standings[0]?.needsDecision).toBe(true);
  });

  it('com o critério do WOD 3 escolhido, o empate é resolvido de verdade', () => {
    const teams = [team(1), team(2)];
    const entrada = {
      teams,
      wod1: [
        w1('team-1', [50, 50, 50, 50, 25, 25]),
        w1('team-2', [25, 25, 50, 50, 100, 100]),
      ],
      wod2: [],
      // team-1 fez melhor tempo, logo é 1ª no WOD 3.
      wod3: [w3('team-1', 800), w3('team-2', 900)],
    };

    const semCriterio = buildLeaderboard({ ...entrada, settings: settings() });
    expect(semCriterio.standings[0]?.tied).toBe(true);
    expect(semCriterio.standings[0]?.needsDecision).toBe(true);

    const comCriterio = buildLeaderboard({
      ...entrada,
      settings: settings({ tieBreaker1: 'WOD3' }),
    });

    expect(comCriterio.standings[0]?.team.id).toBe('team-1');
    expect(comCriterio.standings[0]?.position).toBe(1);
    expect(comCriterio.standings[1]?.position).toBe(2);
    expect(comCriterio.standings.every((r) => !r.tied)).toBe(true);
    expect(comCriterio.standings.every((r) => !r.needsDecision)).toBe(true);
    expect(comCriterio.standings[0]?.desempatadoPor).toBe('WOD3');
  });

  // Integridade: quem tem menos WODs lançados não pode "furar a fila"
  it('dupla com menos WODs pontuados não ultrapassa quem tem mais', () => {
    const teams = [team(1), team(2)];
    const board = buildLeaderboard({
      teams,
      // team-2 só tem o WOD 1 lançado; team-1 tem os três.
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
