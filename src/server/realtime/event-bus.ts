import { EventEmitter } from 'node:events';
import { logger } from '@/lib/logger';

/**
 * Barramento de eventos em processo, consumido pelo endpoint SSE.
 *
 * Por que SSE e não WebSocket: o fluxo é estritamente unidirecional
 * (servidor → dashboard). SSE reconecta sozinho, atravessa proxy HTTP sem
 * upgrade e custa uma fração da complexidade. Ver docs/architecture.md.
 *
 * Limitação conhecida: o barramento é local ao processo. Com várias
 * instâncias, um evento ingerido na instância A não chega ao SSE da B.
 * A troca prevista é Postgres LISTEN/NOTIFY ou Redis pub/sub —
 * o contrato `publish/subscribe` já isola essa mudança.
 */

export interface ArrivalPayload {
  accessEventId: string;
  studentId: string;
  turnstileId: string | null;
  occurredAt: string;
}

export type RealtimeEvent =
  | { type: 'arrival'; payload: ArrivalPayload }
  | { type: 'heartbeat'; payload: { at: string } }
  | { type: 'sync'; payload: { status: 'ok' | 'error'; at: string; detail?: string } };

const CHANNEL = 'realtime';

const globalForBus = globalThis as unknown as { __nacaoBus?: EventEmitter };

function bus(): EventEmitter {
  if (!globalForBus.__nacaoBus) {
    const emitter = new EventEmitter();
    // Cada aba aberta é um listener. O padrão de 10 estoura rápido numa
    // recepção com vários tablets.
    emitter.setMaxListeners(200);
    globalForBus.__nacaoBus = emitter;
  }
  return globalForBus.__nacaoBus;
}

export function publish(event: RealtimeEvent): void {
  bus().emit(CHANNEL, event);
  if (event.type === 'arrival') {
    logger.debug('Evento publicado no barramento', { type: event.type });
  }
}

export function subscribe(listener: (event: RealtimeEvent) => void): () => void {
  bus().on(CHANNEL, listener);
  return () => bus().off(CHANNEL, listener);
}

export function listenerCount(): number {
  return bus().listenerCount(CHANNEL);
}
