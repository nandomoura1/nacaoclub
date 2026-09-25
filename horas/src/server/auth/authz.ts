import { AuthenticationError, AuthorizationError } from '@/server/errors';
import type { PermissionKey } from './permissions';
import type { Principal } from './principal';

/**
 * Autorização — sempre no servidor. A tela pode esconder um botão por
 * conveniência; a decisão real acontece aqui.
 */
export function can(principal: Principal | null, permission: PermissionKey): boolean {
  return principal !== null && principal.permissions.has(permission);
}

export function assertCan(
  principal: Principal | null,
  permission: PermissionKey,
): asserts principal is Principal {
  if (!principal) throw new AuthenticationError();
  if (!principal.permissions.has(permission)) throw new AuthorizationError();
}

/** O principal pode agir sobre algo que pertence a `areaId`? */
export function canAccessArea(principal: Principal, areaId: string): boolean {
  return principal.areaIds === null || principal.areaIds.includes(areaId);
}

export function assertAreaAccess(principal: Principal, areaId: string): void {
  if (!canAccessArea(principal, areaId)) {
    throw new AuthorizationError('Esta área não está sob a sua coordenação.');
  }
}

/**
 * Filtro Prisma para consultas escopadas por área. Use SEMPRE no
 * repositório — a tela nunca recebe o dado que não pode ver.
 *   where: { ...areaWhere(principal) }
 */
export function areaWhere(principal: Principal): { areaId?: { in: string[] } } {
  return principal.areaIds === null ? {} : { areaId: { in: [...principal.areaIds] } };
}
