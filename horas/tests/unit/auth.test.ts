import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '@/server/auth/password';
import { hashSessionToken, newSessionToken } from '@/server/auth/token';
import { PERMISSION_KEYS, SYSTEM_ROLES } from '@/server/auth/permissions';
import { areaWhere, assertAreaAccess, assertCan, can, canAccessArea } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import { AuthenticationError, AuthorizationError } from '@/server/errors';
import type { PermissionKey } from '@/server/auth/permissions';

function principal(permissions: PermissionKey[], areaIds: string[] | null = []): Principal {
  return {
    id: 'u1', name: 'Teste', email: 't@t.dev', roleKeys: [],
    permissions: new Set(permissions), areaIds, mustChangePassword: false,
  };
}

describe('senha (scrypt)', () => {
  it('verifica a senha certa e recusa a errada', async () => {
    const hash = await hashPassword('nacao@2026');
    expect(hash).toMatch(/^scrypt\$1\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
    expect(await verifyPassword('nacao@2026', hash)).toBe(true);
    expect(await verifyPassword('nacao@2027', hash)).toBe(false);
  });
  it('usa salt aleatório: mesma senha, hashes diferentes', async () => {
    expect(await hashPassword('mesma-senha')).not.toBe(await hashPassword('mesma-senha'));
  });
  it('recusa senha curta e hash malformado', async () => {
    await expect(hashPassword('curta')).rejects.toThrow();
    expect(await verifyPassword('x', 'bcrypt$lixo')).toBe(false);
  });
});

describe('token de sessão', () => {
  it('é aleatório e o banco só guarda o HMAC', () => {
    const a = newSessionToken();
    expect(a).not.toBe(newSessionToken());
    expect(a.length).toBeGreaterThanOrEqual(43);
    const h = hashSessionToken(a, 's'.repeat(64));
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain(a);
    expect(hashSessionToken(a, 't'.repeat(64))).not.toBe(h); // depende do segredo
  });
});

describe('matriz de papéis', () => {
  it('ADMIN tem todas as permissões', () => {
    expect(new Set(SYSTEM_ROLES.ADMIN.permissions)).toEqual(new Set(PERMISSION_KEYS));
  });
  it('COORDENADOR opera a escala, mas não administra, não fecha e não vê dinheiro', () => {
    const p = SYSTEM_ROLES.COORDENADOR.permissions;
    expect(p).toContain('occurrence.exception');
    expect(p).toContain('payroll.approve_area');
    for (const k of ['admin.users', 'payroll.close', 'payroll.edit_closed', 'finance.view', 'area.all'] as const) {
      expect(p).not.toContain(k);
    }
  });
  it('CONSULTA só lê, em todas as áreas', () => {
    const p = SYSTEM_ROLES.CONSULTA.permissions;
    expect(p).toContain('area.all');
    expect(p.some((k) => /edit|exception|close|approve|manage|generate/.test(k))).toBe(false);
  });
  it('só referencia permissões do catálogo', () => {
    for (const role of Object.values(SYSTEM_ROLES)) {
      for (const k of role.permissions) expect(PERMISSION_KEYS).toContain(k);
    }
  });
});

describe('autorização e escopo por área', () => {
  it('assertCan distingue 401 (sem sessão) de 403 (sem permissão)', () => {
    expect(() => assertCan(null, 'schedule.view')).toThrow(AuthenticationError);
    expect(() => assertCan(principal([]), 'schedule.view')).toThrow(AuthorizationError);
    expect(() => assertCan(principal(['schedule.view']), 'schedule.view')).not.toThrow();
    expect(can(null, 'schedule.view')).toBe(false);
  });

  it('coordenador só alcança as próprias áreas', () => {
    const coord = principal(['schedule.view'], ['crossfit']);
    expect(canAccessArea(coord, 'crossfit')).toBe(true);
    expect(canAccessArea(coord, 'futevolei')).toBe(false);
    expect(() => assertAreaAccess(coord, 'futevolei')).toThrow(AuthorizationError);
    expect(areaWhere(coord)).toEqual({ areaId: { in: ['crossfit'] } });
  });

  it('sem área atribuída = nenhuma área (lista vazia não é "tudo")', () => {
    const semArea = principal(['schedule.view'], []);
    expect(canAccessArea(semArea, 'crossfit')).toBe(false);
    expect(areaWhere(semArea)).toEqual({ areaId: { in: [] } });
  });

  it('areaIds null (area.all) = sem restrição', () => {
    const admin = principal(['area.all'], null);
    expect(canAccessArea(admin, 'qualquer')).toBe(true);
    expect(areaWhere(admin)).toEqual({});
  });
});
