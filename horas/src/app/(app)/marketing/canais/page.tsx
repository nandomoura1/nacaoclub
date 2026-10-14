import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { PageHeader } from '@/components/ui/card';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { prisma } from '@/server/db';
import { clicksByDay, listLinks } from '@/server/services/mkt-leads-service';
import { LinksClient } from './LinksClient';

export const metadata: Metadata = { title: 'Canais & Links' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const principal = await requirePrincipal();
  if (!can(principal, 'mkt.view')) redirect('/hoje');
  const [links, days, campaigns, h] = await Promise.all([
    listLinks(principal), clicksByDay(30),
    prisma.mktCampaign.findMany({ where: { status: { notIn: ['FINALIZADA', 'ANALISE'] } }, select: { id: true, name: true }, orderBy: { startDate: 'desc' }, take: 100 }),
    headers(),
  ]);
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? '';
  const base = `${h.get('x-forwarded-proto') ?? 'https'}://${host}`;
  return (
    <>
      <PageHeader title="Canais & Links" description="Links curtos rastreáveis para bio do Instagram, WhatsApp, anúncios e QR Code: cada clique é contado e os leads que chegam por eles ficam ligados à campanha." />
      <LinksClient links={links} days={days} campaigns={campaigns} base={base} perms={{ edit: can(principal, 'mkt.edit'), del: can(principal, 'mkt.admin') }} />
    </>
  );
}
