import { describe, expect, it } from 'vitest';
import { discountDays, transportRows, type TransportInput } from '@/domain/escalas/passagem';

const base = (o: Partial<TransportInput>): TransportInput => ({
  teacherId: 't1', name: 'Ana', bond: 'CLT', sector: 'ADM', workDays: [], source: 'escala', prevWorkDays: [], prevLeaves: [], dailyCents: null, ...o,
});

describe('passagem (vale-transporte)', () => {
  it('desconta só falta e atestado do mês anterior que caíram em dia de trabalho', () => {
    const prev = new Set(['2035-06-11', '2035-06-12', '2035-06-13']);
    expect(discountDays(prev, [
      { start: '2035-06-12', end: '2035-06-12', type: 'FALTA' },
      { start: '2035-06-13', end: '2035-06-17', type: 'ATESTADO' }, // 14–17 não eram dia de trabalho
      { start: '2035-06-11', end: '2035-06-11', type: 'FERIAS' }, // férias não descontam
    ])).toEqual(['2035-06-12', '2035-06-13']);
  });

  it('dias a pagar × valor; mesma pessoa em dois setores conta cada dia uma vez; MEI fica fora', () => {
    const rows = transportRows([
      base({ workDays: ['2035-07-02', '2035-07-03', '2035-07-04'], prevWorkDays: ['2035-06-12'], prevLeaves: [{ start: '2035-06-12', end: '2035-06-12', type: 'FALTA' }], dailyCents: 1100 }),
      base({ sector: 'Recepção', workDays: ['2035-07-04', '2035-07-07'], source: 'estimado' }),
      base({ teacherId: 't2', name: 'Beto', bond: 'FUNAP', sector: 'Cozinha', workDays: ['2035-07-02'] }),
      base({ teacherId: 't3', name: 'Caio', bond: 'MEI', workDays: ['2035-07-02'] }),
    ]);
    expect(rows.map((r) => [r.name, r.sectors.join('+'), r.source, r.workDays, r.discount, r.payDays, r.totalCents])).toEqual([
      ['Ana', 'ADM+Recepção', 'misto', 4, 1, 3, 3300],
      ['Beto', 'Cozinha', 'escala', 1, 0, 1, null],
    ]);
  });
});
