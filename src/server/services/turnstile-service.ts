import type { Turnstile } from '@prisma/client';
import { prisma } from '@/server/db/prisma';
import { logger } from '@/lib/logger';
import { getTecnofitProvider } from '@/server/tecnofit';
import { allowedTurnstileIds } from '@/server/auth/rbac';
import type { SessionUser } from '@/server/auth/session';
import { AuditService } from './audit-service';

/**
 * Catracas.
 *
 * Os identificadores externos (`tecnofitAccessPointId`) NUNCA são inventados:
 * chegam pela sincronização com a API ou por cadastro manual de um ADMIN que
 * copiou o ID do painel Tecnofit.
 */
export const TurnstileService = {
  /**
   * Descobre catracas na API e reconcilia com o banco local.
   * Nunca apaga catraca: desativa a que sumiu da origem, preservando o
   * histórico de eventos que aponta para ela.
   */
  async syncFromTecnofit(actorUserId?: string): Promise<{ created: number; updated: number; deactivated: number }> {
    const provider = getTecnofitProvider();
    const remote = await provider.listAccessPoints();

    let created = 0;
    let updated = 0;

    for (const [index, ap] of remote.entries()) {
      const existing = await prisma.turnstile.findUnique({
        where: { tecnofitAccessPointId: ap.externalId },
      });

      if (existing) {
        await prisma.turnstile.update({
          where: { id: existing.id },
          data: {
            // O nome local pode ter sido ajustado por um ADMIN para ficar mais
            // claro ao professor. Não sobrescrevemos edição humana com a origem.
            name: existing.name,
            description: ap.description ?? existing.description,
            location: ap.location ?? existing.location,
            active: ap.active ?? existing.active,
          },
        });
        updated++;
      } else {
        await prisma.turnstile.create({
          data: {
            tecnofitAccessPointId: ap.externalId,
            name: ap.name,
            description: ap.description ?? null,
            location: ap.location ?? null,
            active: ap.active ?? true,
            displayOrder: index,
          },
        });
        created++;
      }
    }

    const remoteIds = remote.map((r) => r.externalId);
    const { count: deactivated } = await prisma.turnstile.updateMany({
      where: {
        tecnofitAccessPointId: { notIn: remoteIds.length ? remoteIds : ['__none__'] },
        NOT: { tecnofitAccessPointId: null },
        active: true,
      },
      data: { active: false },
    });

    logger.info('Sincronização de catracas concluída', { created, updated, deactivated, provider: provider.name });

    await AuditService.record({
      userId: actorUserId ?? null,
      action: 'TURNSTILE_SYNC',
      entity: 'Turnstile',
      newValue: { created, updated, deactivated, provider: provider.name },
    });

    return { created, updated, deactivated };
  },

  /** Catracas visíveis para o usuário, já ordenadas para o seletor. */
  async listVisible(user: SessionUser): Promise<Turnstile[]> {
    const allowed = await allowedTurnstileIds(user);
    return prisma.turnstile.findMany({
      where: {
        active: true,
        ...(allowed === null ? {} : { id: { in: allowed } }),
      },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    });
  },

  async listAll(): Promise<Turnstile[]> {
    return prisma.turnstile.findMany({ orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }] });
  },

  /**
   * Resolve a catraca local a partir da referência crua de um evento.
   * Ordem: ID externo → nome exato (case-insensitive). Se nada casar,
   * devolve null e o evento é guardado com `rawTurnstileRef` preenchido —
   * o dado não se perde só porque a catraca ainda não foi cadastrada.
   */
  async resolve(externalId?: string | null, label?: string | null): Promise<Turnstile | null> {
    if (externalId) {
      const byId = await prisma.turnstile.findUnique({ where: { tecnofitAccessPointId: externalId } });
      if (byId) return byId;
    }
    if (label) {
      const byName = await prisma.turnstile.findFirst({
        where: { name: { equals: label, mode: 'insensitive' } },
      });
      if (byName) return byName;
    }
    return null;
  },

  async create(data: {
    name: string;
    tecnofitAccessPointId?: string | null;
    description?: string | null;
    location?: string | null;
    modalityLabel?: string | null;
    displayOrder?: number;
  }, actorUserId: string): Promise<Turnstile> {
    const turnstile = await prisma.turnstile.create({
      data: {
        name: data.name,
        tecnofitAccessPointId: data.tecnofitAccessPointId || null,
        description: data.description ?? null,
        location: data.location ?? null,
        modalityLabel: data.modalityLabel ?? null,
        displayOrder: data.displayOrder ?? 0,
      },
    });
    await AuditService.record({
      userId: actorUserId,
      action: 'TURNSTILE_CREATE',
      entity: 'Turnstile',
      entityId: turnstile.id,
      newValue: turnstile,
    });
    return turnstile;
  },

  async update(id: string, data: Partial<Turnstile>, actorUserId: string): Promise<Turnstile> {
    const before = await prisma.turnstile.findUniqueOrThrow({ where: { id } });
    const after = await prisma.turnstile.update({
      where: { id },
      data: {
        name: data.name ?? before.name,
        description: data.description ?? before.description,
        location: data.location ?? before.location,
        modalityLabel: data.modalityLabel ?? before.modalityLabel,
        active: data.active ?? before.active,
        displayOrder: data.displayOrder ?? before.displayOrder,
      },
    });
    await AuditService.record({
      userId: actorUserId,
      action: 'TURNSTILE_UPDATE',
      entity: 'Turnstile',
      entityId: id,
      oldValue: before,
      newValue: after,
    });
    return after;
  },
};
