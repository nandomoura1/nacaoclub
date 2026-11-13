import { describe, expect, it } from 'vitest';
import { personOf, shapeOf } from '@/server/tecnofit/client';

describe('Tecnofit: funcionário responsável em formatos diferentes', () => {
  it('acha o consultor/vendedor como objeto ou como campo ...Id', () => {
    expect(personOf({ consultant: { id: 12, name: 'Ana' } })).toEqual({ id: '12', name: 'Ana' });
    expect(personOf({ seller: { id: '7', name: 'Bia' } })).toEqual({ id: '7', name: 'Bia' });
    expect(personOf({ employee: { employeeId: 9 } })).toEqual({ id: '9', name: null });
    expect(personOf({ consultantId: 33, consultantName: 'Caio' })).toEqual({ id: '33', name: 'Caio' });
    expect(personOf({ customer: { id: 1 }, consultant: null })).toBeNull();
  });
  it('diagnóstico guarda só os nomes dos campos, nunca valores', () => {
    const s = shapeOf({ id: 1, status: 'done', customer: { id: 5, name: 'Fulano', phone: '61999' } });
    expect(s).toBe('id,status,customer{id,name,phone}');
    expect(s).not.toContain('Fulano');
  });
});
