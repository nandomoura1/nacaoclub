import type { Role } from '@prisma/client';
import { prisma } from '@/server/db/prisma';
import type { SessionUser } from './session';

/**
 * Autorização — sempre no servidor.
 *
 * O frontend pode esconder um botão por conveniência, mas a decisão real
 * acontece aqui. Nenhuma permissão é hardcoded em componente (seção 9).
 */

export class AuthorizationError extends Error {
  readonly status = 403;
  constructor(message = 'Você não tem permissão para esta ação.') {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export class AuthenticationError extends Error {
  readonly status = 401;
  constructor(message = 'Autenticação necessária.') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export type Permission =
  | 'student:read'
  | 'student:search'
  | 'note:create'
  | 'note:update:own'
  | 'note:update:any'
  | 'note:delete:own'
  | 'note:delete:any'
  | 'feedback:create'
  | 'alert:read'
  | 'alert:acknowledge'
  | 'turnstile:read'
  | 'turnstile:read:all'
  | 'turnstile:manage'
  | 'turnstile:sync'
  | 'user:manage'
  | 'audit:read'
  | 'integration:manage';

const MATRIX: Record<Role, Permission[]> = {
  PROFESSOR: [
    'student:read',
    'student:search',
    'note:create',
    'note:update:own',
    'note:delete:own',
    'feedback:create',
    'alert:read',
    'turnstile:read',
  ],
  GESTOR: [
    'student:read',
    'student:search',
    'note:create',
    'note:update:own',
    'note:update:any',
    'note:delete:own',
    'note:delete:any',
    'feedback:create',
    'alert:read',
    'alert:acknowledge',
    'turnstile:read',
    'turnstile:read:all',
    'audit:read',
  ],
  ADMIN: [
    'student:read',
    'student:search',
    'note:create',
    'note:update:own',
    'note:update:any',
    'note:delete:own',
    'note:delete:any',
    'feedback:create',
    'alert:read',
    'alert:acknowledge',
    'turnstile:read',
    'turnstile:read:all',
    'turnstile:manage',
    'turnstile:sync',
    'user:manage',
    'audit:read',
    'integration:manage',
  ],
};

export function can(user: SessionUser, permission: Permission): boolean {
  return MATRIX[user.role].includes(permission);
}

export function assertCan(user: SessionUser | null, permission: Permission): asserts user is SessionUser {
  if (!user) throw new AuthenticationError();
  if (!can(user, permission)) throw new AuthorizationError();
}

/**
 * Catracas que o usuário pode enxergar.
 *
 * GESTOR e ADMIN veem todas. PROFESSOR vê a catraca padrão mais as
 * explicitamente autorizadas. Retornar `null` significa "sem restrição" —
 * distinto de lista vazia, que significa "nenhuma catraca liberada".
 */
export async function allowedTurnstileIds(user: SessionUser): Promise<string[] | null> {
  if (can(user, 'turnstile:read:all')) return null;

  const permissions = await prisma.userTurnstilePermission.findMany({
    where: { userId: user.id },
    select: { turnstileId: true },
  });

  const ids = new Set(permissions.map((p) => p.turnstileId));
  if (user.defaultTurnstileId) ids.add(user.defaultTurnstileId);
  return [...ids];
}

/** Valida um filtro de catraca vindo do cliente. Nunca confiar no parâmetro. */
export async function assertCanViewTurnstile(
  user: SessionUser,
  turnstileId: string | null,
): Promise<void> {
  const allowed = await allowedTurnstileIds(user);
  if (allowed === null) return;

  // "Todas" para quem tem acesso restrito significa "todas as minhas",
  // e isso é resolvido no service. Aqui só barramos alvo específico proibido.
  if (turnstileId === null) return;

  if (!allowed.includes(turnstileId)) {
    throw new AuthorizationError('Você não tem acesso a esta catraca.');
  }
}
