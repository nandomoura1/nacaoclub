import { prisma } from '@/server/db';
import { assertCan } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import { AppError } from '@/server/errors';
import { isIsoDate } from '@/domain/dates';
import { lastMonths, performanceReport, previousRange } from '@/domain/marketing/performance';
import { dt, iso } from './marketing-service';

/** Dia local (Brasília, UTC-3) de um instante. */
const localDay = (d: Date) => new Date(d.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);

/** Painel de Performance: cobre o período, o anterior e os últimos 6 meses numa leitura só. */
export async function performancePanel(principal: Principal | null, from: string, to: string) {
  assertCan(principal, 'mkt.view');
  if (!isIsoDate(from) || !isIsoDate(to) || from > to) throw new AppError('Período inválido.');
  const start = [previousRange(from, to).from, lastMonths(to, 6)[0]!.from].sort()[0]!;
  const [leads, clicks, links, spends] = await Promise.all([
    prisma.mktLead.findMany({ where: { createdAt: { gte: new Date(`${start}T03:00:00Z`), lt: new Date(Date.parse(`${to}T03:00:00Z`) + 86_400_000) } }, select: { createdAt: true, source: true, stage: true, campaignId: true, linkId: true } }),
    prisma.mktLinkClickDay.findMany({ where: { day: { gte: dt(start)!, lte: dt(to)! } } }),
    prisma.mktLink.findMany({ select: { id: true, title: true, slug: true, campaignId: true } }),
    prisma.mktAdSpend.findMany({ where: { periodStart: { lte: dt(to)! }, periodEnd: { gte: dt(start)! } } }),
  ]);
  const campaignIds = [...new Set([...leads.map((l) => l.campaignId), ...links.map((l) => l.campaignId), ...spends.map((s) => s.campaignId)].filter(Boolean) as string[])];
  const campaigns = await prisma.mktCampaign.findMany({ where: { id: { in: campaignIds } }, select: { id: true, name: true } });
  return performanceReport({
    from, to, links, campaigns,
    leads: leads.map((l) => ({ day: localDay(l.createdAt), source: l.source, stage: l.stage, campaignId: l.campaignId, linkId: l.linkId })),
    clicks: clicks.map((c) => ({ linkId: c.linkId, day: iso(c.day)!, clicks: c.clicks })),
    spends: spends.map((s) => ({ platform: s.platform, campaignId: s.campaignId, start: iso(s.periodStart)!, end: iso(s.periodEnd)!, spendCents: s.spendCents, impressions: s.impressions, clicks: s.clicks, platformLeads: s.platformLeads })),
  });
}
