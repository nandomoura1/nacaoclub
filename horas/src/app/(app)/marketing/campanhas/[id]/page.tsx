import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, Library, Megaphone } from 'lucide-react';
import { prisma } from '@/server/db';
import { todayIso } from '@/lib/today';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { NotFoundError } from '@/server/errors';
import { getCampaign, mktOptions } from '@/server/services/marketing-service';
import { CampaignClient } from './CampaignClient';
import { CampaignForm } from '../CampaignForm';

export const metadata: Metadata = { title: 'Campanha' };
// Sugerir tarefas chama a IA.
export const maxDuration = 300;

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ evento?: string; data?: string; tipo?: string }> }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'mkt.view')) redirect('/hoje');
  const { id } = await params;
  const options = await mktOptions();
  const back = <Link href="/marketing/campanhas" className="mb-3 inline-flex items-center gap-1 text-sm text-tinta-suave hover:text-nacao"><ArrowLeft className="size-4" /> Campanhas</Link>;
  if (id === 'nova') {
    if (!can(principal, 'mkt.edit')) redirect('/marketing/campanhas');
    const sp = await searchParams;
    const ev = sp.evento && options.events.find((e) => e.id === sp.evento);
    return (
      <>
        {back}
        <h1 className="mb-4 text-2xl font-extrabold text-navy">Nova campanha</h1>
        <CampaignForm id={null} initial={null} options={options} canEdit
          defaults={{ ownerId: principal.id, ...(ev ? { eventId: ev.id, name: ev.name, type: 'EVENTO' } : {}), ...(sp.data && /^\d{4}-\d{2}-\d{2}$/.test(sp.data) ? { startDate: sp.data } : {}) }} />
      </>
    );
  }
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const today = todayIso();
  const v = await getCampaign(principal, id, today).catch((e) => { if (e instanceof NotFoundError) return null; throw e; });
  if (!v) notFound();
  const assets = await prisma.mktAsset.groupBy({ by: ['status'], where: { campaignId: id, status: { not: 'ARQUIVADO' } }, _count: { _all: true } });
  const nAssets = assets.reduce((s, a) => s + a._count._all, 0);
  const nApproved = assets.find((a) => a.status === 'APROVADO')?._count._all ?? 0;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {back}
        <span className="mb-3 flex flex-wrap gap-4">
        {can(principal, 'mkt.edit') && (
          <Link href={`/marketing/interna?campanha=${id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-nacao hover:underline">
            <Megaphone className="size-4" /> Comunicar a equipe →
          </Link>
        )}
        <Link href={`/marketing/biblioteca?campanha=${id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-nacao hover:underline">
          <Library className="size-4" /> Criativos: {nAssets === 0 ? 'nenhum ainda' : `${nAssets} (${nApproved} aprovado${nApproved === 1 ? '' : 's'})`} →
        </Link>
        </span>
      </div>
      <CampaignClient v={v} options={options} today={today} perms={{ edit: can(principal, 'mkt.edit'), approve: can(principal, 'mkt.approve'), ai: can(principal, 'mkt.ai') }} />
    </>
  );
}
