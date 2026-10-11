import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/card';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { mktOptions } from '@/server/services/marketing-service';
import { TrelloImport } from './TrelloImport';

export const metadata: Metadata = { title: 'Importar do Trello' };
export const maxDuration = 60;

export default async function Page() {
  const principal = await requirePrincipal();
  if (!can(principal, 'mkt.admin')) redirect('/marketing/kanban');
  const options = await mktOptions();
  return (
    <>
      <PageHeader title="Importar quadro do Trello" description="Traga os cards do Trello para o Kanban de Marketing. Você confere tudo antes de gravar; importar de novo o mesmo quadro não duplica nada." />
      <TrelloImport people={options.people} campaigns={options.campaigns} />
    </>
  );
}
