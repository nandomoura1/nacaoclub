import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/server/db';
import { audit } from '@/server/audit';
import { assertCan, can } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import type { RequestMeta } from '@/server/auth/session';
import { AppError, NotFoundError } from '@/server/errors';
import { isIsoDate, type IsoDate } from '@/domain/dates';
import { NOTICE_AUDIENCES, NOTICE_KINDS, noticeText, onBoard } from '@/domain/marketing/notices';
import { baseVars } from '@/domain/wa-automations';
import { maskDestination, normalizeDestination, phoneKey } from '@/domain/whatsapp';
import { audienceRecipients, type Recipient } from '@/server/whatsapp/automations';
import { zapiConfig } from '@/server/whatsapp/zapi';
import { deliverWhatsApp } from '@/server/services/whatsapp-service';
import { dt, iso } from './marketing-service';

/**
 * Comunicação Interna: comunicados para a equipe por WhatsApp (com pedido de
 * "OK" opcional, que cai nas Respostas da Z-API) e mural no app com "Li".
 */

const TEST_LIMIT = 3;
type Filter = { modalityId?: string | null; roleKey?: string | null; numbers?: string[]; userIds?: string[]; roleKeys?: string[] } | null;
const appUrl = () => (process.env.APP_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '')).replace(/\/$/, '');

/** Toda a equipe: usuários ativos + professores ativos, sem repetir o mesmo telefone. */
async function everyone(today: IsoDate): Promise<Recipient[]> {
  const [users, teachers] = await Promise.all([
    prisma.user.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, phone: true, teachers: { select: { teacher: { select: { phone: true } } } } } }),
    prisma.teacher.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, displayName: true, phone: true } }),
  ]);
  const seen = new Set<string>();
  const out: Recipient[] = [];
  const push = (r: Recipient) => {
    const k = phoneKey(r.phone);
    if (k) { if (seen.has(k)) return; seen.add(k); }
    out.push(r);
  };
  for (const u of users) push({ key: `u:${u.id}`, name: u.name, phone: u.phone ?? u.teachers.map((t) => t.teacher.phone).find(Boolean) ?? null, vars: baseVars(u.name, today, appUrl()) });
  for (const t of teachers) { const name = t.displayName || t.name; push({ key: `t:${t.id}`, teacherId: t.id, name, phone: t.phone, vars: baseVars(name, today, appUrl()) }); }
  return out;
}

/** Pessoas escolhidas (Briefing): usuários marcados + perfis inteiros + grupos/números, sem repetir telefone. */
async function selection(f: Filter, today: IsoDate): Promise<Recipient[]> {
  const userIds = f?.userIds ?? [], roleKeys = f?.roleKeys ?? [];
  const users = userIds.length || roleKeys.length ? await prisma.user.findMany({
    where: { active: true, OR: [{ id: { in: userIds } }, { roles: { some: { role: { key: { in: roleKeys } } } } }] },
    orderBy: { name: 'asc' }, select: { id: true, name: true, phone: true, teachers: { select: { teacher: { select: { phone: true } } } } },
  }) : [];
  const seen = new Set<string>();
  const out: Recipient[] = [];
  const push = (r: Recipient) => {
    const k = phoneKey(r.phone);
    if (k) { if (seen.has(k)) return; seen.add(k); }
    out.push(r);
  };
  for (const u of users) push({ key: `u:${u.id}`, name: u.name, phone: u.phone ?? u.teachers.map((t) => t.teacher.phone).find(Boolean) ?? null, vars: baseVars(u.name, today, appUrl()) });
  for (const n of f?.numbers ?? []) push({ key: `n:${n}`, name: null, phone: n, vars: baseVars(null, today, appUrl()) });
  return out;
}

export async function noticeRecipients(audience: string, filter: Filter, today: IsoDate): Promise<Recipient[]> {
  if (audience === 'SELECAO') return selection(filter, today);
  return audience === 'TODOS' ? everyone(today) : audienceRecipients(audience, filter, today);
}

export interface NoticeRow {
  id: string; kind: string; title: string; body: string; audience: string; filter: Filter; campaignId: string | null; campaign: string | null;
  sendWhatsApp: boolean; askConfirmation: boolean; pinned: boolean; showUntil: string | null; status: string; publishedAt: string | null; publishedBy: string | null;
  sendResult: SendResult | null; reads: number; confirmations: { total: number; ok: number; ajuste: number; pending: string[] } | null; createdAt: string;
}
export interface SendResult { total: number; enviados: number; falhas: number; semTelefone: string[]; limitadoTeste: number; erro?: string }

export async function listNotices(principal: Principal | null): Promise<NoticeRow[]> {
  assertCan(principal, 'mkt.view');
  const rows = await prisma.mktNotice.findMany({ orderBy: [{ status: 'asc' }, { publishedAt: 'desc' }, { createdAt: 'desc' }], take: 100, include: { _count: { select: { reads: true } } } });
  const ids = [...new Set(rows.flatMap((r) => [r.campaignId, r.publishedById]).filter(Boolean) as string[])];
  const [campaigns, users, confs] = await Promise.all([
    prisma.mktCampaign.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
    prisma.waConfirmation.findMany({ where: { kind: { in: rows.map((r) => `aviso:${r.id}`) } }, select: { kind: true, name: true, status: true } }),
  ]);
  const name = new Map([...campaigns, ...users].map((x) => [x.id, x.name]));
  return rows.map((r) => {
    const mine = confs.filter((c) => c.kind === `aviso:${r.id}`);
    return {
      id: r.id, kind: r.kind, title: r.title, body: r.body, audience: r.audience, filter: r.filter as Filter, campaignId: r.campaignId, campaign: r.campaignId ? name.get(r.campaignId) ?? null : null,
      sendWhatsApp: r.sendWhatsApp, askConfirmation: r.askConfirmation, pinned: r.pinned, showUntil: iso(r.showUntil), status: r.status,
      publishedAt: r.publishedAt?.toISOString() ?? null, publishedBy: r.publishedById ? name.get(r.publishedById) ?? null : null,
      sendResult: (r.sendResult as SendResult | null) ?? null, reads: r._count.reads, createdAt: r.createdAt.toISOString(),
      confirmations: mine.length ? { total: mine.length, ok: mine.filter((c) => c.status === 'CONFIRMADO').length, ajuste: mine.filter((c) => c.status === 'AJUSTE').length, pending: mine.filter((c) => c.status === 'PENDENTE').map((c) => c.name).sort() } : null,
    };
  });
}

const schema = z.object({
  kind: z.enum(NOTICE_KINDS.map((k) => k.id) as [string, ...string[]]),
  title: z.string().trim().min(3, 'Dê um título ao comunicado.').max(100),
  body: z.string().trim().min(5, 'Escreva o comunicado.').max(6000, 'Texto longo demais para o WhatsApp.'),
  audience: z.enum(NOTICE_AUDIENCES.map((a) => a.id) as [string, ...string[]]),
  filter: z.object({ modalityId: z.string().uuid().nullable().optional(), roleKey: z.string().max(40).nullable().optional(), numbers: z.array(z.string().trim().max(60)).max(50).optional(),
    userIds: z.array(z.string().uuid()).max(200).optional(), roleKeys: z.array(z.string().max(40)).max(20).optional() }).nullable(),
  campaignId: z.string().uuid().nullable(),
  sendWhatsApp: z.boolean(),
  askConfirmation: z.boolean(),
  pinned: z.boolean(),
  showUntil: z.string().refine(isIsoDate, 'Data inválida.').nullable(),
});

export async function saveNotice(principal: Principal | null, id: string | null, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'mkt.edit');
  const r = schema.safeParse(input);
  if (!r.success) throw new AppError(r.error.issues[0]?.message ?? 'Dados inválidos.');
  const d = r.data;
  if (d.audience === 'PERFIL' && !d.filter?.roleKey) throw new AppError('Escolha o perfil.');
  if (d.audience === 'NUMEROS' && !d.filter?.numbers?.length) throw new AppError('Informe pelo menos um grupo ou número.');
  if (d.audience === 'SELECAO' && !d.filter?.userIds?.length && !d.filter?.roleKeys?.length && !d.filter?.numbers?.length) throw new AppError('Escolha pelo menos uma pessoa, perfil ou grupo.');
  const data = { ...d, filter: (d.filter ?? Prisma.JsonNull) as Prisma.InputJsonValue, showUntil: dt(d.showUntil) };
  return prisma.$transaction(async (tx) => {
    const before = id ? await tx.mktNotice.findUnique({ where: { id } }) : null;
    if (id && !before) throw new NotFoundError('Comunicado não encontrado.');
    // Depois de publicado, dá para ajustar mural (fixar, data) e texto do mural — o WhatsApp já foi.
    const n = id ? await tx.mktNotice.update({ where: { id }, data }) : await tx.mktNotice.create({ data: { ...data, createdById: principal.id } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: id ? 'mkt.notice_updated' : 'mkt.notice_created', entityType: 'mkt_notice', entityId: n.id, before, after: n, summary: `${principal.name} ${id ? 'editou' : 'criou'} o comunicado “${n.title}”` });
    return n.id;
  });
}

/** Prévia: para quantos vai, quem está sem WhatsApp e como fica a mensagem. */
export async function previewNotice(principal: Principal | null, input: { audience: string; filter: Filter; kind: string; title: string; body: string; askConfirmation: boolean }, today: IsoDate) {
  assertCan(principal, 'mkt.edit');
  const list = await noticeRecipients(input.audience, input.filter, today);
  const ok = list.filter((r) => r.phone && normalizeDestination(r.phone));
  const sample = ok[0] ?? list[0];
  return {
    total: list.length, comTelefone: ok.length,
    semTelefone: list.filter((r) => !ok.includes(r)).map((r) => r.name ?? r.phone ?? '—'),
    texto: noticeText(input, sample?.vars ?? baseVars(principal!.name, today, appUrl())),
    teste: zapiConfig().testPhone ? TEST_LIMIT : null,
  };
}

/** Publica: vai para o mural e, se marcado, envia por WhatsApp (uma vez só). */
export async function publishNotice(principal: Principal | null, id: string, today: IsoDate, meta: RequestMeta): Promise<SendResult | null> {
  assertCan(principal, 'mkt.edit');
  const claimed = await prisma.mktNotice.updateMany({ where: { id, status: 'RASCUNHO' }, data: { status: 'PUBLICADO', publishedAt: new Date(), publishedById: principal.id } });
  if (!claimed.count) throw new AppError('Este comunicado já foi publicado.');
  const n = await prisma.mktNotice.findUniqueOrThrow({ where: { id } });
  let result: SendResult | null = null;
  if (n.sendWhatsApp) {
    result = { total: 0, enviados: 0, falhas: 0, semTelefone: [], limitadoTeste: 0 };
    try {
      const cfg = zapiConfig();
      if (!cfg.configured) throw new Error('WhatsApp não configurado — o comunicado ficou só no mural.');
      const list = await noticeRecipients(n.audience, n.filter as Filter, today);
      result.total = list.length;
      const withPhone = list.filter((r) => { const ok = !!(r.phone && normalizeDestination(r.phone)); if (!ok) result!.semTelefone.push(r.name ?? r.phone ?? '—'); return ok; });
      const batch = cfg.testPhone ? withPhone.slice(0, TEST_LIMIT) : withPhone;
      result.limitadoTeste = withPhone.length - batch.length;
      for (const r of batch) {
        try {
          const d = await deliverWhatsApp({ kind: 'COMUNICADO', to: r.phone!, text: noticeText(n, r.vars), actor: { id: principal.id, name: `${principal.name} (comunicado)` } });
          if (d.error) { result.falhas++; continue; }
          result.enviados++;
          const key = phoneKey(cfg.testPhone ?? r.phone);
          if (n.askConfirmation && key && !r.phone!.includes('-group')) {
            await prisma.waConfirmation.upsert({
              where: { kind_period_recipientKey: { kind: `aviso:${n.id}`, period: today, recipientKey: r.key } },
              create: { kind: `aviso:${n.id}`, period: today, recipientKey: r.key, teacherId: r.teacherId ?? null, name: r.name ?? maskDestination(normalizeDestination(r.phone!)!), subject: `Comunicado: ${n.title}`, phoneKey: key },
              update: {},
            });
          }
        } catch { result.falhas++; }
      }
    } catch (e) {
      result.erro = e instanceof Error ? e.message : 'Falha no envio.';
    }
  }
  await prisma.$transaction(async (tx) => {
    await tx.mktNotice.update({ where: { id }, data: { sendResult: result ? (result as unknown as Prisma.InputJsonValue) : Prisma.JsonNull } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'mkt.notice_published', entityType: 'mkt_notice', entityId: id, after: { publico: n.audience, whatsapp: result }, summary: `${principal.name} publicou o comunicado “${n.title}”${result ? ` (${result.enviados} WhatsApp enviados)` : ''}` });
  });
  return result;
}

export async function deleteNotice(principal: Principal | null, id: string, meta: RequestMeta) {
  assertCan(principal, 'mkt.admin');
  await prisma.$transaction(async (tx) => {
    const n = await tx.mktNotice.findUnique({ where: { id } });
    if (!n) throw new NotFoundError('Comunicado não encontrado.');
    await tx.waConfirmation.deleteMany({ where: { kind: `aviso:${id}`, status: 'PENDENTE' } });
    await tx.mktNotice.delete({ where: { id } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'mkt.notice_deleted', entityType: 'mkt_notice', entityId: id, before: n, summary: `${principal.name} excluiu o comunicado “${n.title}”` });
  });
}

// ── Mural (qualquer pessoa logada) ────────────────────────

export async function noticeBoard(principal: Principal | null, today: IsoDate) {
  if (!principal) return [];
  const rows = await prisma.mktNotice.findMany({
    where: { status: 'PUBLICADO', publishedAt: { gte: new Date(Date.now() - 120 * 86_400_000) } },
    orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }], take: 30,
    include: { reads: { where: { userId: principal.id }, select: { readAt: true } } },
  });
  return rows
    .filter((r) => onBoard({ publishedAt: r.publishedAt?.toISOString() ?? null, pinned: r.pinned, showUntil: iso(r.showUntil) }, today))
    .map((r) => ({ id: r.id, kind: r.kind, title: r.title, body: r.body.replace(/\{primeiro_nome\}/g, principal.name.split(' ')[0]!).replace(/\{nome\}/g, principal.name).replace(/\{[a-z_]+\}/g, ''), pinned: r.pinned, publishedAt: r.publishedAt!.toISOString(), read: r.reads.length > 0 }))
    .sort((a, b) => Number(a.read) - Number(b.read) || Number(b.pinned) - Number(a.pinned) || b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, 6);
}
export type BoardItem = Awaited<ReturnType<typeof noticeBoard>>[number];

export async function markNoticeRead(principal: Principal | null, id: string) {
  if (!principal) throw new AppError('Entre no sistema.');
  const n = await prisma.mktNotice.findFirst({ where: { id, status: 'PUBLICADO' }, select: { id: true } });
  if (!n) throw new NotFoundError('Comunicado não encontrado.');
  await prisma.mktNoticeRead.upsert({ where: { noticeId_userId: { noticeId: id, userId: principal.id } }, create: { noticeId: id, userId: principal.id }, update: {} });
}

/** Quem leu no app (para o painel do comunicado). */
export async function noticeReaders(principal: Principal | null, id: string) {
  assertCan(principal, 'mkt.view');
  const reads = await prisma.mktNoticeRead.findMany({ where: { noticeId: id }, orderBy: { readAt: 'asc' } });
  const users = new Map((await prisma.user.findMany({ where: { id: { in: reads.map((r) => r.userId) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return reads.map((r) => ({ name: users.get(r.userId) ?? '—', at: r.readAt.toISOString() }));
}

export const canManageNotices = (p: Principal | null) => can(p, 'mkt.edit');
