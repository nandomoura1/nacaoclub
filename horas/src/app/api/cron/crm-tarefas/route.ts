import { NextResponse } from 'next/server';
import { todayIso } from '@/lib/today';
import { generateTasks } from '@/server/services/crm-task-service';
import { runDueAutomations } from '@/server/whatsapp/automations';

/**
 * Tarefas de CRM do dia (Vercel Cron, 07h27 de Brasília — depois da sincronização das 05h17):
 * gera/dá baixa nas tarefas e envia a automação "Tarefas de CRM do dia" (se estiver ligada).
 * Protegido por CRON_SECRET. O agendador das 8h é a reserva (cada dia sai uma vez só).
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'não autorizado' }, { status: 401 });
  const today = new URL(req.url).searchParams.get('dia') ?? todayIso();
  const tasks = await generateTasks(today);
  const sent = await runDueAutomations(today, { audience: 'CRM_TAREFAS' });
  return NextResponse.json({ today, tasks, sent });
}
