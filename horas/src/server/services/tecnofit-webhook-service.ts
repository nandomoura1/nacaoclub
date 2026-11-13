import { createHmac, timingSafeEqual } from 'node:crypto';
import { prisma } from '@/server/db';
import { audit } from '@/server/audit';
import { assertCan } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import type { RequestMeta } from '@/server/auth/session';
import { AppError } from '@/server/errors';
import { toUtc, type IsoDate } from '@/domain/dates';
import { isoFromApi } from '@/domain/cobranca';
import { hhmm, minutesOf, tvLabel } from '@/domain/tv-checkins';
import { todayIso } from '@/lib/today';
import { HttpTecnofit, tecnofitApi, tecnofitConfig } from '@/server/tecnofit/client';
import { resyncCustomer } from './crm-sync-service';

/**
 * Avisos da Tecnofit (webhooks), confirmados por ela em 12/11/2026:
 * - assinatura HMAC-SHA256 em `X-Tecnofit-Signature: v1=<hex>` sobre "<timestamp>.<corpo bruto>";
 * - cabeçalhos X-Tecnofit-Event / -Webhook-Id / -Timestamp; responder 2xx em até 5 s (senão ela reenvia
 *   em 1 min, 5 min, 15 min, 1 h, 6 h e 24 h);
 * - o corpo só identifica o evento e traz `resource_url`: o dado atualizado vem da API na hora.
 * A rota guarda o aviso e responde; o processamento roda em seguida (after). Duplicado não processa de novo.
 * O secret fica SÓ na Vercel (TECNOFIT_WEBHOOK_SECRET). A chave que cadastra os webhooks é separada
 * (TECNOFIT_WEBHOOK_API_KEY/SECRET), como a Tecnofit recomenda.
 */

export const WEBHOOK_EVENTS = [
  'payment.received', 'payment.refunded', 'sale.created', 'sale.updated', 'sale.cancelled',
  'customer.status_changed', 'customer.consultant_changed',
  'contract.created', 'contract.updated', 'contract.cancelled',
  'call.created', 'call.completed', 'attendance.created',
] as const;

const MAX_SKEW_S = 5 * 60;

/** Timestamp do cabeçalho em segundos (aceita segundos, milissegundos ou data ISO). */
function tsSeconds(v: string): number | null {
  if (/^\d+$/.test(v)) { const n = Number(v); return n > 1e12 ? Math.floor(n / 1000) : n; }
  const t = Date.parse(v);
  return Number.isFinite(t) ? Math.floor(t / 1000) : null;
}

/** Confere a assinatura (e que o aviso é recente: evita reaproveitar um aviso antigo). */
export function verifySignature(secret: string, timestamp: string | null, signature: string | null, rawBody: string, nowS = Math.floor(Date.now() / 1000)): boolean {
  if (!secret || !timestamp || !signature) return false;
  const ts = tsSeconds(timestamp);
  if (ts === null || Math.abs(nowS - ts) > MAX_SKEW_S) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  const got = signature.split(',').map((p) => p.trim()).find((p) => p.startsWith('v1='))?.slice(3) ?? '';
  const a = Buffer.from(expected, 'hex'); const b = Buffer.from(got, 'hex');
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

const pick = (o: Record<string, unknown> | null | undefined, ...keys: string[]): string | null => {
  for (const k of keys) {
    const v = k.split('.').reduce<unknown>((acc, part) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[part] : undefined), o);
    if (v !== undefined && v !== null && v !== '') return String(v);
  }
  return null;
};

/** Guarda o aviso (idempotente). Devolve false se já tinha chegado. */
export async function storeEvent(id: string, event: string, resourceUrl: string | null): Promise<boolean> {
  const r = await prisma.tecWebhookEvent.createMany({ data: [{ id: id.slice(0, 100), event: event.slice(0, 60), resourceUrl: resourceUrl?.slice(0, 500) ?? null }], skipDuplicates: true });
  return r.count === 1;
}

/** Processa um aviso guardado. Erro fica registrado (o dado se corrige na sincronização diária). */
export async function processEvent(id: string, today: IsoDate = todayIso()): Promise<string> {
  const ev = await prisma.tecWebhookEvent.findUnique({ where: { id } });
  if (!ev || ev.status !== 'RECEBIDO') return ev?.status ?? 'NAO_ENCONTRADO';
  const done = (status: string, error: string | null = null) => prisma.tecWebhookEvent.update({ where: { id }, data: { status, error: error?.slice(0, 300) ?? null, processedAt: new Date() } }).then(() => status);
  if (!(WEBHOOK_EVENTS as readonly string[]).includes(ev.event)) return done('IGNORADO');
  try {
    const { api } = await tecnofitApi();
    const r = ev.resourceUrl ? await api.resource(ev.resourceUrl) : null;
    if (!r) return done('IGNORADO', 'recurso não encontrado');
    if (ev.event === 'attendance.created') return done(await storeAttendance(r, today));

    const customerId = ev.event.startsWith('customer.')
      ? pick(r, 'id', 'customer.id')
      : pick(r, 'customer.id', 'customerId', 'customer_id', 'sale.customer.id', 'client.id');
    if (!customerId) return done('IGNORADO', 'aviso sem aluno');

    if (ev.event.startsWith('call.')) {
      const st = (pick(r, 'status') ?? '').toLowerCase();
      const completed = ev.event === 'call.completed' || /complet|conclu|realiz/.test(st);
      const at = isoFromApi(pick(r, 'callDate', 'completedAt', 'updatedAt'));
      const deadline = isoFromApi(pick(r, 'callDeadline', 'deadline'));
      await resyncCustomer(customerId, today, completed ? { lastCallDone: at && at <= today ? at : today } : { nextCall: deadline });
    } else if (ev.event === 'customer.consultant_changed') {
      await resyncCustomer(customerId, today, { consultant: pick(r, 'consultant.id', 'consultantId', 'consultant_id') });
    } else {
      await resyncCustomer(customerId, today, { contracts: ev.event.startsWith('contract.') });
    }
    return done('PROCESSADO');
  } catch (e) {
    return done('ERRO', e instanceof Error ? e.message : String(e));
  }
}

/** Check-in em tempo real para a TV (só turma/CrossFit de hoje; a TV recebe só "Nome I."). */
async function storeAttendance(r: Record<string, unknown>, today: IsoDate): Promise<string> {
  const type = (pick(r, 'type', 'checkin.type') ?? '').toLowerCase();
  if (type && !['class', 'crossfit'].includes(type)) return 'IGNORADO';
  const customerId = pick(r, 'customer.id', 'customerId');
  const name = pick(r, 'customer.name') ?? '';
  const classId = pick(r, 'class.id', 'classId');
  const start = minutesOf(pick(r, 'class.start', 'classStart'));
  const day = isoFromApi(pick(r, 'checkin.createdAt', 'createdAt', 'class.start')) ?? today;
  if (!customerId || !classId || day !== today) return 'IGNORADO';
  // O id pode ser o do evento do dia: a agenda (já lida) diz a turma.
  const slot = await prisma.tecClassSlot.findFirst({ where: { day: toUtc(today), tecnofitEventId: classId } });
  await prisma.tvCheckin.createMany({
    data: [{ day: toUtc(today), tecnofitClassId: slot?.tecnofitClassId ?? classId, start: start === null ? (slot?.start ?? '') : hhmm(start), customerTecId: customerId, name: name.slice(0, 120), label: tvLabel(name), className: (pick(r, 'class.name') ?? slot?.name ?? '').slice(0, 120), checkinAt: pick(r, 'checkin.createdAt', 'createdAt') }],
    skipDuplicates: true,
  });
  return 'PROCESSADO';
}

/** Tecnofit lenta ou fora do ar: avisos que ficaram "RECEBIDO" (o after() caiu) são reprocessados. */
export async function processPending(today: IsoDate = todayIso(), limit = 50) {
  const old = await prisma.tecWebhookEvent.findMany({ where: { status: 'RECEBIDO', receivedAt: { lt: new Date(Date.now() - 2 * 60_000) } }, orderBy: { receivedAt: 'asc' }, take: limit, select: { id: true } });
  for (const e of old) await processEvent(e.id, today);
  // Avisos guardados por 30 dias.
  await prisma.tecWebhookEvent.deleteMany({ where: { receivedAt: { lt: new Date(Date.now() - 30 * 86_400_000) } } });
  return old.length;
}

// ── Configurações (crm.admin) ─────────────────────────────

export function webhookConfig() {
  return {
    secretConfigured: !!process.env.TECNOFIT_WEBHOOK_SECRET?.trim(),
    adminKeyConfigured: !!(process.env.TECNOFIT_WEBHOOK_API_KEY?.trim() && process.env.TECNOFIT_WEBHOOK_API_SECRET?.trim()),
  };
}

export async function webhookOverview(principal: Principal | null) {
  assertCan(principal, 'crm.admin');
  const since = new Date(Date.now() - 7 * 86_400_000);
  const [byStatus, recent] = await Promise.all([
    prisma.tecWebhookEvent.groupBy({ by: ['event', 'status'], where: { receivedAt: { gte: since } }, _count: true }),
    prisma.tecWebhookEvent.findMany({ orderBy: { receivedAt: 'desc' }, take: 15, select: { event: true, status: true, error: true, receivedAt: true } }),
  ]);
  return {
    ...webhookConfig(),
    last7: byStatus.map((x) => ({ event: x.event, status: x.status, count: x._count })),
    recent: recent.map((r) => ({ event: r.event, status: r.status, error: r.error, at: r.receivedAt.toISOString() })),
  };
}

/**
 * Cadastra a assinatura na Tecnofit (chave de webhooks). O secret volta UMA vez: é mostrado só ao
 * administrador para colar em TECNOFIT_WEBHOOK_SECRET na Vercel — o sistema não guarda.
 */
export async function registerWebhook(principal: Principal | null, baseUrl: string, meta: RequestMeta) {
  assertCan(principal, 'crm.admin');
  if (!/^https:\/\//.test(baseUrl)) throw new AppError('O endereço do sistema precisa ser HTTPS (APP_URL).');
  const cfg = tecnofitConfig();
  const http = new HttpTecnofit(cfg, fetch, 350, { key: process.env.TECNOFIT_WEBHOOK_API_KEY, secret: process.env.TECNOFIT_WEBHOOK_API_SECRET });
  const url = `${baseUrl}/api/webhooks/tecnofit`;
  const existing = (await http.listWebhooks()).find((w) => w.url === url && w.active);
  if (existing) throw new AppError('Já existe um webhook ativo para este endereço na Tecnofit. Se perdeu o secret, gere outro pela rotação de secret.');
  const r = await http.createWebhook(url, [...WEBHOOK_EVENTS], 'Nação ADM — cobrança, renovações e check-ins');
  await prisma.$transaction((tx) => audit(tx, { actorId: principal.id, ...meta }, { action: 'crm.webhook_registered', entityType: 'tecnofit_webhook', entityId: r.id, after: { url, events: r.events }, summary: `${principal.name} cadastrou o webhook da Tecnofit (${r.events.length} eventos)` }));
  return { id: r.id, secret: r.secret, url };
}

