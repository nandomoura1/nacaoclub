import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { isIsoDate } from '@/domain/dates';
import { getPrincipal } from '@/server/auth/session';
import { NotFoundError } from '@/server/errors';
import { tvByWeek } from '@/server/services/tv-service';
import { TvBoard } from '../../TvBoard';

export const metadata: Metadata = { title: 'Treino na TV' };
export const dynamic = 'force-dynamic';

/** Um dia da semana em tela cheia (com login: notebook ou Chromecast na TV). */
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ dia?: string }> }) {
  const { id } = await params;
  const { dia } = await searchParams;
  const principal = await getPrincipal();
  if (!principal) redirect(`/login?next=${encodeURIComponent(`/tv/semana/${id}${dia ? `?dia=${dia}` : ''}`)}`);
  if (!/^[0-9a-f-]{36}$/i.test(id) || !dia || !isIsoDate(dia)) notFound();
  const v = await tvByWeek(principal, id, dia).catch((e) => { if (e instanceof NotFoundError) return null; throw e; });
  if (!v) notFound();
  return <TvBoard v={v} refreshSeconds={300} />;
}
