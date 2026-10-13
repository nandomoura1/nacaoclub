import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/server/db';
import { audit } from '@/server/audit';
import { assertCan } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import type { RequestMeta } from '@/server/auth/session';
import { PERMISSION_KEYS } from '@/server/auth/permissions';
import { AppError, NotFoundError } from '@/server/errors';
import { addDays, fromUtc, toUtc, type IsoDate } from '@/domain/dates';
import { demandOrder, isLate, OPEN_STATUSES } from '@/domain/processos';
import { teacherGradeText } from '@/domain/teacher-share';
import { AUDIENCES, audienceOf, baseVars, demandsBlock, describeWhen, FREQUENCIES, isDue, periodOf, renderTemplate, shiftsBlock, unknownVariables, type VariableKey } from '@/domain/wa-automations';
import { monthName, nextSaturday, type LeaderDemand, type PersonalShift } from '@/domain/wa-jobs';
import { maskDestination, normalizeDestination, phoneKey } from '@/domain/whatsapp';
import { teacherShareData } from '@/server/services/teacher-share-service';
import { deliverWhatsApp } from '@/server/services/whatsapp-service';
import { zapiConfig } from './zapi';

/**
 * Automações de WhatsApp editáveis: cada uma tem frequência, público e um
 * modelo de texto. O agendador diário roda as do dia; "Enviar agora" roda na
 * hora. Cada período é enviado uma vez só. Em modo teste (ZAPI_TEST_PHONE),
 * no máximo 3 mensagens por execução, todas para o número de teste.
 */

const TEST_LIMIT = 3;
const SYSTEM: Principal = { id: '00000000-0000-0000-0000-000000000000', name: 'Envio automático', email: 'sistema@nacao', roleKeys: ['SISTEMA'], permissions: new Set(PERMISSION_KEYS), areaIds: null, mustChangePassword: false, teacherIds: [] };

const appUrl = () => {
  const host = process.env.APP_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '');
  return host.replace(/\/$/, '');
};

type Filter = { modalityId?: string | null; roleKey?: string | null; numbers?: string[] } | null;
export interface Recipient { key: string; name: string | null; phone: string | null; vars: Partial<Record<VariableKey, string>>; teacherId?: string }

// ── Públicos ──────────────────────────────────────────────

async function leaders(today: IsoDate, withPending: boolean): Promise<Recipient[]> {
  const sectors = await prisma.procSector.findMany({ where: { active: true, leaderId: { not: null } }, select: { id: true, leaderId: true } });
  const ids = [...new Set(sectors.map((s) => s.leaderId!))];
  if (!ids.length) return [];
  const users = await prisma.user.findMany({ where: { id: { in: ids }, active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, phone: true, teachers: { select: { teacher: { select: { phone: true } } } } } });
  const demands = withPending ? await prisma.procDemand.findMany({
    where: { status: { in: OPEN_STATUSES }, dueDate: { lte: toUtc(addDays(today, 7)) }, OR: [{ sectorId: { in: sectors.map((s) => s.id) } }, { ownerId: { in: ids } }] },
    include: { sector: { select: { name: true } } },
  }) : [];
  const link = `${appUrl()}/processos/demandas?minhas=1`;
  return users.flatMap((u) => {
    const phone = u.phone ?? u.teachers.map((t) => t.teacher.phone).find(Boolean) ?? null;
    const base = { key: `u:${u.id}`, name: u.name, phone };
    if (!withPending) return [{ ...base, vars: baseVars(u.name, today, appUrl()) }];
    const mine = new Set(sectors.filter((s) => s.leaderId === u.id).map((s) => s.id));
    const list: (LeaderDemand & { status: string; doneAt: null })[] = demands.filter((d) => mine.has(d.sectorId) || d.ownerId === u.id)
      .map((d) => { const x = { status: d.status, dueDate: fromUtc(d.dueDate!), priority: d.priority, doneAt: null }; return { ...x, title: d.title, sector: d.sector.name, late: isLate(x, today) }; })
      .sort((a, b) => demandOrder(a, b, today));
    return list.length ? [{ ...base, vars: { ...baseVars(u.name, today, link), demandas: demandsBlock(list) } }] : [];
  });
}

async function weekendDuty(today: IsoDate): Promise<Recipient[]> {
  const sat = nextSaturday(today);
  const until = addDays(sat, 2);
  const [shifts, holidays] = await Promise.all([
    prisma.dutyShift.findMany({ where: { date: { gte: toUtc(sat), lte: toUtc(until) } }, include: { sector: { select: { name: true } }, people: { include: { teacher: { select: { id: true, name: true, displayName: true, phone: true, active: true } } } } } }),
    prisma.holiday.findMany({ where: { date: { gte: toUtc(sat), lte: toUtc(until) } }, select: { date: true, name: true } }),
  ]);
  const hol = new Map(holidays.map((h) => [fromUtc(h.date), h.name]));
  const by = new Map<string, { name: string; phone: string | null; shifts: PersonalShift[] }>();
  for (const s of shifts) {
    const date = fromUtc(s.date);
    if (date === until && !hol.has(date)) continue; // segunda só se for feriado
    for (const p of s.people) {
      if (!p.teacher.active) continue;
      const cur = by.get(p.teacher.id) ?? { name: p.teacher.displayName || p.teacher.name, phone: p.teacher.phone, shifts: [] };
      cur.shifts.push({ date, startMin: s.startMin, endMin: s.endMin, sector: s.sector.name, holiday: hol.get(date) ?? null });
      by.set(p.teacher.id, cur);
    }
  }
  return [...by].map(([id, t]) => ({ key: `t:${id}`, teacherId: id, name: t.name, phone: t.phone, vars: { ...baseVars(t.name, today, appUrl()), escala: shiftsBlock(t.shifts) } }));
}

async function teachers(today: IsoDate, f: Filter, withGrade: boolean): Promise<Recipient[]> {
  const list = await prisma.teacher.findMany({
    where: { active: true, ...(f?.modalityId ? { OR: [{ primaryModalityId: f.modalityId }, { modalities: { some: { modalityId: f.modalityId } } }] } : {}) },
    select: { id: true, name: true, displayName: true, phone: true }, orderBy: { name: 'asc' },
  });
  const out: Recipient[] = [];
  for (const t of list) {
    const name = t.displayName || t.name;
    if (!withGrade) { out.push({ key: `t:${t.id}`, teacherId: t.id, name, phone: t.phone, vars: baseVars(name, today, appUrl()) }); continue; }
    const d = await teacherShareData(SYSTEM, t.id, today);
    if (!d.slots.length) continue;
    // A grade sem o título (o modelo já tem o seu).
    const grade = teacherGradeText({ name: d.name, date: today, slots: d.slots, duties: [], groups: [], specific: '' }).split('\n').slice(3).join('\n');
    out.push({ key: `t:${t.id}`, teacherId: t.id, name, phone: d.phone, vars: { ...baseVars(name, today, appUrl()), grade } });
  }
  return out;
}

async function byRole(today: IsoDate, f: Filter): Promise<Recipient[]> {
  if (!f?.roleKey) return [];
  const users = await prisma.user.findMany({ where: { active: true, roles: { some: { role: { key: f.roleKey } } } }, orderBy: { name: 'asc' }, select: { id: true, name: true, phone: true, teachers: { select: { teacher: { select: { phone: true } } } } } });
  return users.map((u) => ({ key: `u:${u.id}`, name: u.name, phone: u.phone ?? u.teachers.map((t) => t.teacher.phone).find(Boolean) ?? null, vars: baseVars(u.name, today, appUrl()) }));
}

export async function audienceRecipients(audience: string, filter: Filter, today: IsoDate): Promise<Recipient[]> {
  switch (audience) {
    case 'LIDERES_PENDENCIAS': return leaders(today, true);
    case 'LIDERES': return leaders(today, false);
    case 'ESCALADOS_FDS': return weekendDuty(today);
    case 'PROFESSORES_GRADE': return teachers(today, filter, true);
    case 'PROFESSORES': return teachers(today, filter, false);
    case 'PERFIL': return byRole(today, filter);
    case 'NUMEROS': return (filter?.numbers ?? []).map((n) => ({ key: `n:${n}`, name: null, phone: n, vars: baseVars(null, today, appUrl()) }));
    default: return [];
  }
}

// ── Cadastro ──────────────────────────────────────────────

const schema = z.object({
  name: z.string().trim().min(3, 'Dê um nome à automação.').max(80),
  active: z.boolean(),
  frequency: z.enum(FREQUENCIES.map((f) => f.id) as [string, ...string[]]),
  weekdays: z.array(z.number().int().min(1).max(7)).max(7),
  monthDay: z.number().int().min(1).max(28).nullable(),
  audience: z.enum(AUDIENCES.map((a) => a.id) as [string, ...string[]]),
  filter: z.object({ modalityId: z.string().uuid().nullable().optional(), roleKey: z.string().max(40).nullable().optional(), numbers: z.array(z.string().trim().max(60)).max(50).optional() }).nullable(),
  template: z.string().trim().min(5, 'Escreva a mensagem.').max(3500, 'Mensagem longa demais.'),
  askConfirmation: z.boolean(),
});

export async function saveAutomation(principal: Principal | null, id: string | null, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'whatsapp.admin');
  const r = schema.safeParse(input);
  if (!r.success) throw new AppError(r.error.issues[0]?.message ?? 'Dados inválidos.');
  const d = r.data;
  if (d.frequency === 'SEMANAL' && !d.weekdays.length) throw new AppError('Escolha pelo menos um dia da semana.');
  const bad = unknownVariables(d.template, d.audience);
  if (bad.length) throw new AppError(`Este público não preenche: ${bad.map((b) => `{${b}}`).join(', ')}. Troque o público ou tire a variável.`);
  const aud = audienceOf(d.audience)!;
  if (aud.filter === 'role' && !d.filter?.roleKey) throw new AppError('Escolha o perfil.');
  const numbers = aud.filter === 'numbers' ? (d.filter?.numbers ?? []).map((n) => n.trim()).filter(Boolean) : [];
  if (aud.filter === 'numbers') {
    if (!numbers.length) throw new AppError('Informe ao menos um número.');
    const invalid = numbers.find((n) => !normalizeDestination(n));
    if (invalid) throw new AppError(`Número inválido: ${invalid}`);
  }
  const filter = aud.filter === 'modality' ? (d.filter?.modalityId ? { modalityId: d.filter.modalityId } : null) : aud.filter === 'role' ? { roleKey: d.filter!.roleKey } : aud.filter === 'numbers' ? { numbers } : null;
  const data = {
    name: d.name, active: d.active, frequency: d.frequency,
    weekdays: d.frequency === 'SEMANAL' ? [...new Set(d.weekdays)].sort() : [], monthDay: d.frequency === 'MENSAL' ? d.monthDay ?? 1 : null,
    audience: d.audience, filter: (filter ?? undefined) as Prisma.InputJsonValue | undefined, template: d.template, askConfirmation: d.askConfirmation,
  };
  return prisma.$transaction(async (tx) => {
    const before = id ? await tx.waAutomation.findUnique({ where: { id } }) : null;
    if (id && !before) throw new NotFoundError('Automação não encontrada.');
    const a = id
      ? await tx.waAutomation.update({ where: { id }, data: { ...data, filter: filter ? (filter as Prisma.InputJsonValue) : Prisma.DbNull } })
      : await tx.waAutomation.create({ data: { ...data, createdById: principal.id } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: id ? 'whatsapp.automation_updated' : 'whatsapp.automation_created', entityType: 'wa_automation', entityId: a.id, before, after: a, summary: `${principal.name} ${id ? 'editou' : 'criou'} a automação "${a.name}"` });
    return a.id;
  });
}

export async function deleteAutomation(principal: Principal | null, id: string, meta: RequestMeta) {
  assertCan(principal, 'whatsapp.admin');
  await prisma.$transaction(async (tx) => {
    const a = await tx.waAutomation.findUnique({ where: { id } });
    if (!a) throw new NotFoundError('Automação não encontrada.');
    await tx.waAutomation.delete({ where: { id } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'whatsapp.automation_deleted', entityType: 'wa_automation', entityId: id, before: a, summary: `${principal.name} excluiu a automação "${a.name}"` });
  });
}

export async function setAutomationActive(principal: Principal | null, id: string, active: boolean, meta: RequestMeta) {
  assertCan(principal, 'whatsapp.admin');
  await prisma.$transaction(async (tx) => {
    const a = await tx.waAutomation.update({ where: { id }, data: { active } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'whatsapp.automation_toggle', entityType: 'wa_automation', entityId: id, after: { ativo: active }, summary: `${principal.name} ${active ? 'ligou' : 'desligou'} a automação "${a.name}"` });
  });
}

export async function listAutomations() {
  const rows = await prisma.waAutomation.findMany({ orderBy: [{ active: 'desc' }, { createdAt: 'asc' }] });
  return rows.map((a) => ({
    id: a.id, name: a.name, active: a.active, frequency: a.frequency, weekdays: a.weekdays, monthDay: a.monthDay, audience: a.audience,
    filter: (a.filter as Filter) ?? null, template: a.template, askConfirmation: a.askConfirmation,
    when: describeWhen(a), audienceLabel: audienceOf(a.audience)?.label ?? a.audience,
    lastRunAt: a.lastRunAt?.toISOString() ?? null, lastResult: (a.lastResult as unknown as RunResult | null) ?? null,
  }));
}
export type AutomationView = Awaited<ReturnType<typeof listAutomations>>[number];

// ── Execução ──────────────────────────────────────────────

export interface RunResult { period: string; total: number; enviados: number; falhas: number; semTelefone: string[]; limitadoTeste: number; erro?: string; manual?: boolean }

type AutomationRow = NonNullable<Awaited<ReturnType<typeof prisma.waAutomation.findUnique>>>;

/** Prévia: destinatários e textos, sem enviar. */
export async function previewAutomation(a: Pick<AutomationRow, 'audience' | 'filter' | 'template'>, today: IsoDate) {
  const list = await audienceRecipients(a.audience, a.filter as Filter, today);
  const ok = list.filter((r) => r.phone && normalizeDestination(r.phone));
  return {
    total: list.length,
    semTelefone: list.filter((r) => !ok.includes(r)).map((r) => r.name ?? r.phone ?? '—'),
    amostras: ok.slice(0, 3).map((r) => ({ para: maskDestination(normalizeDestination(r.phone!)!), nome: r.name ?? 'número fixo', texto: renderTemplate(a.template, r.vars) })),
  };
}

/** Roda uma automação. Sem `force`: só se ativa, do dia e ainda não enviada no período (marcação atômica). */
export async function runAutomation(id: string, today: IsoDate, opts: { force?: boolean; actorName?: string } = {}): Promise<RunResult | null> {
  const a = await prisma.waAutomation.findUnique({ where: { id } });
  if (!a) throw new NotFoundError('Automação não encontrada.');
  const period = periodOf(a, today);
  if (!opts.force) {
    if (!a.active || !isDue(a, today)) return null;
    const claimed = await prisma.waAutomation.updateMany({ where: { id, active: true, OR: [{ lastPeriod: null }, { lastPeriod: { not: period } }] }, data: { lastPeriod: period, lastRunAt: new Date() } });
    if (!claimed.count) return null;
  }
  const result: RunResult = { period, total: 0, enviados: 0, falhas: 0, semTelefone: [], limitadoTeste: 0, ...(opts.force ? { manual: true } : {}) };
  try {
    const cfg = zapiConfig();
    if (!cfg.configured) throw new Error('WhatsApp não configurado.');
    const list = await audienceRecipients(a.audience, a.filter as Filter, today);
    result.total = list.length;
    const withPhone = list.filter((r) => { const ok = !!(r.phone && normalizeDestination(r.phone)); if (!ok) result.semTelefone.push(r.name ?? r.phone ?? '—'); return ok; });
    const batch = cfg.testPhone ? withPhone.slice(0, TEST_LIMIT) : withPhone;
    result.limitadoTeste = withPhone.length - batch.length;
    const subject = `${a.name} · ${a.frequency === 'MENSAL' ? monthName(today.slice(0, 7)) : today.split('-').reverse().slice(0, 2).join('/')}`;
    for (const r of batch) {
      try {
        const d = await deliverWhatsApp({ kind: kindOf(a.audience), to: r.phone!, text: renderTemplate(a.template, r.vars), actor: { id: null, name: opts.actorName ? `${opts.actorName} (envio manual)` : `Automação: ${a.name}` } });
        if (d.error) { result.falhas++; continue; }
        result.enviados++;
        const key = phoneKey(cfg.testPhone ?? r.phone);
        if (a.askConfirmation && key) {
          await prisma.waConfirmation.upsert({
            where: { kind_period_recipientKey: { kind: a.id, period, recipientKey: r.key } },
            create: { kind: a.id, period, recipientKey: r.key, teacherId: r.teacherId ?? null, name: r.name ?? maskDestination(normalizeDestination(r.phone!)!), subject, phoneKey: key },
            update: { phoneKey: key, subject, status: 'PENDENTE', reply: null, sentAt: new Date(), repliedAt: null },
          });
        }
      } catch {
        result.falhas++;
      }
    }
  } catch (e) {
    result.erro = e instanceof Error ? e.message : 'Falha no envio automático.';
  }
  await prisma.waAutomation.update({ where: { id }, data: { lastRunAt: new Date(), lastResult: result as unknown as Prisma.InputJsonValue, ...(opts.force ? { lastPeriod: period } : {}) } });
  return result;
}

const kindOf = (audience: string) => (audience === 'LIDERES_PENDENCIAS' ? 'DEMANDAS' : audience === 'ESCALADOS_FDS' ? 'ESCALA' : audience === 'PROFESSORES_GRADE' ? 'GRADE' : 'LIVRE');

/** Agendador: roda todas as automações ativas que são do dia. */
export async function runDueAutomations(today: IsoDate) {
  const list = await prisma.waAutomation.findMany({ where: { active: true }, select: { id: true, name: true, frequency: true, weekdays: true, monthDay: true } });
  const out: Record<string, RunResult | string> = {};
  for (const a of list.filter((x) => isDue(x, today))) out[a.name] = (await runAutomation(a.id, today)) ?? 'já enviada neste período';
  return out;
}

// ── Respostas ─────────────────────────────────────────────

/** Confirmações dos últimos 35 dias e as últimas mensagens recebidas. */
export async function replyOverview() {
  const since = new Date(Date.now() - 35 * 86_400_000);
  const [confirmations, inbound, lastIn] = await Promise.all([
    prisma.waConfirmation.findMany({ where: { sentAt: { gte: since } }, orderBy: [{ sentAt: 'desc' }] }),
    prisma.waInbound.findMany({ orderBy: { createdAt: 'desc' }, take: 15 }),
    prisma.waInbound.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
  ]);
  const tNames = new Map((await prisma.teacher.findMany({ where: { id: { in: inbound.map((i) => i.teacherId).filter((x): x is string => !!x) } }, select: { id: true, name: true, displayName: true } })).map((t) => [t.id, t.displayName || t.name]));
  const uNames = new Map((await prisma.user.findMany({ where: { id: { in: inbound.map((i) => i.userId).filter((x): x is string => !!x) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const groups = new Map<string, { subject: string; items: { id: string; name: string; status: string; reply: string | null }[] }>();
  for (const c of confirmations) {
    const k = `${c.kind}|${c.period}`;
    const g = groups.get(k) ?? { subject: c.subject ?? `Grade mensal · ${monthName(c.period)}`, items: [] };
    g.items.push({ id: c.id, name: c.name, status: c.status, reply: c.reply });
    groups.set(k, g);
  }
  return {
    lastReceivedAt: lastIn?.createdAt.toISOString() ?? null,
    groups: [...groups.values()].map((g) => ({ ...g, items: g.items.sort((a, b) => a.status.localeCompare(b.status) || a.name.localeCompare(b.name)) })),
    inbound: inbound.map((i) => ({ id: i.id, at: i.createdAt.toISOString(), from: (i.teacherId && tNames.get(i.teacherId)) || (i.userId && uNames.get(i.userId)) || i.senderName || i.toMasked, text: i.text, handled: i.handled })),
  };
}
export type ReplyOverview = Awaited<ReturnType<typeof replyOverview>>;
