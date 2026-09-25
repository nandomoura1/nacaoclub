import { describe, expect, it } from 'vitest';
import { detectLayout, parseRange, parseSheet, splitTurmaProfessor } from '@/domain/import/parsers';
import type { Grid } from '@/domain/import/types';

/**
 * Fixtures com a MESMA estrutura da planilha real da Nação (docs/06 §2),
 * com nomes fictícios. "^" = célula continuação de mesclagem (vertical).
 */
function grid(rows: string[][]): Grid {
  return rows.map((r) => r.map((t) => (t === '^' ? { text: '', slave: true } : { text: t, slave: false })));
}

const SALA = grid([
  ['HORARIOS CROSSFIT', '', '', '', ''],
  ['HORARIO', 'SALA', 'SEGUNDA', 'TERÇA', 'QUARTA'],
  ['5h', 'CROSSFIT 1', 'Ana', 'Ana', 'Ana'],
  ['^', 'FUNCIONAL 1', 'Hyrox', '', 'Hyrox'],
  ['^', '^', 'Bruno', '-', 'Bruno'],
  ['^', 'AUXILIAR', 'Carla', 'Carla', ''],
  ['^', '^', 'Davi', '', ''],
  ['6h', 'CROSSFIT 2', 'Master', 'Barbell', ''],
  ['^', '^', 'Bruno', 'Ana (core)', ''],
  ['^', 'SALA TATAME', 'Mobilidade', 'Muay Thai', 'Core'],
  ['^', '^', 'Ana (mobility)', 'Edu', ''],
  ['^', '^', 'Jiu Jitsu Kids', '', ''],
  ['^', '^', 'Edu', '', ''],
]);

describe('layout SALA (CrossFit / Contraturno)', () => {
  const { rows, layout } = parseSheet('CROSSFIT', SALA);
  const at = (ref: string) => rows.find((r) => r.ref === ref);

  it('detecta o formato', () => expect(layout).toBe('SALA'));

  it('sala com modalidade implícita: a célula é o professor', () => {
    expect(at('C3')).toMatchObject({ weekday: 1, startMin: 300, activityText: null, fallbackText: 'crossfit', spaceHint: 'CROSSFIT 1', people: [{ raw: 'Ana', role: 'TITULAR' }] });
  });

  it('pares atividade/professor; "-" é vazio', () => {
    expect(at('C4')).toMatchObject({ activityText: 'Hyrox', fallbackText: 'funcional', people: [{ raw: 'Bruno' }] });
    expect(at('D4')).toBeUndefined();
  });

  it('linha de auxiliares vira uma atividade com todas as pessoas', () => {
    expect(at('C6')).toMatchObject({ labelHint: 'AUXILIAR', fallbackText: 'crossfit', people: [{ raw: 'Carla', role: 'AUXILIAR' }, { raw: 'Davi', role: 'AUXILIAR' }] });
    expect(at('D6')?.people).toHaveLength(1);
  });

  it('sala com 4 linhas = dois pares; atividade sem professor é mantida', () => {
    expect(at('C10')).toMatchObject({ startMin: 360, activityText: 'Mobilidade', fallbackText: null, people: [{ raw: 'Ana (mobility)' }] });
    expect(at('C12')).toMatchObject({ activityText: 'Jiu Jitsu Kids', people: [{ raw: 'Edu' }] });
    expect(at('E10')).toMatchObject({ activityText: 'Core', people: [] });
  });

  it('conta como a planilha: uma célula = uma aula', () => {
    const ana = rows.filter((r) => r.people.some((p) => p.raw.startsWith('Ana')));
    expect(ana).toHaveLength(5); // 3× CrossFit 1, core, mobility
  });
});

const QUADRA = grid([
  ['HORARIO', 'QUADRA', 'SEGUNDA', 'TERÇA'],
  ['7h', 'QUADRA 6', 'SÉRIE D - FULANO', 'SÉRIE A - BELTRANO'],
  ['^', 'QUADRA 5', 'PERSONAL FULAN', 'FITVOLÊI ADULTO'],
  ['^', 'ÁGUIA', '', 'CICLANO'],
  ['^', 'COORDENADOR', 'FULANO', 'BASE FORTE FTV - BELTRANO'],
  ['^', 'QUADRA 4', 'SÉRIE C -', ''],
  ['HORÁRIO DOS PROFESSORES - 2024', '', '', ''],
  ['Fulano', '', 'algo', ''],
]);

describe('layout QUADRA (Quadras de Areia)', () => {
  const { rows, layout, warnings } = parseSheet('QUADRAS', QUADRA);
  const at = (ref: string) => rows.find((r) => r.ref === ref);

  it('detecta o formato e para no fim da grade', () => {
    expect(layout).toBe('QUADRA');
    expect(warnings[0]).toMatch(/A7: a grade termina aqui/);
    expect(rows.some((r) => r.ref.endsWith('8'))).toBe(false);
  });

  it('"TURMA - PROFESSOR"', () => {
    expect(at('C2')).toMatchObject({ activityText: 'SÉRIE D', fallbackText: 'futevolei', kind: 'AULA', spaceHint: 'QUADRA 6', people: [{ raw: 'FULANO' }] });
  });

  it('personal é só controle de espaço', () => {
    expect(at('C3')).toMatchObject({ kind: 'PERSONAL', people: [{ raw: 'FULAN' }] });
  });

  it('quadra só com turma = aula sem professor; "SÉRIE C -" também', () => {
    expect(at('D3')).toMatchObject({ activityText: 'FITVOLÊI ADULTO', people: [] });
    expect(at('C6')).toMatchObject({ activityText: 'SÉRIE C', people: [] });
  });

  it('linha nomeada: ÁGUIA é turma; COORDENADOR com nome sozinho é coordenação', () => {
    expect(at('D4')).toMatchObject({ activityText: 'ÁGUIA', kind: 'AULA', people: [{ raw: 'CICLANO' }] });
    expect(at('C5')).toMatchObject({ kind: 'COORDENACAO', labelHint: 'Coordenação', people: [{ raw: 'FULANO' }] });
    expect(at('D5')).toMatchObject({ kind: 'AULA', activityText: 'BASE FORTE FTV', people: [{ raw: 'BELTRANO' }] });
  });
});

const PLANTAO = grid([
  ['HORARIOS NAÇÃO FIT', '', '', '', '', ''],
  ['MANHÃ', 'PROFESSOR', 'ESTAGIÁRIO', 'TARDE', 'PROFESSOR', 'ESTAGIÁRIO'],
  ['5h - 6h', 'ANA', 'BIA', '12h - 13h', 'CAIO', ''],
  ['', '', '', '', 'DANI', 'EVA'],
  ['6h - 7h', 'ANA', '', '', '', ''],
  ['ESCALA DE FINAL DE SEMANA', '', '', '', '', ''],
  ['Data', 'Dia', 'Professor', '', '', ''],
]);

describe('layout PLANTÃO (Nação Fit)', () => {
  const { rows, layout, warnings } = parseSheet('NAÇÃO FIT', PLANTAO);

  it('detecta, lê as trincas e repete de segunda a sexta', () => {
    expect(layout).toBe('PLANTAO');
    expect(rows).toHaveLength(3 * 5);
    expect(rows.filter((r) => r.weekday === 6)).toHaveLength(0);
  });

  it('faixa vira início + duração; professor e estagiário na mesma atividade', () => {
    const cedo = rows.find((r) => r.startMin === 300 && r.weekday === 1)!;
    expect(cedo).toMatchObject({ durationMin: 60, kind: 'PLANTAO', fallbackText: 'musculacao', people: [{ raw: 'ANA', role: 'TITULAR' }, { raw: 'BIA', role: 'ESTAGIARIO' }] });
    const tarde = rows.find((r) => r.startMin === 720 && r.weekday === 3)!;
    expect(tarde.people.map((p) => p.raw)).toEqual(['CAIO', 'DANI', 'EVA']);
  });

  it('fim de semana é por data: fica de fora, com aviso', () => {
    expect(warnings.join()).toMatch(/fim de semana/);
  });
});

describe('utilitários', () => {
  it('faixas de horário', () => {
    expect(parseRange('5h - 6h')).toEqual([300, 360]);
    expect(parseRange('22h - 23h')).toEqual([1320, 1380]);
    expect(parseRange('6h - 5h')).toBeNull();
  });
  it('turma e professor', () => {
    expect(splitTurmaProfessor('SIMULAÇÃO DE JOGO INICIANTE - FULANO')).toEqual(['SIMULAÇÃO DE JOGO INICIANTE', 'FULANO']);
    expect(splitTurmaProfessor('APRENDIZ -  CICLANO')).toEqual(['APRENDIZ', 'CICLANO']);
    expect(splitTurmaProfessor('FITVOLÊI ADULTO')).toBeNull();
  });
  it('aba desconhecida não gera nada', () => {
    expect(detectLayout(grid([['Nome', 'CPF'], ['x', 'y']]))).toBeNull();
  });
});

import { resolveModality, resolveTeacher, suggestedTeacherName } from '@/domain/import/resolve';

describe('resolução contra o cadastro', () => {
  const mods = ['CrossFit', 'Funcional', 'Funcional Beach', 'Funcional Kids', 'Mobilidade', 'Jiu-Jitsu', 'Natação Kids', 'Base Forte', 'HYROX']
    .map((name, i) => ({ id: `m${i}`, name }));
  const idOf = (n: string) => mods.find((m) => m.name === n)!.id;

  it('nome exato, sem acento/caixa', () => {
    expect(resolveModality('Hyrox', mods)).toEqual({ modalityId: idOf('HYROX'), label: null });
    expect(resolveModality('FUNCIONAL BEACH', mods)).toEqual({ modalityId: idOf('Funcional Beach'), label: null });
  });
  it('prefixo mais longo vence; o resto vira turma', () => {
    expect(resolveModality('Mobilidade Master', mods)).toEqual({ modalityId: idOf('Mobilidade'), label: 'Master' });
    expect(resolveModality('Jiu Jitsu Kids', mods)).toEqual({ modalityId: idOf('Jiu-Jitsu'), label: 'Kids' });
    expect(resolveModality('BASE FORTE FTV', mods)).toEqual({ modalityId: idOf('Base Forte'), label: 'Ftv' });
  });
  it('texto curto que só uma modalidade completa', () => {
    expect(resolveModality('NATAÇÃO', mods)).toEqual({ modalityId: idOf('Natação Kids'), label: null });
    expect(resolveModality('Core', mods)).toBeNull();
    expect(resolveModality('SÉRIE D', mods)).toBeNull();
  });

  const teachers = [
    { id: 't1', name: 'Ana Souza', displayName: 'Ana', aliases: [] },
    { id: 't2', name: 'Bruno Lima', displayName: null, aliases: ['bruninho'] },
    { id: 't3', name: 'Bruno Alves', displayName: null, aliases: [] },
  ];
  it('professor por apelido, nome de grade, sufixo entre parênteses', () => {
    expect(resolveTeacher('ANA (mobility)', teachers)).toBe('t1');
    expect(resolveTeacher('Bruninho', teachers)).toBe('t2');
    expect(resolveTeacher('Ana Souza', teachers)).toBe('t1');
  });
  it('primeiro nome só quando não é ambíguo', () => {
    expect(resolveTeacher('Bruno', teachers)).toBeNull();
    expect(resolveTeacher('Carla', teachers)).toBeNull();
  });
  it('nome sugerido para cadastro', () => {
    expect(suggestedTeacherName('PEDRO  AGUIAR (est)')).toBe('Pedro Aguiar');
  });
});

import { collectNames } from '@/domain/import/plan';

describe('pessoas novas não duplicam', () => {
  it('"Ana (mobility)" aponta para a mesma "Ana" nova', () => {
    const rows = parseSheet('X', grid([
      ['HORARIO', 'SALA', 'SEGUNDA'],
      ['5h', 'CROSSFIT 1', 'Ana Nova'],
      ['6h', 'SALA TATAME', 'Mobilidade'],
      ['^', '^', 'Ana Nova (mobility)'],
    ])).rows;
    const names = collectNames(rows, { modalities: [], spaces: [], activityTypes: [], teachers: [] });
    expect(names.find((n) => n.key === 'ana nova')!.auto).toEqual({ action: 'create', name: 'Ana Nova' });
    expect(names.find((n) => n.key === 'ana nova (mobility)')!.auto).toEqual({ action: 'same', key: 'ana nova' });
  });
});
