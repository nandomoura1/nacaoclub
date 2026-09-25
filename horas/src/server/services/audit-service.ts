import { z } from 'zod';
import { prisma } from '@/server/db';
import { assertCan } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';

export const auditFilterSchema = z.object({
  q: z.string().trim().max(100).optional(),
  actorId: z.string().uuid().optional(),
  entityType: z.string().max(50).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});

export const AUDIT_PAGE_SIZE = 50;

export async function listAuditLogs(principal: Principal | null, rawFilter: unknown) {
  assertCan(principal, 'audit.view');
  const f = auditFilterSchema.parse(rawFilter);

  const where = {
    ...(f.actorId ? { actorId: f.actorId } : {}),
    ...(f.entityType ? { entityType: f.entityType } : {}),
    ...(f.q ? { summary: { contains: f.q, mode: 'insensitive' as const } } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { at: 'desc' },
      skip: (f.page - 1) * AUDIT_PAGE_SIZE,
      take: AUDIT_PAGE_SIZE,
      include: { actor: { select: { name: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { items, total, page: f.page, pages: Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE)) };
}
