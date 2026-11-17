import { describe, expect, it } from 'vitest';
import { DEFAULT_VALUES, awardTotal, awardTsv, lostLabel, payDay, suggest } from '@/domain/premiacao';

describe('Premiação (puro)', () => {
  it('sugestão: atestado perde assiduidade; falta perde os três; admitido no mês zera', () => {
    expect(suggest([], '2035-06-01', '2035-06-30', null)).toEqual({ state: { productivity: true, punctuality: true, attendance: true, extraCents: 0 }, reasons: [] });
    const at = suggest([{ type: 'ATESTADO', start: '2035-06-10', end: '2035-06-11' }], '2035-06-01', '2035-06-30', null);
    expect(at.state).toMatchObject({ productivity: true, punctuality: true, attendance: false });
    expect(at.reasons).toEqual(['Atestado 10/06/2035 a 11/06/2035']);
    const fa = suggest([{ type: 'FALTA', start: '2035-06-12', end: '2035-06-12' }, { type: 'ATESTADO', start: '2035-05-28', end: '2035-05-30' }], '2035-06-01', '2035-06-30', null);
    expect(fa.state).toMatchObject({ productivity: false, punctuality: false, attendance: false });
    expect(fa.reasons).toEqual(['Falta 12/06/2035']); // atestado de maio não conta
    const adm = suggest([], '2035-06-01', '2035-06-30', '2035-06-10');
    expect(adm.state.productivity).toBe(false);
    expect(adm.reasons[0]).toMatch(/não completou o mês/);
  });

  it('total, rótulo do que perdeu, dia do pagamento e tabela', () => {
    const s = { productivity: true, punctuality: false, attendance: true, extraCents: 0 };
    expect(awardTotal(DEFAULT_VALUES, s)).toBe(20000);
    expect(awardTotal(DEFAULT_VALUES, { ...s, extraCents: -50000 })).toBe(0);
    expect(awardTotal({ productivity: 25000, punctuality: 25000, attendance: 25000 }, { ...s, punctuality: true })).toBe(75000);
    expect(lostLabel(s)).toBe('Perdeu: Pontualidade');
    expect(lostLabel({ ...s, productivity: false, attendance: false })).toBe('Perdeu os 3 critérios');
    expect(payDay('2026-11')).toBe('2026-12-15');
    expect(payDay('2026-12')).toBe('2027-01-15');
    expect(awardTsv([{ group: 'Kids', name: 'A', total: 20000, note: 'Atraso' }, { group: 'Kids', name: 'B', total: 30000, note: '' }]))
      .toBe('Equipe\tNome\tValor a receber\tObs.\nKids\tA\t200,00\tAtraso\nKids\tB\t300,00\t\nSubtotal — Kids\t\t500,00\t\n\nTOTAL GERAL\t\t500,00\t');
  });
});
