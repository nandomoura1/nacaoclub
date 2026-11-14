import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/card';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { contactsPage } from '@/server/services/contacts-service';
import { ContactsClient } from './ContactsClient';

export const metadata: Metadata = { title: 'Contatos' };

export default async function Page({ searchParams }: { searchParams: Promise<{ inativos?: string }> }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'contacts.view')) redirect('/hoje');
  const sp = await searchParams;
  const data = await contactsPage(principal, { inactive: sp.inativos === '1' });
  return (
    <>
      <PageHeader
        title="Contatos"
        description="Telefones importantes da Nação num lugar só: a equipe (direto do cadastro de colaboradores — o telefone se corrige na ficha) e a agenda de quem é de fora (terceirizados, fornecedores, monitoras, serviços)."
      />
      <ContactsClient data={data} showInactive={sp.inativos === '1'} />
    </>
  );
}
