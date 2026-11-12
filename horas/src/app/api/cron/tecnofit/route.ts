import { after, NextResponse } from 'next/server';
import { todayIso } from '@/lib/today';
import { runTecnofitSync } from '@/server/services/crm-sync-service';
import { tecnofitConfig } from '@/server/tecnofit/client';
import { selfBaseUrl } from '@/lib/app-url';

/**
 * Sincronização diária com a Tecnofit (Vercel Cron às 05h17 e de 10 em 10 min até 07h07 de Brasília):
 * débitos e casos de cobrança. Protegido por CRON_SECRET. Cada chamada continua a rodada do dia de onde
 * parou (concluída = não faz nada) e, se não couber no tempo, dispara a continuação (?parte=N).
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MAX_PARTS = 20;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'não autorizado' }, { status: 401 });
  // Sem as chaves na Vercel ainda: não há o que sincronizar (não é erro).
  if (!tecnofitConfig().configured) return NextResponse.json({ skipped: 'Tecnofit não configurada (TECNOFIT_API_KEY/SECRET).' });
  const url = new URL(req.url);
  const today = url.searchParams.get('dia') ?? todayIso();
  const part = Number(url.searchParams.get('parte') ?? '1') || 1;
  const r = await runTecnofitSync(today, { budgetMs: 240_000 });
  if (r.status === 'RODANDO' && part < MAX_PARTS) {
    const next = new URL(`${selfBaseUrl(url.origin)}/api/cron/tecnofit`);
    next.searchParams.set('dia', today);
    next.searchParams.set('parte', String(part + 1));
    // Só garante que a próxima parte começou; ela segue sozinha no servidor.
    after(() => fetch(next, { headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(10_000) }).then(() => undefined, () => undefined));
  }
  return NextResponse.json({ today, part, ...r, stats: { ...r.stats, errors: r.stats.errors?.length ?? 0 } });
}
