import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { prisma } from '@/server/db';
import { todayIso } from '@/lib/today';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { NotFoundError } from '@/server/errors';
import { briefingData } from '@/server/services/mkt-briefing-service';
import { zapiConfig } from '@/server/whatsapp/zapi';
import { BriefingClient } from './BriefingClient';

export const metadata: Metadata = { title: 'Briefing da campanha' };
export const dynamic = 'force-dynamic';
// Enviar manda um WhatsApp por pessoa.
export const maxDuration = 300;

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'mkt.view')) redirect('/hoje');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await briefingData(principal, id).catch((e) => { if (e instanceof NotFoundError) return null; throw e; });
  if (!d) notFound();
  const roles = await prisma.role.findMany({ select: { key: true, name: true }, orderBy: { name: 'asc' } });
  const cfg = zapiConfig();
  return (
    <>
      <Link href={`/marketing/campanhas/${id}`} className="mb-3 inline-flex items-center gap-1 text-sm text-tinta-suave hover:text-nacao"><ArrowLeft className="size-4" /> {d.input.name}</Link>
      <h1 className="text-2xl font-extrabold text-navy">Briefing da campanha</h1>
      <p className="mb-4 text-sm text-tinta-suave">Resumo, o que o Comercial precisa saber e quem faz o quê — pronto para mandar no WhatsApp do time de Marketing e do Comercial.</p>
      <BriefingClient input={d.input} team={d.team} link={d.link} roles={roles} today={todayIso()}
        whatsapp={{ configured: cfg.configured, testMode: !!cfg.testPhone }} canSend={can(principal, 'mkt.edit')} />
    </>
  );
}
