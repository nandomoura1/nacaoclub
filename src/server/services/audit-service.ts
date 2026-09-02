import { prisma } from '@/server/db/prisma';
import { logger, redact } from '@/lib/logger';
import type { Prisma } from '@prisma/client';

/**
 * Trilha de auditoria.
 *
 * Regra do brief (seção 23): nada de alteração silenciosa. Toda edição e
 * exclusão de nota registra valor anterior e novo. A gravação é best-effort:
 * uma falha de auditoria não pode derrubar a operação do professor, mas
 * precisa aparecer no log de erro.
 */

export interface AuditInput {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export const AuditService = {
  async record(input: AuditInput): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          userId: input.userId ?? null,
          action: input.action,
          entity: input.entity,
          entityId: input.entityId ?? null,
          // redact() garante que nenhum segredo entre na trilha, mesmo que
          // um chamador futuro passe um objeto inteiro sem pensar.
          oldValue: (redact(input.oldValue) ?? null) as Prisma.InputJsonValue,
          newValue: (redact(input.newValue) ?? null) as Prisma.InputJsonValue,
          ipAddress: input.ipAddress ?? null,
          userAgent: input.userAgent?.slice(0, 255) ?? null,
        },
      });
    } catch (err) {
      logger.error('Falha ao gravar auditoria', {
        action: input.action,
        entity: input.entity,
        error: (err as Error).message,
      });
    }
  },

  async list(params: { entity?: string; entityId?: string; userId?: string; limit?: number }) {
    return prisma.auditLog.findMany({
      where: {
        ...(params.entity ? { entity: params.entity } : {}),
        ...(params.entityId ? { entityId: params.entityId } : {}),
        ...(params.userId ? { userId: params.userId } : {}),
      },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(params.limit ?? 100, 500),
    });
  },
};
