import { describe, expect, it } from 'vitest';
import { buildLeaderboard } from '@/lib/scoring/build';
import { standingsByCategory } from '@/lib/scoring/overall';
import { cargas, cenario, distancias, prova, settings, team, tempo, val, wodNumero } from './helpers';

/**
 * O MOTOR GENÉRICO.
 *
 * Os testes falam em 1A, 2C e 3A porque o cenário é a etapa de setembro —
 * mas o motor não conhece esses códigos. Ele lê o cadastro da prova
 * (unidade, direção, origem) e aplica a mesma regra em todas.
 */

const pts = (board: ReturnType<typeof buildLeaderboard>, codigo: string, teamId: string) =>
  board.provas.get(prova(codigo).id)?.get(teamId)?.points ?? null;

const valorDe = (board: ReturnType<typeof buildLeaderboard>, codigo: string, teamId: string) =>
  board.provas.get(prova(codigo).id)?.get(teamId)?.valor ?? null;

describe('Prova por atleta — o valor é a soma dos dois', () => {
  const board = buildLeaderboard(
    cenario({
      teams: [team(1), team(2)],
      wod1: [...cargas('team-1', [60, 40, 100, 100, 150, 150]), ...cargas('team-2', [50, 50, 90, 90, 140, 140])],
    }),
  );

  it('soma os dois atletas', () => {
    expect(valorDe(board, '1A', 'team-1')).toBe(100);
    expect(valorDe(board, '1A', 'team-2')).toBe(100);
  });

  it('mesma soma com divisão diferente é empate', () => {
    expect(pts(board, '1A', 'team-1')).toBe(1);
    expect(pts(board, '1A', 'team-2')).toBe(1);
  });

  it('só um atleta lançado ainda conta', () => {
    const parcial = buildLeaderboard(
      cenario({ teams: [team(1)], wod1: cargas('team-1', [60, null, null, null, null, null]) }),
    );
    expect(valorDe(parcial, '1A', 'team-1')).toBe(60);
  });
});

describe('Prova calculada — soma de outras provas', () => {
  const board = buildLeaderboard(
    cenario({
      teams: [team(1), team(2)],
      wod1: [...cargas('team-1', [60, 40, 100, 100, 150, 150]), ...cargas('team-2', [50, 50, 90, 90, 140, 140])],
      wod2: [...distancias('team-1', 5, 10), ...distancias('team-2', 4, 9)],
    }),
  );

  it('1D é a soma de 1A, 1B e 1C — nunca digitada', () => {
    expect(valorDe(board, '1D', 'team-1')).toBe(600);
    expect(valorDe(board, '1D', 'team-2')).toBe(560);
  });

  it('2C é a soma de 2A e 2B', () => {
    expect(valorDe(board, '2C', 'team-1')).toBe(15);
    expect(valorDe(board, '2C', 'team-2')).toBe(13);
  });

  it('soma de distâncias livres não cria empate por ponto flutuante', () => {
    const livre = buildLeaderboard(
      cenario({ teams: [team(1)], wod2: distancias('team-1', 2.41, 2.59) }),
    );
    expect(valorDe(livre, '2C', 'team-1')).toBe(5);
  });

  it('sem nenhuma parcela lançada, a soma não existe — e não vale zero', () => {
    const vazio = buildLeaderboard(cenario({ teams: [team(1)], wod2: distancias('team-1', null, null) }));
    expect(valorDe(vazio, '2C', 'team-1')).toBeNull();
  });
});

describe('Direção da prova', () => {
  it('MAIOR_VENCE: mais carga é melhor', () => {
    const board = buildLeaderboard(
      cenario({
        teams: [team(1), team(2)],
        wod1: [...cargas('team-1', [100, 100, 100, 100, 100, 100]), ...cargas('team-2', [50, 50, 50, 50, 50, 50])],
      }),
    );
    expect(pts(board, '1A', 'team-1')).toBe(1);
    expect(pts(board, '1A', 'team-2')).toBe(2);
  });

  it('MENOR_VENCE: menos tempo é melhor', () => {
    const board = buildLeaderboard(
      cenario({ teams: [team(1), team(2)], wod3: [tempo('team-1', 900), tempo('team-2', 800)] }),
    );
    expect(pts(board, '3A', 'team-2')).toBe(1);
    expect(pts(board, '3A', 'team-1')).toBe(2);
  });
});

describe('Workout com CAP — quem não concluiu', () => {
  const base = {
    teams: [team(1), team(2), team(3)],
    wod3: [
      tempo('team-1', 800),
      tempo('team-2', 900),
      tempo('team-3', null, false, 300),
    ],
  };

  it('PENDING_DEFINITION: atrás de quem concluiu, marcada para decisão', () => {
    const board = buildLeaderboard(cenario(base));
    expect(pts(board, '3A', 'team-3')).toBe(3);
    expect(board.provas.get(prova('3A').id)?.get('team-3')?.needsDecision).toBe(true);
  });

  it('TIED_LAST: ocupa a última colocação', () => {
    const board = buildLeaderboard(
      cenario({ ...base, settings: settings({ dnfPolicy: 'TIED_LAST' }) }),
    );
    expect(pts(board, '3A', 'team-3')).toBe(3);
  });

  it('VOLUME_DESC: entre os incompletos, mais volume fica na frente', () => {
    const board = buildLeaderboard(
      cenario({
        teams: [team(1), team(2), team(3)],
        wod3: [
          tempo('team-1', 800),
          tempo('team-2', null, false, 500),
          tempo('team-3', null, false, 200),
        ],
        settings: settings({ dnfPolicy: 'VOLUME_DESC' }),
      }),
    );
    expect(pts(board, '3A', 'team-2')).toBe(2);
    expect(pts(board, '3A', 'team-3')).toBe(3);
  });

  it('workout SEM cap ignora a política: todo mundo disputa pelo valor', () => {
    const board = buildLeaderboard(
      cenario({
        teams: [team(1), team(2)],
        wod2: [...distancias('team-1', 5, 10), ...distancias('team-2', 4, 9)],
        settings: settings({ dnfPolicy: 'TIED_LAST' }),
      }),
    );
    expect(pts(board, '2A', 'team-1')).toBe(1);
    expect(pts(board, '2A', 'team-2')).toBe(2);
  });
});

describe('Homologação', () => {
  it('rascunho não entra no ranking público', () => {
    const entrada = cenario({
      teams: [team(1), team(2)],
      wod2: [...distancias('team-1', 5, 10), ...distancias('team-2', 9, 9)],
    });
    const rascunho = entrada.entries.map((e) =>
      e.teamId === 'team-2' ? { ...e, status: 'DRAFT' as const } : e,
    );

    const board = buildLeaderboard({ ...entrada, entries: rascunho });
    expect(pts(board, '2A', 'team-2')).toBeNull();
    expect(pts(board, '2A', 'team-1')).toBe(1);
  });

  it('dupla desclassificada fica fora do ranking', () => {
    const board = buildLeaderboard(
      cenario({
        teams: [team(1), team(2, { status: 'DESCLASSIFICADA' })],
        wod2: [...distancias('team-1', 5, 10), ...distancias('team-2', 9, 9)],
      }),
    );
    expect(pts(board, '2A', 'team-2')).toBeNull();
    expect(pts(board, '2A', 'team-1')).toBe(1);
  });
});

describe('Total do evento', () => {
  it('soma as oito provas que pontuam', () => {
    const board = buildLeaderboard(
      cenario({
        teams: [team(1), team(2)],
        wod1: [...cargas('team-1', [100, 100, 100, 100, 100, 100]), ...cargas('team-2', [50, 50, 50, 50, 50, 50])],
        wod2: [...distancias('team-1', 5, 10), ...distancias('team-2', 4, 9)],
        wod3: [tempo('team-1', 800), tempo('team-2', 900)],
      }),
    );

    const primeiro = board.standings.find((r) => r.team.id === 'team-1');
    expect(primeiro?.totalPoints).toBe(8);
    expect(board.provaList).toHaveLength(8);
  });

  it('prova com pontua=false fica no ranking mas fora do total', () => {
    const comProvaSolta = structuredClone(
      cenario({
        teams: [team(1), team(2)],
        wod2: [...distancias('team-1', 5, 10), ...distancias('team-2', 4, 9)],
      }),
    );
    const wod2 = comProvaSolta.wods.find((w) => w.numero === 2);
    const prova2a = wod2?.provas.find((p) => p.codigo === '2A');
    if (prova2a) prova2a.pontua = false;

    const board = buildLeaderboard(comProvaSolta);
    // 2A continua ranqueada…
    expect(pts(board, '2A', 'team-1')).toBe(1);
    // …mas o total só considera 2B e 2C.
    const primeiro = board.standings.find((r) => r.team.id === 'team-1');
    expect(primeiro?.totalPoints).toBe(2);
  });
});

describe('Pontuação por WOD', () => {
  it('o total do WOD é a soma das provas dele', () => {
    const board = buildLeaderboard(
      cenario({
        teams: [team(1), team(2)],
        wod2: [...distancias('team-1', 5, 10), ...distancias('team-2', 4, 9)],
      }),
    );
    const wod2 = wodNumero(2);
    expect(board.wodScores.get(wod2.id)?.get('team-1')?.points).toBe(3);
    expect(board.wodScores.get(wod2.id)?.get('team-2')?.points).toBe(6);
  });
});

describe('A disputa é dentro da categoria', () => {
  it('5 masculinas e 3 femininas: o teto de pontos é o tamanho da categoria', () => {
    const masculinas = [1, 2, 3, 4, 5].map((n) => team(n, { category: 'MASCULINA' }));
    const femininas = [6, 7, 8].map((n) => team(n, { category: 'FEMININA' }));

    const board = buildLeaderboard(
      cenario({
        teams: [...masculinas, ...femininas],
        wod2: [100, 95, 90, 85, 80, 60, 55, 50].flatMap((km, i) =>
          distancias(`team-${i + 1}`, km / 10, km / 10),
        ),
      }),
    );

    expect(pts(board, '2A', 'team-5')).toBe(5);
    expect(pts(board, '2A', 'team-8')).toBe(3);
    expect(standingsByCategory(board.standings, 'FEMININA')).toHaveLength(3);
  });
});

describe('Prova ainda sem lançamento', () => {
  it('não vira zero: a dupla fica "aguardando"', () => {
    const board = buildLeaderboard(
      cenario({ teams: [team(1), team(2)], wod2: [...distancias('team-1', 5, 10), ...distancias('team-2', null, null)] }),
    );
    expect(valorDe(board, '2A', 'team-2')).toBeNull();
    expect(board.provas.get(prova('2A').id)?.get('team-2')?.hasResult).toBe(false);
  });
});

describe('Valor avulso', () => {
  it('prova comum lê o campo único, não os de atleta', () => {
    const board = buildLeaderboard(
      cenario({ teams: [team(1)], wod2: [val('2A', 'team-1', 7.5), val('2B', 'team-1', 2.5)] }),
    );
    expect(valorDe(board, '2C', 'team-1')).toBe(10);
  });
});
