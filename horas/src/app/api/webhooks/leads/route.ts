import { NextResponse } from 'next/server';
import { ingestLead, leadsWebhookToken } from '@/server/services/mkt-leads-service';

/**
 * Leads de formulários (Wix Automations → "Enviar dados por webhook",
 * landing pages, Zapier…). A URL leva o token e, opcionalmente, a origem:
 * https://<site>/api/webhooks/leads?token=<…>&origem=SITE&campanha=<nome>
 * Aceita JSON ou formulário (application/x-www-form-urlencoded).
 */
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const url = new URL(req.url);
  const token = leadsWebhookToken();
  if (!token || url.searchParams.get('token') !== token) return NextResponse.json({ error: 'não autorizado' }, { status: 401 });
  let body: unknown;
  try {
    const type = req.headers.get('content-type') ?? '';
    body = type.includes('application/x-www-form-urlencoded') || type.includes('multipart/form-data')
      ? Object.fromEntries((await req.formData()).entries())
      : await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'corpo inválido' }, { status: 400 });
  }
  try {
    const r = await ingestLead(body, { source: url.searchParams.get('origem'), campaign: url.searchParams.get('campanha') });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error('webhook leads', e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
