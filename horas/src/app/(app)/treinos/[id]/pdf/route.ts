import { isIsoDate } from '@/domain/dates';
import { getPrincipal } from '@/server/auth/session';
import { AppError } from '@/server/errors';
import { getWeek } from '@/server/services/workout-service';
import { workoutPdf } from '@/server/workouts/pdf';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET /treinos/:id/pdf?tipo=professor|aluno[&dia=AAAA-MM-DD] → plano de aula ou resumo dos alunos. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const q = new URL(req.url).searchParams;
    const tipo = q.get('tipo') === 'aluno' ? 'aluno' : 'professor';
    const dia = q.get('dia');
    if (dia && !isIsoDate(dia)) throw new AppError('Dia inválido.');
    const week = await getWeek(await getPrincipal(), id);
    if (!week.days.some((d) => d.blocks.length && (!dia || d.date === dia))) throw new AppError(dia ? 'Esse dia não tem treino lançado.' : 'Lance ao menos um dia de treino antes de gerar o PDF.');
    const pdf = await workoutPdf(week, tipo, dia ?? undefined);
    const slug = week.modality.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return new Response(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${tipo === 'professor' ? 'plano-de-aula' : 'treino'}-${slug}-${dia ?? week.weekStart}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    if (e instanceof AppError) return new Response(e.message, { status: e.status });
    throw e;
  }
}
