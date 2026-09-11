import { describe, expect, it } from 'vitest';
import { matchesQuery } from '@/lib/search';
import { buildLeaderboard } from '@/lib/scoring/build';
import { standingsByCategory } from '@/lib/scoring/overall';
import { settings, team, w1 } from './helpers';

const board = buildLeaderboard({
  teams: [
    team(1, { teamName: 'Cerrado', athlete1: 'Marina Cerrado', athlete2: 'Rafa Cerrado', category: 'MISTA' }),
    team(2, { teamName: 'Ipê Amarelo', athlete1: 'Bia Ipê', athlete2: 'Nina Ipê', category: 'FEMININA' }),
    team(7, { teamName: 'Buriti', athlete1: 'Zé Buriti', athlete2: 'Dan Buriti', category: 'MASCULINA' }),
  ],
  wod1: [w1('team-1', [100]), w1('team-2', [90]), w1('team-7', [80])],
  wod2: [],
  wod3: [],
  settings: settings(),
});

const rows = board.standings;
const acha = (q: string) => rows.filter((r) => matchesQuery(r, q)).map((r) => r.team.teamName);

describe('Pesquisa (§8)', () => {
  it('encontra pelo nome da dupla', () => {
    expect(acha('cerrado')).toContain('Cerrado');
  });

  it('encontra pelo nome do atleta 1 e do atleta 2', () => {
    expect(acha('marina')).toEqual(['Cerrado']);
    expect(acha('nina')).toEqual(['Ipê Amarelo']);
  });

  it('ignora acento e caixa', () => {
    expect(acha('IPE')).toEqual(['Ipê Amarelo']);
    expect(acha('ze buriti')).toEqual(['Buriti']);
  });

  it('encontra pelo número da dupla, com ou sem zero à esquerda', () => {
    expect(acha('07')).toEqual(['Buriti']);
    expect(acha('7')).toEqual(['Buriti']);
  });

  it('exige todos os termos digitados', () => {
    expect(acha('marina cerrado')).toEqual(['Cerrado']);
    expect(acha('marina ipe')).toEqual([]);
  });

  it('busca vazia devolve todo mundo', () => {
    expect(acha('')).toHaveLength(3);
    expect(acha('   ')).toHaveLength(3);
  });

  it('sem correspondência devolve lista vazia', () => {
    expect(acha('zzzz')).toEqual([]);
  });
});

describe('Filtro por categoria (§29)', () => {
  it('mostra apenas a categoria escolhida', () => {
    expect(standingsByCategory(rows, 'FEMININA').map((r) => r.team.teamName)).toEqual([
      'Ipê Amarelo',
    ]);
  });

  it('renumera as posições dentro da categoria', () => {
    const board2 = buildLeaderboard({
      teams: [
        team(1, { category: 'MASCULINA' }),
        team(2, { category: 'FEMININA' }),
        team(3, { category: 'MASCULINA' }),
        team(4, { category: 'MASCULINA' }),
      ],
      wod1: [w1('team-1', [400]), w1('team-2', [300]), w1('team-3', [200]), w1('team-4', [100])],
      wod2: [],
      wod3: [],
      settings: settings(),
    });

    const masc = standingsByCategory(board2.standings, 'MASCULINA');
    expect(masc.map((r) => r.team.id)).toEqual(['team-1', 'team-3', 'team-4']);
    // Na geral seriam 1º, 3º e 4º; na categoria viram 1º, 2º e 3º.
    expect(masc.map((r) => r.position)).toEqual([1, 2, 3]);
  });
});
