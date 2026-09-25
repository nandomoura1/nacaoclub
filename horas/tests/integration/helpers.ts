import { randomUUID } from 'node:crypto';
import { prisma } from '@/server/db';
import { hashPassword } from '@/server/auth/password';
import { loadPrincipal, type Principal } from '@/server/auth/principal';
import { syncPermissionCatalog } from '@/server/services/rbac-catalog';

export const hasDb = Boolean(process.env.DATABASE_URL);

export const META = { ipAddress: '10.0.0.1', userAgent: 'vitest' };

export async function ensureCatalog() {
  await prisma.$transaction((tx) => syncPermissionCatalog(tx), { timeout: 30_000 });
}

export async function makeArea(name = `Área ${randomUUID().slice(0, 8)}`) {
  return prisma.coordinationArea.create({ data: { name } });
}

/** Cria um usuário com papel e áreas e devolve o Principal já resolvido. */
export async function makeUser(
  roleKey: string,
  opts: { areaIds?: string[]; password?: string; mustChangePassword?: boolean; name?: string } = {},
): Promise<{ principal: Principal; email: string; password: string }> {
  const password = opts.password ?? 'senha-de-teste-123';
  const email = `${roleKey.toLowerCase()}-${randomUUID().slice(0, 8)}@teste.dev`;
  const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
  const user = await prisma.user.create({
    data: {
      name: opts.name ?? `${roleKey} de teste`,
      email,
      passwordHash: await hashPassword(password),
      mustChangePassword: opts.mustChangePassword ?? false,
      roles: { create: { roleId: role.id } },
      areaScopes: { create: (opts.areaIds ?? []).map((areaId) => ({ areaId })) },
    },
  });
  return { principal: (await loadPrincipal(prisma, user.id))!, email, password };
}
