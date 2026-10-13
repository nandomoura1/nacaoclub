import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { todayIso } from '@/lib/today';
import { webhookToken } from '@/server/whatsapp/inbound';
import { PageHeader } from '@/components/ui/card';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { whatsAppOverview } from '@/server/services/whatsapp-service';
import { listWaJobs, replyOverview } from '@/server/whatsapp/jobs';
import { WhatsAppClient } from './WhatsAppClient';

export const metadata: Metadata = { title: 'WhatsApp (Z-API)' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const principal = await requirePrincipal();
  if (!can(principal, 'whatsapp.admin')) redirect('/hoje');
  const [v, jobs, replies, h] = await Promise.all([whatsAppOverview(principal), listWaJobs(), replyOverview(todayIso()), headers()]);
  const cronReady = !!process.env.CRON_SECRET;
  // Endereço para colar no painel da Z-API (só administradores veem).
  const token = webhookToken();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const webhookUrl = token && host ? `${h.get('x-forwarded-proto') ?? 'https'}://${host}/api/webhooks/zapi?token=${token}` : null;
  return (
    <>
      <PageHeader title="WhatsApp (Z-API)" description="Envio de mensagens pelo sistema: acessos, escalas, cobranças do condomínio. Cada envio fica registrado aqui e no Histórico." />
      <WhatsAppClient v={v} jobs={jobs} cronReady={cronReady} replies={replies} webhookUrl={webhookUrl} />
    </>
  );
}
