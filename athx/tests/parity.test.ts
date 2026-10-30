import { describe, expect, it } from 'vitest';
import type { Category } from '@/types/domain';
import { buildLeaderboard } from '@/lib/scoring/build';
import { standingsByCategory } from '@/lib/scoring/overall';
import { cargas, cenario, distancias, prova, settings, team, tempo, WODS } from './helpers';
import input from './fixtures/parity-input.json';
import expected from './fixtures/parity-expected.json';

/**
 * PARIDADE ENTRE OS DOIS MOTORES (§25)
 *
 * `parity-expected.json` NÃO foi escrito à mão: é a saída real das views
 * athx_valores, athx_prova_scores, athx_wod_scores e athx_standings rodando
 * em um PostgreSQL 16 sobre o dataset de `parity-input.json`.
 *
 * São 20 duplas divididas em 5 Masculinas, 6 Femininas e 9 Mistas — divisão
 * desigual de propósito: é ela que prova que cada prova é ranqueada dentro
 * da categoria. Há empates de carga, empates de tempo, duplas que não
 * concluíram o WOD 3 e uma distância fora do múltiplo de 500 m.
 *
 * Este teste roda o motor TypeScript sobre o MESMO dataset e exige resultado
 * idêntico. Se alguém mexer em um dos dois lados sem mexer no outro, quebra
 * aqui — que é exatamente o ponto: o público e o admin nunca podem ver
 * classificações diferentes.
 */

interface Linha {
  n: number;
  cat: Category;
  sp1: number; sp2: number;
  bs1: number; bs2: number;
  dl1: number; dl2: number;
  runKm: number;
  bikeKm: number;
  finished: boolean;
  time: number;
  volume: number | null;
}

interface ProvaEsperada {
  valor: number | null;
  rank: number | null;
  points: number | null;
  tied: boolean;
  needs_decision: boolean;
}

interface Esperado {
  team_number: number;
  category: Category;
  position: number;
  category_position: number;
  tied: boolean;
  total_points: number;
  scored_wods: number;
  provas: Record<string, ProvaEsperada>;
  wods: Record<string, { points: number | null; rank: number | null; has_result: boolean }>;
}

const linhas = input as Linha[];
const esperado = expected as Esperado[];

const board = buildLeaderboard(
  cenario({
    teams: linhas.map((r) => team(r.n, { category: r.cat })),
    wod1: linhas.flatMap((r) => cargas(`team-${r.n}`, [r.sp1, r.sp2, r.bs1, r.bs2, r.dl1, r.dl2])),
    wod2: linhas.flatMap((r) => distancias(`team-${r.n}`, r.runKm, r.bikeKm)),
    wod3: linhas.map((r) => tempo(`team-${r.n}`, r.time, r.finished, r.volume)),
    // O fixture foi gerado com o padrão do banco: desempate pelo WOD 3.
    settings: settings({ tieBreaker1: 'WOD3' }),
  }),
);

const porNumero = new Map(board.standings.map((s) => [s.team.teamNumber, s]));

describe('Motor TypeScript × motor SQL', () => {
  it('o cenário é mesmo desigual — 5 · 6 · 9', () => {
    const porCategoria = (c: Category) => esperado.filter((e) => e.category === c).length;
    expect(porCategoria('MASCULINA')).toBe(5);
    expect(porCategoria('FEMININA')).toBe(6);
    expect(porCategoria('MISTA')).toBe(9);
  });

  it('produz o mesmo valor bruto em cada prova', () => {
    for (const linha of esperado) {
      const row = porNumero.get(linha.team_number);
      expect(row, `dupla ${linha.team_number}`).toBeDefined();

      for (const [codigo, alvo] of Object.entries(linha.provas)) {
        const score = row?.provas[prova(codigo).id];
        expect(score?.valor ?? null, `valor de ${codigo} na dupla ${linha.team_number}`).toBe(
          alvo.valor,
        );
      }
    }
  });

  it('produz a mesma posição e os mesmos pontos em cada prova', () => {
    for (const linha of esperado) {
      const row = porNumero.get(linha.team_number);

      for (const [codigo, alvo] of Object.entries(linha.provas)) {
        const score = row?.provas[prova(codigo).id];
        const onde = `${codigo} na dupla ${linha.team_number}`;
        expect(score?.rank ?? null, `posição de ${onde}`).toBe(alvo.rank);
        expect(score?.points ?? null, `pontos de ${onde}`).toBe(alvo.points);
        expect(score?.tied ?? false, `empate de ${onde}`).toBe(alvo.tied);
      }
    }
  });

  it('produz o mesmo total por WOD', () => {
    for (const linha of esperado) {
      const row = porNumero.get(linha.team_number);

      for (const [numero, alvo] of Object.entries(linha.wods)) {
        const wod = WODS.find((w) => w.numero === Number(numero));
        const score = row?.wods[wod!.id];
        const onde = `WOD ${numero} da dupla ${linha.team_number}`;
        expect(score?.points ?? null, `pontos do ${onde}`).toBe(alvo.points);
        expect(score?.hasResult ?? false, `resultado do ${onde}`).toBe(alvo.has_result);
      }
    }
  });

  it('produz a mesma classificação geral', () => {
    for (const linha of esperado) {
      const row = porNumero.get(linha.team_number);
      expect(row?.totalPoints, `total da dupla ${linha.team_number}`).toBe(linha.total_points);
      expect(row?.scoredWods, `WODs da dupla ${linha.team_number}`).toBe(linha.scored_wods);
      expect(row?.position, `posição geral da dupla ${linha.team_number}`).toBe(linha.position);
    }
  });

  it('coloca cada dupla na mesma posição de categoria', () => {
    for (const categoria of ['MASCULINA', 'FEMININA', 'MISTA'] as const) {
      for (const row of standingsByCategory(board.standings, categoria)) {
        const alvo = esperado.find((e) => e.team_number === row.team.teamNumber);
        expect(alvo?.category, `categoria da dupla ${row.team.teamNumber}`).toBe(categoria);
        expect(row.position, `posição na categoria da dupla ${row.team.teamNumber}`).toBe(
          alvo?.category_position,
        );
      }
    }
  });

  it('marca os mesmos empates que o banco', () => {
    for (const linha of esperado) {
      expect(porNumero.get(linha.team_number)?.tied, `empate da dupla ${linha.team_number}`).toBe(
        linha.tied,
      );
    }
  });

  it('nenhuma pontuação de prova passa do tamanho da categoria', () => {
    for (const categoria of ['MASCULINA', 'FEMININA', 'MISTA'] as const) {
      const naCategoria = standingsByCategory(board.standings, categoria);
      const teto = naCategoria.length;

      for (const row of naCategoria) {
        for (const p of board.provaList) {
          const pontos = row.provas[p.id]?.points;
          if (pontos === null || pontos === undefined) continue;
          expect(pontos, `${p.codigo} da dupla ${row.team.teamNumber} em ${categoria}`)
            .toBeLessThanOrEqual(teto);
        }
      }
    }
  });
});
