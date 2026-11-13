import { after, NextResponse } from 'next/server';
import { processEvent, storeEvent, verifySignature } from '@/server/services/tecnofit-webhook-service';

/**
 * POST /api/webhooks/tecnofit — avisos da Tecnofit. Confere a assinatura (HMAC-SHA256 com
 * TECNOFIT_WEBHOOK_SECRET), guarda e responde na hora (a Tecnofit exige 2xx em até 5 s);
 * o processamento roda logo depois. Assinatura inválida = 401 (a Tecnofit não reenvia 4xx).
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  const secret = process.env.TECNOFIT_WEBHOOK_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: 'webhook não configurado' }, { status: 503 });
  const raw = await req.text();
  if (raw.length > 256_000) return NextResponse.json({ error: 'grande demais' }, { status: 413 });
  if (!verifySignature(secret, req.headers.get('x-tecnofit-timestamp'), req.headers.get('x-tecnofit-signature'), raw)) {
    return NextResponse.json({ error: 'assinatura inválida' }, { status: 401 });
  }
  let body: Record<string, unknown> = {};
  try { body = JSON.parse(raw) as Record<string, unknown>; } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }
  const data = (body.data && typeof body.data === 'object' ? body.data : {}) as Record<string, unknown>;
  const id = req.headers.get('x-tecnofit-webhook-id') ?? String(body.id ?? body.webhook_event_id ?? '');
  const event = req.headers.get('x-tecnofit-event') ?? String(body.event ?? '');
  const resourceUrl = String(body.resource_url ?? data.resource_url ?? '') || null;
  if (!id || !event) return NextResponse.json({ error: 'aviso sem id ou evento' }, { status: 400 });
  const isNew = await storeEvent(id, event, resourceUrl);
  if (isNew) after(() => processEvent(id).then(() => undefined, () => undefined));
  return NextResponse.json({ ok: true, duplicate: !isNew });
}
