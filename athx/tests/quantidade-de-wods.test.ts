import { describe, expect, it } from 'vitest';
import { buildLeaderboard } from '@/lib/scoring/build';
import { standingsByCategory } from '@/lib/scoring/overall';
import { formulaDoTotal, provasQuePontuam } from '@/types/wod';
import type { Prova, ProvaResult, Wod, WodEntry } from '@/types/wod';
import { DEFAULT_SETTINGS } from '@/types/domain';
import { team } from './helpers';

/**
 * QUANTOS WODS O EVENTO TEM É DECISÃO DA ORGANIZAÇÃO.
 *
 * Os outros testes rodam sobre a etapa de setembro, que tem três workouts.
 * Este arquivo existe para provar que o três não está escondido em lugar
 * nenhum: o mesmo motor tem de pontuar um evento de UM workout e um de
 * CINCO sem nenhuma linha de código diferente.
 *
 * Era exatamente o que o modelo antigo não conseguia — havia uma tabela por
 * WOD, com as colunas daquele workout, e um quarto exigia programador.
 */

/** Monta um WOD com uma prova simples de carga. */
function wodSimples(numero: number, codigo: string): Wod {
  const prova: Prova = {
    id: `prova-${codigo}`,
    wodId: `wod-${numero}`,
    codigo,
    descricao: `Prova ${codigo}`,
    criterio: null,
    unidade: 'KG',
    direcao: 'MAIOR_VENCE',
    origem: 'DIGITADA',
    porAtleta: false,
    componentes: [],
    pontua: true,
    ordem: 1,
  };

  return {
    id: `wod-${numero}`,
    eventId: 'evento-teste',
    numero,
    nome: `WORKOUT ${numero}`,
    formato: 'CARGA MÁXIMA',
    capSegundos: null,
    resumo: null,
    permiteCap: false,
    regras: [],
    pendencias: [],
    ordem: numero,
    blocos: [],
    provas: [prova],
  };
}

function homologar(wods: readonly Wod[], teamIds: readonly string[]): WodEntry[] {
  return wods.flatMap((w) =>
    teamIds.map((teamId) => ({
      wodId: w.id,
      teamId,
      status: 'PUBLISHED' as const,
      concluiu: true,
      volume: null,
      observacao: null,
    })),
  );
}

/** valores[teamId] = lista de cargas, uma por WOD, na ordem. */
function lancar(wods: readonly Wod[], valores: Record<string, number[]>): ProvaResult[] {
  const saida: ProvaResult[] = [];
  for (const [teamId, cargas] of Object.entries(valores)) {
    wods.forEach((w, i) => {
      const carga = cargas[i];
      if (carga === undefined) return;
      saida.push({
        provaId: w.provas[0]!.id,
        teamId,
        valorAtleta1: null,
        valorAtleta2: null,
        valor: carga,
      });
    });
  }
  return saida;
}

function montar(wods: Wod[], valores: Record<string, number[]>) {
  const teamIds = Object.keys(valores);
  const teams = teamIds.map((id, i) => team(i + 1, { id, category: 'MISTA' }));

  return buildLeaderboard({
    teams,
    wods,
    entries: homologar(wods, teamIds),
    results: lancar(wods, valores),
    settings: DEFAULT_SETTINGS,
  });
}

describe('Um evento de UM workout só', () => {
  const wods = [wodSimples(1, '1A')];
  const board = montar(wods, { 'time-a': [100], 'time-b': [90], 'time-c': [80] });
  const classificacao = standingsByCategory(board.standings, 'MISTA');

  it('pontua e classifica', () => {
    expect(classificacao.map((r) => r.team.id)).toEqual(['time-a', 'time-b', 'time-c']);
    expect(classificacao.map((r) => r.totalPoints)).toEqual([1, 2, 3]);
  });

  it('a fórmula do total mostra a única prova', () => {
    expect(formulaDoTotal(wods)).toBe('1A');
  });

  it('o WOD tem resultado assim que sua única prova é lançada', () => {
    expect(board.wodScores.get(wods[0]!.id)?.get('time-a')?.hasResult).toBe(true);
  });
});

describe('Um evento de CINCO workouts', () => {
  const wods = [1, 2, 3, 4, 5].map((n) => wodSimples(n, `${n}A`));

  // time-a vence em tudo; time-b fica em segundo em tudo; time-c por último.
  const board = montar(wods, {
    'time-a': [100, 100, 100, 100, 100],
    'time-b': [90, 90, 90, 90, 90],
    'time-c': [80, 80, 80, 80, 80],
  });
  const classificacao = standingsByCategory(board.standings, 'MISTA');

  it('soma os cinco workouts, sem parar no terceiro', () => {
    expect(classificacao.map((r) => r.totalPoints)).toEqual([5, 10, 15]);
  });

  it('a fórmula do total lista as cinco provas', () => {
    expect(formulaDoTotal(wods)).toBe('1A + 2A + 3A + 4A + 5A');
    expect(provasQuePontuam(wods)).toHaveLength(5);
  });

  it('cada workout tem a sua própria classificação', () => {
    for (const w of wods) {
      expect(board.wodScores.get(w.id)?.get('time-a')?.rank, `WOD ${w.numero}`).toBe(1);
      expect(board.wodScores.get(w.id)?.get('time-c')?.rank, `WOD ${w.numero}`).toBe(3);
    }
  });

  // A regra vale para qualquer quantidade: a dupla só tem total quando TODOS
  // os workouts foram lançados. Com cinco, faltar o quinto é o mesmo que,
  // com três, faltar o terceiro.
  it('quem não fez o quinto workout fica atrás de quem fez os cinco', () => {
    const parcial = montar(wods, {
      'fez-tudo': [80, 80, 80, 80, 80],
      'faltou-um': [100, 100, 100, 100],
    });
    const ordem = standingsByCategory(parcial.standings, 'MISTA');

    expect(ordem[0]?.team.id).toBe('fez-tudo');
    expect(ordem[0]?.scoredWods).toBe(5);
    expect(ordem[1]?.team.id).toBe('faltou-um');
    expect(ordem[1]?.scoredWods).toBe(4);
  });
});

describe('Um evento de DEZ workouts', () => {
  // Nenhum número está cravado. Dez é só um número maior que três.
  const wods = Array.from({ length: 10 }, (_, i) => wodSimples(i + 1, `${i + 1}A`));
  const board = montar(wods, {
    'time-a': Array(10).fill(100),
    'time-b': Array(10).fill(90),
  });
  const classificacao = standingsByCategory(board.standings, 'MISTA');

  it('pontua os dez', () => {
    expect(classificacao.map((r) => r.totalPoints)).toEqual([10, 20]);
    expect(classificacao[0]?.scoredWods).toBe(10);
  });
});
