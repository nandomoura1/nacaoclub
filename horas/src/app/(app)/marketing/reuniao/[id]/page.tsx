import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { NotFoundError } from '@/server/errors';
import { getMeeting } from '@/server/services/mkt-ai-service';
import { MeetingClient } from './MeetingClient';

export const metadata: Metadata = { title: 'Reunião semanal' };
// "Gerar ata" chama a IA.
export const maxDuration = 300;

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'mkt.view')) redirect('/hoje');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const m = await getMeeting(principal, id).catch((e) => { if (e instanceof NotFoundError) return null; throw e; });
  if (!m) notFound();
  return (
    <>
      <Link href="/marketing/reuniao" className="mb-3 inline-flex items-center gap-1 text-sm text-tinta-suave hover:text-nacao"><ArrowLeft className="size-4" /> Reuniões</Link>
      <MeetingClient m={m} perms={{ edit: can(principal, 'mkt.edit'), ai: can(principal, 'mkt.ai') }} />
    </>
  );
}
