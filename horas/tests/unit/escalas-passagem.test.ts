import { describe, expect, it } from 'vitest';
import { discountDays, transportRows, type TransportInput } from '@/domain/escalas/passagem';
import { weekendMeal } from '@/domain/escalas/passagem';

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

  it('alimentação: dias de trabalho − faltas/atestados/home office do mês anterior × valor; a depositar = passagem + alimentação', () => {
    const [ana, beto, caio] = transportRows([
      base({ workDays: ['2035-07-02', '2035-07-03', '2035-07-04'], prevWorkDays: ['2035-06-12'], prevLeaves: [{ start: '2035-06-12', end: '2035-06-12', type: 'FALTA' }], dailyCents: 1100, mealDailyCents: 1500 }),
      base({ teacherId: 't2', name: 'Beto', workDays: ['2035-07-02'], dailyCents: 1100 }),
      base({ teacherId: 't3', name: 'Caio', workDays: ['2035-07-02', '2035-07-03'], mealDailyCents: 2000 }),
    ]);
    expect([ana!.payDays, ana!.totalCents, ana!.mealDays, ana!.mealCents, ana!.depositCents]).toEqual([2, 2200, 2, 3000, 5200]);
    expect([beto!.mealDailyCents, beto!.mealCents, beto!.depositCents]).toEqual([null, null, 1100]);
    expect([caio!.totalCents, caio!.mealCents, caio!.depositCents]).toEqual([null, 4000, 4000]);
  });

  it('alimentação de fim de semana: sábado e domingo acumulam; mesmo dia conta uma vez; dia útil não entra', () => {
    const w = weekendMeal([
      { date: '2035-06-02', weekday: 6, satCents: 2000, sunCents: 3500 },
      { date: '2035-06-02', weekday: 6, satCents: 2000, sunCents: 3500 }, // dois turnos no mesmo sábado
      { date: '2035-06-09', weekday: 6, satCents: 2000, sunCents: 3500 },
      { date: '2035-06-10', weekday: 7, satCents: 2000, sunCents: 3500 },
      { date: '2035-06-12', weekday: 2, satCents: 2000, sunCents: 3500 }, // feriado em dia útil: não entra
    ]);
    expect(w).toEqual({ saturdays: 2, sundays: 1, cents: 7500 });
    expect(weekendMeal([{ date: '2035-06-02', weekday: 6, satCents: null, sunCents: null }]).cents).toBe(0);
  });
});

