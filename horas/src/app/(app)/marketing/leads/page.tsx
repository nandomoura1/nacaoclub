import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/card';
import { DataSources } from '../_components/DataSources';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { prisma } from '@/server/db';
import { listLeads } from '@/server/services/mkt-leads-service';
import { marketingPeople } from '@/server/services/marketing-service';
import { LeadsClient } from './LeadsClient';

export const metadata: Metadata = { title: 'Leads & Conversão' };
export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<{ dias?: string; etapa?: string; origem?: string; q?: string; modo?: string; novo?: string }> }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'mkt.view')) redirect('/hoje');
  const sp = await searchParams;
  const days = [30, 90, 365].includes(Number(sp.dias)) ? Number(sp.dias) : 90;
  const [data, people, campaigns] = await Promise.all([
    listLeads(principal, { days, stage: sp.etapa, source: sp.origem, q: sp.q }),
    marketingPeople(),
    prisma.mktCampaign.findMany({ where: { status: { notIn: ['FINALIZADA', 'ANALISE'] } }, select: { id: true, name: true }, orderBy: { startDate: 'desc' }, take: 100 }),
  ]);
  return (
    <>
      <PageHeader title="Leads & Conversão" description="Quem se interessou pela Nação e em que ponto está: do primeiro contato à matrícula. Formulários do site e dos anúncios entram sozinhos (Marketing → Conexões)." />
      <DataSources principal={principal} keys={['wix-leads','meta-leads','links']} />
      <LeadsClient data={data} people={people} campaigns={campaigns} filter={{ days, stage: sp.etapa ?? '', source: sp.origem ?? '', q: sp.q ?? '', board: sp.modo !== 'lista' }}
        openNew={sp.novo === '1'} perms={{ edit: can(principal, 'mkt.edit'), del: can(principal, 'mkt.admin') }} />
    </>
  );
}
