import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/card';
import { isIsoDate } from '@/domain/dates';
import { presetRange } from '@/domain/marketing/traffic';
import { todayIso } from '@/lib/today';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { prisma } from '@/server/db';
import { trafficPanel } from '@/server/services/mkt-traffic-service';
import { TrafficClient } from './TrafficClient';

export const metadata: Metadata = { title: 'Tráfego Pago' };
export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<{ periodo?: string; de?: string; ate?: string }> }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'mkt.view')) redirect('/hoje');
  const sp = await searchParams;
  const today = todayIso();
  const custom = sp.de && sp.ate && isIsoDate(sp.de) && isIsoDate(sp.ate) && sp.de <= sp.ate;
  const preset = custom ? 'custom' : sp.periodo ?? 'mes';
  const range = custom ? { from: sp.de!, to: sp.ate! } : presetRange(preset, today);
  const [panel, campaigns] = await Promise.all([
    trafficPanel(principal, range.from, range.to),
    prisma.mktCampaign.findMany({ select: { id: true, name: true }, orderBy: { startDate: 'desc' }, take: 150 }),
  ]);
  const apis = { meta: !!process.env.META_ACCESS_TOKEN?.trim(), google: !!process.env.GOOGLE_ADS_REFRESH_TOKEN?.trim() };
  return (
    <>
      <PageHeader title="Tráfego Pago" description="Quanto foi investido em anúncios e quanto custou cada lead e cada matrícula — cruzando o gasto com os leads que chegaram de verdade no funil." />
      <TrafficClient panel={panel} campaigns={campaigns} range={range} preset={preset} today={today} apis={apis}
        perms={{ edit: can(principal, 'mkt.edit'), del: can(principal, 'mkt.admin'), admin: can(principal, 'mkt.admin') }} />
    </>
  );
}
