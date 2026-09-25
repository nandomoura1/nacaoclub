import { describe, expect, it } from 'vitest';
import { redact } from '@/server/audit';
import { describeUserChange, temporaryPassword } from '@/server/services/user-service';

describe('redação da auditoria', () => {
  it('nunca grava hash de senha nem token, em qualquer profundidade', () => {
    const out = redact({
      name: 'Maria',
      passwordHash: 'scrypt$…',
      nested: { token: 'abc', tokenHash: 'def', ok: 1 },
      list: [{ password: 'x', keep: true }],
      at: new Date('2026-09-25T12:00:00Z'),
    });
    expect(out).toEqual({
      name: 'Maria',
      nested: { ok: 1 },
      list: [{ keep: true }],
      at: '2026-09-25T12:00:00.000Z',
    });
  });
});

describe('frase humana da alteração de usuário', () => {
  const base = { name: 'Maria', email: 'maria@n.dev', active: true, roles: ['COORDENADOR'], areas: ['Nação Fit'] };

  it('lista só o que mudou', () => {
    const txt = describeUserChange('Admin', base, { ...base, active: false, areas: ['CrossFit', 'Nação Fit'] });
    expect(txt).toBe('Admin alterou o usuário Maria: desativado; áreas Nação Fit → CrossFit, Nação Fit');
  });
  it('diz quando nada mudou', () => {
    expect(describeUserChange('Admin', base, base)).toMatch(/sem mudanças$/);
  });
});

describe('senha provisória', () => {
  it('3 blocos legíveis, sem caracteres ambíguos, e aleatória', () => {
    const a = temporaryPassword();
    expect(a).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
    expect(a).not.toMatch(/[01ilo]/);
    expect(a).not.toBe(temporaryPassword());
  });
});
