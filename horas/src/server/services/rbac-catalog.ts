import type { Tx } from '@/server/db';
import { PERMISSIONS, PERMISSION_KEYS, SYSTEM_ROLES } from '@/server/auth/permissions';

/**
 * Sincroniza o catálogo de permissões do código com o banco e garante os
 * papéis de sistema. Idempotente: roda no seed e pode rodar em todo deploy.
 *
 * Papéis de sistema recebem exatamente a matriz do código. Papéis criados
 * pelo admin não são tocados.
 */
export async function syncPermissionCatalog(tx: Tx): Promise<void> {
  for (const key of PERMISSION_KEYS) {
    await tx.permission.upsert({
      where: { key },
      create: { key, description: PERMISSIONS[key] },
      update: { description: PERMISSIONS[key] },
    });
  }
  // Permissão que saiu do código sai do banco (e de todos os papéis, via cascade).
  await tx.permission.deleteMany({ where: { key: { notIn: PERMISSION_KEYS } } });

  const permissionIds = new Map(
    (await tx.permission.findMany({ select: { id: true, key: true } })).map((p) => [p.key, p.id]),
  );

  for (const [key, def] of Object.entries(SYSTEM_ROLES)) {
    const role = await tx.role.upsert({
      where: { key },
      create: { key, name: def.name, description: def.description, isSystem: true },
      update: { name: def.name, description: def.description, isSystem: true },
    });
    await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
    if (def.permissions.length) {
      await tx.rolePermission.createMany({
        data: def.permissions.map((p) => ({ roleId: role.id, permissionId: permissionIds.get(p)! })),
      });
    }
  }
}
