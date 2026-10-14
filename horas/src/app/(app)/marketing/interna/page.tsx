import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/card';
import { campaignNotice } from '@/domain/marketing/notices';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { prisma } from '@/server/db';
import { listNotices } from '@/server/services/mkt-notice-service';
import { zapiConfig } from '@/server/whatsapp/zapi';
import { iso } from '@/server/services/marketing-service';
import { NoticesClient } from './NoticesClient';

export const metadata: Metadata = { title: 'Comunicação Interna' };
export const dynamic = 'force-dynamic';
// Publicar envia um WhatsApp por pessoa.
export const maxDuration = 300;

export default async function Page({ searchParams }: { searchParams: Promise<{ campanha?: string }> }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'mkt.view')) redirect('/hoje');
  const sp = await searchParams;
  const [notices, modalities, roles, campaigns, fromCampaign] = await Promise.all([
    listNotices(principal),
    prisma.modality.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.role.findMany({ select: { key: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.mktCampaign.findMany({ select: { id: true, name: true }, orderBy: { startDate: 'desc' }, take: 150 }),
    sp.campanha && /^[0-9a-f-]{36}$/i.test(sp.campanha) ? prisma.mktCampaign.findUnique({ where: { id: sp.campanha } }) : null,
  ]);
  const draft = fromCampaign && can(principal, 'mkt.edit') ? {
    ...campaignNotice({ name: fromCampaign.name, objective: fromCampaign.objective, audience: fromCampaign.audience, offer: fromCampaign.offer, message: fromCampaign.message, cta: fromCampaign.cta, startDate: iso(fromCampaign.startDate)!, endDate: iso(fromCampaign.endDate) }),
    campaignId: fromCampaign.id,
  } : null;
  const cfg = zapiConfig();
  return (
    <>
      <PageHeader title="Comunicação Interna" description="Comunicados para a equipe: chegam no WhatsApp de cada um (com “OK” de leitura, se quiser) e ficam no mural do app, na tela Hoje." />
      <NoticesClient notices={notices} modalities={modalities} roles={roles} campaigns={campaigns} draft={draft}
        whatsapp={{ configured: cfg.configured, testMode: !!cfg.testPhone }}
        perms={{ edit: can(principal, 'mkt.edit'), del: can(principal, 'mkt.admin') }} />
    </>
  );
}
