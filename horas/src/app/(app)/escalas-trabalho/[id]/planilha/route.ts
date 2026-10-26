import { getPrincipal } from '@/server/auth/session';
import { scheduleXlsx } from '@/server/escalas/xlsx';
import { AppError } from '@/server/errors';
import { scheduleById } from '@/server/services/ws-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET /escalas-trabalho/:id/planilha → .xlsx da escala mensal. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new AppError('Escala inválida.');
    const v = await scheduleById(await getPrincipal(), id);
    const buf = await scheduleXlsx(v);
    const name = `escala-${v.sector.name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-')}-${v.month.year}-${String(v.month.month).padStart(2, '0')}.xlsx`;
    return new Response(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${name}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    const msg = e instanceof AppError ? e.message : 'Não foi possível gerar a planilha.';
    return new Response(msg, { status: e instanceof AppError ? e.status : 500 });
  }
}
