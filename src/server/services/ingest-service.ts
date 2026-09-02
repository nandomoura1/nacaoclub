import type { AccessEventSource } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { prisma } from '@/server/db/prisma';
import { logger } from '@/lib/logger';
import type { TecnofitAccessEvent } from '@/server/tecnofit';
import { publish } from '@/server/realtime/event-bus';
import { buildDedupeKey } from './dedupe';
import { StudentService } from './student-service';
import { TurnstileService } from './turnstile-service';
import { AlertService } from './alert-service';

/**
 * ============================================================
 * FUNIL ÚNICO DE INGESTÃO
 * ============================================================
 *
 * Webhook e poller desaguam exatamente aqui. Isso é o que garante que a
 * deduplicação, os alertas e o realtime se comportem de forma idêntica
 * independentemente de como o evento chegou — e é o que permite ligar o
 * webhook depois sem reescrever nada.
 *
 * Fluxo por evento:
 *   normalizado → dedupe → aluno → catraca → persistência → alertas → SSE
 */

export interface IngestResult {
  received: number;
  persisted: number;
  duplicates: number;
  invalid: number;
}

export const IngestService = {
  async ingestMany(events: TecnofitAccessEvent[], source: AccessEventSource): Promise<IngestResult> {
    const result: IngestResult = { received: events.length, persisted: 0, duplicates: 0, invalid: 0 };

    for (const event of events) {
      try {
        const outcome = await this.ingestOne(event, source);
        if (outcome === 'persisted') result.persisted++;
        else if (outcome === 'duplicate') result.duplicates++;
        else result.invalid++;
      } catch (err) {
        result.invalid++;
        // Um evento problemático não pode interromper o lote inteiro.
        logger.error('Falha ao ingerir evento', {
          studentExternalId: event.studentExternalId,
          error: (err as Error).message,
        });
      }
    }

    if (result.persisted || result.duplicates) {
      logger.info('Lote de eventos processado', { ...result, source });
    }
    return result;
  },

  async ingestOne(
    event: TecnofitAccessEvent,
    source: AccessEventSource,
  ): Promise<'persisted' | 'duplicate' | 'invalid'> {
    if (!event.studentExternalId || !event.occurredAt) return 'invalid';

    const dedupeKey = buildDedupeKey({
      studentExternalId: event.studentExternalId,
      accessPointExternalId: event.accessPointExternalId,
      accessPointLabel: event.accessPointLabel,
      eventType: event.eventType,
      occurredAt: event.occurredAt,
    });

    // Checagem barata antes de gastar chamadas de API com um duplicado.
    const existing = await prisma.accessEvent.findFirst({
      where: {
        OR: [
          { dedupeKey },
          ...(event.externalEventId ? [{ externalEventId: event.externalEventId }] : []),
        ],
      },
      select: { id: true },
    });
    if (existing) return 'duplicate';

    const student = await StudentService.ensureByExternalId(event.studentExternalId);
    if (!student) return 'invalid';

    const turnstile = await TurnstileService.resolve(
      event.accessPointExternalId,
      event.accessPointLabel,
    );

    let accessEventId: string;
    try {
      const created = await prisma.accessEvent.create({
        data: {
          externalEventId: event.externalEventId ?? null,
          dedupeKey,
          studentId: student.id,
          turnstileId: turnstile?.id ?? null,
          eventType: event.eventType,
          occurredAt: event.occurredAt,
          source,
          // Preserva a referência crua mesmo quando a catraca não foi
          // reconhecida — o dado não se perde e permite reconciliar depois.
          rawTurnstileRef: turnstile
            ? null
            : event.accessPointLabel ?? event.accessPointExternalId ?? null,
        },
      });
      accessEventId = created.id;
    } catch (err) {
      // A corrida entre webhook e poller termina aqui: o índice único é a
      // garantia real de deduplicação, não a checagem otimista acima.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return 'duplicate';
      }
      throw err;
    }

    await prisma.student.update({
      where: { id: student.id },
      data: {
        lastSeenAt: event.occurredAt,
        firstSeenAt: student.firstSeenAt ?? event.occurredAt,
      },
    });

    // Alertas e realtime não podem derrubar a ingestão: o evento já está
    // persistido e é isso que não pode se perder.
    try {
      if (event.eventType === 'ENTRY') {
        await AlertService.evaluateForArrival({
          student,
          currentTurnstileName: turnstile?.modalityLabel ?? turnstile?.name ?? null,
          occurredAt: event.occurredAt,
        });
      }
    } catch (err) {
      logger.error('Falha ao avaliar alertas', { studentId: student.id, error: (err as Error).message });
    }

    publish({
      type: 'arrival',
      payload: {
        accessEventId,
        studentId: student.id,
        turnstileId: turnstile?.id ?? null,
        occurredAt: event.occurredAt.toISOString(),
      },
    });

    return 'persisted';
  },
};
