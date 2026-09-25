import { describe, expect, it } from 'vitest';
import { planChange, planEnd, versionAt, ScheduleRuleError } from '@/domain/schedule';

const open = [{ id: 'v1', validFrom: '2026-08-01', validTo: null }];

describe('vigência da grade (Cenário 5: a grade muda no dia 15)', () => {
  it('antes do dia 15 vale a versão antiga; do 15 em diante, a nova', () => {
    const plan = planChange(open, '2026-10-15');
    expect(plan).toEqual({ kind: 'split', closeVersionId: 'v1', closeAt: '2026-10-14', newValidFrom: '2026-10-15', newValidTo: null });

    const after = [
      { id: 'v1', validFrom: '2026-08-01', validTo: '2026-10-14' },
      { id: 'v2', validFrom: '2026-10-15', validTo: null },
    ];
    expect(versionAt(after, '2026-10-14')?.id).toBe('v1');
    expect(versionAt(after, '2026-10-15')?.id).toBe('v2');
    expect(versionAt(after, '2026-07-31')).toBeNull();
  });

  it('mudança no mesmo dia em que a versão começa reescreve essa versão', () => {
    expect(planChange(open, '2026-08-01')).toEqual({ kind: 'replace', versionId: 'v1' });
  });

  it('não atropela mudança já agendada: a nova versão termina onde a próxima começa', () => {
    const scheduled = [
      { id: 'v1', validFrom: '2026-08-01', validTo: '2026-11-30' },
      { id: 'v2', validFrom: '2026-12-01', validTo: null },
    ];
    expect(planChange(scheduled, '2026-10-15')).toMatchObject({ closeAt: '2026-10-14', newValidTo: '2026-11-30' });
  });

  it('recusa alterar uma aula que não vale na data', () => {
    expect(() => planChange(open, '2026-07-01')).toThrow(ScheduleRuleError);
  });
});

describe('encerrar aula', () => {
  it('última aula no dia anterior; versões futuras caem junto', () => {
    const vs = [
      { id: 'v1', validFrom: '2026-08-01', validTo: '2026-11-30' },
      { id: 'v2', validFrom: '2026-12-01', validTo: null },
    ];
    expect(planEnd(vs, '2026-10-01')).toEqual({ kind: 'close', versionId: 'v1', closeAt: '2026-09-30', dropVersionIds: ['v2'] });
  });
  it('encerrar no primeiro dia = a aula nunca chega a valer', () => {
    expect(planEnd(open, '2026-08-01')).toEqual({ kind: 'drop', dropVersionIds: ['v1'] });
  });
  it('encerrar depois do fim é erro', () => {
    expect(() => planEnd([{ id: 'v1', validFrom: '2026-08-01', validTo: '2026-08-31' }], '2026-09-10')).toThrow(ScheduleRuleError);
  });
});
