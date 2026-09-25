import type { Tx } from '@/server/db';
import { isPermissionKey, type PermissionKey } from './permissions';

/**
 * Quem está agindo, com tudo que a autorização precisa já resolvido.
 * Montado uma vez por requisição a partir do banco — nunca do cliente.
 */
export interface Principal {
  id: string;
  name: string;
  email: string;
  roleKeys: string[];
  permissions: ReadonlySet<PermissionKey>;
  /** `null` = sem restrição (permissão area.all). Lista vazia = nenhuma área. */
  areaIds: readonly string[] | null;
  mustChangePassword: boolean;
}

export async function loadPrincipal(db: Tx, userId: string): Promise<Principal | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
      areaScopes: { select: { areaId: true } },
    },
  });
  if (!user || !user.active) return null;

  // Senha provisória: nenhuma permissão até a troca. A tela redireciona, mas
  // a trava de verdade é esta — vale também para Server Actions chamadas direto.
  const permissions = new Set<PermissionKey>();
  if (!user.mustChangePassword) for (const { role } of user.roles) {
    for (const { permission } of role.permissions) {
      if (isPermissionKey(permission.key)) permissions.add(permission.key);
    }
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    roleKeys: user.roles.map((r) => r.role.key),
    permissions,
    areaIds: permissions.has('area.all') ? null : user.areaScopes.map((s) => s.areaId),
    mustChangePassword: user.mustChangePassword,
  };
}
