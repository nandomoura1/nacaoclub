import type { Prisma } from '@prisma/client';
import { prisma } from '@/server/db';
import type { Principal } from '@/server/auth/principal';
import { PERMISSION_KEYS } from '@/server/auth/permissions';
import { addDays, fromUtc, toUtc, type IsoDate } from '@/domain/dates';
import { isLate, OPEN_STATUSES, demandOrder } from '@/domain/processos';
import { teacherGradeText } from '@/domain/teacher-share';
import { dutyPersonalMessage, leaderMessage, monthlyGradeMessage, nextSaturday, periodKey, WA_JOBS, type LeaderDemand, type PersonalShift, type WaJobKey } from '@/domain/wa-jobs';
import { normalizeDestination, phoneKey } from '@/domain/whatsapp';
import { teacherShareData } from '@/server/services/teacher-share-service';
import { deliverWhatsApp } from '@/server/services/whatsapp-service';
import { zapiConfig } from './zapi';

/**
 * Envios automáticos de WhatsApp. Cada envio monta a lista de destinatários,
 * manda um por um (registrado e auditado como "Envio automático") e marca o
 * período como enviado — rodar de novo no mesmo período não duplica.
 * Em modo teste (ZAPI_TEST_PHONE) manda só as 3 primeiras mensagens.
 */

const TEST_LIMIT = 3;
const ACTOR = { id: null, name: 'Envio automático' } as const;

/** O agendador não tem usuário: lê tudo, como a diretoria, sem escrever nada fora do registro de envios. */
const SYSTEM: Principal = { id: '00000000-0000-0000-0000-000000000000', name: 'Envio automático', email: 'sistema@nacao', roleKeys: ['SISTEMA'], permissions: new Set(PERMISSION_KEYS), areaIds: null, mustChangePassword: false, teacherIds: [] };

export interface Recipient { name: string; phone: string | null; text: string; teacherId?: string }

const appUrl = () => {
  const host = process.env.APP_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null);
  return host ? host.replace(/\/$/, '') : '';
};

// ── Destinatários de cada envio ───────────────────────────

async function leaderRecipients(today: IsoDate): Promise<Recipient[]> {
  const sectors = await prisma.procSector.findMany({ where: { active: true, leaderId: { not: null } }, select: { id: true, leaderId: true } });
  const leaderIds = [...new Set(sectors.map((s) => s.leaderId!))];
  if (!leaderIds.length) return [];
  const soon = toUtc(addDays(today, 7));
  const demands = await prisma.procDemand.findMany({
    where: { status: { in: OPEN_STATUSES }, dueDate: { lte: soon }, OR: [{ sectorId: { in: sectors.map((s) => s.id) } }, { ownerId: { in: leaderIds } }] },
    include: { sector: { select: { name: true } } },
  });
  const users = await prisma.user.findMany({ where: { id: { in: leaderIds }, active: true }, select: { id: true, name: true, phone: true, teachers: { select: { teacher: { select: { phone: true } } } } } });
  const url = `${appUrl()}/processos/demandas?minhas=1`;
  return users.flatMap((u) => {
    const mine = new Set(sectors.filter((s) => s.leaderId === u.id).map((s) => s.id));
    const list: (LeaderDemand & { status: string; doneAt: null })[] = demands
      .filter((d) => mine.has(d.sectorId) || d.ownerId === u.id)
      .map((d) => { const due = fromUtc(d.dueDate!); const x = { status: d.status, dueDate: due, priority: d.priority, doneAt: null }; return { ...x, title: d.title, sector: d.sector.name, late: isLate(x, today) }; })
      .sort((a, b) => demandOrder(a, b, today));
    if (!list.length) return [];
    const phone = u.phone ?? u.teachers.map((t) => t.teacher.phone).find(Boolean) ?? null;
    return [{ name: u.name, phone, text: leaderMessage({ name: u.name, demands: list, url }) }];
  });
}

async function dutyRecipients(today: IsoDate): Promise<Recipient[]> {
  const sat = nextSaturday(today);
  const until = addDays(sat, 2); // sábado, domingo e a segunda (se for feriado)
  const [shifts, holidays] = await Promise.all([
    prisma.dutyShift.findMany({ where: { date: { gte: toUtc(sat), lte: toUtc(until) } }, include: { sector: { select: { name: true } }, people: { include: { teacher: { select: { id: true, name: true, displayName: true, phone: true, active: true } } } } } }),
    prisma.holiday.findMany({ where: { date: { gte: toUtc(sat), lte: toUtc(until) } }, select: { date: true, name: true } }),
  ]);
  const hol = new Map(holidays.map((h) => [fromUtc(h.date), h.name]));
  const byTeacher = new Map<string, { name: string; phone: string | null; shifts: PersonalShift[] }>();
  for (const s of shifts) {
    const date = fromUtc(s.date);
    // Segunda só entra se for feriado.
    if (date === until && !hol.has(date)) continue;
    for (const p of s.people) {
      if (!p.teacher.active) continue;
      const cur = byTeacher.get(p.teacher.id) ?? { name: p.teacher.displayName || p.teacher.name, phone: p.teacher.phone, shifts: [] };
      cur.shifts.push({ date, startMin: s.startMin, endMin: s.endMin, sector: s.sector.name, holiday: hol.get(date) ?? null });
      byTeacher.set(p.teacher.id, cur);
    }
  }
  return [...byTeacher.values()].map((t) => ({ name: t.name, phone: t.phone, text: dutyPersonalMessage(t) }));
}

async function gradeRecipients(today: IsoDate): Promise<Recipient[]> {
  const teachers = await prisma.teacher.findMany({ where: { active: true }, select: { id: true }, orderBy: { name: 'asc' } });
  const out: Recipient[] = [];
  for (const t of teachers) {
    const d = await teacherShareData(SYSTEM, t.id, today);
    if (!d.slots.length) continue;
    const gradeText = teacherGradeText({ name: d.name, date: today, slots: d.slots, duties: [], groups: [], specific: '' });
    out.push({ name: d.name, phone: d.phone, text: monthlyGradeMessage({ month: today.slice(0, 7), gradeText }), teacherId: t.id });
  }
  return out;
}

export function jobRecipients(job: WaJobKey, today: IsoDate): Promise<Recipient[]> {
  return job === 'LIDERES' ? leaderRecipients(today) : job === 'ESCALA_FDS' ? dutyRecipients(today) : gradeRecipients(today);
}

const KIND: Record<WaJobKey, string> = { LIDERES: 'DEMANDAS', ESCALA_FDS: 'ESCALA', GRADE_MENSAL: 'GRADE' };

// ── Execução ──────────────────────────────────────────────

export interface JobResult { period: string; total: number; enviados: number; falhas: number; semTelefone: string[]; limitadoTeste: number; erro?: string; manual?: boolean }

async function ensureJobs() {
  await prisma.waJob.createMany({ data: WA_JOBS.map((j) => ({ key: j.key })), skipDuplicates: true });
}

/**
 * Roda um envio. Sem `force`, só se estiver ligado e ainda não enviado neste
 * período (a marcação é atômica: duas execuções simultâneas não duplicam).
 */
export async function runWaJob(job: WaJobKey, today: IsoDate, opts: { force?: boolean; actorName?: string } = {}): Promise<JobResult | null> {
  await ensureJobs();
  const period = periodKey(job, today);
  if (!opts.force) {
    const claimed = await prisma.waJob.updateMany({
      where: { key: job, enabled: true, OR: [{ lastPeriod: null }, { lastPeriod: { not: period } }] },
      data: { lastPeriod: period, lastRunAt: new Date() },
    });
    if (!claimed.count) return null;
  }
  const result: JobResult = { period, total: 0, enviados: 0, falhas: 0, semTelefone: [], limitadoTeste: 0, ...(opts.force ? { manual: true } : {}) };
  try {
    const cfg = zapiConfig();
    if (!cfg.configured) throw new Error('WhatsApp não configurado.');
    const recipients = await jobRecipients(job, today);
    result.total = recipients.length;
    const withPhone = recipients.filter((r) => { const ok = !!(r.phone && normalizeDestination(r.phone)); if (!ok) result.semTelefone.push(r.name); return ok; });
    const batch = cfg.testPhone ? withPhone.slice(0, TEST_LIMIT) : withPhone;
    result.limitadoTeste = withPhone.length - batch.length;
    for (const r of batch) {
      try {
        const d = await deliverWhatsApp({ kind: KIND[job], to: r.phone!, text: r.text, actor: { id: ACTOR.id, name: opts.actorName ? `${opts.actorName} (envio manual)` : ACTOR.name } });
        if (d.error) result.falhas++; else result.enviados++;
        // Grade: abre a confirmação (a resposta chega pelo webhook). Em modo teste, o "telefone" é o de teste.
        const key = phoneKey(cfg.testPhone ?? r.phone);
        if (!d.error && job === 'GRADE_MENSAL' && r.teacherId && key) {
          await prisma.waConfirmation.upsert({
            where: { kind_period_teacherId: { kind: 'GRADE', period, teacherId: r.teacherId } },
            create: { kind: 'GRADE', period, teacherId: r.teacherId, name: r.name, phoneKey: key },
            update: { name: r.name, phoneKey: key, status: 'PENDENTE', reply: null, sentAt: new Date(), repliedAt: null },
          });
        }
      } catch {
        result.falhas++;
      }
    }
  } catch (e) {
    result.erro = e instanceof Error ? e.message : 'Falha no envio automático.';
  }
  await prisma.waJob.update({ where: { key: job }, data: { lastRunAt: new Date(), lastResult: result as unknown as Prisma.InputJsonValue, ...(opts.force ? { lastPeriod: period } : {}) } });
  return result;
}

export async function listWaJobs() {
  await ensureJobs();
  const rows = new Map((await prisma.waJob.findMany()).map((r) => [r.key, r]));
  return WA_JOBS.map((j) => {
    const r = rows.get(j.key)!;
    return { ...j, enabled: r.enabled, lastPeriod: r.lastPeriod, lastRunAt: r.lastRunAt?.toISOString() ?? null, lastResult: (r.lastResult as unknown as JobResult | null) ?? null };
  });
}
export type WaJobView = Awaited<ReturnType<typeof listWaJobs>>[number];

/** Respostas: confirmações do período e as últimas mensagens recebidas. */
export async function replyOverview(today: IsoDate) {
  const period = today.slice(0, 7);
  const [confirmations, inbound, lastIn] = await Promise.all([
    prisma.waConfirmation.findMany({ where: { kind: 'GRADE', period }, orderBy: [{ status: 'asc' }, { name: 'asc' }] }),
    prisma.waInbound.findMany({ orderBy: { createdAt: 'desc' }, take: 15 }),
    prisma.waInbound.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
  ]);
  const names = new Map((await prisma.teacher.findMany({ where: { id: { in: inbound.map((i) => i.teacherId).filter((x): x is string => !!x) } }, select: { id: true, name: true, displayName: true } })).map((t) => [t.id, t.displayName || t.name]));
  const users = new Map((await prisma.user.findMany({ where: { id: { in: inbound.map((i) => i.userId).filter((x): x is string => !!x) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return {
    period,
    lastReceivedAt: lastIn?.createdAt.toISOString() ?? null,
    confirmations: confirmations.map((c) => ({ id: c.id, name: c.name, status: c.status, reply: c.reply, sentAt: c.sentAt.toISOString(), repliedAt: c.repliedAt?.toISOString() ?? null })),
    inbound: inbound.map((i) => ({ id: i.id, at: i.createdAt.toISOString(), from: (i.teacherId && names.get(i.teacherId)) || (i.userId && users.get(i.userId)) || i.senderName || i.toMasked, text: i.text, handled: i.handled })),
  };
}
export type ReplyOverview = Awaited<ReturnType<typeof replyOverview>>;
