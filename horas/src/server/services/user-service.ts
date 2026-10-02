import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { prisma, type Tx } from '@/server/db';
import { audit } from '@/server/audit';
import { assertCan } from '@/server/auth/authz';
import { hashPassword } from '@/server/auth/password';
import type { Principal } from '@/server/auth/principal';
import type { RequestMeta } from '@/server/auth/session';
import { AppError, NotFoundError } from '@/server/errors';

/**
 * Gestão de usuários. Toda escrita: autoriza → valida → grava → audita,
 * numa única transação.
 */

const uuid = z.string().uuid();

export const userInputSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome.').max(120),
  email: z.string().trim().toLowerCase().email('Informe um e-mail válido.'),
  roleKeys: z.array(z.string().min(1)).min(1, 'Escolha ao menos um papel.'),
  areaIds: z.array(uuid).default([]),
  /** Professor que este usuário é (perfil Professor vê o próprio extrato). */
  teacherId: uuid.nullable().optional().or(z.literal('').transform(() => null)),
});
export type UserInput = z.input<typeof userInputSchema>;

export const userUpdateSchema = userInputSchema.extend({ active: z.boolean() });
export type UserUpdate = z.input<typeof userUpdateSchema>;

/** Senha provisória legível: 3 blocos de 4, sem caracteres ambíguos. */
export function temporaryPassword(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const block = () => Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join('');
  return `${block()}-${block()}-${block()}`;
}

function parse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  return parsed.data;
}

async function resolveRoles(tx: Tx, roleKeys: string[]) {
  const roles = await tx.role.findMany({ where: { key: { in: roleKeys } } });
  if (roles.length !== new Set(roleKeys).size) throw new AppError('Papel inexistente.');
  return roles;
}

/** Professor vinculado: existe e não está ligado a outro usuário. */
async function resolveTeacher(tx: Tx, teacherId: string | null | undefined, userId: string | null) {
  if (!teacherId) return null;
  const t = await tx.teacher.findUnique({ where: { id: teacherId }, select: { id: true, name: true, user: { select: { id: true, name: true } } } });
  if (!t) throw new AppError('Professor não encontrado.');
  if (t.user && t.user.id !== userId) throw new AppError(`${t.name} já está vinculado ao usuário ${t.user.name}.`);
  return t.id;
}

async function resolveAreas(tx: Tx, areaIds: string[]) {
  const areas = await tx.coordinationArea.findMany({
    where: { id: { in: areaIds }, deletedAt: null },
  });
  if (areas.length !== new Set(areaIds).size) throw new AppError('Área inexistente.');
  return areas;
}

/** Retrato do usuário para o log: o que importa comparar antes/depois. */
async function snapshot(tx: Tx, userId: string) {
  const u = await tx.user.findUnique({
    where: { id: userId },
    include: {
      roles: { include: { role: true } },
      areaScopes: { include: { area: true } },
      teacher: { select: { name: true } },
    },
  });
  if (!u) return null;
  return {
    name: u.name,
    email: u.email,
    active: u.active,
    roles: u.roles.map((r) => r.role.key).sort(),
    areas: u.areaScopes.map((s) => s.area.name).sort(),
    professor: u.teacher?.name ?? null,
  };
}

export async function listUsers(principal: Principal | null) {
  assertCan(principal, 'admin.users');
  return prisma.user.findMany({
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
    include: {
      roles: { include: { role: true } },
      areaScopes: { include: { area: true } },
      teacher: { select: { id: true, name: true } },
    },
  });
}

export async function listRolesAndAreas(principal: Principal | null) {
  assertCan(principal, 'admin.users');
  const [roles, areas] = await Promise.all([
    prisma.role.findMany({ orderBy: { name: 'asc' } }),
    prisma.coordinationArea.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
  ]);
  return { roles, areas };
}

/** Cria o usuário com senha provisória, mostrada UMA vez para o admin repassar. */
export async function createUser(
  principal: Principal | null,
  input: unknown,
  meta: RequestMeta,
): Promise<{ userId: string; temporaryPassword: string }> {
  assertCan(principal, 'admin.users');
  const data = parse(userInputSchema, input);
  const password = temporaryPassword();
  const passwordHash = await hashPassword(password);

  const userId = await prisma.$transaction(async (tx) => {
    if (await tx.user.findUnique({ where: { email: data.email } })) {
      throw new AppError('Já existe um usuário com este e-mail.');
    }
    const roles = await resolveRoles(tx, data.roleKeys);
    const areas = await resolveAreas(tx, data.areaIds);
    const teacherId = await resolveTeacher(tx, data.teacherId, null);

    const user = await tx.user.create({
      data: {
        name: data.name,
        email: data.email,
        teacherId,
        passwordHash,
        mustChangePassword: true,
        createdById: principal.id,
        roles: { create: roles.map((r) => ({ roleId: r.id })) },
        areaScopes: { create: areas.map((a) => ({ areaId: a.id })) },
      },
    });

    await audit(tx, { actorId: principal.id, ...meta }, {
      action: 'user.created',
      entityType: 'user',
      entityId: user.id,
      after: await snapshot(tx, user.id),
      summary: `${principal.name} criou o usuário ${user.name} (${roles.map((r) => r.name).join(', ')})`,
    });
    return user.id;
  });

  return { userId, temporaryPassword: password };
}

export async function updateUser(
  principal: Principal | null,
  userId: string,
  input: unknown,
  meta: RequestMeta,
): Promise<void> {
  assertCan(principal, 'admin.users');
  const data = parse(userUpdateSchema, input);

  await prisma.$transaction(async (tx) => {
    const before = await snapshot(tx, userId);
    if (!before) throw new NotFoundError('Usuário não encontrado.');

    // Proteção contra auto-bloqueio: ninguém tira o próprio acesso de admin.
    if (userId === principal.id) {
      if (!data.active) throw new AppError('Você não pode desativar o próprio usuário.');
      if (before.roles.includes('ADMIN') && !data.roleKeys.includes('ADMIN')) {
        throw new AppError('Você não pode remover o próprio papel de Administrador.');
      }
    }

    const clash = await tx.user.findFirst({ where: { email: data.email, id: { not: userId } } });
    if (clash) throw new AppError('Já existe um usuário com este e-mail.');

    const roles = await resolveRoles(tx, data.roleKeys);
    const areas = await resolveAreas(tx, data.areaIds);
    const teacherId = await resolveTeacher(tx, data.teacherId, userId);

    await tx.user.update({
      where: { id: userId },
      data: { name: data.name, email: data.email, active: data.active, teacherId },
    });
    await tx.userRole.deleteMany({ where: { userId } });
    await tx.userRole.createMany({ data: roles.map((r) => ({ userId, roleId: r.id })) });
    await tx.userAreaScope.deleteMany({ where: { userId } });
    if (areas.length) {
      await tx.userAreaScope.createMany({ data: areas.map((a) => ({ userId, areaId: a.id })) });
    }
    if (before.active && !data.active) {
      await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    const after = await snapshot(tx, userId);
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: 'user.updated',
      entityType: 'user',
      entityId: userId,
      before,
      after,
      summary: describeUserChange(principal.name, before, after!),
    });
  });
}

type UserSnapshot = NonNullable<Awaited<ReturnType<typeof snapshot>>>;

/** "Carla alterou Maria: papéis COORDENADOR → ADMIN; desativado". */
export function describeUserChange(actor: string, before: UserSnapshot, after: UserSnapshot): string {
  const changes: string[] = [];
  if (before.name !== after.name) changes.push(`nome ${before.name} → ${after.name}`);
  if (before.email !== after.email) changes.push(`e-mail ${before.email} → ${after.email}`);
  if (before.active !== after.active) changes.push(after.active ? 'reativado' : 'desativado');
  if (before.roles.join() !== after.roles.join()) {
    changes.push(`papéis ${before.roles.join(', ') || '—'} → ${after.roles.join(', ') || '—'}`);
  }
  if (before.areas.join() !== after.areas.join()) {
    changes.push(`áreas ${before.areas.join(', ') || '—'} → ${after.areas.join(', ') || '—'}`);
  }
  if ((before.professor ?? null) !== (after.professor ?? null)) changes.push(`professor vinculado ${before.professor ?? '—'} → ${after.professor ?? '—'}`);
  return `${actor} alterou o usuário ${after.name}: ${changes.join('; ') || 'sem mudanças'}`;
}

export async function resetPassword(
  principal: Principal | null,
  userId: string,
  meta: RequestMeta,
): Promise<{ temporaryPassword: string }> {
  assertCan(principal, 'admin.users');
  const password = temporaryPassword();
  const passwordHash = await hashPassword(password);

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('Usuário não encontrado.');
    await tx.user.update({ where: { id: userId }, data: { passwordHash, mustChangePassword: true } });
    await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: 'user.password_reset',
      entityType: 'user',
      entityId: userId,
      summary: `${principal.name} gerou nova senha provisória para ${user.name}`,
    });
  });

  return { temporaryPassword: password };
}
