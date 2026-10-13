import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/card';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { whatsAppOverview } from '@/server/services/whatsapp-service';
import { listWaJobs } from '@/server/whatsapp/jobs';
import { WhatsAppClient } from './WhatsAppClient';

export const metadata: Metadata = { title: 'WhatsApp (Z-API)' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const principal = await requirePrincipal();
  if (!can(principal, 'whatsapp.admin')) redirect('/hoje');
  const [v, jobs] = await Promise.all([whatsAppOverview(principal), listWaJobs()]);
  const cronReady = !!process.env.CRON_SECRET;
  return (
    <>
      <PageHeader title="WhatsApp (Z-API)" description="Envio de mensagens pelo sistema: acessos, escalas, cobranças do condomínio. Cada envio fica registrado aqui e no Histórico." />
      <WhatsAppClient v={v} jobs={jobs} cronReady={cronReady} />
    </>
  );
}
