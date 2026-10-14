import { z } from 'zod';
import { prisma } from '@/server/db';
import { audit } from '@/server/audit';
import { assertCan } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import type { RequestMeta } from '@/server/auth/session';
import { AppError, NotFoundError } from '@/server/errors';
import { isIsoDate } from '@/domain/dates';
import { AD_PLATFORMS, trafficReport } from '@/domain/marketing/traffic';
import { dt, iso } from './marketing-service';

/**
 * Tráfego Pago: gasto por plataforma/campanha (lançado à mão enquanto a API
 * da Meta/Google não está ligada) cruzado com os leads reais do funil.
 */

export interface SpendRow {
  id: string; platform: string; campaignId: string | null; campaign: string | null; adName: string | null; start: string; end: string;
  spendCents: number; impressions: number | null; clicks: number | null; platformLeads: number | null; notes: string | null; origin: string; createdBy: string | null;
}

export async function trafficPanel(principal: Principal | null, from: string, to: string) {
  assertCan(principal, 'mkt.view');
  if (!isIsoDate(from) || !isIsoDate(to) || from > to) throw new AppError('Período inválido.');
  const [spends, leads] = await Promise.all([
    prisma.mktAdSpend.findMany({ where: { periodStart: { lte: dt(to)! }, periodEnd: { gte: dt(from)! } }, orderBy: [{ periodStart: 'desc' }, { createdAt: 'desc' }] }),
    prisma.mktLead.findMany({ where: { createdAt: { gte: new Date(`${from}T03:00:00Z`), lt: new Date(Date.parse(`${to}T03:00:00Z`) + 86_400_000) } }, select: { source: true, campaignId: true, stage: true, createdAt: true } }),
  ]);
  const ids = [...new Set([...spends.map((s) => s.campaignId), ...spends.map((s) => s.createdById), ...leads.map((l) => l.campaignId)].filter(Boolean) as string[])];
  const [campaigns, users] = await Promise.all([
    prisma.mktCampaign.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
  ]);
  const name = new Map([...campaigns, ...users].map((x) => [x.id, x.name]));
  const rows: SpendRow[] = spends.map((s) => ({
    id: s.id, platform: s.platform, campaignId: s.campaignId, campaign: s.campaignId ? name.get(s.campaignId) ?? null : null, adName: s.adName,
    start: iso(s.periodStart)!, end: iso(s.periodEnd)!, spendCents: s.spendCents, impressions: s.impressions, clicks: s.clicks, platformLeads: s.platformLeads,
    notes: s.notes, origin: s.origin, createdBy: s.createdById ? name.get(s.createdById) ?? null : null,
  }));
  // Data do lead no fuso de Brasília (o filtro do painel é por dia local).
  const local = (d: Date) => new Date(d.getTime() - 3 * 3_600_000).toISOString();
  const report = trafficReport(
    rows.map((r) => ({ platform: r.platform, campaignId: r.campaignId, start: r.start, end: r.end, spendCents: r.spendCents, impressions: r.impressions, clicks: r.clicks, platformLeads: r.platformLeads })),
    leads.map((l) => ({ source: l.source, campaignId: l.campaignId, stage: l.stage, createdAt: local(l.createdAt) })),
    from, to,
  );
  return { rows, report: { ...report, byCampaign: report.byCampaign.map((c) => ({ ...c, name: name.get(c.id) ?? 'Campanha removida' })) } };
}

const spendSchema = z.object({
  platform: z.enum(AD_PLATFORMS.map((p) => p.id) as [string, ...string[]]),
  campaignId: z.string().uuid().nullable(),
  adName: z.string().trim().max(120).nullable(),
  start: z.string().refine(isIsoDate, 'Data inicial inválida.'),
  end: z.string().refine(isIsoDate, 'Data final inválida.'),
  spendCents: z.number().int().min(0, 'Valor inválido.').max(1_000_000_00, 'Valor alto demais — confira.'),
  impressions: z.number().int().min(0).nullable(),
  clicks: z.number().int().min(0).nullable(),
  platformLeads: z.number().int().min(0).nullable(),
  notes: z.string().trim().max(500).nullable(),
});

export async function saveSpend(principal: Principal | null, id: string | null, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'mkt.edit');
  const r = spendSchema.safeParse(input);
  if (!r.success) throw new AppError(r.error.issues[0]?.message ?? 'Dados inválidos.');
  const d = r.data;
  if (d.end < d.start) throw new AppError('A data final vem antes da inicial.');
  if (d.clicks !== null && d.impressions !== null && d.clicks > d.impressions) throw new AppError('Cliques não podem passar das impressões.');
  const data = {
    platform: d.platform, campaignId: d.campaignId, adName: d.adName || null, periodStart: dt(d.start)!, periodEnd: dt(d.end)!,
    spendCents: d.spendCents, impressions: d.impressions, clicks: d.clicks, platformLeads: d.platformLeads, notes: d.notes || null,
  };
  return prisma.$transaction(async (tx) => {
    const before = id ? await tx.mktAdSpend.findUnique({ where: { id } }) : null;
    if (id && !before) throw new NotFoundError('Lançamento não encontrado.');
    if (before?.origin === 'API') throw new AppError('Este gasto veio da integração e é atualizado sozinho.');
    const s = id ? await tx.mktAdSpend.update({ where: { id }, data }) : await tx.mktAdSpend.create({ data: { ...data, createdById: principal.id } });
    const label = AD_PLATFORMS.find((p) => p.id === s.platform)!.label;
    await audit(tx, { actorId: principal.id, ...meta }, { action: id ? 'mkt.spend_updated' : 'mkt.spend_created', entityType: 'mkt_ad_spend', entityId: s.id, before, after: s, summary: `${principal.name} ${id ? 'editou' : 'lançou'} gasto em ${label} (${d.start} a ${d.end})` });
    return s.id;
  });
}

export async function deleteSpend(principal: Principal | null, id: string, meta: RequestMeta) {
  assertCan(principal, 'mkt.admin');
  await prisma.$transaction(async (tx) => {
    const s = await tx.mktAdSpend.findUnique({ where: { id } });
    if (!s) throw new NotFoundError('Lançamento não encontrado.');
    await tx.mktAdSpend.delete({ where: { id } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'mkt.spend_deleted', entityType: 'mkt_ad_spend', entityId: id, before: s, summary: `${principal.name} excluiu um lançamento de gasto em anúncio` });
  });
}
