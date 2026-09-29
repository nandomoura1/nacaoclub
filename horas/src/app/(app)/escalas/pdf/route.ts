import { isIsoDate } from '@/domain/dates';
import { dutyTitle } from '@/domain/duty';
import { getPrincipal } from '@/server/auth/session';
import { dutyPdf } from '@/server/duty/pdf';
import { AppError } from '@/server/errors';
import { loadDuty } from '@/server/services/duty-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET /escalas/pdf?de=AAAA-MM-DD&ate=AAAA-MM-DD[&setor=uuid] → PDF A4 da escala. */
export async function GET(req: Request) {
  try {
    const q = new URL(req.url).searchParams;
    const de = q.get('de') ?? ''; const ate = q.get('ate') ?? '';
    const setor = q.get('setor');
    if (!isIsoDate(de) || !isIsoDate(ate)) throw new AppError('Período inválido.');
    if (setor && !/^[0-9a-f-]{36}$/i.test(setor)) throw new AppError('Setor inválido.');
    const duty = await loadDuty(await getPrincipal(), de, ate, setor);
    const title = dutyTitle(de, ate, duty.holidays) + (setor && duty.sectors[0] ? ` · ${duty.sectors[0].name}` : '');
    const generatedAt = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date());
    const pdf = await dutyPdf({ title, generatedAt, holidays: duty.holidays, sectors: duty.sectors });
    return new Response(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="escala-${de}${de === ate ? '' : `-a-${ate}`}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    if (e instanceof AppError) return new Response(e.message, { status: e.status });
    throw e;
  }
}
