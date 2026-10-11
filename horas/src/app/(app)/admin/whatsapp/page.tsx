import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/card';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { whatsAppOverview } from '@/server/services/whatsapp-service';
import { WhatsAppClient } from './WhatsAppClient';

export const metadata: Metadata = { title: 'WhatsApp (Z-API)' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const principal = await requirePrincipal();
  if (!can(principal, 'whatsapp.admin')) redirect('/hoje');
  const v = await whatsAppOverview(principal);
  return (
    <>
      <PageHeader title="WhatsApp (Z-API)" description="Envio de mensagens pelo sistema: acessos, escalas, cobranças do condomínio. Cada envio fica registrado aqui e no Histórico." />
      <WhatsAppClient v={v} />
    </>
  );
}
