import { describe, expect, it } from 'vitest';
import { buildLeaderboard } from '@/lib/scoring/build';
import { cargas, cenario, distancias, prova, settings, team, tempo } from './helpers';

/**
 * A DISPUTA É DENTRO DA CATEGORIA.
 *
 * Regra dita pela organização: se a Dupla Masculina tem 5 duplas, o máximo
 * que uma dupla masculina pode receber numa prova é 5 pontos. O tamanho da
 * Feminina não pode influenciar a pontuação da Masculina — e vice-versa.
 */

type Board = ReturnType<typeof buildLeaderboard>;

const pts = (board: Board, codigo: string, teamId: string) =>
  board.provas.get(prova(codigo).id)?.get(teamId)?.points ?? null;

const pos = (board: Board, codigo: string, teamId: string) =>
  board.provas.get(prova(codigo).id)?.get(teamId)?.rank ?? null;

/** 5 duplas masculinas + 3 femininas. Divisão desigual de propósito. */
function duplas() {
  return [
    ...[1, 2, 3, 4, 5].map((n) => team(n, { category: 'MASCULINA' })),
    ...[6, 7, 8].map((n) => team(n, { category: 'FEMININA' })),
  ];
}

describe('WOD 1 — cada prova é ranqueada dentro da categoria', () => {
  // Masculinas em ordem decrescente de carga; femininas idem, mais leves.
  const pesos = [100, 95, 90, 85, 80, 60, 55, 50];
  const board = buildLeaderboard(
    cenario({
      teams: duplas(),
      wod1: pesos.flatMap((kg, i) => cargas(`team-${i + 1}`, [kg, kg, kg, kg, kg, kg])),
    }),
  );

  it('a última masculina recebe 5 pontos em 1A, não 8', () => {
    expect(pts(board, '1A', 'team-5')).toBe(5);
    expect(pos(board, '1A', 'team-5')).toBe(5);
  });

  it('a última feminina recebe 3 pontos — o tamanho da categoria dela', () => {
    expect(pts(board, '1A', 'team-8')).toBe(3);
    expect(pos(board, '1A', 'team-8')).toBe(3);
  });

  it('cada categoria tem o seu 1º lugar', () => {
    expect(pos(board, '1A', 'team-1')).toBe(1);
    expect(pos(board, '1A', 'team-6')).toBe(1);
  });

  it('nenhuma pontuação de prova passa do tamanho da categoria', () => {
    for (const t of duplas()) {
      const teto = t.category === 'MASCULINA' ? 5 : 3;
      for (const codigo of ['1A', '1B', '1C', '1D']) {
        const p = pts(board, codigo, t.id);
        expect(p, `${codigo} da ${t.teamName}`).not.toBeNull();
        expect(p!).toBeLessThanOrEqual(teto);
      }
    }
  });

  it('1º em tudo na categoria = 4 pontos no WOD 1', () => {
    const wod1 = board.wods.find((w) => w.numero === 1);
    expect(board.wodScores.get(wod1!.id)?.get('team-1')?.points).toBe(4);
    expect(board.wodScores.get(wod1!.id)?.get('team-6')?.points).toBe(4);
  });
});

describe('WOD 2 — as três provas também são por categoria', () => {
  const board = buildLeaderboard(
    cenario({
      teams: duplas(),
      wod2: [
        ...distancias('team-1', 5, 12),
        ...distancias('team-2', 4.5, 11),
        ...distancias('team-3', 4, 10),
        ...distancias('team-4', 3.5, 9),
        ...distancias('team-5', 3, 8),
        ...distancias('team-6', 2.5, 7),
        ...distancias('team-7', 2, 6),
        ...distancias('team-8', 1.5, 5),
      ],
    }),
  );

  it('a última masculina fica com 5 pontos em cada prova', () => {
    expect(pts(board, '2A', 'team-5')).toBe(5);
    expect(pts(board, '2B', 'team-5')).toBe(5);
    expect(pts(board, '2C', 'team-5')).toBe(5);
  });

  it('a última feminina fica com 3, mesmo tendo a menor distância do evento', () => {
    expect(pts(board, '2A', 'team-8')).toBe(3);
    expect(pts(board, '2B', 'team-8')).toBe(3);
  });
});

describe('WOD 3 — quem não concluiu fica atrás de quem concluiu NA CATEGORIA', () => {
  // Masculinas: 3 concluíram, 2 não. Femininas: 1 concluiu, 2 não.
  const wod3 = [
    tempo('team-1', 800),
    tempo('team-2', 850),
    tempo('team-3', 900),
    tempo('team-4', null, false, 300),
    tempo('team-5', null, false, 200),
    tempo('team-6', 1000),
    tempo('team-7', null, false, 150),
    tempo('team-8', null, false, 100),
  ];

  it('PENDING_DEFINITION conta os finalizadores da própria categoria', () => {
    const board = buildLeaderboard(cenario({ teams: duplas(), wod3 }));

    // Masculina: 3 concluíram -> os incompletos entram na 4ª posição
    expect(pos(board, '3A', 'team-4')).toBe(4);
    expect(pos(board, '3A', 'team-5')).toBe(4);

    // Feminina: 1 concluiu -> os incompletos entram na 2ª, não na 4ª
    expect(pos(board, '3A', 'team-7')).toBe(2);
    expect(pos(board, '3A', 'team-8')).toBe(2);
  });

  it('TIED_LAST usa o tamanho da categoria como última posição', () => {
    const board = buildLeaderboard(
      cenario({ teams: duplas(), wod3, settings: settings({ dnfPolicy: 'TIED_LAST' }) }),
    );
    expect(pts(board, '3A', 'team-5')).toBe(5); // 5 masculinas
    expect(pts(board, '3A', 'team-8')).toBe(3); // 3 femininas
  });

  it('VOLUME_DESC desempata por volume dentro da categoria', () => {
    const board = buildLeaderboard(
      cenario({ teams: duplas(), wod3, settings: settings({ dnfPolicy: 'VOLUME_DESC' }) }),
    );
    expect(pos(board, '3A', 'team-4')).toBe(4); // maior volume entre as masculinas
    expect(pos(board, '3A', 'team-5')).toBe(5);
    expect(pos(board, '3A', 'team-7')).toBe(2); // maior volume entre as femininas
    expect(pos(board, '3A', 'team-8')).toBe(3);
  });
});

describe('Dupla desclassificada não conta para o teto da categoria', () => {
  it('com uma das 5 masculinas fora, o teto vira 4', () => {
    const teams = [
      ...[1, 2, 3, 4].map((n) => team(n, { category: 'MASCULINA' })),
      team(5, { category: 'MASCULINA', status: 'DESCLASSIFICADA' }),
    ];

    const board = buildLeaderboard(
      cenario({
        teams,
        wod1: [100, 95, 90, 85, 80].flatMap((kg, i) =>
          cargas(`team-${i + 1}`, [kg, kg, kg, kg, kg, kg]),
        ),
      }),
    );

    expect(pts(board, '1A', 'team-4')).toBe(4);
    expect(pts(board, '1A', 'team-5')).toBeNull();
  });
});

describe('Total da competição', () => {
  it('vencer as oito provas da categoria dá 8 pontos', () => {
    const board = buildLeaderboard(
      cenario({
        teams: duplas(),
        wod1: [100, 90, 80, 70, 60, 55, 50, 45].flatMap((kg, i) =>
          cargas(`team-${i + 1}`, [kg, kg, kg, kg, kg, kg]),
        ),
        wod2: [
          ...distancias('team-1', 5, 12),
          ...distancias('team-2', 4.5, 11),
          ...distancias('team-3', 4, 10),
          ...distancias('team-4', 3.5, 9),
          ...distancias('team-5', 3, 8),
          ...distancias('team-6', 2.5, 7),
          ...distancias('team-7', 2, 6),
          ...distancias('team-8', 1.5, 5),
        ],
        wod3: [800, 850, 900, 950, 1000, 1050, 1100, 1150].map((s, i) =>
          tempo(`team-${i + 1}`, s),
        ),
      }),
    );

    const porId = new Map(board.standings.map((s) => [s.team.id, s]));

    // 1A+1B+1C+1D+2A+2B+2C+3A = oito primeiros lugares
    expect(porId.get('team-1')?.totalPoints).toBe(8);
    expect(porId.get('team-6')?.totalPoints).toBe(8);

    // A última masculina: oito quintos lugares
    expect(porId.get('team-5')?.totalPoints).toBe(40);
    // A última feminina: oito terceiros lugares — não oito oitavos
    expect(porId.get('team-8')?.totalPoints).toBe(24);
  });
});
