import { isIsoDate } from '@/domain/dates';
import { getPrincipal } from '@/server/auth/session';
import { AppError } from '@/server/errors';
import { getWeek } from '@/server/services/workout-service';
import { dayArt, weekArt } from '@/server/workouts/art';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/** GET /treinos/:id/arte → JPG da semana (paisagem) · ?dia=AAAA-MM-DD → treino do dia (retrato 4:5). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const dia = new URL(req.url).searchParams.get('dia');
    const week = await getWeek(await getPrincipal(), id);
    if (dia && !isIsoDate(dia)) throw new AppError('Dia inválido.');
    if (dia && !week.days.some((d) => d.date === dia && d.blocks.length)) throw new AppError('Esse dia não tem treino lançado.');
    if (!dia && !week.days.some((d) => d.blocks.length)) throw new AppError('Lance ao menos um dia de treino antes de gerar a arte.');
    const jpg = dia ? await dayArt(week, dia) : await weekArt(week);
    const slug = week.modality.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return new Response(new Uint8Array(jpg), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Disposition': `inline; filename="treino-${slug}-${dia ?? week.weekStart}.jpg"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    if (e instanceof AppError) return new Response(e.message, { status: e.status });
    throw e;
  }
}
