import { NextResponse } from 'next/server';
import { todayIso } from '@/lib/today';
import { runDueAutomations } from '@/server/whatsapp/automations';

/**
 * Agendador diário (Vercel Cron, 8h de Brasília): roda as automações de
 * WhatsApp do dia. Protegido por CRON_SECRET (a Vercel manda "Authorization: Bearer …").
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'não autorizado' }, { status: 401 });
  const today = new URL(req.url).searchParams.get('dia') ?? todayIso();
  return NextResponse.json({ today, results: await runDueAutomations(today) });
}
