import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/server/db';
import { audit } from '@/server/audit';
import { loadPrincipal } from '@/server/auth/principal';
import { authenticate, changeOwnPassword } from '@/server/services/auth-service';
import { createUser, resetPassword, updateUser } from '@/server/services/user-service';
import { syncPermissionCatalog } from '@/server/services/rbac-catalog';
import { AppError, AuthorizationError } from '@/server/errors';
import { META, ensureCatalog, hasDb, makeArea, makeUser } from './helpers';

describe.skipIf(!hasDb)('E1 · identidade, permissões e auditoria (Postgres real)', () => {
  beforeAll(ensureCatalog);

  describe('auditoria é somente-inclusão (trigger no banco)', () => {
    it('recusa UPDATE, DELETE e TRUNCATE — nem o dono do banco reescreve o passado', async () => {
      await audit(prisma, { actorId: null }, { action: 'teste', entityType: 'teste', summary: 'registro de teste' });
      const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'teste' } });

      await expect(prisma.auditLog.update({ where: { id: log.id }, data: { summary: 'adulterado' } })).rejects.toThrow(/somente-inclusão/);
      await expect(prisma.auditLog.delete({ where: { id: log.id } })).rejects.toThrow(/somente-inclusão/);
      await expect(prisma.$executeRawUnsafe('TRUNCATE audit_logs')).rejects.toThrow(/somente-inclusão/);

      expect((await prisma.auditLog.findUniqueOrThrow({ where: { id: log.id } })).summary).toBe('registro de teste');
    });

    it('a alteração e o log são atômicos: se a transação falha, nenhum dos dois fica', async () => {
      const before = await prisma.auditLog.count();
      await expect(
        prisma.$transaction(async (tx) => {
          await audit(tx, { actorId: null }, { action: 'atomico', entityType: 'teste', summary: 'x' });
          throw new Error('falha no meio');
        }),
      ).rejects.toThrow('falha no meio');
      expect(await prisma.auditLog.count()).toBe(before);
    });
  });

  describe('catálogo de permissões', () => {
    it('é idempotente', async () => {
      await prisma.$transaction((tx) => syncPermissionCatalog(tx), { timeout: 30_000 });
      const count = await prisma.permission.count();
      await prisma.$transaction((tx) => syncPermissionCatalog(tx), { timeout: 30_000 });
      expect(await prisma.permission.count()).toBe(count);
      expect(await prisma.role.count({ where: { isSystem: true } })).toBe(4);
    });
  });

  describe('principal (papel + escopo)', () => {
    it('coordenador enxerga só as próprias áreas; consulta e admin enxergam todas', async () => {
      const area = await makeArea();
      const coord = await makeUser('COORDENADOR', { areaIds: [area.id] });
      const consulta = await makeUser('CONSULTA');
      const admin = await makeUser('ADMIN');

      expect(coord.principal.areaIds).toEqual([area.id]);
      expect(coord.principal.permissions.has('occurrence.exception')).toBe(true);
      expect(coord.principal.permissions.has('admin.users')).toBe(false);
      expect(consulta.principal.areaIds).toBeNull();
      expect(admin.principal.areaIds).toBeNull();
    });

    it('senha provisória = nenhuma permissão até a troca', async () => {
      const temp = await makeUser('ADMIN', { mustChangePassword: true });
      expect(temp.principal.permissions.size).toBe(0);
    });

    it('usuário inativo não vira principal', async () => {
      const u = await makeUser('ADMIN');
      await prisma.user.update({ where: { id: u.principal.id }, data: { active: false } });
      expect(await loadPrincipal(prisma, u.principal.id)).toBeNull();
    });
  });

  describe('login', () => {
    it('aceita a senha certa e audita o acesso', async () => {
      const u = await makeUser('COORDENADOR', { password: 'senha-correta-1' });
      expect(await authenticate({ email: u.email, password: 'senha-correta-1' }, META)).toBe(u.principal.id);
      const log = await prisma.auditLog.findFirst({ where: { action: 'auth.login', entityId: u.principal.id } });
      expect(log?.ipAddress).toBe('10.0.0.1');
    });

    it('mesma mensagem para senha errada e e-mail inexistente (sem oráculo), e audita a recusa', async () => {
      const u = await makeUser('COORDENADOR', { password: 'senha-correta-1' });
      const wrong = await authenticate({ email: u.email, password: 'errada' }, META).catch((e: AppError) => e);
      const ghost = await authenticate({ email: 'ninguem@teste.dev', password: 'x' }, META).catch((e: AppError) => e);
      expect(wrong).toBeInstanceOf(AppError);
      expect((wrong as AppError).message).toBe((ghost as AppError).message);
      expect((wrong as AppError).status).toBe(401);
      expect(await prisma.auditLog.count({ where: { action: 'auth.login_failed', entityId: u.principal.id } })).toBe(1);
    });

    it('e-mail é normalizado (maiúsculas e espaços)', async () => {
      const u = await makeUser('ADMIN', { password: 'senha-correta-1' });
      expect(await authenticate({ email: `  ${u.email.toUpperCase()} `, password: 'senha-correta-1' }, META)).toBe(u.principal.id);
    });

    it('usuário desativado não entra, mesmo com a senha certa', async () => {
      const u = await makeUser('ADMIN', { password: 'senha-correta-1' });
      await prisma.user.update({ where: { id: u.principal.id }, data: { active: false } });
      await expect(authenticate({ email: u.email, password: 'senha-correta-1' }, META)).rejects.toThrow(AppError);
    });
  });

  describe('gestão de usuários', () => {
    it('coordenador não cria usuário (403) e nada é gravado', async () => {
      const coord = await makeUser('COORDENADOR');
      const before = await prisma.user.count();
      await expect(
        createUser(coord.principal, { name: 'Invasor', email: 'x@teste.dev', roleKeys: ['ADMIN'] }, META),
      ).rejects.toThrow(AuthorizationError);
      expect(await prisma.user.count()).toBe(before);
    });

    it('admin cria coordenador com senha provisória; o log não contém a senha', async () => {
      const admin = await makeUser('ADMIN', { name: 'Admin Teste' });
      const area = await makeArea('Futevôlei (teste)');
      const { userId, temporaryPassword } = await createUser(
        admin.principal,
        { name: 'Ramon', email: 'RAMON.teste@nacao.dev', roleKeys: ['COORDENADOR'], areaIds: [area.id] },
        META,
      );

      const created = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      expect(created.email).toBe('ramon.teste@nacao.dev');
      expect(created.mustChangePassword).toBe(true);

      // A provisória funciona, mas não dá permissão até a troca.
      await authenticate({ email: 'ramon.teste@nacao.dev', password: temporaryPassword }, META);
      expect((await loadPrincipal(prisma, userId))!.permissions.size).toBe(0);

      const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'user.created', entityId: userId } });
      expect(log.summary).toBe('Admin Teste criou o usuário Ramon (Coordenador)');
      expect(JSON.stringify(log.after)).not.toMatch(/scrypt|passwordHash/);
      expect(log.after).toMatchObject({ roles: ['COORDENADOR'], areas: ['Futevôlei (teste)'] });

      // Troca de senha libera as permissões.
      const temp = (await loadPrincipal(prisma, userId))!;
      await changeOwnPassword(temp, { current: temporaryPassword, next: 'minha-senha-nova', confirm: 'minha-senha-nova' }, META);
      const ready = (await loadPrincipal(prisma, userId))!;
      expect(ready.permissions.has('occurrence.exception')).toBe(true);
      expect(ready.areaIds).toEqual([area.id]);
    });

    it('recusa e-mail duplicado e papel inexistente', async () => {
      const admin = await makeUser('ADMIN');
      const other = await makeUser('CONSULTA');
      await expect(createUser(admin.principal, { name: 'Dup', email: other.email, roleKeys: ['CONSULTA'] }, META)).rejects.toThrow(/Já existe/);
      await expect(createUser(admin.principal, { name: 'Fulano', email: 'novo@teste.dev', roleKeys: ['SUPERUSER'] }, META)).rejects.toThrow(/Papel inexistente/);
    });

    it('alteração registra antes/depois e desativar derruba as sessões abertas', async () => {
      const admin = await makeUser('ADMIN', { name: 'Admin Teste' });
      const area = await makeArea();
      const target = await makeUser('COORDENADOR', { areaIds: [area.id], name: 'Maria' });
      await prisma.session.create({
        data: { userId: target.principal.id, tokenHash: `h-${target.principal.id}`, expiresAt: new Date(Date.now() + 3_600_000) },
      });

      await updateUser(admin.principal, target.principal.id, {
        name: 'Maria', email: target.email, roleKeys: ['COORDENADOR'], areaIds: [], active: false,
      }, META);

      const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'user.updated', entityId: target.principal.id } });
      expect(log.summary).toMatch(/Admin Teste alterou o usuário Maria: desativado; áreas .* → —/);
      expect(log.before).toMatchObject({ active: true });
      expect(log.after).toMatchObject({ active: false, areas: [] });
      expect(await prisma.session.count({ where: { userId: target.principal.id, revokedAt: null } })).toBe(0);
    });

    it('admin não se tranca para fora (nem desativando, nem tirando o próprio ADMIN)', async () => {
      const admin = await makeUser('ADMIN');
      const base = { name: 'Eu', email: admin.email, areaIds: [] };
      await expect(updateUser(admin.principal, admin.principal.id, { ...base, roleKeys: ['ADMIN'], active: false }, META)).rejects.toThrow(/desativar o próprio/);
      await expect(updateUser(admin.principal, admin.principal.id, { ...base, roleKeys: ['CONSULTA'], active: true }, META)).rejects.toThrow(/próprio papel de Administrador/);
    });

    it('nova senha provisória revoga sessões e exige troca', async () => {
      const admin = await makeUser('ADMIN');
      const target = await makeUser('COORDENADOR', { password: 'antiga-senha-1' });
      await prisma.session.create({
        data: { userId: target.principal.id, tokenHash: `r-${target.principal.id}`, expiresAt: new Date(Date.now() + 3_600_000) },
      });
      const { temporaryPassword } = await resetPassword(admin.principal, target.principal.id, META);

      await expect(authenticate({ email: target.email, password: 'antiga-senha-1' }, META)).rejects.toThrow();
      await authenticate({ email: target.email, password: temporaryPassword }, META);
      expect(await prisma.session.count({ where: { userId: target.principal.id, revokedAt: null } })).toBe(0);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: target.principal.id } })).mustChangePassword).toBe(true);
    });
  });
});
