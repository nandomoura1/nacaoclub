import { NextResponse } from 'next/server';
import { handleZapiReceived, webhookToken, type ZapiReceived } from '@/server/whatsapp/inbound';

/**
 * Webhook "Ao receber" da Z-API. A URL cadastrada no painel leva o token:
 * https://<site>/api/webhooks/zapi?token=<ZAPI_WEBHOOK_TOKEN ou CRON_SECRET>
 * Sempre responde 200 rápido para a Z-API não reenviar à toa.
 */
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const token = webhookToken();
  if (!token || new URL(req.url).searchParams.get('token') !== token) return NextResponse.json({ error: 'não autorizado' }, { status: 401 });
  let body: ZapiReceived;
  try { body = (await req.json()) as ZapiReceived; } catch { return NextResponse.json({ ok: false, error: 'json inválido' }, { status: 400 }); }
  try {
    return NextResponse.json({ ok: true, result: await handleZapiReceived(body) });
  } catch (e) {
    console.error('webhook zapi', e);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
