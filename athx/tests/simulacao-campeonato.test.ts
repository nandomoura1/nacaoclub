import { describe, expect, it } from 'vitest';
import { buildLeaderboard } from '@/lib/scoring/build';
import { standingsByCategory } from '@/lib/scoring/overall';
import { ADMIN_STATUSES, PUBLIC_STATUSES } from '@/lib/scoring/eligibility';
import { buildExportRows } from '@/services/export-service';
import type { Category } from '@/types/domain';
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

/**
 * UM CAMPEONATO INTEIRO, DO PRIMEIRO LANÇAMENTO AO PÓDIO.
 *
 * Os outros testes isolam uma regra cada. Este monta uma etapa completa —
 * 19 duplas, três categorias, três workouts, oito provas — e confere o
 * resultado final como a organização vai lê-lo no dia.
 *
 * O valor está nas armadilhas, todas plantadas de propósito e todas coisas
 * que acontecem num evento de verdade:
 *
 *   · empate de pontos na categoria, resolvido pelo WOD 3
 *   · empate de CARGA numa prova — duas duplas com o mesmo número
 *   · duplas que estouraram o CAP, ordenadas pelo volume
 *   · uma dupla que não apareceu para um workout inteiro
 *   · uma dupla desclassificada, que não pode aparecer em lugar nenhum
 *   · um lançamento em rascunho: o público não vê, a organização vê
 *   · distâncias livres, que não são múltiplos de 500 m
 *
 * Os números abaixo foram calculados à mão antes de o teste ser escrito. Se
 * o motor mudar, é o motor que está errado até prova em contrário.
 */

const CONFIG = settings({ dnfPolicy: 'VOLUME_DESC', tieBreaker1: 'WOD3' });

/* ==========================================================================
   AS DUPLAS
   ========================================================================== */

function dupla(n: number, nome: string, categoria: Category, bateria: number) {
  return team(n, {
    id: nome,
    teamName: nome,
    category: categoria,
    battery: bateria,
    athlete1: `${nome} A`,
    athlete2: `${nome} B`,
  });
}

const MASCULINAS = [
  dupla(1, 'm1', 'MASCULINA', 1),
  dupla(2, 'm2', 'MASCULINA', 1),
  dupla(3, 'm3', 'MASCULINA', 1),
  dupla(4, 'm4', 'MASCULINA', 2),
  dupla(5, 'm5', 'MASCULINA', 2),
  dupla(6, 'm6', 'MASCULINA', 2),
];

const FEMININAS = [
  dupla(7, 'f1', 'FEMININA', 1),
  dupla(8, 'f2', 'FEMININA', 1),
  dupla(9, 'f3', 'FEMININA', 1),
  dupla(10, 'f4', 'FEMININA', 2),
  dupla(11, 'f5', 'FEMININA', 2),
  dupla(12, 'f6', 'FEMININA', 2),
];

const MISTAS = [
  dupla(13, 'x1', 'MISTA', 1),
  dupla(14, 'x2', 'MISTA', 1),
  dupla(15, 'x3', 'MISTA', 1),
  dupla(16, 'x4', 'MISTA', 2),
  dupla(17, 'x5', 'MISTA', 2),
  dupla(18, 'x6', 'MISTA', 2),
];

/** Fez os melhores resultados da etapa e foi desclassificada. Não existe. */
const DESCLASSIFICADA = team(19, {
  id: 'x7',
  teamName: 'x7',
  category: 'MISTA',
  battery: 2,
  status: 'DESCLASSIFICADA',
});

const TODAS = [...MASCULINAS, ...FEMININAS, ...MISTAS, DESCLASSIFICADA];

/* ==========================================================================
   O QUE ACONTECEU EM CADA WORKOUT
   ========================================================================== */

const WOD1 = [
  // Masculina. m1 e m2 empatam em 1D (650 kg) com cargas distribuídas de
  // formas diferentes — é o que faz 1A, 1B e 1C ordenarem diferente de 1D.
  ...cargas('m1', [70, 60, 100, 100, 160, 160]), // 130 / 200 / 320 = 650
  ...cargas('m2', [75, 75, 110, 110, 140, 140]), // 150 / 220 / 280 = 650
  ...cargas('m3', [70, 70, 105, 105, 145, 145]), // 140 / 210 / 290 = 640
  ...cargas('m4', [60, 60, 95, 95, 150, 150]), //  120 / 190 / 300 = 610
  // m5 empata com m2 no DEADLIFT (280 kg): empate dentro de uma prova.
  ...cargas('m5', [55, 55, 90, 90, 140, 140]), //  110 / 180 / 280 = 570
  ...cargas('m6', [50, 50, 85, 85, 130, 130]), //  100 / 170 / 260 = 530

  // Feminina. f6 é a mais forte aqui — e some no WOD 3.
  ...cargas('f1', [60, 60, 100, 100, 140, 140]), // 600
  ...cargas('f2', [58, 58, 97, 97, 135, 135]), //  580
  ...cargas('f3', [56, 56, 94, 94, 130, 130]), //  560
  ...cargas('f4', [54, 54, 91, 91, 125, 125]), //  540
  ...cargas('f5', [52, 52, 88, 88, 120, 120]), //  520
  ...cargas('f6', [62, 62, 103, 103, 145, 145]), // 620

  ...cargas('x1', [68, 62, 105, 100, 150, 145]), // 630
  ...cargas('x2', [66, 60, 102, 98, 147, 142]), //  615
  ...cargas('x3', [64, 58, 99, 96, 144, 139]), //   600
  ...cargas('x4', [62, 56, 96, 94, 141, 136]), //   585
  ...cargas('x5', [60, 54, 93, 92, 138, 133]), //   570
  ...cargas('x6', [58, 52, 90, 90, 135, 130]), //   555

  // A desclassificada teria vencido tudo.
  ...cargas('x7', [90, 90, 140, 140, 200, 200]),
];

const WOD2 = [
  // Distâncias LIVRES: 2,41 km não é múltiplo de 500 m, e tem de ser aceito.
  ...distancias('m1', 2.41, 12.33),
  ...distancias('m2', 2.59, 11.8),
  ...distancias('m3', 2.5, 12.0),
  ...distancias('m4', 2.2, 12.6),
  ...distancias('m5', 2.0, 11.0),
  ...distancias('m6', 1.8, 10.5),

  ...distancias('f1', 2.8, 12.5),
  ...distancias('f2', 2.6, 12.0),
  ...distancias('f3', 2.4, 11.5),
  ...distancias('f4', 2.2, 11.0),
  ...distancias('f5', 2.0, 10.5),
  ...distancias('f6', 3.0, 13.0),

  ...distancias('x1', 2.9, 12.8),
  ...distancias('x2', 2.7, 12.4),
  ...distancias('x3', 2.5, 12.1),
  ...distancias('x4', 2.3, 11.7),
  ...distancias('x5', 2.1, 11.3),
  ...distancias('x6', 1.9, 10.9),

  ...distancias('x7', 4.0, 15.0),
];

const WOD3 = [
  // Masculina: quatro concluíram, duas estouraram o CAP de 20 min.
  tempo('m1', 900),
  tempo('m2', 840),
  tempo('m3', 960),
  tempo('m4', 1020),
  tempo('m5', 1200, false, 450),
  tempo('m6', 1200, false, 380),

  // Feminina: f6 NÃO aparece aqui de propósito.
  tempo('f1', 880),
  tempo('f2', 920),
  tempo('f3', 960),
  tempo('f4', 1000),
  tempo('f5', 1040),

  tempo('x1', 870),
  tempo('x2', 910),
  tempo('x3', 950),
  tempo('x4', 990),
  tempo('x5', 1030),
  tempo('x6', 1070),

  tempo('x7', 700),
];

/** O lançamento do WOD 3 da x6 ainda está em rascunho — o juiz não homologou. */
const RASCUNHO = entry(3, 'x6', { status: 'DRAFT', concluiu: true });

function montarCampeonato() {
  const base = cenario({
    teams: TODAS,
    wod1: WOD1,
    wod2: WOD2,
    wod3: WOD3,
    settings: CONFIG,
  });
  const entries = base.entries.map((e) =>
    e.teamId === 'x6' && e.wodId === wodNumero(3).id ? RASCUNHO : e,
  );
  return { ...base, entries };
}

function campeonato(statuses = PUBLIC_STATUSES) {
  return buildLeaderboard(montarCampeonato(), { statuses });
}

const board = campeonato();

const pts = (codigo: string, teamId: string) =>
  board.provas.get(prova(codigo).id)?.get(teamId)?.points ?? null;
const rank = (codigo: string, teamId: string) =>
  board.provas.get(prova(codigo).id)?.get(teamId)?.rank ?? null;
const wodPts = (numero: number, teamId: string) =>
  board.wodScores.get(wodNumero(numero).id)?.get(teamId)?.points ?? null;
const valorDe = (codigo: string, teamId: string) =>
  board.provas.get(prova(codigo).id)?.get(teamId)?.valor ?? null;
const linha = (teamId: string) => board.standings.find((r) => r.team.id === teamId);
const categoria = (c: Category) => standingsByCategory(board.standings, c);

/* ==========================================================================
   WOD 1 — CARGAS
   ========================================================================== */

describe('WOD 1 · a prova por atleta soma os dois', () => {
  it('o valor da prova é a soma da dupla', () => {
    expect(valorDe('1A', 'm1')).toBe(130);
    expect(valorDe('1C', 'm1')).toBe(320);
  });

  it('a prova calculada soma as três lançadas', () => {
    expect(valorDe('1D', 'm1')).toBe(650);
    expect(valorDe('1D', 'm2')).toBe(650);
  });

  // Mesma carga = mesma colocação e mesmos pontos. Sem isso, a ordem
  // alfabética ou a de cadastro decidiria o pódio.
  it('empate de carga numa prova dá a mesma colocação às duas', () => {
    expect(valorDe('1C', 'm2')).toBe(280);
    expect(valorDe('1C', 'm5')).toBe(280);
    expect(rank('1C', 'm2')).toBe(rank('1C', 'm5'));
    expect(pts('1C', 'm2')).toBe(pts('1C', 'm5'));
  });

  it('o empate em 1D não arrasta 1A, 1B e 1C', () => {
    expect(pts('1D', 'm1')).toBe(pts('1D', 'm2')); // empatadas no total
    expect(pts('1A', 'm1')).not.toBe(pts('1A', 'm2')); // e separadas nas partes
  });

  it('o total do WOD 1 é a soma das quatro provas', () => {
    // m1: 1A 3 + 1B 3 + 1C 1 + 1D 1 = 8
    expect(wodPts(1, 'm1')).toBe(8);
    // m2: 1A 1 + 1B 1 + 1C 4 + 1D 1 = 7
    expect(wodPts(1, 'm2')).toBe(7);
  });
});

/* ==========================================================================
   WOD 2 — DISTÂNCIAS
   ========================================================================== */

describe('WOD 2 · distância livre', () => {
  it('aceita distância que não é múltiplo de 500 m', () => {
    expect(valorDe('2A', 'm1')).toBe(2.41);
  });

  it('a soma não inventa dízima', () => {
    // 2,41 + 12,33 em ponto flutuante dá 14,739999999999998 sem o
    // arredondamento — e dois valores iguais deixariam de empatar.
    expect(valorDe('2C', 'm1')).toBe(14.74);
  });

  it('o total do WOD 2 é a soma das três provas', () => {
    // m4: 2A 4 + 2B 1 + 2C 1 = 6
    expect(wodPts(2, 'm4')).toBe(6);
  });
});

/* ==========================================================================
   WOD 3 — CAP E VOLUME
   ========================================================================== */

describe('WOD 3 · quem estourou o CAP', () => {
  it('quem concluiu vem antes de quem não concluiu', () => {
    expect(rank('3A', 'm4')).toBe(4); // último a concluir
    expect(rank('3A', 'm5')).toBe(5); // primeiro a não concluir
  });

  it('entre os que não concluíram, mais volume é melhor', () => {
    expect(rank('3A', 'm5')).toBeLessThan(rank('3A', 'm6')!); // 450 > 380
  });

  it('menor tempo vence', () => {
    expect(rank('3A', 'm2')).toBe(1); // 14:00
    expect(rank('3A', 'm1')).toBe(2); // 15:00
  });
});

/* ==========================================================================
   A CLASSIFICAÇÃO FINAL
   ========================================================================== */

describe('Classificação · Dupla Masculina', () => {
  const tabela = categoria('MASCULINA');

  it('todas as seis entram', () => {
    expect(tabela).toHaveLength(6);
  });

  it('os totais batem com a conta à mão', () => {
    expect(linha('m1')?.totalPoints).toBe(17); // 8 + 7 + 2
    expect(linha('m2')?.totalPoints).toBe(17); // 7 + 9 + 1
    expect(linha('m3')?.totalPoints).toBe(21);
    expect(linha('m4')?.totalPoints).toBe(24);
    expect(linha('m5')?.totalPoints).toBe(39);
    expect(linha('m6')?.totalPoints).toBe(48);
  });

  // A REGRA DA CASA: empate de pontos se resolve pela colocação no WOD 3.
  it('o empate em 17 pontos é desfeito pelo WOD 3', () => {
    expect(wodPts(3, 'm2')).toBe(1);
    expect(wodPts(3, 'm1')).toBe(2);
    expect(tabela[0]?.team.id).toBe('m2');
    expect(tabela[1]?.team.id).toBe('m1');
  });

  it('o desempate é anunciado na linha da dupla', () => {
    expect(tabela[0]?.desempatadoPor).toBeTruthy();
    expect(tabela[0]?.tied).toBe(false);
  });

  it('a ordem final da categoria', () => {
    expect(tabela.map((r) => r.team.id)).toEqual(['m2', 'm1', 'm3', 'm4', 'm5', 'm6']);
    expect(tabela.map((r) => r.position)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('Classificação · Dupla Feminina', () => {
  const tabela = categoria('FEMININA');

  // f6 tem a MENOR pontuação da categoria e fica em último: ela não fez o
  // WOD 3. Quem completou a etapa vem antes de quem não completou, sempre.
  it('quem não fez um workout cai para o fim, mesmo com menos pontos', () => {
    expect(linha('f6')?.totalPoints).toBe(7);
    expect(linha('f6')?.scoredWods).toBe(2);
    expect(linha('f1')?.totalPoints).toBe(15);
    expect(linha('f1')?.scoredWods).toBe(3);

    expect(tabela[0]?.team.id).toBe('f1');
    expect(tabela.at(-1)?.team.id).toBe('f6');
  });

  it('a ordem final da categoria', () => {
    expect(tabela.map((r) => r.team.id)).toEqual(['f1', 'f2', 'f3', 'f4', 'f5', 'f6']);
  });
});

describe('Classificação · Dupla Mista', () => {
  const tabela = categoria('MISTA');

  it('a dupla desclassificada não aparece', () => {
    expect(tabela.some((r) => r.team.id === 'x7')).toBe(false);
    expect(board.standings.some((r) => r.team.id === 'x7')).toBe(false);
  });

  it('a desclassificada também não ocupa lugar nas provas', () => {
    // Ela tinha as maiores cargas da etapa. Se contasse, empurraria todo
    // mundo uma posição para baixo em 1A.
    expect(pts('1A', 'x7')).toBeNull();
    expect(rank('1A', 'x1')).toBe(1);
  });

  it('o rascunho não homologado não conta para o público', () => {
    expect(wodPts(3, 'x6')).toBeNull();
    expect(linha('x6')?.scoredWods).toBe(2);
    expect(tabela.at(-1)?.team.id).toBe('x6');
  });
});

/* ==========================================================================
   AS DUAS VISÕES: PÚBLICO E ORGANIZAÇÃO
   ========================================================================== */

describe('O mesmo evento, visto pela organização', () => {
  const admin = campeonato(ADMIN_STATUSES);

  it('a organização enxerga o rascunho que o público não vê', () => {
    const publico = board.standings.find((r) => r.team.id === 'x6');
    const org = admin.standings.find((r) => r.team.id === 'x6');

    expect(publico?.scoredWods).toBe(2);
    expect(org?.scoredWods).toBe(3);
  });

  it('nem por isso a desclassificada reaparece', () => {
    expect(admin.standings.some((r) => r.team.id === 'x7')).toBe(false);
  });
});

/* ==========================================================================
   A PLANILHA QUE SAI NO FIM
   ========================================================================== */

describe('A exportação fecha com a tela', () => {
  const linhas = buildExportRows(board);

  // 19, e não 18: a planilha é o registro COMPLETO da etapa, e inclui a
  // desclassificada — marcada no status e SEM colocação. Esconder quem foi
  // desclassificado da folha oficial seria apagar a decisão da organização.
  it('traz todas as duplas, inclusive a desclassificada', () => {
    expect(linhas).toHaveLength(19);

    const fora = linhas.find((l) => l.dupla === 'x7');
    expect(fora?.status).toBe('DESCLASSIFICADA');
    expect(fora?.posicao_categoria).toBe('');
    expect(fora?.posicao_geral).toBe('');
    expect(fora?.total_pontos).toBe('');
  });

  it('a planilha repete a classificação da tela, sem recalcular', () => {
    const m2 = linhas.find((l) => l.dupla === 'm2');
    expect(m2?.posicao_categoria).toBe(1);
    expect(m2?.total_pontos).toBe(17);
  });

  it('tem uma coluna por prova do evento', () => {
    const cabecalho = Object.keys(linhas[0] ?? {});
    for (const codigo of ['1a', '1b', '1c', '1d', '2a', '2b', '2c', '3a']) {
      expect(
        cabecalho.some((c) => c.startsWith(codigo)),
        `faltou coluna de ${codigo.toUpperCase()}`,
      ).toBe(true);
    }
  });
});

/* ==========================================================================
   CONSISTÊNCIA GERAL
   ========================================================================== */

describe('O evento fecha', () => {
  it('as 18 duplas ativas estão classificadas, e só elas', () => {
    expect(board.standings).toHaveLength(18);
  });

  it('cada categoria tem a sua própria disputa, do 1º ao 6º', () => {
    for (const c of ['MASCULINA', 'FEMININA', 'MISTA'] as const) {
      const t = categoria(c);
      expect(t.map((r) => r.position), c).toEqual([1, 2, 3, 4, 5, 6]);
    }
  });

  it('o total de cada dupla é a soma dos pontos das provas que pontuam', () => {
    const quePontuam = board.provaList.filter((p) => p.pontua);

    for (const row of board.standings) {
      const somaDasProvas = quePontuam.reduce(
        (acc, p) => acc + (board.provas.get(p.id)?.get(row.team.id)?.points ?? 0),
        0,
      );
      expect(row.totalPoints, `${row.team.teamName}`).toBe(somaDasProvas);
    }
  });

  it('ninguém pontua numa prova sem ter valor nela', () => {
    for (const p of board.provaList) {
      for (const row of board.standings) {
        const score = board.provas.get(p.id)?.get(row.team.id);
        if (!score) continue;
        const temValor = score.valor != null;
        const naoConcluiuComVolume = p.codigo === '3A';
        if (!temValor && !naoConcluiuComVolume) {
          expect.unreachable(`${row.team.teamName} pontuou em ${p.codigo} sem valor`);
        }
      }
    }
  });
});
