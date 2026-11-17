import { describe, expect, it } from 'vitest';
import { DEFAULT_VALUES, NO_OVERRIDES, applyOverrides, awardPeriod, awardTotal, awardTsv, currentAwardMonth, daysIn, lostLabel, payDay, suggest, toggleOverride } from '@/domain/premiacao';

describe('Premiação (puro)', () => {
  it('regra: atestado perde assiduidade; atraso perde pontualidade; falta perde os três; admitido no meio zera', () => {
    expect(suggest([], '2035-05-15', '2035-06-14', null).state).toEqual({ productivity: true, punctuality: true, attendance: true, extraCents: 0 });
    const at = suggest([{ type: 'ATESTADO', start: '2035-06-10', end: '2035-06-11' }], '2035-05-15', '2035-06-14', null, 2);
    expect(at.state).toMatchObject({ productivity: true, punctuality: false, attendance: false });
    expect(at.reasons).toEqual(['2 dias de atestado (10/06, 11/06)', '2 atrasos > 15 min']);
    const fa = suggest([{ type: 'FALTA', start: '2035-06-12', end: '2035-06-12' }, { type: 'ATESTADO', start: '2035-05-10', end: '2035-05-14' }], '2035-05-15', '2035-06-14', null);
    expect(fa.state).toMatchObject({ productivity: false, punctuality: false, attendance: false });
    expect(fa.reasons).toEqual(['Falta (12/06)']); // atestado antes do dia 15 é da competência anterior
    const adm = suggest([], '2035-05-15', '2035-06-14', '2035-05-20');
    expect(adm.state.productivity).toBe(false);
    expect(adm.reasons[0]).toMatch(/não completou a competência/);
    expect(daysIn([{ type: 'FALTA', start: '2035-05-13', end: '2035-05-16' }], 'FALTA', '2035-05-15', '2035-06-14')).toEqual(['2035-05-15', '2035-05-16']);
  });

  it('correção à mão: clicar inverte; voltar ao valor da regra = automático', () => {
    const auto = { productivity: true, punctuality: false, attendance: true, extraCents: 0 };
    const o1 = toggleOverride(auto, NO_OVERRIDES, 'productivity');
    expect(o1.productivity).toBe(false);
    expect(toggleOverride(auto, o1, 'productivity').productivity).toBeNull();
    const o2 = toggleOverride(auto, NO_OVERRIDES, 'punctuality'); // perdoa o atraso
    expect(applyOverrides(auto, o2, 5000)).toEqual({ productivity: true, punctuality: true, attendance: true, extraCents: 5000 });
  });

  it('total, rótulo, competência 15→14 paga no dia 15 e tabela', () => {
    const s = { productivity: true, punctuality: false, attendance: true, extraCents: 0 };
    expect(awardTotal(DEFAULT_VALUES, s)).toBe(20000);
    expect(awardTotal(DEFAULT_VALUES, { ...s, extraCents: -50000 })).toBe(0);
    expect(lostLabel(s)).toBe('Perdeu: Pontualidade');
    expect(lostLabel({ ...s, productivity: false, attendance: false })).toBe('Perdeu os 3 critérios');
    expect(payDay('2026-12')).toBe('2026-12-15');
    expect(awardPeriod('2026-12')).toEqual({ first: '2026-11-15', last: '2026-12-14' });
    expect(awardPeriod('2027-01')).toEqual({ first: '2026-12-15', last: '2027-01-14' });
    expect(currentAwardMonth('2026-11-17')).toBe('2026-12');
    expect(currentAwardMonth('2026-12-14')).toBe('2026-12');
    expect(currentAwardMonth('2026-12-15')).toBe('2027-01');
    expect(awardTsv([{ group: 'Kids', name: 'A', total: 20000, note: 'Atraso' }, { group: 'Kids', name: 'B', total: 30000, note: '' }]))
      .toBe('Equipe\tNome\tValor a receber\tObs.\nKids\tA\t200,00\tAtraso\nKids\tB\t300,00\t\nSubtotal — Kids\t\t500,00\t\n\nTOTAL GERAL\t\t500,00\t');
  });
});
