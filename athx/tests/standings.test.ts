import { describe, expect, it } from 'vitest';
import type { StandingRow } from '@/types/domain';
import { buildLeaderboard } from '@/lib/scoring/build';
import { standingsByCategory } from '@/lib/scoring/overall';
import {
  cargas,
  cenario,
  distancias,
  entry,
  prova,
  settings,
  team,
  tempo,
  wodNumero,
} from './helpers';

/** Pontos de um WOD, pelo número. */
const wodPts = (row: StandingRow | undefined, numero: number) =>
  row?.wods[wodNumero(numero).id]?.points ?? null;

const wodScore = (row: StandingRow | undefined, numero: number) =>
  row?.wods[wodNumero(numero).id];

/** Pontos de uma prova, pelo código. */
const provaPts = (row: StandingRow | undefined, codigo: string) =>
  row?.provas[prova(codigo).id]?.points ?? null;

/** Quatro duplas com resultado completo nos três WODs. */
function eventoCompleto() {
  return cenario({
    teams: [team(1), team(2), team(3), team(4)],
    wod1: [
      ...cargas('team-1', [60, 40, 80, 70, 100, 90]),
      ...cargas('team-2', [50, 40, 120, 100, 110, 100]),
      ...cargas('team-3', [40, 40, 100, 90, 150, 140]),
      ...cargas('team-4', [70, 60, 90, 80, 120, 110]),
    ],
    wod2: [
      ...distancias('team-1', 3.5, 8.45),
      ...distancias('team-2', 4.0, 7.0),
      ...distancias('team-3', 3.0, 9.5),
      ...distancias('team-4', 2.5, 10.2),
    ],
    wod3: [tempo('team-1', 838), tempo('team-2', 872), tempo('team-3', 910), tempo('team-4', 955)],
  });
}

describe('Classificação geral', () => {
  /**
   * O TOTAL É A SOMA DAS PROVAS QUE PONTUAM.
   *
   * Não confere por atalho (soma dos totais por WOD): soma as oito parcelas
   * uma a uma e exige que batam com o total da classificação.
   */
  it('TOTAL = a soma de cada prova, uma a uma', () => {
    const board = buildLeaderboard(eventoCompleto());
    const codigos = ['1A', '1B', '1C', '1D', '2A', '2B', '2C', '3A'];

    expect(board.provaList.map((p) => p.codigo)).toEqual(codigos);

    for (const row of board.standings) {
      const soma = codigos.reduce((acc, c) => acc + (provaPts(row, c) ?? 0), 0);
      expect(soma, `total da ${row.team.teamName}`).toBe(row.totalPoints);
      expect(wodScore(row, 1)?.hasResult, row.team.teamName).toBe(true);
      expect(wodScore(row, 3)?.hasResult, row.team.teamName).toBe(true);
    }
  });

  it('ordena por total crescente — menor pontuação vence', () => {
    const board = buildLeaderboard(eventoCompleto());
    const totais = board.standings.map((r) => r.totalPoints);
    expect(totais).toEqual([...totais].sort((a, b) => a - b));
    expect(board.standings[0]?.position).toBe(1);
  });

  it('o total de cada WOD é a soma das provas daquele WOD', () => {
    const board = buildLeaderboard(eventoCompleto());

    for (const row of board.standings) {
      for (const wod of board.wods) {
        const soma = wod.provas
          .filter((p) => p.pontua)
          .reduce((acc, p) => acc + (row.provas[p.id]?.points ?? 0), 0);
        expect(wodPts(row, wod.numero), `${wod.nome} da ${row.team.teamName}`).toBe(soma);
      }
    }
  });

  /**
   * MUDANÇA DELIBERADA DE COMPORTAMENTO.
   *
   * O motor antigo tratava campo em branco como ZERO: se o juiz tinha
   * lançado só o Strict Press, as outras duas provas ranqueavam todo mundo
   * empatado em "0 kg" e distribuíam pontos. O motor novo não ranqueia quem
   * não tem resultado — e o WOD só tem total quando todas as provas dele
   * foram lançadas.
   */
  it('prova em branco não vira zero: a dupla fica de fora daquele ranking', () => {
    const board = buildLeaderboard(
      cenario({
        teams: [team(1), team(2)],
        // Só o Strict Press lançado.
        wod1: [
          ...cargas('team-1', [100, 100, null, null, null, null]),
          ...cargas('team-2', [90, 90, null, null, null, null]),
        ],
      }),
    );

    const t1 = board.standings.find((r) => r.team.id === 'team-1');
    expect(provaPts(t1, '1A')).toBe(1);
    // 1B e 1C não foram lançadas: ninguém é ranqueado nelas.
    expect(provaPts(t1, '1B')).toBeNull();
    expect(provaPts(t1, '1C')).toBeNull();
    // E por isso o WOD 1 ainda não tem total.
    expect(wodScore(t1, 1)?.hasResult).toBe(false);
    expect(t1?.scoredWods).toBe(0);
  });

  // §15 — empate na geral
  it('empate na pontuação total gera mesma posição e pede decisão manual', () => {
    const board = buildLeaderboard(
      cenario({
        teams: [team(1), team(2)],
        // Montado para empatar: 1A t1 vence, 1C t2 vence, 1D t2 vence,
        // 1B empata; WOD 3 t1 vence. Totais iguais.
        wod1: [
          ...cargas('team-1', [50, 50, 50, 50, 25, 25]),
          ...cargas('team-2', [25, 25, 50, 50, 100, 100]),
        ],
        wod3: [tempo('team-1', 800), tempo('team-2', 900)],
        // O padrão do evento desempata pelo WOD 3; aqui queremos ver o
        // empate permanecendo de pé, então a organização optou por NENHUM.
        settings: settings({ tieBreaker1: 'NENHUM' }),
      }),
    );

    expect(board.standings[0]?.totalPoints).toBe(board.standings[1]?.totalPoints);
    expect(board.standings[0]?.position).toBe(1);
    expect(board.standings[1]?.position).toBe(1);
    expect(board.standings[0]?.tied).toBe(true);
    expect(board.standings[0]?.needsDecision).toBe(true);
  });

  it('com o critério do WOD 3 escolhido, o empate é resolvido na categoria', () => {
    const entrada = cenario({
      teams: [team(1), team(2)],
      wod1: [
        ...cargas('team-1', [50, 50, 50, 50, 25, 25]),
        ...cargas('team-2', [25, 25, 50, 50, 100, 100]),
      ],
      wod3: [tempo('team-1', 800), tempo('team-2', 900)],
    });

    const semCriterio = buildLeaderboard({
      ...entrada,
      settings: settings({ tieBreaker1: 'NENHUM' }),
    });
    expect(semCriterio.standings[0]?.tied).toBe(true);

    const comCriterio = buildLeaderboard({
      ...entrada,
      settings: settings({ tieBreaker1: 'WOD3' }),
    });

    const naCategoria = standingsByCategory(comCriterio.standings, 'MISTA');
    expect(naCategoria[0]?.team.id).toBe('team-1');
    expect(naCategoria.map((r) => r.position)).toEqual([1, 2]);
    expect(naCategoria.every((r) => !r.tied)).toBe(true);
    expect(naCategoria[0]?.desempatadoPor).toBe('WOD3');
  });

  // Integridade: quem tem menos WODs lançados não pode "furar a fila"
  it('dupla com menos WODs pontuados não ultrapassa quem tem mais', () => {
    const board = buildLeaderboard(
      cenario({
        teams: [team(1), team(2)],
        // team-2 só tem o WOD 1 lançado; team-1 tem os três.
        wod1: [
          ...cargas('team-1', [50, 50, 50, 50, 50, 50]),
          ...cargas('team-2', [100, 100, 100, 100, 100, 100]),
        ],
        wod2: [...distancias('team-1', 3, 3)],
        wod3: [tempo('team-1', 800)],
      }),
    );

    expect(board.standings[0]?.team.id).toBe('team-1');
    expect(board.standings[0]?.scoredWods).toBe(3);
    expect(board.standings[1]?.scoredWods).toBe(1);
  });

  it('duplas sem nenhum resultado ficam no fim e não são marcadas como empate', () => {
    const board = buildLeaderboard(
      cenario({
        teams: [team(1), team(2), team(3)],
        wod1: [...cargas('team-1', [100, 100, 100, 100, 100, 100])],
      }),
    );

    const semResultado = board.standings.filter((r) => r.scoredWods === 0);
    expect(semResultado).toHaveLength(2);
    expect(semResultado.every((r) => !r.tied)).toBe(true);
    expect(semResultado.every((r) => !r.needsDecision)).toBe(true);
    expect(board.standings[0]?.team.id).toBe('team-1');
  });

  it('desclassificada não aparece na classificação', () => {
    const board = buildLeaderboard(
      cenario({
        teams: [team(1), team(2, { status: 'DESCLASSIFICADA' })],
        wod1: [
          ...cargas('team-1', [50, 50, 50, 50, 50, 50]),
          ...cargas('team-2', [100, 100, 100, 100, 100, 100]),
        ],
      }),
    );

    expect(board.standings).toHaveLength(1);
    expect(board.standings[0]?.team.id).toBe('team-1');
  });

  it('recalcula posições dentro da categoria', () => {
    const board = buildLeaderboard(
      cenario({
        teams: [
          team(1, { category: 'MASCULINA' }),
          team(2, { category: 'FEMININA' }),
          team(3, { category: 'MASCULINA' }),
        ],
        wod1: [
          ...cargas('team-1', [100, 100, 100, 100, 100, 100]),
          ...cargas('team-2', [90, 90, 90, 90, 90, 90]),
          ...cargas('team-3', [80, 80, 80, 80, 80, 80]),
        ],
      }),
    );

    const masculina = standingsByCategory(board.standings, 'MASCULINA');
    expect(masculina.map((r) => r.team.id)).toEqual(['team-1', 'team-3']);
    expect(masculina.map((r) => r.position)).toEqual([1, 2]);
  });

  it('leaderboard público ignora DRAFT; prévia do admin inclui', () => {
    const raw = cenario({
      teams: [team(1), team(2)],
      wod1: [
        ...cargas('team-1', [100, 100, 100, 100, 100, 100]),
        ...cargas('team-2', [90, 90, 90, 90, 90, 90]),
      ],
      // A dupla 1 é mais forte, mas o lançamento dela ainda é rascunho.
      entries: [entry(1, 'team-1', { status: 'DRAFT' })],
    });

    expect(buildLeaderboard(raw).standings[0]?.team.id).toBe('team-2');

    const previa = buildLeaderboard(raw, { statuses: ['DRAFT', 'PUBLISHED', 'LOCKED'] });
    expect(previa.standings[0]?.team.id).toBe('team-1');
  });
});
