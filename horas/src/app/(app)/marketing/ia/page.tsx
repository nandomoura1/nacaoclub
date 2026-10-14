import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/card';
import { addDays } from '@/domain/dates';
import { todayIso } from '@/lib/today';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { prisma } from '@/server/db';
import { listStudio } from '@/server/services/mkt-studio-service';
import { StudioClient } from './StudioClient';

export const metadata: Metadata = { title: 'IA Marketing' };
export const dynamic = 'force-dynamic';
// Gerar chama a IA.
export const maxDuration = 300;

export default async function Page({ searchParams }: { searchParams: Promise<{ aba?: string; campanha?: string }> }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'mkt.view')) redirect('/hoje');
  const sp = await searchParams;
  const today = todayIso();
  const [items, campaigns] = await Promise.all([
    listStudio(principal),
    prisma.mktCampaign.findMany({ where: { status: { notIn: ['FINALIZADA', 'ANALISE'] } }, select: { id: true, name: true }, orderBy: { startDate: 'asc' }, take: 150 }),
  ]);
  return (
    <>
      <PageHeader title="IA Marketing" description="Rascunhos da IA no tom da Nação: legendas e roteiros, pauta da semana e leitura da Performance. Nada sai do sistema nem vira tarefa sem alguém aprovar." />
      <StudioClient items={items} campaigns={campaigns} today={today} weekEnd={addDays(today, 6)} monthStart={`${today.slice(0, 8)}01`}
        tab={sp.aba === 'pauta' || sp.aba === 'analise' ? sp.aba : 'textos'} campaignId={sp.campanha ?? ''}
        perms={{ ai: can(principal, 'mkt.ai'), edit: can(principal, 'mkt.edit') }} configured={!!process.env.ANTHROPIC_API_KEY || process.env.AI_FAKE === '1'} />
    </>
  );
}
