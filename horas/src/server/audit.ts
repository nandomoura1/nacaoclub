import type { Prisma } from '@prisma/client';
import type { Tx } from '@/server/db';
import type { RequestMeta } from '@/server/auth/session';

export interface AuditContext extends RequestMeta {
  actorId: string | null;
}

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  /** Frase em português: "Carla criou o usuário Maria (Coordenador)". */
  summary: string;
}

/** Campos que nunca entram no log, mesmo que venham no objeto. */
const REDACTED = new Set(['passwordHash', 'password', 'tokenHash', 'token']);

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([k]) => !REDACTED.has(k))
        .map(([k, v]) => [k, redact(v)]),
    );
  }
  return value;
}

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  return value === undefined || value === null ? undefined : (redact(value) as Prisma.InputJsonValue);
}

/**
 * Grava a trilha de auditoria. Chame com o MESMO `tx` da alteração: se a
 * alteração falhar, o log não existe; se o log falhar, a alteração não existe.
 */
export async function audit(tx: Tx, ctx: AuditContext, entry: AuditEntry): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorId: ctx.actorId,
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent?.slice(0, 255) ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      before: toJson(entry.before),
      after: toJson(entry.after),
      summary: entry.summary,
    },
  });
}
