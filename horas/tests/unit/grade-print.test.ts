import { describe, expect, it } from 'vitest';
import { formatCref, printDensity, printLines } from '@/domain/grade-print';

const people = [
  { teacherId: 'a', role: 'TITULAR', name: 'Rafa', leave: null },
  { teacherId: 'b', role: 'AUXILIAR', name: 'Joana', leave: null },
  { teacherId: 'c', role: 'TITULAR', name: 'Pedro Estagiário', leave: null },
  { teacherId: 'd', role: 'TITULAR', name: 'Eliseu', leave: { type: 'FERIAS', substitute: 'Ju' } },
];
const info = new Map([['a', { intern: false, cref: '012345-G/DF' }], ['b', { intern: true, cref: null }], ['c', { intern: true, cref: null }], ['d', { intern: false, cref: 'CREF: 9999-G/DF' }]]);
const label = (t: string) => (t === 'FERIAS' ? 'Férias' : t);

describe('Impressão da grade', () => {
  it('CREF formatado sem duplicar o prefixo', () => {
    expect(formatCref('012345-G/DF')).toBe('CREF 012345-G/DF');
    expect(formatCref('cref: 9999-G/DF')).toBe('CREF 9999-G/DF');
    expect(formatCref('  ')).toBeNull();
  });
  it('só professores: sem auxiliar nem estagiário, com CREF', () => {
    expect(printLines(people, 'professores', info, label)).toEqual([
      { name: 'Rafa', cref: 'CREF 012345-G/DF', aux: false, note: null },
      { name: 'Eliseu', cref: 'CREF 9999-G/DF', aux: false, note: 'férias → Ju' },
    ]);
  });
  it('todos: auxiliar marcado e sem CREF', () => {
    const l = printLines(people, 'todos', info, label);
    expect(l.map((x) => [x.name, x.aux])).toEqual([['Rafa', false], ['Joana', true], ['Pedro Estagiário', false], ['Eliseu', false]]);
    expect(l.every((x) => x.cref === null)).toBe(true);
  });
  it('densidade', () => {
    expect(printDensity(8, 1)).toBe('normal');
    expect(printDensity(12, 1)).toBe('compacta');
    expect(printDensity(15, 3)).toBe('mini');
  });
});
