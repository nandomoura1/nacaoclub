import { describe, expect, it } from 'vitest';
import { daysUntil, guessTerm, termStatus } from '@/domain/contracts';

describe('vigência de contratos', () => {
  it('lê início + fim, início + prazo e indeterminado', () => {
    expect(guessTerm({ inicio: '2026-12-01', fim: '2027-05-31' })).toEqual({ startsOn: '2026-12-01', endsOn: '2027-05-31', indefinite: false });
    expect(guessTerm({ inicio: '2026-11-03', prazo: '12 meses' }).endsOn).toBe('2027-11-02');
    expect(guessTerm({ inicio: '2026-01-31', prazo: '1 mês' }).endsOn).toBe('2026-02-27');
    expect(guessTerm({ inicio: '2026-11-01', prazo: '2 anos' }).endsOn).toBe('2028-10-31');
    expect(guessTerm({ inicio: '2026-11-01', prazo: '90 dias' }).endsOn).toBe('2027-01-29');
    expect(guessTerm({ inicio: '2026-11-01', prazo: 'Indeterminado' })).toEqual({ startsOn: '2026-11-01', endsOn: null, indefinite: true });
    expect(guessTerm({ prazo: 'até o fim do evento' })).toEqual({ startsOn: null, endsOn: null, indefinite: false });
  });
  it('situação pelo prazo', () => {
    const t = '2026-11-02';
    expect(termStatus({ startsOn: '2026-01-01', endsOn: '2027-12-31', terminatedOn: null }, t)).toBe('ATIVO');
    expect(termStatus({ startsOn: '2026-01-01', endsOn: null, terminatedOn: null }, t)).toBe('ATIVO');
    expect(termStatus({ startsOn: '2026-01-01', endsOn: '2026-11-20', terminatedOn: null }, t)).toBe('VENCE_EM_BREVE');
    expect(termStatus({ startsOn: '2026-01-01', endsOn: '2026-11-01', terminatedOn: null }, t)).toBe('VENCIDO');
    expect(termStatus({ startsOn: '2026-12-01', endsOn: null, terminatedOn: null }, t)).toBe('A_INICIAR');
    expect(termStatus({ startsOn: '2026-01-01', endsOn: null, terminatedOn: '2026-11-02' }, t)).toBe('ENCERRADO');
    expect(termStatus({ startsOn: '2026-01-01', endsOn: null, terminatedOn: '2026-12-01' }, t)).toBe('ATIVO');
    expect(termStatus({ startsOn: null, endsOn: null, terminatedOn: null }, t)).toBe('SEM_VIGENCIA');
    expect(daysUntil('2026-11-20', t)).toBe(18);
  });
});
