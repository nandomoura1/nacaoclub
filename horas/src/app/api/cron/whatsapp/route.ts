import { NextResponse } from 'next/server';
import { todayIso } from '@/lib/today';
import { dueJobs, isJobKey } from '@/domain/wa-jobs';
import { runWaJob } from '@/server/whatsapp/jobs';

/**
 * Agendador diário (Vercel Cron, 8h de Brasília): roda os envios automáticos
 * do dia. Protegido por CRON_SECRET (a Vercel manda "Authorization: Bearer …").
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'não autorizado' }, { status: 401 });
  const today = new URL(req.url).searchParams.get('dia') ?? todayIso();
  const results: Record<string, unknown> = {};
  for (const job of dueJobs(today).filter(isJobKey)) results[job] = (await runWaJob(job, today)) ?? 'já enviado neste período ou desligado';
  return NextResponse.json({ today, results });
}
