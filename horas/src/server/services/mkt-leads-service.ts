import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/server/db';
import { audit } from '@/server/audit';
import { assertCan } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import type { RequestMeta } from '@/server/auth/session';
import { AppError, NotFoundError } from '@/server/errors';
import { isIsoDate } from '@/domain/dates';
import { funnel, LEAD_SOURCES, LEAD_STAGES, LINK_CHANNELS, parseLeadPayload, slugify, sourceFromUtm, withUtm } from '@/domain/marketing/leads';
import { phoneKey } from '@/domain/whatsapp';
import { dt, iso } from './marketing-service';

/**
 * Leads & Conversão e Canais & Links. Leads chegam pelo webhook (formulário do
 * site/Wix, landing pages), por cadastro manual ou por link de campanha; o
 * funil vai de Novo a Matriculado/Perdido. Links /l/<slug> contam cliques.
 */

// ── Leads ─────────────────────────────────────────────────

export interface LeadRow {
  id: string; name: string; phone: string | null; email: string | null; interest: string | null; source: string; stage: string;
  owner: string | null; ownerId: string | null; campaign: string | null; campaignId: string | null; utm: string | null; notes: string | null; lostReason: string | null;
  nextActionAt: string | null; createdAt: string; convertedAt: string | null;
}

export async function listLeads(principal: Principal | null, f: { days?: number; stage?: string; source?: string; q?: string } = {}) {
  assertCan(principal, 'mkt.view');
  const since = new Date(Date.now() - (f.days ?? 90) * 86_400_000);
  const q = f.q?.trim();
  const rows = await prisma.mktLead.findMany({
    where: {
      createdAt: { gte: since },
      ...(f.stage ? { stage: f.stage } : {}),
      ...(f.source ? { source: f.source } : {}),
      ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }, { phone: { contains: q.replace(/\D/g, '') || q } }, { interest: { contains: q, mode: 'insensitive' } }] } : {}),
    },
    orderBy: { createdAt: 'desc' }, take: 1000,
  });
  const ids = [...new Set(rows.flatMap((r) => [r.ownerId, r.campaignId]).filter((x): x is string => !!x))];
  const [users, campaigns] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
    prisma.mktCampaign.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
  ]);
  const uName = new Map(users.map((u) => [u.id, u.name]));
  const cName = new Map(campaigns.map((c) => [c.id, c.name]));
  const leads: LeadRow[] = rows.map((r) => ({
    id: r.id, name: r.name, phone: r.phone, email: r.email, interest: r.interest, source: r.source, stage: r.stage,
    owner: r.ownerId ? uName.get(r.ownerId) ?? null : null, ownerId: r.ownerId, campaign: r.campaignId ? cName.get(r.campaignId) ?? null : null, campaignId: r.campaignId,
    utm: [r.utmSource, r.utmMedium, r.utmCampaign].filter(Boolean).join(' / ') || null, notes: r.notes, lostReason: r.lostReason,
    nextActionAt: iso(r.nextActionAt), createdAt: r.createdAt.toISOString(), convertedAt: r.convertedAt?.toISOString() ?? null,
  }));
  return { leads, funnel: funnel(leads.map((l) => ({ stage: l.stage, source: l.source, createdAt: l.createdAt, convertedAt: l.convertedAt }))) };
}

const leadSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome.').max(120),
  phone: z.string().trim().max(30).nullable(),
  email: z.string().trim().max(120).nullable().refine((v) => !v || /@/.test(v), 'E-mail inválido.'),
  interest: z.string().trim().max(120).nullable(),
  source: z.enum(LEAD_SOURCES.map((s) => s.id) as [string, ...string[]]),
  stage: z.enum(LEAD_STAGES.map((s) => s.id) as [string, ...string[]]),
  ownerId: z.string().uuid().nullable(),
  campaignId: z.string().uuid().nullable(),
  notes: z.string().trim().max(2000).nullable(),
  nextActionAt: z.string().refine(isIsoDate, 'Data inválida.').nullable(),
});

export async function saveLead(principal: Principal | null, id: string | null, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'mkt.edit');
  const r = leadSchema.safeParse(input);
  if (!r.success) throw new AppError(r.error.issues[0]?.message ?? 'Dados inválidos.');
  const d = r.data;
  if (d.phone && d.phone.replace(/\D/g, '').length < 10) throw new AppError('Telefone: informe DDD + número.');
  const data = { ...d, phone: d.phone || null, email: d.email?.toLowerCase() || null, interest: d.interest || null, notes: d.notes || null, nextActionAt: dt(d.nextActionAt) };
  return prisma.$transaction(async (tx) => {
    const before = id ? await tx.mktLead.findUnique({ where: { id } }) : null;
    if (id && !before) throw new NotFoundError('Lead não encontrado.');
    const convertedAt = d.stage === 'MATRICULADO' ? before?.convertedAt ?? new Date() : null;
    const lead = id ? await tx.mktLead.update({ where: { id }, data: { ...data, convertedAt } }) : await tx.mktLead.create({ data: { ...data, convertedAt, createdById: principal.id } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: id ? 'mkt.lead_updated' : 'mkt.lead_created', entityType: 'mkt_lead', entityId: lead.id, before, after: lead, summary: `${principal.name} ${id ? 'editou' : 'cadastrou'} o lead ${lead.name}` });
    return lead.id;
  });
}

export async function setLeadStage(principal: Principal | null, id: string, stage: string, lostReason: string | null, meta: RequestMeta) {
  assertCan(principal, 'mkt.edit');
  if (!LEAD_STAGES.some((s) => s.id === stage)) throw new AppError('Etapa inválida.');
  if (stage === 'PERDIDO' && !lostReason?.trim()) throw new AppError('Diga por que o lead foi perdido.');
  await prisma.$transaction(async (tx) => {
    const l = await tx.mktLead.findUnique({ where: { id } });
    if (!l) throw new NotFoundError('Lead não encontrado.');
    if (l.stage === stage && stage !== 'PERDIDO') return;
    await tx.mktLead.update({ where: { id }, data: { stage, convertedAt: stage === 'MATRICULADO' ? l.convertedAt ?? new Date() : null, lostReason: stage === 'PERDIDO' ? lostReason!.trim().slice(0, 300) : null } });
    const label = LEAD_STAGES.find((s) => s.id === stage)!.label;
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'mkt.lead_stage', entityType: 'mkt_lead', entityId: id, before: { etapa: l.stage }, after: { etapa: stage, motivo: lostReason }, summary: `${principal.name} moveu o lead ${l.name} para ${label}` });
  });
}

export async function deleteLead(principal: Principal | null, id: string, meta: RequestMeta) {
  assertCan(principal, 'mkt.admin');
  await prisma.$transaction(async (tx) => {
    const l = await tx.mktLead.findUnique({ where: { id } });
    if (!l) throw new NotFoundError('Lead não encontrado.');
    await tx.mktLead.delete({ where: { id } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'mkt.lead_deleted', entityType: 'mkt_lead', entityId: id, before: l, summary: `${principal.name} excluiu o lead ${l.name}` });
  });
}

/** Token do webhook de leads: LEADS_WEBHOOK_TOKEN ou, se não houver, o CRON_SECRET. */
export const leadsWebhookToken = () => process.env.LEADS_WEBHOOK_TOKEN || process.env.CRON_SECRET || null;

/**
 * Lead vindo de formulário (webhook). Não duplica: mesmo envio (id do
 * formulário) é ignorado; mesmo telefone/e-mail em 7 dias vira nota no lead existente.
 */
export async function ingestLead(payload: unknown, opts: { source?: string | null; campaign?: string | null } = {}): Promise<{ result: 'criado' | 'atualizado' | 'duplicado' | 'ignorado'; id?: string }> {
  const p = parseLeadPayload(payload);
  if (!p.name && !p.phone && !p.email) return { result: 'ignorado' };
  const ref = p.ref ? `form:${p.ref}` : `hash:${createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 32)}`;
  if (await prisma.mktLead.findUnique({ where: { externalRef: ref }, select: { id: true } })) return { result: 'duplicado' };
  const source = opts.source && LEAD_SOURCES.some((s) => s.id === opts.source) ? opts.source : sourceFromUtm(p.utm);
  const link = p.utm.campaign ? await prisma.mktLink.findFirst({ where: { utmCampaign: p.utm.campaign }, select: { id: true, campaignId: true } }) : null;
  const campaign = opts.campaign ? await prisma.mktCampaign.findFirst({ where: { OR: [{ id: /^[0-9a-f-]{36}$/.test(opts.campaign) ? opts.campaign : undefined }, { name: { equals: opts.campaign, mode: 'insensitive' } }] }, select: { id: true } }) : null;
  const note = [p.message ? `Mensagem: ${p.message}` : null, `Recebido em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`].filter(Boolean).join('\n');

  // Mesmo contato nos últimos 7 dias: atualiza em vez de duplicar.
  const key = phoneKey(p.phone);
  const recent = await prisma.mktLead.findMany({ where: { createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) }, OR: [...(p.email ? [{ email: p.email }] : []), ...(p.phone ? [{ phone: { not: null } }] : [])] }, take: 200 });
  const same = recent.find((l) => (p.email && l.email === p.email) || (key && phoneKey(l.phone) === key));
  return prisma.$transaction(async (tx) => {
    if (same) {
      await tx.mktLead.update({ where: { id: same.id }, data: { notes: [same.notes, `— Novo envio de formulário —\n${note}`].filter(Boolean).join('\n\n').slice(0, 4000), interest: same.interest ?? p.interest } });
      await audit(tx, { actorId: null }, { action: 'mkt.lead_form_again', entityType: 'mkt_lead', entityId: same.id, after: { origem: source }, summary: `${same.name} enviou o formulário de novo` });
      return { result: 'atualizado' as const, id: same.id };
    }
    const lead = await tx.mktLead.create({
      data: {
        name: (p.name ?? p.email ?? p.phone ?? 'Sem nome').slice(0, 120), phone: p.phone, email: p.email, interest: p.interest, source, externalRef: ref,
        utmSource: p.utm.source ?? null, utmMedium: p.utm.medium ?? null, utmCampaign: p.utm.campaign ?? null, linkId: link?.id ?? null,
        campaignId: campaign?.id ?? link?.campaignId ?? null, notes: note, raw: payload as Prisma.InputJsonValue,
      },
    });
    await audit(tx, { actorId: null }, { action: 'mkt.lead_received', entityType: 'mkt_lead', entityId: lead.id, after: { origem: source }, summary: `Novo lead pelo formulário: ${lead.name}` });
    return { result: 'criado' as const, id: lead.id };
  });
}

// ── Links ─────────────────────────────────────────────────

const linkSchema = z.object({
  title: z.string().trim().min(2, 'Dê um nome ao link.').max(80),
  slug: z.string().trim().max(40).nullable(),
  destination: z.string().trim().max(1000).refine((v) => /^https?:\/\//.test(v), 'O destino precisa começar com https://'),
  channel: z.enum(LINK_CHANNELS.map((c) => c.id) as [string, ...string[]]),
  utmSource: z.string().trim().max(60).nullable(),
  utmMedium: z.string().trim().max(60).nullable(),
  utmCampaign: z.string().trim().max(80).nullable(),
  utmContent: z.string().trim().max(80).nullable(),
  campaignId: z.string().uuid().nullable(),
  active: z.boolean(),
});

export async function listLinks(principal: Principal | null) {
  assertCan(principal, 'mkt.view');
  const [links, leads] = await Promise.all([
    prisma.mktLink.findMany({ orderBy: [{ active: 'desc' }, { createdAt: 'desc' }] }),
    prisma.mktLead.groupBy({ by: ['linkId'], where: { linkId: { not: null } }, _count: { _all: true } }),
  ]);
  const leadCount = new Map(leads.map((l) => [l.linkId, l._count._all]));
  const won = new Map((await prisma.mktLead.groupBy({ by: ['linkId'], where: { linkId: { not: null }, stage: 'MATRICULADO' }, _count: { _all: true } })).map((l) => [l.linkId, l._count._all]));
  return links.map((l) => ({
    id: l.id, slug: l.slug, title: l.title, destination: l.destination, channel: l.channel, utmSource: l.utmSource, utmMedium: l.utmMedium, utmCampaign: l.utmCampaign, utmContent: l.utmContent,
    campaignId: l.campaignId, active: l.active, clicks: l.clicks, lastClickAt: l.lastClickAt?.toISOString() ?? null, leads: leadCount.get(l.id) ?? 0, won: won.get(l.id) ?? 0,
    finalUrl: withUtm(l.destination, { source: l.utmSource, medium: l.utmMedium, campaign: l.utmCampaign, content: l.utmContent }),
  }));
}
export type LinkRow = Awaited<ReturnType<typeof listLinks>>[number];

export async function saveLink(principal: Principal | null, id: string | null, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'mkt.edit');
  const r = linkSchema.safeParse(input);
  if (!r.success) throw new AppError(r.error.issues[0]?.message ?? 'Dados inválidos.');
  const d = r.data;
  const ch = LINK_CHANNELS.find((c) => c.id === d.channel)!;
  const slug = slugify(d.slug || d.title);
  if (await prisma.mktLink.findFirst({ where: { slug, ...(id ? { NOT: { id } } : {}) }, select: { id: true } })) throw new AppError(`Já existe um link /l/${slug}. Escolha outro endereço curto.`);
  const data = {
    title: d.title, slug, destination: d.destination, channel: d.channel, active: d.active, campaignId: d.campaignId,
    utmSource: d.utmSource || ch.source, utmMedium: d.utmMedium || ch.medium, utmCampaign: d.utmCampaign || slug, utmContent: d.utmContent || null,
  };
  return prisma.$transaction(async (tx) => {
    const before = id ? await tx.mktLink.findUnique({ where: { id } }) : null;
    if (id && !before) throw new NotFoundError('Link não encontrado.');
    const l = id ? await tx.mktLink.update({ where: { id }, data }) : await tx.mktLink.create({ data: { ...data, createdById: principal.id } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: id ? 'mkt.link_updated' : 'mkt.link_created', entityType: 'mkt_link', entityId: l.id, before, after: l, summary: `${principal.name} ${id ? 'editou' : 'criou'} o link /l/${l.slug}` });
    return l.id;
  });
}

export async function deleteLink(principal: Principal | null, id: string, meta: RequestMeta) {
  assertCan(principal, 'mkt.admin');
  await prisma.$transaction(async (tx) => {
    const l = await tx.mktLink.findUnique({ where: { id } });
    if (!l) throw new NotFoundError('Link não encontrado.');
    await tx.mktLinkClickDay.deleteMany({ where: { linkId: id } });
    await tx.mktLead.updateMany({ where: { linkId: id }, data: { linkId: null } });
    await tx.mktLink.delete({ where: { id } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'mkt.link_deleted', entityType: 'mkt_link', entityId: id, before: l, summary: `${principal.name} excluiu o link /l/${l.slug}` });
  });
}

/** Clique público em /l/<slug>: conta e devolve o destino com UTM (null = não existe/inativo). */
export async function clickLink(slug: string, today: string): Promise<string | null> {
  const l = await prisma.mktLink.findUnique({ where: { slug } });
  if (!l || !l.active) return null;
  await prisma.$transaction([
    prisma.mktLink.update({ where: { id: l.id }, data: { clicks: { increment: 1 }, lastClickAt: new Date() } }),
    prisma.mktLinkClickDay.upsert({ where: { linkId_day: { linkId: l.id, day: dt(today)! } }, create: { linkId: l.id, day: dt(today)!, clicks: 1 }, update: { clicks: { increment: 1 } } }),
  ]);
  return withUtm(l.destination, { source: l.utmSource, medium: l.utmMedium, campaign: l.utmCampaign, content: l.utmContent });
}

/** Cliques por dia dos últimos N dias (todos os links). */
export async function clicksByDay(days = 30) {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await prisma.mktLinkClickDay.groupBy({ by: ['day'], where: { day: { gte: since } }, _sum: { clicks: true }, orderBy: { day: 'asc' } });
  return rows.map((r) => ({ day: iso(r.day)!, clicks: r._sum.clicks ?? 0 }));
}
