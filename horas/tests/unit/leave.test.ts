import { describe, expect, it } from 'vitest';
import { absenceReasonOf, exceptionTypeOf, isAffectable, leaveEffect, overlaps } from '@/domain/leave';

describe('ausências (puro)', () => {
  it('efeito na cadeira do professor conforme a cobertura', () => {
    expect(leaveEffect({ type: 'FERIAS', coverage: 'SUBSTITUIR', substituteId: 'bia' })).toEqual({ status: 'SUBSTITUIDA', executingTeacherId: 'bia', absenceReason: 'FERIAS' });
    expect(leaveEffect({ type: 'FALTA', coverage: 'PENDENTE', substituteId: null })).toEqual({ status: 'AUSENTE_PENDENTE', executingTeacherId: null, absenceReason: 'FALTA' });
    expect(leaveEffect({ type: 'ATESTADO', coverage: 'CANCELAR', substituteId: null })).toEqual({ status: 'CANCELADA', executingTeacherId: null, absenceReason: 'ATESTADO' });
    expect(absenceReasonOf('AFASTAMENTO')).toBe('OUTRO');
    expect(exceptionTypeOf('FOLGA', 'PENDENTE')).toBe('FOLGA');
    expect(exceptionTypeOf('FOLGA', 'SUBSTITUIR')).toBe('SUBSTITUICAO');
  });
  it('só mexe na aula prevista do próprio professor', () => {
    const a = { plannedTeacherId: 'ana', status: 'PREVISTA' as const, executingTeacherId: 'ana', absenceReason: null };
    expect(isAffectable(a, 'ana', 'PREVISTA')).toBe(true);
    expect(isAffectable(a, 'bia', 'PREVISTA')).toBe(false);
    expect(isAffectable(a, 'ana', 'CANCELADA')).toBe(false);
    expect(isAffectable(a, 'ana', 'AGUARDANDO_DECISAO_FERIADO')).toBe(false);
    expect(isAffectable({ ...a, status: 'SUBSTITUIDA' }, 'ana', 'PREVISTA')).toBe(false);
  });
  it('sobreposição de períodos', () => {
    expect(overlaps({ start: '2026-10-01', end: '2026-10-10' }, { start: '2026-10-10', end: '2026-10-20' })).toBe(true);
    expect(overlaps({ start: '2026-10-01', end: '2026-10-09' }, { start: '2026-10-10', end: '2026-10-20' })).toBe(false);
  });
});
