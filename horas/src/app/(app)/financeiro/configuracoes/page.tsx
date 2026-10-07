import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/card';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { getFinTargets, listCategories } from '@/server/services/fin-service';
import { SettingsClient } from './SettingsClient';

export const metadata: Metadata = { title: 'Configurações financeiras' };

export default async function Page() {
  const principal = await requirePrincipal();
  if (!can(principal, 'fin.admin')) redirect('/financeiro');
  const [targets, categories] = await Promise.all([getFinTargets(), listCategories()]);
  return (
    <>
      <PageHeader title="Configurações financeiras" description="Metas e limites dos alertas, e as categorias usadas para classificar recebimentos e pagamentos." />
      <SettingsClient targets={targets} categories={categories} />
    </>
  );
}
