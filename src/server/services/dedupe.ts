import { createHash } from 'node:crypto';

/**
 * ============================================================
 * DEDUPLICAÇÃO DE EVENTOS DE CATRACA (seção 12 do brief)
 * ============================================================
 *
 * O mesmo giro de catraca não pode virar dois cards. Isso acontece o tempo
 * todo na prática: o webhook entrega e o poller relê a mesma janela, ou a
 * origem reenvia por falta de ACK.
 *
 * Estratégia em duas camadas:
 *
 *   1. `externalEventId` — quando a origem fornece ID único, ele é a
 *      verdade. Índice único no banco.
 *
 *   2. `dedupeKey` — sempre calculada, mesmo quando há ID externo. É a
 *      rede de segurança para quando webhook e poller descrevem o mesmo
 *      evento com IDs diferentes (ou sem ID).
 *
 * A chave usa o timestamp truncado ao SEGUNDO. Escolha deliberada:
 * milissegundos divergem entre origens para o mesmo evento físico; o
 * minuto seria largo demais e engoliria duas entradas legítimas seguidas.
 *
 * A catraca entra na chave pela referência que existir: preferimos o ID
 * externo, caímos para o rótulo normalizado e, na falta dos dois, usamos
 * um marcador explícito. Um evento sem catraca identificada não pode
 * colidir silenciosamente com outro de catraca conhecida.
 */

export interface DedupeInput {
  studentExternalId: string;
  accessPointExternalId?: string | null;
  accessPointLabel?: string | null;
  eventType: string;
  occurredAt: Date;
}

function normalizeRef(input: DedupeInput): string {
  if (input.accessPointExternalId) return `id:${input.accessPointExternalId}`;
  if (input.accessPointLabel) {
    const slug = input.accessPointLabel
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return `label:${slug}`;
  }
  return 'unknown';
}

export function buildDedupeKey(input: DedupeInput): string {
  const secondPrecision = Math.floor(input.occurredAt.getTime() / 1000);
  const material = [
    input.studentExternalId,
    normalizeRef(input),
    input.eventType,
    String(secondPrecision),
  ].join('|');

  return createHash('sha256').update(material).digest('hex').slice(0, 40);
}

/**
 * Chave de alerta: um mesmo aluno não deve receber o mesmo alerta duas vezes
 * dentro da mesma janela (normalmente o dia). O bucket entra na chave.
 */
export function buildAlertDedupeKey(studentId: string, type: string, bucket: string): string {
  return createHash('sha256')
    .update(`${studentId}|${type}|${bucket}`)
    .digest('hex')
    .slice(0, 40);
}

/** Bucket diário em horário local, usado como janela padrão dos alertas. */
export function dayBucket(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
