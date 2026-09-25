import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/card';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { todayIso } from '@/lib/today';
import { ImportClient } from './ImportClient';

export const metadata: Metadata = { title: 'Importar planilha' };

export default async function ImportarPage() {
  const principal = await requirePrincipal();
  if (!can(principal, 'import.run')) redirect('/grade');
  return (
    <>
      <PageHeader
        title="Importar a planilha atual"
        description="Lê as abas de grade (CrossFit, Nação Fit, Quadras, Contraturno), mostra tudo antes de gravar e só grava o que você confirmar."
      />
      <ImportClient today={todayIso()} />
    </>
  );
}
