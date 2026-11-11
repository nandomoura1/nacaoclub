import { NextResponse } from 'next/server';
import { todayIso } from '@/lib/today';
import { SEND_HOURS } from '@/domain/cobranca';
import { generateTasks } from '@/server/services/crm-task-service';
import { sendCrmDigests } from '@/server/whatsapp/automations';

/**
 * Tarefas de CRM (Vercel Cron, uma entrada diária por hora das 6h às 14h de Brasília: ?hora=6 … ?hora=14):
 * gera/dá baixa nas tarefas do dia (idempotente) e manda o WhatsApp de quem tem envio nesta hora
 * (Cobrança e CRM → Time de CRM), se a automação "Tarefas de CRM do dia" estiver ligada. Protegido por CRON_SECRET.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Hora de Brasília agora (a Vercel roda em UTC). */
const brHour = () => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }).format(new Date()));

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'não autorizado' }, { status: 401 });
  const url = new URL(req.url);
  const today = url.searchParams.get('dia') ?? todayIso();
  const hour = Number(url.searchParams.get('hora') ?? brHour());
  if (!(SEND_HOURS as readonly number[]).includes(hour)) return NextResponse.json({ today, hour, skipped: 'fora da janela de envio (6h–14h)' });
  const tasks = await generateTasks(today);
  const sent = await sendCrmDigests(today, hour);
  return NextResponse.json({ today, tasks, sent });
}
