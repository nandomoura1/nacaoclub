import { describe, expect, it } from 'vitest';
import { docChecklist, internshipStatus, isIntern } from '@/domain/staff-docs';

const C = (validFrom: string | null, validUntil: string | null) => ({ kind: 'CONTRATO_ESTAGIO', validFrom, validUntil });
const T = '2026-10-08';

describe('Documentos da equipe — contador do estágio', () => {
  it('reconhece estagiário pelo vínculo ou cargo', () => {
    expect(isIntern('Estágio', null)).toBe(true);
    expect(isIntern(null, 'Estagiário')).toBe(true);
    expect(isIntern('CLT', 'Professor')).toBe(false);
  });

  it('vigente, vence em breve (≤30 dias), vence hoje, vencido', () => {
    expect(internshipStatus([C('2026-03-01', '2027-02-28')], T)).toMatchObject({ state: 'vigente', daysLeft: 143, end: '2027-02-28' });
    expect(internshipStatus([C('2026-03-01', '2026-11-07')], T)).toMatchObject({ state: 'vence_em_breve', daysLeft: 30 });
    expect(internshipStatus([C('2026-03-01', T)], T)).toMatchObject({ state: 'vence_em_breve', daysLeft: 0 });
    expect(internshipStatus([C('2026-03-01', '2026-10-05')], T)).toMatchObject({ state: 'vencido', daysLeft: -3 });
  });

  it('sem contrato; contrato ainda não começou', () => {
    expect(internshipStatus([], T).state).toBe('sem_contrato');
    expect(internshipStatus([{ kind: 'IDENTIDADE', validFrom: null, validUntil: null }], T).state).toBe('sem_contrato');
    expect(internshipStatus([C('2026-11-01', '2027-04-30')], T)).toMatchObject({ state: 'nao_iniciado', start: '2026-11-01' });
  });

  it('aditivo: vale o contrato que cobre hoje com o fim mais distante', () => {
    const s = internshipStatus([C('2025-10-01', '2026-09-30'), C('2026-10-01', '2027-03-31')], T);
    expect(s).toMatchObject({ state: 'vigente', start: '2026-10-01', end: '2027-03-31' });
    // Aditivo lançado mas o original já venceu e o aditivo começa depois: aponta o próximo.
    expect(internshipStatus([C('2025-10-01', '2026-09-30'), C('2026-10-10', '2027-03-31')], T).state).toBe('nao_iniciado');
  });

  it('avisa quando os contratos somam mais de 2 anos (Lei 11.788)', () => {
    expect(internshipStatus([C('2024-10-08', '2025-10-07'), C('2025-10-08', '2026-10-07')], '2026-01-01').over2Years).toBe(false);
    expect(internshipStatus([C('2024-10-08', '2025-10-07'), C('2025-10-08', '2026-12-31')], '2026-01-01').over2Years).toBe(true);
  });

  it('checklist: estagiário precisa do contrato de estágio (CREF opcional); demais, CREF e contrato de trabalho', () => {
    expect(docChecklist(true, [], T).map((c) => [c.kind, c.state])).toEqual([['IDENTIDADE', 'faltando'], ['CREF', 'opcional'], ['CONTRATO_ESTAGIO', 'faltando']]);
    const docs = [{ kind: 'IDENTIDADE', validFrom: null, validUntil: null }, { kind: 'CREF', validFrom: null, validUntil: '2026-01-31' }, { kind: 'CONTRATO_TRABALHO', validFrom: '2025-01-01', validUntil: null }];
    expect(docChecklist(false, docs, T).map((c) => [c.kind, c.state])).toEqual([['IDENTIDADE', 'ok'], ['CREF', 'vencido'], ['CONTRATO_TRABALHO', 'ok']]);
  });
});
