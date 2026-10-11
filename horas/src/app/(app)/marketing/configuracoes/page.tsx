import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/card';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { mktOptions } from '@/server/services/marketing-service';
import { AreasClient } from './AreasClient';

export const metadata: Metadata = { title: 'Configurações do Marketing' };

export default async function Page() {
  const principal = await requirePrincipal();
  if (!can(principal, 'mkt.admin')) redirect('/marketing');
  const options = await mktOptions();
  return (
    <>
      <PageHeader title="Configurações do Marketing" description="Responsável padrão de cada área: toda tarefa nova da área já nasce com ele." />
      <AreasClient areas={options.areas} people={options.people} />
    </>
  );
}
