import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/card';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { prisma } from '@/server/db';
import { zapiConfig } from '@/server/whatsapp/zapi';
import { listAutomations } from '@/server/whatsapp/automations';
import { AutomationsClient } from './AutomationsClient';

export const metadata: Metadata = { title: 'Automações de WhatsApp' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const principal = await requirePrincipal();
  if (!can(principal, 'whatsapp.admin')) redirect('/hoje');
  const [automations, modalities, roles] = await Promise.all([
    listAutomations(),
    prisma.modality.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.role.findMany({ select: { key: true, name: true }, orderBy: { name: 'asc' } }),
  ]);
  const cfg = zapiConfig();
  return (
    <>
      <PageHeader title="Automações de WhatsApp" description="Mensagens que o sistema manda sozinho: escolha quando, para quem e o texto. Rodam às 8h, no dia de cada uma; cada período é enviado uma vez só." />
      <p className="-mt-2 mb-4 text-sm"><Link href="/admin/whatsapp" className="font-semibold text-nacao">← WhatsApp (conexão, respostas e registro de envios)</Link></p>
      <AutomationsClient automations={automations} modalities={modalities} roles={roles} configured={cfg.configured} testMode={!!cfg.testPhone} cronReady={!!process.env.CRON_SECRET} />
    </>
  );
}
