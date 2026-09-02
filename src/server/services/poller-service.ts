import { getEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { prisma } from '@/server/db/prisma';
import { getTecnofitProvider } from '@/server/tecnofit';
import { publish } from '@/server/realtime/event-bus';
import { IngestService, type IngestResult } from './ingest-service';

/**
 * ============================================================
 * POLLING INTELIGENTE (seção 11)
 * ============================================================
 *
 * A documentação oficial não pôde ser consultada para confirmar se a
 * Tecnofit oferece webhook de catraca (ver docs/tecnofit-integration.md).
 * O poller existe para que o produto funcione de qualquer jeito.
 *
 * Cuidados que o tornam "inteligente" e não um laço burro:
 *  - cursor persistido em SyncState: sobrevive a restart, não relê o mundo;
 *  - janela de sobreposição: cobre latência de escrita na origem;
 *  - deduplicação a jusante: a sobreposição não vira evento duplicado;
 *  - backoff progressivo em falha: não martela uma API que já está sofrendo;
 *  - guarda de concorrência: um ciclo por vez, sempre.
 */

const RESOURCE = 'access_events';

let running = false;
let timer: NodeJS.Timeout | null = null;

async function getCursor(): Promise<Date | null> {
  const state = await prisma.syncState.findUnique({ where: { resource: RESOURCE } });
  if (!state?.cursor) return null;
  const d = new Date(state.cursor);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function saveSuccess(cursor: Date): Promise<void> {
  const now = new Date();
  await prisma.syncState.upsert({
    where: { resource: RESOURCE },
    create: { resource: RESOURCE, cursor: cursor.toISOString(), lastRunAt: now, lastOkAt: now },
    update: {
      cursor: cursor.toISOString(),
      lastRunAt: now,
      lastOkAt: now,
      lastError: null,
      failureCount: 0,
    },
  });
}

async function saveFailure(message: string): Promise<number> {
  const now = new Date();
  const state = await prisma.syncState.upsert({
    where: { resource: RESOURCE },
    create: { resource: RESOURCE, lastRunAt: now, lastError: message, failureCount: 1 },
    update: { lastRunAt: now, lastError: message, failureCount: { increment: 1 } },
  });
  return state.failureCount;
}

/** Executa um ciclo. Exportado para permitir disparo manual e teste. */
export async function runPollCycle(): Promise<IngestResult & { skipped?: boolean }> {
  if (running) {
    logger.debug('Ciclo de polling ignorado: já existe um em andamento');
    return { received: 0, persisted: 0, duplicates: 0, invalid: 0, skipped: true };
  }
  running = true;

  const env = getEnv();
  const until = new Date();

  try {
    const cursor = await getCursor();
    const since = cursor
      ? new Date(cursor.getTime() - env.ACCESS_POLL_OVERLAP_SECONDS * 1000)
      : new Date(until.getTime() - 4 * 3600 * 1000);

    const provider = getTecnofitProvider();
    const totals: IngestResult = { received: 0, persisted: 0, duplicates: 0, invalid: 0 };

    let nextCursor: string | undefined;
    let pages = 0;
    // Teto de páginas: protege contra paginação infinita se a origem
    // devolver um cursor que nunca termina.
    const MAX_PAGES = 20;

    do {
      const page = await provider.listAccessEvents({ since, until, cursor: nextCursor, limit: 100 });
      const result = await IngestService.ingestMany(page.items, 'POLLING');

      totals.received += result.received;
      totals.persisted += result.persisted;
      totals.duplicates += result.duplicates;
      totals.invalid += result.invalid;

      nextCursor = page.nextCursor;
      pages++;
    } while (nextCursor && pages < MAX_PAGES);

    await saveSuccess(until);
    publish({ type: 'sync', payload: { status: 'ok', at: until.toISOString() } });

    return totals;
  } catch (err) {
    const message = (err as Error).message;
    const failures = await saveFailure(message);
    logger.error('Ciclo de polling falhou', { error: message, failures });
    publish({ type: 'sync', payload: { status: 'error', at: new Date().toISOString(), detail: message } });
    return { received: 0, persisted: 0, duplicates: 0, invalid: 0 };
  } finally {
    running = false;
  }
}

/** Intervalo efetivo, alongado enquanto houver falhas seguidas. */
async function nextDelayMs(): Promise<number> {
  const env = getEnv();
  const base = env.ACCESS_POLL_INTERVAL_SECONDS * 1000;
  const state = await prisma.syncState.findUnique({ where: { resource: RESOURCE } });
  const failures = state?.failureCount ?? 0;
  if (failures === 0) return base;
  return Math.min(base * 2 ** Math.min(failures, 5), 5 * 60_000);
}

const globalForPoller = globalThis as unknown as { __nacaoPollerStarted?: boolean };

/**
 * Liga o poller. Idempotente: chamadas repetidas (hot reload) não criam
 * múltiplos laços.
 */
export function startPoller(): void {
  const env = getEnv();
  if (env.ACCESS_INGEST_MODE === 'webhook') {
    logger.info('Poller desativado (ACCESS_INGEST_MODE=webhook)');
    return;
  }
  if (globalForPoller.__nacaoPollerStarted) return;
  globalForPoller.__nacaoPollerStarted = true;

  logger.info('Poller de acessos iniciado', {
    intervalSeconds: env.ACCESS_POLL_INTERVAL_SECONDS,
    provider: env.TECNOFIT_PROVIDER,
  });

  const loop = async () => {
    await runPollCycle();
    const delay = await nextDelayMs();
    timer = setTimeout(loop, delay);
    // Não segura o processo vivo só por causa do poller.
    timer.unref?.();
  };

  // Pequeno atraso inicial: deixa a aplicação subir antes do primeiro ciclo.
  timer = setTimeout(loop, 3_000);
  timer.unref?.();
}

export function stopPoller(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  globalForPoller.__nacaoPollerStarted = false;
}

export async function getSyncStatus() {
  return prisma.syncState.findUnique({ where: { resource: RESOURCE } });
}
