import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { MEETING_KINDS } from '@/domain/proc-meeting';
import { todayIso } from '@/lib/today';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { NotFoundError } from '@/server/errors';
import { procPeople } from '@/server/services/proc-service';
import { procMeetingView } from '@/server/services/proc-meeting-service';
import { MeetingClient } from './MeetingClient';

export const metadata: Metadata = { title: 'Reunião de líderes' };
export const dynamic = 'force-dynamic';
// Encerrar pode enviar um WhatsApp por líder.
export const maxDuration = 120;

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'proc.view')) redirect('/hoje');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const today = todayIso();
  const view = await procMeetingView(principal, id, today).catch((e) => { if (e instanceof NotFoundError) return null; throw e; });
  if (!view) notFound();
  const people = (await procPeople()).filter((p) => p.canProc).map((p) => ({ id: p.id, name: p.name }));
  const kind = MEETING_KINDS.find((k) => k.id === view.meeting.kind)!;
  return (
    <>
      <Link href="/processos/reuniao" className="mb-3 inline-flex items-center gap-1 text-sm text-tinta-suave hover:text-nacao"><ArrowLeft className="size-4" /> Reuniões</Link>
      <h1 className="text-2xl font-extrabold text-navy">{kind.label} · {view.meeting.date.split('-').reverse().join('/')}</h1>
      <p className="mb-4 text-sm text-tinta-suave">Semana {view.meeting.week.split('-W')[1]} · {view.meeting.status === 'ABERTA' ? `em andamento · ≈ ${kind.minutes} min` : 'encerrada'}</p>
      <MeetingClient view={view} people={people} today={today} />
    </>
  );
}
