import type { Metadata } from 'next';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/card';
import { todayIso } from '@/lib/today';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { prisma } from '@/server/db';
import { getCondoSettings, listCenters, listIptuYears } from '@/server/services/condo-service';
import { CadastrosClient } from './CadastrosClient';

export const metadata: Metadata = { title: 'Cadastros do condomínio' };

export default async function Page() {
  const principal = await requirePrincipal();
  if (!can(principal, 'condo.edit')) redirect('/condominio');
  const [centers, iptu, settings, periods] = await Promise.all([listCenters(principal), listIptuYears(principal), getCondoSettings(), prisma.condoPeriod.count()]);
  return (
    <>
      <PageHeader title="Cadastros do condomínio" description="Parceiros e operações, relógios de energia, itens fixos, IPTU e dados de recebimento." />
      <Suspense>
        <CadastrosClient centers={centers} iptu={iptu} settings={settings} today={todayIso()} empty={!centers.length && !periods} />
      </Suspense>
    </>
  );
}
