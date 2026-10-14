import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card, PageHeader } from '@/components/ui/card';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { prisma } from '@/server/db';
import { storageConfig } from '@/server/storage';
import { assetCounts, listAssets } from '@/server/services/mkt-asset-service';
import { LibraryClient } from './LibraryClient';

export const metadata: Metadata = { title: 'Biblioteca' };
export const dynamic = 'force-dynamic';

type SP = Promise<{ status?: string; tipo?: string; campanha?: string; q?: string }>;

export default async function Page({ searchParams }: { searchParams: SP }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'mkt.view')) redirect('/hoje');
  const sp = await searchParams;
  const configured = storageConfig().configured;
  const [assets, counts, campaigns] = await Promise.all([
    listAssets(principal, { status: sp.status, kind: sp.tipo, campaignId: sp.campanha, q: sp.q }),
    assetCounts(),
    prisma.mktCampaign.findMany({ select: { id: true, name: true }, orderBy: { startDate: 'desc' }, take: 150 }),
  ]);
  return (
    <>
      <PageHeader title="Biblioteca" description="Artes, vídeos, fotos e logos da Nação num lugar só, ligados à campanha, com aprovação antes de publicar." />
      {!configured && (
        <Card className="mb-4 border-atencao/40 p-4 text-sm">
          <p className="font-semibold text-navy">Falta ligar o armazenamento de arquivos.</p>
          <p className="mt-1 text-tinta-suave">A pasta privada já foi criada no Supabase. Falta colocar 2 variáveis na Vercel. {can(principal, 'mkt.admin') && <Link href="/marketing/integracoes" className="font-semibold text-nacao">Ver passo a passo →</Link>}</p>
        </Card>
      )}
      <LibraryClient
        assets={assets} counts={counts} campaigns={campaigns} configured={configured}
        filters={{ status: sp.status ?? '', kind: sp.tipo ?? '', campaignId: sp.campanha ?? '', q: sp.q ?? '' }}
        perms={{ edit: can(principal, 'mkt.edit'), approve: can(principal, 'mkt.approve'), del: can(principal, 'mkt.admin') }}
      />
    </>
  );
}
