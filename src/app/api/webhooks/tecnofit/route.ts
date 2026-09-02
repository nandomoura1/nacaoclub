import { createHmac, timingSafeEqual } from 'node:crypto';
import { getEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { loadEndpointMap } from '@/server/tecnofit/endpoint-map';
import { normalizeAccessEvent, normalizeCollection } from '@/server/tecnofit/normalizer';
import { IngestService } from '@/server/services/ingest-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * ============================================================
 * WEBHOOK DE EVENTOS DE CATRACA
 * ============================================================
 *
 * ⚠️ NÃO VERIFICADO: não foi possível confirmar na documentação oficial se
 * a Tecnofit emite webhook de passagem de catraca, qual o formato do payload
 * ou como a assinatura é calculada. Ver docs/tecnofit-integration.md.
 *
 * O endpoint foi construído de forma DEFENSIVA e agnóstica de formato:
 *
 *  - Aceita objeto único ou coleção, em qualquer envelope conhecido pelo
 *    normalizer — o mesmo mapeamento declarativo usado no polling.
 *  - Exige assinatura HMAC-SHA256 do corpo cru quando TECNOFIT_WEBHOOK_SECRET
 *    está configurado. Sem segredo configurado, o endpoint RECUSA tudo em
 *    produção: um webhook aberto é um vetor de injeção de eventos falsos.
 *  - Responde 200 mesmo para payload que não gerou evento válido, para não
 *    provocar retentativa infinita na origem — o diagnóstico vai para o log.
 *
 * Quando a documentação for obtida, o ajuste esperado é apenas o header e o
 * algoritmo da assinatura, mais o mapeamento de campos. Zero mudança de lógica.
 */

function assinaturaValida(rawBody: string, header: string | null, secret: string): boolean {
  if (!header) return false;

  // Aceita "sha256=<hex>" e o hex puro — as duas convenções mais comuns.
  const received = header.includes('=') ? header.split('=').pop()!.trim() : header.trim();
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');

  const a = Buffer.from(received, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const env = getEnv();

  if (env.ACCESS_INGEST_MODE === 'polling') {
    return Response.json({ error: 'Webhook desabilitado (ACCESS_INGEST_MODE=polling).' }, { status: 404 });
  }

  const rawBody = await request.text();

  if (env.TECNOFIT_WEBHOOK_SECRET) {
    const header = request.headers.get(env.TECNOFIT_WEBHOOK_SIGNATURE_HEADER);
    if (!assinaturaValida(rawBody, header, env.TECNOFIT_WEBHOOK_SECRET)) {
      logger.warn('Webhook rejeitado: assinatura inválida');
      return Response.json({ error: 'Assinatura inválida.' }, { status: 401 });
    }
  } else if (env.NODE_ENV === 'production') {
    // Falha fechada. Aceitar evento não assinado em produção permitiria a
    // qualquer um forjar a chegada de um aluno.
    logger.error('Webhook recusado: TECNOFIT_WEBHOOK_SECRET não configurado em produção');
    return Response.json({ error: 'Webhook não configurado.' }, { status: 503 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: 'Corpo não é JSON válido.' }, { status: 400 });
  }

  const map = loadEndpointMap();

  // Tenta interpretar como coleção; se vier vazio, tenta como evento único.
  const collection = normalizeCollection(body, map, (raw) => normalizeAccessEvent(raw, map));
  const events = collection.items.length
    ? collection.items
    : [normalizeAccessEvent(body, map)].filter((e): e is NonNullable<typeof e> => e !== null);

  if (events.length === 0) {
    // Sem stack e sem payload no log: pode conter dado pessoal.
    logger.warn('Webhook recebido sem evento reconhecível', {
      bodyBytes: rawBody.length,
      hint: 'Ajuste fields.accessEvent no EndpointMap conforme o payload real.',
    });
    return Response.json({ received: 0, persisted: 0 }, { status: 200 });
  }

  const result = await IngestService.ingestMany(events, 'WEBHOOK');
  return Response.json(result, { status: 200 });
}
