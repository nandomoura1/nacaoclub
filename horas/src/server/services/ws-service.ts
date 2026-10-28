import { z } from 'zod';
import { prisma, type Tx } from '@/server/db';
import { audit } from '@/server/audit';
import { assertCan, can } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import type { RequestMeta } from '@/server/auth/session';
import { AppError, NotFoundError } from '@/server/errors';
import { addDays, eachDay, formatDateBR, fromUtc, isIsoDate, toUtc, type IsoDate } from '@/domain/dates';
import { mondayOf, monthInfo, resolveDay, type MonthInfo, type Override } from '@/domain/escalas/calendar';
import { generate } from '@/domain/escalas/engine';
import { buildRotation } from '@/domain/escalas/rotation';
import { describeRule, parseRule, RULE_KINDS, type RuleKind } from '@/domain/escalas/rules';
import type { Absence, Bond, Cell, CellKind, DayPlan, Grid, HoursMap, LegalParams, Member, MemberHours, Post, Rule } from '@/domain/escalas/types';
import { validate, type Analysis } from '@/domain/escalas/validate';
import { cancelLeave, saveLeave } from './leave-service';
import { deliverWhatsApp } from './whatsapp-service';
import { zapiConfig } from '@/server/whatsapp/zapi';
import { memberScheduleText } from '@/domain/escalas/whatsapp';
import { DOCUMENT_MODELS, MODEL_CYCLE_REF } from '@/server/escalas/models';

/**
 * Escalas de Trabalho 5x2: organizador mensal por setor, ligado ao cadastro de
 * pessoas (teachers), às ausências (leaves), aos feriados e aos eventos que o
 * sistema já tem. O cálculo é do domínio (src/domain/escalas), aqui só
 * carrega, autoriza, salva e registra no histórico.
 */

type P = Principal;
const ctx = (p: P, meta: RequestMeta) => ({ actorId: p.id, ...meta });

// ─── Escopo ───────────────────────────────────────────────────

/** Diretoria/DP (ws.admin) vê todos os setores; o líder, os setores da Gestão de Processos que lidera. */
export async function sectorScope(p: P, db: Tx = prisma): Promise<string[] | null> {
  if (can(p, 'ws.admin')) return null;
  const rows = await db.wsSector.findMany({ where: { procSector: { leaderId: p.id } }, select: { id: true } });
  return rows.map((r) => r.id);
}

async function assertSector(p: P, sectorId: string, db: Tx = prisma) {
  const s = await db.wsSector.findUnique({ where: { id: sectorId } });
  if (!s) throw new NotFoundError('Setor não encontrado.');
  const scope = await sectorScope(p, db);
  if (scope && !scope.includes(sectorId)) throw new AppError('Este setor não está entre os que você lidera.', 403);
  return s;
}

export async function listSectors(principal: P | null) {
  assertCan(principal, 'ws.view');
  const scope = await sectorScope(principal);
  return prisma.wsSector.findMany({
    where: { ...(scope ? { id: { in: scope } } : {}) },
    orderBy: [{ active: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    include: { procSector: { select: { name: true } }, _count: { select: { members: { where: { active: true } }, rules: { where: { active: true } }, posts: { where: { active: true } } } } },
  });
}

// ─── Esquemas ─────────────────────────────────────────────────

const min = z.number().int().min(0).max(1440);
const win = z.tuple([min, min]).refine(([s, e]) => e > s, 'Horário: o fim precisa ser depois do início.');
const dayKeys = ['1', '2', '3', '4', '5', '6', '7', 'F'] as const;
const hoursMapSchema = z.record(z.enum(dayKeys), z.array(win).max(3)).default({});
const shift3 = z.tuple([min, min, z.number().int().min(0).max(240)]).refine(([s, e]) => e > s, 'Horário do colaborador: a saída precisa ser depois da entrada.');
const weekSchema = z.array(shift3.nullable()).length(7, 'A grade semanal precisa dos 7 dias.');
const memberHoursSchema = z.object({ base: shift3.optional(), 6: shift3.optional(), 7: shift3.optional(), F: shift3.optional(), week: z.object({ A: weekSchema, B: weekSchema.optional(), cycle: z.array(weekSchema).min(2, 'O rodízio precisa de pelo menos 2 semanas.').max(12, 'Rodízio de no máximo 12 semanas.').optional() }).optional() }).default({});
const weekdays = z.array(z.number().int().min(1).max(7)).max(7).transform((a) => [...new Set(a)].sort());
const text = (n: number) => z.string().trim().max(n).optional().nullable().transform((v) => v || null);

const sectorSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome do setor.').max(60),
  procSectorId: z.string().uuid().nullable().or(z.literal('').transform(() => null)).default(null),
  hours: hoursMapSchema,
  cycleRef: z.string().refine(isIsoDate, 'Data de referência do ciclo inválida.'),
  notes: text(500),
  sortOrder: z.number().int().min(0).max(999).default(0),
  active: z.boolean().default(true),
});
const postSchema = z.object({
  name: z.string().trim().min(2, 'Dê um nome ao posto (ex.: Abertura).').max(60),
  kind: z.enum(['ABERTURA', 'FECHAMENTO', 'ALMOCO']).nullable().or(z.literal('').transform(() => null)).default(null),
  startMin: min, endMin: min,
  weekdays: z.array(z.number().int().min(1).max(8)).min(1, 'Escolha os dias do posto.').max(8),
  minPeople: z.number().int().min(1).max(30).default(1),
  functionName: text(60),
  mandatory: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(999).default(0),
  active: z.boolean().default(true),
}).refine((p) => p.endMin > p.startMin, 'O posto precisa terminar depois de começar.');
const memberSchema = z.object({
  teacherId: z.string().uuid().nullable().or(z.literal('').transform(() => null)).default(null),
  newName: text(120),
  functionName: text(60),
  altFunctions: z.array(z.string().trim().min(1).max(60)).max(10).default([]),
  bond: z.enum(['CLT', 'FUNAP', 'MEI', 'FREELANCER']),
  mode: z.enum(['FIXO', 'COBERTURA']).default('FIXO'),
  hours: memberHoursSchema,
  weeklyMin: z.number().int().min(0).max(4400).default(2400),
  fixedOff: weekdays.default([]),
  availableDays: weekdays.default([]),
  saturday: z.boolean().default(true),
  sunday: z.boolean().default(true),
  holiday: z.boolean().default(true),
  autoSchedule: z.boolean().default(true),
  notes: text(500),
  sortOrder: z.number().int().min(0).max(999).default(0),
  active: z.boolean().default(true),
});
const ruleSchema = z.object({ kind: z.string(), label: text(140), params: z.record(z.unknown()), mandatory: z.boolean(), active: z.boolean().default(true) });
const overrideSchema = z.object({
  date: z.string().refine(isIsoDate, 'Data inválida.'),
  sectorId: z.string().uuid().nullable().or(z.literal('').transform(() => null)).default(null),
  closed: z.boolean().default(false),
  hours: z.array(win).max(3).nullable().default(null),
  reason: z.string().trim().min(2, 'Diga o motivo (ex.: Nação Celebration, dedetização).').max(120),
  eventId: z.string().uuid().nullable().or(z.literal('').transform(() => null)).default(null),
  extraPeople: z.number().int().min(0).max(50).default(0),
});
const legalSchema = z.object({
  bond: z.enum(['CLT', 'FUNAP', 'MEI', 'FREELANCER']),
  validFrom: z.string().refine(isIsoDate, 'Vigência inválida.'),
  maxDailyMin: min.nullable(), maxDailyExtraMin: min.nullable(), maxWeeklyMin: z.number().int().min(0).max(10080).nullable(),
  minRestBetweenMin: min.nullable(), maxConsecutiveDays: z.number().int().min(1).max(31).nullable(),
  sundayOffEveryWeeks: z.number().int().min(1).max(12).nullable(),
  breakLongOverMin: min.nullable(), breakLongMin: min.nullable(), breakShortOverMin: min.nullable(), breakShortMin: min.nullable(),
  maxBreakMin: min.nullable().default(null),
  notes: text(1000),
  validated: z.boolean().default(false),
});
const cellSchema = z.object({
  kind: z.enum(['TRABALHO', 'FOLGA', 'BANCO', 'FECHADO', 'SEM_GRADE', 'FERIAS', 'ATESTADO', 'FALTA', 'AFASTAMENTO', 'INDISPONIVEL']),
  startMin: min.nullable().optional(), endMin: min.nullable().optional(), breakMin: z.number().int().min(0).max(240).nullable().optional(),
  note: text(120),
}).refine((c) => c.kind !== 'TRABALHO' || (c.startMin != null && c.endMin != null && c.endMin > c.startMin), 'Informe entrada e saída (a saída depois da entrada).');

function parse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) throw new AppError(r.error.issues[0]?.message ?? 'Dados inválidos.');
  return r.data;
}

// ─── Cadastros do setor ───────────────────────────────────────

export async function sectorSetup(principal: P | null, sectorId: string) {
  assertCan(principal, 'ws.view');
  await assertSector(principal, sectorId);
  const [sector, people, procSectors] = await Promise.all([
    prisma.wsSector.findUniqueOrThrow({
      where: { id: sectorId },
      include: {
        procSector: { select: { id: true, name: true } },
        posts: { orderBy: [{ sortOrder: 'asc' }, { startMin: 'asc' }] },
        members: { orderBy: [{ active: 'desc' }, { sortOrder: 'asc' }], include: { teacher: { select: { id: true, name: true, displayName: true, active: true } } } },
        rules: { orderBy: [{ active: 'desc' }, { createdAt: 'asc' }] },
      },
    }),
    prisma.teacher.findMany({ where: { active: true }, select: { id: true, name: true, displayName: true }, orderBy: { name: 'asc' } }),
    prisma.procSector.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { sortOrder: 'asc' } }),
  ]);
  const nameOf = new Map(sector.members.map((m) => [m.id, m.teacher.displayName || m.teacher.name]));
  return {
    sector,
    people: people.map((t) => ({ id: t.id, name: t.displayName ? `${t.displayName} (${t.name})` : t.name })),
    procSectors,
    rules: sector.rules.map((r) => ({ ...r, description: describeRule(r.kind, r.params as Record<string, unknown>, (id) => nameOf.get(id) ?? '—') })),
  };
}

export async function saveSector(principal: P | null, id: string | null, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'ws.admin');
  const d = parse(sectorSchema, input);
  return prisma.$transaction(async (tx) => {
    const data = { name: d.name, procSectorId: d.procSectorId, hours: d.hours, cycleRef: toUtc(mondayOf(d.cycleRef)), notes: d.notes, sortOrder: d.sortOrder, active: d.active };
    const clash = await tx.wsSector.findFirst({ where: { name: { equals: d.name, mode: 'insensitive' }, ...(id ? { id: { not: id } } : {}) } });
    if (clash) throw new AppError('Já existe um setor com esse nome.');
    const s = id ? await tx.wsSector.update({ where: { id }, data }) : await tx.wsSector.create({ data });
    await audit(tx, ctx(principal, meta), { action: id ? 'ws.sector.updated' : 'ws.sector.created', entityType: 'ws_sector', entityId: s.id, after: d, summary: `${principal.name} ${id ? 'alterou' : 'criou'} o setor de escala ${s.name}` });
    return s.id;
  });
}

/** Horário e ciclo do setor: o líder também ajusta (não cria nem renomeia). */
export async function saveSectorHours(principal: P | null, sectorId: string, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'ws.edit');
  const d = parse(z.object({
    hours: hoursMapSchema, cycleRef: z.string().refine(isIsoDate, 'Data inválida.'), notes: text(500),
    holidayMode: z.enum(['SABADO', 'DOMINGO']).nullable().or(z.literal('').transform(() => null)).default(null),
    holidayConfirm: z.boolean().default(false),
    holidayRotate: z.boolean().default(false),
    holidayStaff: z.number().int().min(1, 'Pelo menos 1 pessoa no feriado.').max(50).nullable().default(null),
  }), input);
  return prisma.$transaction(async (tx) => {
    const s = await assertSector(principal, sectorId, tx);
    await tx.wsSector.update({ where: { id: sectorId }, data: { hours: d.hours, cycleRef: toUtc(mondayOf(d.cycleRef)), notes: d.notes, holidayMode: d.holidayMode, holidayConfirm: d.holidayConfirm, holidayRotate: d.holidayRotate, holidayStaff: d.holidayStaff } });
    await audit(tx, ctx(principal, meta), { action: 'ws.sector.hours', entityType: 'ws_sector', entityId: sectorId, before: { hours: s.hours, cycleRef: fromUtc(s.cycleRef) }, after: d, summary: `${principal.name} alterou o horário/ciclo do setor ${s.name}` });
  });
}

export async function savePost(principal: P | null, sectorId: string, id: string | null, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'ws.edit');
  const d = parse(postSchema, input);
  return prisma.$transaction(async (tx) => {
    const s = await assertSector(principal, sectorId, tx);
    if (id && !(await tx.wsPost.findFirst({ where: { id, sectorId } }))) throw new NotFoundError('Posto não encontrado.');
    const p = id ? await tx.wsPost.update({ where: { id }, data: d }) : await tx.wsPost.create({ data: { ...d, sectorId } });
    await audit(tx, ctx(principal, meta), { action: id ? 'ws.post.updated' : 'ws.post.created', entityType: 'ws_post', entityId: p.id, after: d, summary: `${principal.name} ${id ? 'alterou' : 'criou'} o posto ${p.name} (${s.name})` });
    return p.id;
  });
}

export async function deletePost(principal: P | null, sectorId: string, id: string, meta: RequestMeta) {
  assertCan(principal, 'ws.edit');
  return prisma.$transaction(async (tx) => {
    const s = await assertSector(principal, sectorId, tx);
    const p = await tx.wsPost.findFirst({ where: { id, sectorId } });
    if (!p) throw new NotFoundError('Posto não encontrado.');
    await tx.wsPost.delete({ where: { id } });
    await audit(tx, ctx(principal, meta), { action: 'ws.post.deleted', entityType: 'ws_post', entityId: id, before: p, summary: `${principal.name} excluiu o posto ${p.name} (${s.name})` });
  });
}

/** Colaborador na equipe: usa o cadastro de pessoas existente (ou cria um novo, só com o nome). */
export async function saveMember(principal: P | null, sectorId: string, id: string | null, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'ws.edit');
  const d = parse(memberSchema, input);
  if (!id && !d.teacherId && !d.newName) throw new AppError('Escolha a pessoa no cadastro ou informe o nome para cadastrar.');
  if (d.mode === 'FIXO' && d.autoSchedule && d.active && !d.hours.base && !d.hours.week) throw new AppError('Informe o horário habitual (ou a grade semanal) ou desmarque "entra na geração automática".');
  if (d.mode === 'COBERTURA' && d.bond === 'CLT') throw new AppError('CLT entra como "fixo" na escala; "cobertura" é para MEI e freelancer.');
  const off = new Set(d.fixedOff);
  if (d.availableDays.some((x) => off.has(x))) throw new AppError('Um dia não pode ser de folga fixa e disponível ao mesmo tempo.');
  return prisma.$transaction(async (tx) => {
    const s = await assertSector(principal, sectorId, tx);
    let teacherId = d.teacherId;
    if (id) {
      const cur = await tx.wsMember.findFirst({ where: { id, sectorId } });
      if (!cur) throw new NotFoundError('Colaborador não encontrado na equipe.');
      teacherId = cur.teacherId;
    } else if (!teacherId) {
      const t = await tx.teacher.create({ data: { name: d.newName!, createdById: principal.id, notes: `Cadastrado pela escala do setor ${s.name}.` } });
      teacherId = t.id;
    } else if (await tx.wsMember.findFirst({ where: { sectorId, teacherId } })) {
      throw new AppError('Esta pessoa já está na equipe do setor.');
    }
    const data = {
      functionName: d.functionName, altFunctions: d.altFunctions, bond: d.bond, mode: d.mode, hours: d.hours, weeklyMin: d.weeklyMin,
      fixedOff: d.fixedOff, availableDays: d.availableDays, saturday: d.saturday, sunday: d.sunday, holiday: d.holiday,
      autoSchedule: d.autoSchedule, notes: d.notes, sortOrder: d.sortOrder, active: d.active,
    };
    const m = id ? await tx.wsMember.update({ where: { id }, data }) : await tx.wsMember.create({ data: { ...data, sectorId, teacherId: teacherId! } });
    const t = await tx.teacher.findUniqueOrThrow({ where: { id: m.teacherId }, select: { name: true } });
    await audit(tx, ctx(principal, meta), { action: id ? 'ws.member.updated' : 'ws.member.created', entityType: 'ws_member', entityId: m.id, after: { ...data, pessoa: t.name }, summary: `${principal.name} ${id ? 'alterou' : 'incluiu'} ${t.name} na equipe de ${s.name}` });
    return m.id;
  });
}

export async function removeMember(principal: P | null, sectorId: string, id: string, meta: RequestMeta) {
  assertCan(principal, 'ws.edit');
  return prisma.$transaction(async (tx) => {
    const s = await assertSector(principal, sectorId, tx);
    const m = await tx.wsMember.findFirst({ where: { id, sectorId }, include: { teacher: { select: { name: true } }, _count: { select: { cells: true } } } });
    if (!m) throw new NotFoundError('Colaborador não encontrado na equipe.');
    // Quem já está numa escala salva só é desativado (o histórico fica).
    if (m._count.cells) await tx.wsMember.update({ where: { id }, data: { active: false } });
    else await tx.wsMember.delete({ where: { id } });
    await audit(tx, ctx(principal, meta), { action: 'ws.member.removed', entityType: 'ws_member', entityId: id, summary: `${principal.name} tirou ${m.teacher.name} da equipe de ${s.name}${m._count.cells ? ' (desativado: já está em escala salva)' : ''}` });
  });
}

/**
 * Monta o rodízio: as pessoas escolhidas (na ordem) começam na grade atual de
 * cada uma (semana 1 = semana de referência do setor) e avançam uma posição
 * por semana. `memberIds` vazio desfaz o rodízio de todo o setor (fica a grade da semana 1).
 */
export async function setRotation(principal: P | null, sectorId: string, memberIds: string[], meta: RequestMeta) {
  assertCan(principal, 'ws.edit');
  const ids = z.array(z.string().uuid()).max(12, 'Rodízio de no máximo 12 pessoas.').parse(memberIds);
  if (ids.length === 1) throw new AppError('O rodízio precisa de pelo menos 2 pessoas.');
  if (new Set(ids).size !== ids.length) throw new AppError('A mesma pessoa aparece duas vezes.');
  return prisma.$transaction(async (tx) => {
    const s = await assertSector(principal, sectorId, tx);
    const all = await tx.wsMember.findMany({ where: { sectorId }, include: { teacher: { select: { name: true, displayName: true } } } });
    const name = (m: (typeof all)[number]) => m.teacher.displayName || m.teacher.name;
    if (!ids.length) {
      for (const m of all) {
        const h = m.hours as MemberHours;
        if (!h.week?.cycle) continue;
        await tx.wsMember.update({ where: { id: m.id }, data: { hours: { ...h, week: { A: h.week.cycle[0]! } } } });
      }
      await audit(tx, ctx(principal, meta), { action: 'ws.rotation.cleared', entityType: 'ws_sector', entityId: sectorId, summary: `${principal.name} desfez o rodízio do setor ${s.name}` });
      return;
    }
    const chosen = ids.map((id) => {
      const m = all.find((x) => x.id === id);
      if (!m) throw new AppError('Alguém escolhido não está na equipe do setor.');
      const h = m.hours as MemberHours;
      const pos = h.week?.cycle?.[0] ?? h.week?.A;
      if (!pos) throw new AppError(`${name(m)} não tem grade semanal fixa: defina a grade dela (posição) antes de montar o rodízio.`);
      return { m, h, pos };
    });
    const cycles = buildRotation(chosen.map((c) => c.pos));
    for (const [i, c] of chosen.entries()) {
      await tx.wsMember.update({ where: { id: c.m.id }, data: { hours: { ...c.h, week: { A: cycles[i]![0]!, cycle: cycles[i] } } } });
    }
    await audit(tx, ctx(principal, meta), { action: 'ws.rotation.set', entityType: 'ws_sector', entityId: sectorId, after: { ordem: chosen.map((c) => name(c.m)), semanas: ids.length }, summary: `${principal.name} montou o rodízio de ${ids.length} semanas no setor ${s.name}: ${chosen.map((c) => name(c.m)).join(' → ')}` });
  });
}

export async function saveRule(principal: P | null, sectorId: string, id: string | null, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'ws.edit');
  const d = parse(ruleSchema, input);
  const r = parseRule(d.kind, d.params);
  if (!r.ok) throw new AppError(r.error);
  return prisma.$transaction(async (tx) => {
    const s = await assertSector(principal, sectorId, tx);
    const members = await tx.wsMember.findMany({ where: { sectorId }, select: { id: true, teacher: { select: { name: true, displayName: true } } } });
    const ids = new Set(members.map((m) => m.id));
    const refs = JSON.stringify(r.params).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g) ?? [];
    if (refs.some((x) => !ids.has(x))) throw new AppError('A regra cita alguém que não está na equipe do setor.');
    const nameOf = new Map(members.map((m) => [m.id, m.teacher.displayName || m.teacher.name]));
    const label = d.label || describeRule(d.kind, r.params, (x) => nameOf.get(x) ?? '—');
    if (id && !(await tx.wsRule.findFirst({ where: { id, sectorId } }))) throw new NotFoundError('Regra não encontrada.');
    const data = { kind: d.kind, label, params: r.params as object, mandatory: d.mandatory, active: d.active };
    const rule = id ? await tx.wsRule.update({ where: { id }, data }) : await tx.wsRule.create({ data: { ...data, sectorId } });
    await audit(tx, ctx(principal, meta), { action: id ? 'ws.rule.updated' : 'ws.rule.created', entityType: 'ws_rule', entityId: rule.id, after: data, summary: `${principal.name} ${id ? 'alterou' : 'criou'} o pré-requisito "${label}" (${s.name}, ${d.mandatory ? 'obrigatório' : 'preferencial'})` });
    return rule.id;
  });
}

export async function deleteRule(principal: P | null, sectorId: string, id: string, meta: RequestMeta) {
  assertCan(principal, 'ws.edit');
  return prisma.$transaction(async (tx) => {
    const s = await assertSector(principal, sectorId, tx);
    const r = await tx.wsRule.findFirst({ where: { id, sectorId } });
    if (!r) throw new NotFoundError('Regra não encontrada.');
    await tx.wsRule.delete({ where: { id } });
    await audit(tx, ctx(principal, meta), { action: 'ws.rule.deleted', entityType: 'ws_rule', entityId: id, before: r, summary: `${principal.name} excluiu o pré-requisito "${r.label}" (${s.name})` });
  });
}

// ─── Funcionamento (calendário) ───────────────────────────────

export async function calendarData(principal: P | null, year: number, month: number) {
  assertCan(principal, 'ws.view');
  const mi = monthInfo(year, month);
  const scope = await sectorScope(principal);
  const [settings, holidays, overrides, events, sectors] = await Promise.all([
    prisma.appSettings.findUnique({ where: { id: 1 }, select: { nacaoHours: true } }),
    prisma.holiday.findMany({ where: { date: { gte: toUtc(mi.first), lte: toUtc(mi.last) } }, orderBy: { date: 'asc' } }),
    prisma.wsDayOverride.findMany({
      where: { date: { gte: toUtc(mi.first), lte: toUtc(mi.last) }, ...(scope ? { OR: [{ sectorId: null }, { sectorId: { in: scope } }] } : {}) },
      include: { sector: { select: { name: true } }, event: { select: { name: true } } }, orderBy: { date: 'asc' },
    }),
    prisma.mktEvent.findMany({ where: { startDate: { lte: toUtc(mi.last) }, OR: [{ endDate: { gte: toUtc(mi.first) } }, { endDate: null, startDate: { gte: toUtc(mi.first) } }], status: { not: 'CANCELADO' } }, select: { id: true, name: true, startDate: true, endDate: true, location: true }, orderBy: { startDate: 'asc' } }),
    prisma.wsSector.findMany({ where: { active: true, ...(scope ? { id: { in: scope } } : {}) }, select: { id: true, name: true }, orderBy: { sortOrder: 'asc' } }),
  ]);
  return {
    month: mi,
    nacaoHours: (settings?.nacaoHours ?? {}) as HoursMap,
    holidays: holidays.map((h) => ({ date: fromUtc(h.date), name: h.name, scope: h.scope })),
    overrides: overrides.map((o) => ({ id: o.id, date: fromUtc(o.date), sectorId: o.sectorId, sector: o.sector?.name ?? null, closed: o.closed, hours: o.hours as [number, number][] | null, reason: o.reason, eventId: o.eventId, event: o.event?.name ?? null, extraPeople: o.extraPeople })),
    events: events.map((e) => ({ id: e.id, name: e.name, start: fromUtc(e.startDate), end: e.endDate ? fromUtc(e.endDate) : null, location: e.location })),
    sectors,
    canAdmin: can(principal, 'ws.admin'),
  };
}

export async function saveNacaoHours(principal: P | null, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'ws.admin');
  const hours = parse(hoursMapSchema, input);
  return prisma.$transaction(async (tx) => {
    const before = await tx.appSettings.findUnique({ where: { id: 1 }, select: { nacaoHours: true } });
    await tx.appSettings.upsert({ where: { id: 1 }, update: { nacaoHours: hours }, create: { id: 1, nacaoHours: hours } });
    await audit(tx, ctx(principal, meta), { action: 'ws.nacao_hours', entityType: 'app_settings', before: before?.nacaoHours, after: hours, summary: `${principal.name} alterou o horário geral de funcionamento da Nação` });
  });
}

export async function saveOverride(principal: P | null, id: string | null, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'ws.edit');
  const d = parse(overrideSchema, input);
  if (!d.closed && !d.hours?.length && !d.extraPeople && !d.eventId) throw new AppError('Diga o que muda: fechado, horário especial ou reforço de equipe.');
  if (d.sectorId === null && !can(principal, 'ws.admin')) throw new AppError('Só a gestão altera o funcionamento da Nação inteira; escolha o seu setor.', 403);
  return prisma.$transaction(async (tx) => {
    if (d.sectorId) await assertSector(principal, d.sectorId, tx);
    if (id) {
      const cur = await tx.wsDayOverride.findUnique({ where: { id } });
      if (!cur) throw new NotFoundError('Exceção não encontrada.');
      if (cur.sectorId) await assertSector(principal, cur.sectorId, tx);
      else if (!can(principal, 'ws.admin')) throw new AppError('Só a gestão altera o funcionamento da Nação inteira.', 403);
    }
    const data = { date: toUtc(d.date), sectorId: d.sectorId, closed: d.closed, hours: d.closed ? undefined : (d.hours ?? undefined), reason: d.reason, eventId: d.eventId, extraPeople: d.extraPeople };
    const o = id ? await tx.wsDayOverride.update({ where: { id }, data }) : await tx.wsDayOverride.create({ data: { ...data, createdById: principal.id } });
    await audit(tx, ctx(principal, meta), { action: id ? 'ws.override.updated' : 'ws.override.created', entityType: 'ws_day_override', entityId: o.id, after: d, summary: `${principal.name} registrou funcionamento especial em ${formatDateBR(d.date)}: ${d.reason}` });
    return o.id;
  });
}

/** Confirma o funcionamento do setor numa data (some o aviso "confirme"; a escala não muda). */
export async function confirmDay(principal: P | null, sectorId: string, date: string, meta: RequestMeta) {
  assertCan(principal, 'ws.edit');
  if (!isIsoDate(date)) throw new AppError('Data inválida.');
  return prisma.$transaction(async (tx) => {
    const s = await assertSector(principal, sectorId, tx);
    const done = await tx.wsDayOverride.findFirst({ where: { sectorId, date: toUtc(date), confirmed: true } });
    if (!done) await tx.wsDayOverride.create({ data: { date: toUtc(date), sectorId, confirmed: true, reason: 'Funcionamento confirmado', createdById: principal.id } });
    await audit(tx, ctx(principal, meta), { action: 'ws.day.confirmed', entityType: 'ws_sector', entityId: sectorId, after: { data: date }, summary: `${principal.name} confirmou o funcionamento de ${s.name} em ${formatDateBR(date)}` });
  });
}

export async function deleteOverride(principal: P | null, id: string, meta: RequestMeta) {
  assertCan(principal, 'ws.edit');
  return prisma.$transaction(async (tx) => {
    const o = await tx.wsDayOverride.findUnique({ where: { id } });
    if (!o) throw new NotFoundError('Exceção não encontrada.');
    if (o.sectorId) await assertSector(principal, o.sectorId, tx);
    else if (!can(principal, 'ws.admin')) throw new AppError('Só a gestão altera o funcionamento da Nação inteira.', 403);
    await tx.wsDayOverride.delete({ where: { id } });
    await audit(tx, ctx(principal, meta), { action: 'ws.override.deleted', entityType: 'ws_day_override', entityId: id, before: o, summary: `${principal.name} excluiu o funcionamento especial de ${formatDateBR(fromUtc(o.date))} (${o.reason})` });
  });
}

// ─── Parâmetros legais ────────────────────────────────────────

export async function listLegal(principal: P | null) {
  assertCan(principal, 'ws.view');
  return prisma.wsLegalParam.findMany({ orderBy: [{ bond: 'asc' }, { validFrom: 'desc' }] });
}

export async function saveLegal(principal: P | null, id: string | null, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'ws.admin');
  const { validated, ...d } = parse(legalSchema, input);
  return prisma.$transaction(async (tx) => {
    const data = { ...d, validFrom: toUtc(d.validFrom), validatedAt: validated ? new Date() : null, validatedBy: validated ? principal.name : null };
    const clash = await tx.wsLegalParam.findFirst({ where: { bond: d.bond, validFrom: toUtc(d.validFrom), ...(id ? { id: { not: id } } : {}) } });
    if (clash) throw new AppError('Já existe um parâmetro desse vínculo com essa vigência.');
    const r = id ? await tx.wsLegalParam.update({ where: { id }, data }) : await tx.wsLegalParam.create({ data });
    await audit(tx, ctx(principal, meta), { action: id ? 'ws.legal.updated' : 'ws.legal.created', entityType: 'ws_legal_param', entityId: r.id, after: { ...d, validado: validated }, summary: `${principal.name} ${id ? 'alterou' : 'cadastrou'} os parâmetros de jornada ${d.bond} (vigência ${formatDateBR(d.validFrom)})${validated ? ', validados pelo DP' : ''}` });
    return r.id;
  });
}

// ─── Ausências (as mesmas da Gestão de Horas) ─────────────────

export async function listAbsences(principal: P | null, sectorId: string, year: number, month: number) {
  assertCan(principal, 'ws.view');
  await assertSector(principal, sectorId);
  const mi = monthInfo(year, month);
  const members = await prisma.wsMember.findMany({ where: { sectorId }, select: { id: true, teacherId: true, active: true, teacher: { select: { name: true, displayName: true } } } });
  const leaves = await prisma.leave.findMany({
    where: { teacherId: { in: members.map((m) => m.teacherId) }, slotId: null, startDate: { lte: toUtc(addDays(mi.last, 60)) }, endDate: { gte: toUtc(addDays(mi.first, -60)) } },
    include: { teacher: { select: { name: true, displayName: true } }, substitute: { select: { name: true } } },
    orderBy: [{ startDate: 'desc' }],
  });
  return {
    members: members.filter((m) => m.active).map((m) => ({ id: m.id, teacherId: m.teacherId, name: m.teacher.displayName || m.teacher.name })),
    leaves: leaves.map((l) => ({ id: l.id, teacherId: l.teacherId, name: l.teacher.displayName || l.teacher.name, type: l.type, start: fromUtc(l.startDate), end: fromUtc(l.endDate), notes: l.notes, substitute: l.substitute?.name ?? null, cancelled: !!l.cancelledAt })),
  };
}

const absenceSchema = z.object({
  memberId: z.string().uuid(),
  type: z.enum(['FERIAS', 'ATESTADO', 'AFASTAMENTO', 'FOLGA', 'FALTA', 'INDISPONIVEL']),
  startDate: z.string().refine(isIsoDate, 'Data inicial inválida.'),
  endDate: z.string().refine(isIsoDate, 'Data final inválida.'),
  substituteMemberId: z.string().uuid().nullable().or(z.literal('').transform(() => null)).default(null),
  notes: text(500),
});

/** Registra a ausência no cadastro único (leaves): vale para a escala e, se a pessoa dá aula, para as aulas. A escala publicada não muda sozinha. */
export async function saveAbsence(principal: P | null, sectorId: string, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'ws.edit');
  const d = parse(absenceSchema, input);
  await assertSector(principal, sectorId);
  const [m, sub] = await Promise.all([
    prisma.wsMember.findFirst({ where: { id: d.memberId, sectorId } }),
    d.substituteMemberId ? prisma.wsMember.findFirst({ where: { id: d.substituteMemberId, sectorId } }) : null,
  ]);
  if (!m) throw new NotFoundError('Colaborador não encontrado na equipe.');
  if (d.substituteMemberId && !sub) throw new NotFoundError('Substituto não encontrado na equipe.');
  return saveLeave(principal, m.teacherId, {
    type: d.type, startDate: d.startDate, endDate: d.endDate, notes: d.notes ?? undefined,
    coverage: sub ? 'SUBSTITUIR' : 'PENDENTE', substituteId: sub?.teacherId ?? null,
  }, meta, { scopeChecked: true });
}

export async function cancelAbsence(principal: P | null, sectorId: string, leaveId: string, meta: RequestMeta) {
  assertCan(principal, 'ws.edit');
  await assertSector(principal, sectorId);
  const l = await prisma.leave.findUnique({ where: { id: leaveId }, select: { teacherId: true } });
  if (!l || !(await prisma.wsMember.findFirst({ where: { sectorId, teacherId: l.teacherId } }))) throw new NotFoundError('Ausência não encontrada neste setor.');
  return cancelLeave(principal, leaveId, meta, { scopeChecked: true });
}

// ─── Mês: carregar, gerar, editar, aprovar, publicar ──────────

const toMember = (m: { id: string; teacher: { name: string; displayName: string | null }; bond: string; mode: string; functionName: string | null; altFunctions: string[]; hours: unknown; weeklyMin: number; fixedOff: number[]; availableDays: number[]; saturday: boolean; sunday: boolean; holiday: boolean; autoSchedule: boolean }): Member => ({
  id: m.id, name: m.teacher.displayName || m.teacher.name, bond: m.bond as Bond, mode: m.mode as Member['mode'], functionName: m.functionName, altFunctions: m.altFunctions,
  hours: (m.hours ?? {}) as MemberHours, weeklyMin: m.weeklyMin, fixedOff: m.fixedOff, availableDays: m.availableDays, saturday: m.saturday, sunday: m.sunday, holiday: m.holiday, autoSchedule: m.autoSchedule,
});

const toCell = (c: { kind: string; startMin: number | null; endMin: number | null; breakMin: number | null; note: string | null; manual: boolean }): Cell => ({ kind: c.kind as CellKind, startMin: c.startMin, endMin: c.endMin, breakMin: c.breakMin, note: c.note, manual: c.manual });

const prevMonth = (y: number, m: number) => (m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 });
const nextMonth = (y: number, m: number) => (m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 });

/** Tudo que o motor e a validação precisam (calendário real, equipe, regras, ausências, vizinhos). */
async function context(db: Tx, sectorId: string, year: number, month: number) {
  const mi = monthInfo(year, month);
  const sector = await db.wsSector.findUniqueOrThrow({ where: { id: sectorId } });
  const p = prevMonth(year, month);
  const n = nextMonth(year, month);
  const [settings, holidays, overrides, membersRaw, posts, rules, schedule, prevS, nextS] = await Promise.all([
    db.appSettings.findUnique({ where: { id: 1 }, select: { nacaoHours: true } }),
    db.holiday.findMany({ where: { date: { gte: toUtc(mi.rangeStart), lte: toUtc(mi.rangeEnd) } } }),
    db.wsDayOverride.findMany({ where: { date: { gte: toUtc(mi.rangeStart), lte: toUtc(mi.rangeEnd) }, OR: [{ sectorId: null }, { sectorId }] }, include: { event: { select: { name: true } } } }),
    db.wsMember.findMany({ where: { sectorId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], include: { teacher: { select: { name: true, displayName: true, phone: true } } } }),
    db.wsPost.findMany({ where: { sectorId, active: true }, orderBy: [{ sortOrder: 'asc' }, { startMin: 'asc' }] }),
    db.wsRule.findMany({ where: { sectorId, active: true }, orderBy: { createdAt: 'asc' } }),
    db.wsSchedule.findUnique({ where: { sectorId_year_month: { sectorId, year, month } }, include: { cells: true } }),
    db.wsSchedule.findUnique({ where: { sectorId_year_month: { sectorId, year: p.y, month: p.m } }, include: { cells: { where: { date: { gte: toUtc(mi.rangeStart) } } } } }),
    db.wsSchedule.findUnique({ where: { sectorId_year_month: { sectorId, year: n.y, month: n.m } }, include: { cells: { where: { date: { lte: toUtc(mi.rangeEnd) } } } } }),
  ]);
  const ovs: Override[] = overrides.map((o) => ({ date: fromUtc(o.date), sectorId: o.sectorId, closed: o.closed, hours: (o.hours as [number, number][] | null) ?? null, reason: o.reason, eventName: o.event?.name ?? null, extraPeople: o.extraPeople, confirmed: o.confirmed }));
  const cal = { sectorId, sectorHours: sector.hours as HoursMap, nacaoHours: (settings?.nacaoHours ?? {}) as HoursMap, holidays: new Map(holidays.map((h) => [fromUtc(h.date), { name: h.name, scope: h.scope }])), overrides: ovs, holidayMode: sector.holidayMode, holidayConfirm: sector.holidayConfirm };
  const days = new Map<IsoDate, DayPlan>(eachDay(mi.rangeStart, mi.rangeEnd).map((d) => [d, resolveDay(d, cal)]));
  // Ativos + quem já está na escala salva deste mês (mesmo desativado depois).
  const inSchedule = new Set(schedule?.cells.map((c) => c.memberId));
  const membersDb = membersRaw.filter((m) => m.active || inSchedule.has(m.id));
  const members = membersDb.map(toMember);
  const leaves = await db.leave.findMany({
    where: { teacherId: { in: membersDb.map((m) => m.teacherId) }, cancelledAt: null, slotId: null, startDate: { lte: toUtc(mi.rangeEnd) }, endDate: { gte: toUtc(mi.rangeStart) } },
    include: { substitute: { select: { name: true, displayName: true } } },
  });
  const memberOfTeacher = new Map(membersDb.map((m) => [m.teacherId, m.id]));
  const absences: Absence[] = leaves.map((l) => ({ memberId: memberOfTeacher.get(l.teacherId)!, start: fromUtc(l.startDate), end: fromUtc(l.endDate), type: l.type, substituteName: l.substitute ? l.substitute.displayName || l.substitute.name : null }));
  const legalRows = await db.wsLegalParam.findMany({ where: { validFrom: { lte: toUtc(mi.first) } }, orderBy: { validFrom: 'desc' } });
  const legal: Partial<Record<string, LegalParams>> = {};
  for (const r of legalRows) {
    if (legal[r.bond]) continue;
    legal[r.bond] = { bond: r.bond as Bond, validFrom: fromUtc(r.validFrom), maxDailyMin: r.maxDailyMin, maxDailyExtraMin: r.maxDailyExtraMin, maxWeeklyMin: r.maxWeeklyMin, minRestBetweenMin: r.minRestBetweenMin, maxConsecutiveDays: r.maxConsecutiveDays, sundayOffEveryWeeks: r.sundayOffEveryWeeks, breakLongOverMin: r.breakLongOverMin, breakLongMin: r.breakLongMin, breakShortOverMin: r.breakShortOverMin, breakShortMin: r.breakShortMin, maxBreakMin: r.maxBreakMin, validated: !!r.validatedAt };
  }
  const prior: Grid = {};
  for (const c of prevS?.cells ?? []) (prior[c.memberId] ??= {})[fromUtc(c.date)] = toCell(c);
  const after: Grid = {};
  for (const c of nextS?.cells ?? []) (after[c.memberId] ??= {})[fromUtc(c.date)] = toCell(c);
  // A mesma pessoa em outros setores no mês (mesmo horário = conflito).
  const others = await db.wsCell.findMany({
    where: { kind: 'TRABALHO', date: { gte: toUtc(mi.first), lte: toUtc(mi.last) }, member: { teacherId: { in: membersDb.map((m) => m.teacherId) }, sectorId: { not: sectorId } } },
    include: { member: { select: { teacherId: true, sector: { select: { name: true } } } } },
  });
  const elsewhere = others.filter((c) => memberOfTeacher.has(c.member.teacherId)).map((c) => ({ memberId: memberOfTeacher.get(c.member.teacherId)!, date: fromUtc(c.date), startMin: c.startMin ?? 0, endMin: c.endMin ?? 0, sector: c.member.sector.name }));
  // Feriados já trabalhados (rodízio) e saldo do banco de horas dos meses anteriores deste setor.
  const pastHolidays = await db.holiday.findMany({ where: { date: { lt: toUtc(mi.first), gte: toUtc(addDays(mi.first, -730)) }, scope: { not: 'FACULTATIVO' } }, select: { date: true } });
  const holidayHistory: Record<string, number> = {};
  const holidayLast: Record<string, IsoDate> = {};
  if (pastHolidays.length) {
    const worked = await db.wsCell.findMany({ where: { kind: 'TRABALHO', date: { in: pastHolidays.map((h) => h.date) }, schedule: { sectorId } }, select: { memberId: true, date: true } });
    for (const w of worked) {
      holidayHistory[w.memberId] = (holidayHistory[w.memberId] ?? 0) + 1;
      const d = fromUtc(w.date);
      if (!holidayLast[w.memberId] || d > holidayLast[w.memberId]!) holidayLast[w.memberId] = d;
    }
  }
  const previous = await db.wsSchedule.findMany({ where: { sectorId, OR: [{ year: { lt: year } }, { year, month: { lt: month } }] }, select: { analysis: true } });
  const bankCarry: Record<string, number> = {};
  for (const s of previous) {
    for (const st of ((s.analysis as { members?: { memberId: string; balanceMin: number | null }[] })?.members ?? [])) {
      if (st.balanceMin != null) bankCarry[st.memberId] = (bankCarry[st.memberId] ?? 0) + st.balanceMin;
    }
  }
  const domainPosts: Post[] = posts.map((p) => ({ id: p.id, name: p.name, kind: p.kind, startMin: p.startMin, endMin: p.endMin, weekdays: p.weekdays, minPeople: p.minPeople, functionName: p.functionName, mandatory: p.mandatory }));
  const domainRules: Rule[] = rules.map((r) => ({ id: r.id, kind: r.kind, label: r.label, params: r.params as Record<string, unknown>, mandatory: r.mandatory }));
  return { mi, sector, days, members, membersDb, posts: domainPosts, rules: domainRules, absences, legal, prior, after, elsewhere, schedule, cycleRef: fromUtc(sector.cycleRef), holidayHistory, holidayLast, bankCarry };
}

type Ctx = Awaited<ReturnType<typeof context>>;

function gridOf(c: Ctx, cells: { memberId: string; date: Date; kind: string; startMin: number | null; endMin: number | null; breakMin: number | null; note: string | null; manual: boolean }[]): Grid {
  const g: Grid = {};
  for (const m of c.members) g[m.id] = { ...(c.prior[m.id] ?? {}), ...(c.after[m.id] ?? {}) };
  for (const x of cells) (g[x.memberId] ??= {})[fromUtc(x.date)] = toCell(x);
  return g;
}

function analyze(c: Ctx, grid: Grid): Analysis {
  return validate({ month: c.mi, days: c.days, members: c.members, posts: c.posts, rules: c.rules, absences: c.absences, cycleRef: c.cycleRef, grid, legal: c.legal, elsewhere: c.elsewhere, bankCarry: c.bankCarry });
}

export interface MonthView {
  month: MonthInfo;
  sector: { id: string; name: string; cycleRef: IsoDate };
  days: DayPlan[];
  members: (Member & { teacherId: string; active: boolean; hasPhone: boolean })[];
  posts: Post[];
  rules: (Rule & { description: string })[];
  absences: Absence[];
  legal: Partial<Record<string, LegalParams>>;
  schedule: { id: string; status: string; generatedAt: string | null; approvedAt: string | null; publishedAt: string | null } | null;
  grid: Grid;
  analysis: Analysis | null;
  can: { edit: boolean; publish: boolean };
}

export async function loadMonth(principal: P | null, sectorId: string, year: number, month: number): Promise<MonthView> {
  assertCan(principal, 'ws.view');
  await assertSector(principal, sectorId);
  const c = await context(prisma, sectorId, year, month);
  const grid = c.schedule ? gridOf(c, c.schedule.cells) : {};
  const nameOf = new Map(c.members.map((m) => [m.id, m.name]));
  return {
    month: c.mi,
    sector: { id: c.sector.id, name: c.sector.name, cycleRef: c.cycleRef },
    days: [...c.days.values()],
    // O telefone não vai para a tela (dado pessoal): só se existe no cadastro.
    members: c.members.map((m) => { const db = c.membersDb.find((x) => x.id === m.id)!; return { ...m, teacherId: db.teacherId, active: db.active, hasPhone: !!db.teacher.phone }; }),
    posts: c.posts,
    rules: c.rules.map((r) => ({ ...r, description: describeRule(r.kind, r.params, (id) => nameOf.get(id) ?? '—') })),
    absences: c.absences,
    legal: c.legal,
    schedule: c.schedule ? { id: c.schedule.id, status: c.schedule.status, generatedAt: c.schedule.generatedAt?.toISOString() ?? null, approvedAt: c.schedule.approvedAt?.toISOString() ?? null, publishedAt: c.schedule.publishedAt?.toISOString() ?? null } : null,
    grid,
    // Sempre recalculada: ausência lançada depois da publicação aparece aqui (sem mudar a escala).
    analysis: c.schedule ? analyze(c, grid) : null,
    can: { edit: can(principal, 'ws.edit'), publish: can(principal, 'ws.publish') },
  };
}

export async function generateSchedule(principal: P | null, sectorId: string, year: number, month: number, meta: RequestMeta) {
  assertCan(principal, 'ws.edit');
  return prisma.$transaction(async (tx) => {
    const s = await assertSector(principal, sectorId, tx);
    const c = await context(tx, sectorId, year, month);
    if (c.schedule && c.schedule.status !== 'RASCUNHO') throw new AppError('A escala deste mês já foi aprovada/publicada. Reabra para edição antes de gerar de novo.');
    if (!c.members.some((m) => m.mode === 'FIXO' && m.autoSchedule && (m.hours.base || m.hours.week))) throw new AppError('Nenhum colaborador com horário habitual na equipe: cadastre a equipe antes de gerar.');
    const out = generate({ month: c.mi, days: c.days, members: c.members, posts: c.posts, rules: c.rules, absences: c.absences, cycleRef: c.cycleRef, prior: c.prior, holidayRotate: c.sector.holidayRotate, holidayHistory: c.holidayHistory, holidayLast: c.holidayLast, holidayStaff: c.sector.holidayStaff });
    const sched = c.schedule ?? await tx.wsSchedule.create({ data: { sectorId, year, month } });
    await tx.wsCell.deleteMany({ where: { scheduleId: sched.id } });
    const rows = c.members.flatMap((m) => c.mi.days.map((d) => {
      const x = out.grid[m.id]![d]!;
      return { scheduleId: sched.id, memberId: m.id, date: toUtc(d), kind: x.kind, startMin: x.startMin ?? null, endMin: x.endMin ?? null, breakMin: x.breakMin ?? null, note: x.note ?? null, manual: false };
    }));
    await tx.wsCell.createMany({ data: rows });
    const grid = gridOf(c, rows);
    const analysis = analyze(c, grid);
    analysis.alerts.unshift(...out.alerts.filter((a) => !analysis.alerts.some((b) => b.message === a.message)));
    await tx.wsSchedule.update({ where: { id: sched.id }, data: { analysis: analysis as object, generatedAt: new Date() } });
    await audit(tx, ctx(principal, meta), { action: 'ws.schedule.generated', entityType: 'ws_schedule', entityId: sched.id, after: { setor: s.name, mes: c.mi.label, classificacao: analysis.classification, alertas: analysis.alerts.length }, summary: `${principal.name} gerou a escala de ${s.name} — ${c.mi.label}` });
    return { id: sched.id, classification: analysis.classification };
  }, { timeout: 60_000, maxWait: 10_000 });
}

async function editable(tx: Tx, principal: P, scheduleId: string) {
  const sch = await tx.wsSchedule.findUnique({ where: { id: scheduleId }, include: { sector: { select: { name: true } } } });
  if (!sch) throw new NotFoundError('Escala não encontrada.');
  await assertSector(principal, sch.sectorId, tx);
  if (sch.status !== 'RASCUNHO') throw new AppError('Escala aprovada/publicada: reabra para edição antes de mudar.');
  return sch;
}

async function reanalyze(tx: Tx, sch: { id: string; sectorId: string; year: number; month: number }) {
  const c = await context(tx, sch.sectorId, sch.year, sch.month);
  const analysis = analyze(c, gridOf(c, c.schedule!.cells));
  await tx.wsSchedule.update({ where: { id: sch.id }, data: { analysis: analysis as object } });
  return analysis;
}

/** Edição manual de um dia: salva e roda de novo a verificação de cobertura e jornada. */
export async function editCell(principal: P | null, scheduleId: string, memberId: string, date: string, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'ws.edit');
  const d = parse(cellSchema, input);
  if (!isIsoDate(date)) throw new AppError('Data inválida.');
  return prisma.$transaction(async (tx) => {
    const sch = await editable(tx, principal, scheduleId);
    const mi = monthInfo(sch.year, sch.month);
    if (date < mi.first || date > mi.last) throw new AppError('Data fora do mês da escala.');
    const m = await tx.wsMember.findFirst({ where: { id: memberId, sectorId: sch.sectorId }, include: { teacher: { select: { name: true } } } });
    if (!m) throw new NotFoundError('Colaborador não encontrado na equipe.');
    const work = d.kind === 'TRABALHO';
    const data = { kind: d.kind, startMin: work ? d.startMin! : null, endMin: work ? d.endMin! : null, breakMin: work ? (d.breakMin ?? 0) : null, note: d.note, manual: true };
    const before = await tx.wsCell.findUnique({ where: { scheduleId_memberId_date: { scheduleId, memberId, date: toUtc(date) } } });
    await tx.wsCell.upsert({ where: { scheduleId_memberId_date: { scheduleId, memberId, date: toUtc(date) } }, update: data, create: { ...data, scheduleId, memberId, date: toUtc(date) } });
    await audit(tx, ctx(principal, meta), { action: 'ws.cell.edited', entityType: 'ws_schedule', entityId: scheduleId, before, after: data, summary: `${principal.name} editou a escala de ${sch.sector.name}: ${m.teacher.name} em ${formatDateBR(date)} (${d.kind.toLowerCase()})` });
    return reanalyze(tx, sch);
  }, { timeout: 60_000, maxWait: 10_000 });
}

/** Troca de folga: troca dois dias (da mesma pessoa ou de duas pessoas). */
export async function swapCells(principal: P | null, scheduleId: string, a: { memberId: string; date: string }, b: { memberId: string; date: string }, meta: RequestMeta) {
  assertCan(principal, 'ws.edit');
  return prisma.$transaction(async (tx) => {
    const sch = await editable(tx, principal, scheduleId);
    const get = (x: { memberId: string; date: string }) => tx.wsCell.findUnique({ where: { scheduleId_memberId_date: { scheduleId, memberId: x.memberId, date: toUtc(x.date) } } });
    const [ca, cb] = await Promise.all([get(a), get(b)]);
    if (!ca || !cb) throw new NotFoundError('Dia não encontrado na escala.');
    const pick = (c: typeof ca) => ({ kind: c.kind, startMin: c.startMin, endMin: c.endMin, breakMin: c.breakMin, note: c.note ? `${c.note} (troca)` : 'Troca de folga', manual: true });
    await tx.wsCell.update({ where: { id: ca.id }, data: pick(cb) });
    await tx.wsCell.update({ where: { id: cb.id }, data: pick(ca) });
    await audit(tx, ctx(principal, meta), { action: 'ws.cell.swapped', entityType: 'ws_schedule', entityId: scheduleId, after: { a, b }, summary: `${principal.name} trocou ${formatDateBR(a.date)} por ${formatDateBR(b.date)} na escala de ${sch.sector.name}` });
    return reanalyze(tx, sch);
  }, { timeout: 60_000, maxWait: 10_000 });
}

export async function setScheduleStatus(principal: P | null, scheduleId: string, status: 'RASCUNHO' | 'APROVADA' | 'PUBLICADA', meta: RequestMeta) {
  assertCan(principal, 'ws.publish');
  return prisma.$transaction(async (tx) => {
    const sch = await tx.wsSchedule.findUnique({ where: { id: scheduleId }, include: { sector: { select: { name: true } } } });
    if (!sch) throw new NotFoundError('Escala não encontrada.');
    await assertSector(principal, sch.sectorId, tx);
    if (status !== 'RASCUNHO') {
      const c = await context(tx, sch.sectorId, sch.year, sch.month);
      const a = analyze(c, gridOf(c, c.schedule!.cells));
      if (a.classification === 'COM_CONFLITO') throw new AppError(`A escala tem ${a.alerts.filter((x) => x.level === 'CONFLITO').length} conflito(s) impeditivo(s): corrija antes de ${status === 'PUBLICADA' ? 'publicar' : 'aprovar'}.`);
      if (status === 'PUBLICADA' && sch.status === 'RASCUNHO') throw new AppError('Aprove a escala antes de publicar.');
      await tx.wsSchedule.update({ where: { id: scheduleId }, data: { analysis: a as object } });
    }
    const label = { RASCUNHO: 'reabriu para edição', APROVADA: 'aprovou', PUBLICADA: 'publicou' }[status];
    await tx.wsSchedule.update({
      where: { id: scheduleId },
      data: {
        status,
        ...(status === 'APROVADA' ? { approvedAt: new Date(), approvedBy: principal.id } : {}),
        ...(status === 'PUBLICADA' ? { publishedAt: new Date(), publishedBy: principal.id } : {}),
      },
    });
    const mi = monthInfo(sch.year, sch.month);
    await audit(tx, ctx(principal, meta), { action: `ws.schedule.${status.toLowerCase()}`, entityType: 'ws_schedule', entityId: scheduleId, before: { status: sch.status }, after: { status }, summary: `${principal.name} ${label} a escala de ${sch.sector.name} — ${mi.label}` });
  }, { timeout: 60_000, maxWait: 10_000 });
}

// ─── WhatsApp: escala do mês para cada pessoa ─────────────────

export function wsWhatsAppStatus() {
  const c = zapiConfig();
  return { configured: c.configured, testMode: !!c.testPhone };
}

function messageFor(v: MonthView, memberId: string) {
  const m = v.members.find((x) => x.id === memberId);
  if (!m) throw new NotFoundError('Colaborador não encontrado na escala.');
  const st = v.analysis?.members.find((x) => x.memberId === memberId);
  const monthDays = v.days.filter((d) => d.date >= v.month.first && d.date <= v.month.last);
  return memberScheduleText({
    sector: v.sector.name, monthLabel: v.month.label, status: v.schedule!.status, name: m.name, days: monthDays,
    cells: Object.fromEntries(monthDays.map((d) => [d.date, v.grid[m.id]?.[d.date]])), minutes: st?.minutes ?? 0, workDays: st?.days ?? 0, offs: st?.offs ?? 0,
  });
}

/** Envia a escala do mês de uma pessoa (texto editado na tela; destino vazio = telefone do cadastro). */
export async function sendMemberSchedule(principal: P | null, scheduleId: string, memberId: string, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'ws.edit');
  const d = parse(z.object({ to: text(60), text: z.string().trim().min(10, 'A mensagem está vazia.').max(4000, 'Mensagem longa demais para o WhatsApp.') }), input);
  const v = await scheduleById(principal, scheduleId);
  const m = await prisma.wsMember.findFirst({ where: { id: memberId, sectorId: v.sector.id }, include: { teacher: { select: { phone: true, name: true } } } });
  if (!m) throw new NotFoundError('Colaborador não encontrado na equipe.');
  const to = d.to ?? m.teacher.phone;
  if (!to) throw new AppError(`${m.teacher.name} não tem telefone no cadastro: informe o número.`);
  const r = await deliverWhatsApp({ kind: 'ESCALA', to, text: d.text, actor: { id: principal.id, name: principal.name }, meta });
  if (r.error) throw new AppError(r.error);
  return { status: r.status, testMode: r.testMode, to: r.to };
}

/** Envia a escala individual para toda a equipe (quem tem telefone e está na escala do mês). */
export async function sendTeamSchedules(principal: P | null, scheduleId: string, meta: RequestMeta) {
  assertCan(principal, 'ws.edit');
  const v = await scheduleById(principal, scheduleId);
  const rows = await prisma.wsMember.findMany({ where: { sectorId: v.sector.id, active: true }, include: { teacher: { select: { phone: true, name: true, displayName: true } } }, orderBy: { sortOrder: 'asc' } });
  const sent: string[] = [];
  const noPhone: string[] = [];
  const failed: string[] = [];
  for (const m of rows) {
    const name = m.teacher.displayName || m.teacher.name;
    const cells = v.grid[m.id] ?? {};
    if (!v.month.days.some((d) => cells[d]?.kind === 'TRABALHO')) continue; // fora da escala do mês (ex.: sem grade)
    if (!m.teacher.phone) { noPhone.push(name); continue; }
    const r = await deliverWhatsApp({ kind: 'ESCALA', to: m.teacher.phone, text: messageFor(v, m.id), actor: { id: principal.id, name: principal.name }, meta }).catch((e: unknown) => ({ error: e instanceof Error ? e.message : 'falha' }));
    (r.error ? failed : sent).push(name);
  }
  return { sent, noPhone, failed, testMode: !!zapiConfig().testPhone };
}

/** Para a impressão / planilha. */
export async function scheduleById(principal: P | null, id: string) {
  assertCan(principal, 'ws.view');
  const s = await prisma.wsSchedule.findUnique({ where: { id }, select: { sectorId: true, year: true, month: true } });
  if (!s) throw new NotFoundError('Escala não encontrada.');
  return loadMonth(principal, s.sectorId, s.year, s.month);
}

/**
 * Carrega os 4 setores do documento (equipe, grade semanal A/B, postos e regras).
 * Idempotente: setor que já existe (pelo nome) é pulado. Cria as pessoas no
 * cadastro com o setor no nome (há homônimos, ex.: duas Déboras).
 */
export async function loadDocumentModels(principal: P | null, meta: RequestMeta) {
  assertCan(principal, 'ws.admin');
  const created: string[] = [];
  const skipped: string[] = [];
  for (const model of DOCUMENT_MODELS) {
    await prisma.$transaction(async (tx) => {
      if (await tx.wsSector.findFirst({ where: { name: { equals: model.name, mode: 'insensitive' } } })) { skipped.push(model.name); return; }
      const proc = model.procSector ? await tx.procSector.findFirst({ where: { name: model.procSector }, select: { id: true } }) : null;
      const sector = await tx.wsSector.create({ data: { name: model.name, procSectorId: proc?.id ?? null, hours: model.hours, cycleRef: toUtc(MODEL_CYCLE_REF), notes: model.notes, sortOrder: DOCUMENT_MODELS.indexOf(model), holidayMode: model.holidayMode ?? null, holidayConfirm: model.holidayConfirm ?? false, holidayRotate: model.holidayRotate ?? false, holidayStaff: model.holidayStaff ?? null } });
      const ids = new Map<string, string>();
      for (const [i, m] of model.members.entries()) {
        const t = await tx.teacher.findFirst({ where: { name: m.name } }) ?? await tx.teacher.create({ data: { name: m.name, displayName: m.display, createdById: principal.id, notes: `Cadastrado pelo modelo de escala (${model.name}).` } });
        const row = await tx.wsMember.create({
          data: {
            sectorId: sector.id, teacherId: t.id, functionName: m.functionName, altFunctions: m.altFunctions ?? [], bond: m.bond, mode: m.mode ?? 'FIXO',
            hours: m.week ? { week: m.week } : {}, weeklyMin: m.bond === 'FUNAP' ? 2640 : 2400, fixedOff: m.fixedOff ?? [], availableDays: m.availableDays ?? [],
            autoSchedule: m.autoSchedule ?? true, notes: m.notes ?? null, sortOrder: i,
          },
        });
        ids.set(`@${m.key}`, row.id);
      }
      for (const [i, p] of model.posts.entries()) {
        await tx.wsPost.create({ data: { sectorId: sector.id, name: p.name, kind: p.kind, startMin: p.start, endMin: p.end, weekdays: p.weekdays, minPeople: p.min, functionName: p.functionName ?? null, mandatory: p.mandatory ?? true, sortOrder: i } });
      }
      const nameOf = new Map(model.members.map((m) => [ids.get(`@${m.key}`)!, m.display]));
      for (const r of model.rules) {
        const params = JSON.parse(JSON.stringify(r.params).replace(/"@[a-z]+"/g, (k) => JSON.stringify(ids.get(k.slice(1, -1)) ?? k)));
        const ok = parseRule(r.kind, params);
        if (!ok.ok) throw new AppError(`Modelo ${model.name}: ${ok.error}`);
        await tx.wsRule.create({ data: { sectorId: sector.id, kind: r.kind, label: r.label ?? describeRule(r.kind, ok.params, (x) => nameOf.get(x) ?? '—'), params: ok.params as object, mandatory: r.mandatory } });
      }
      await audit(tx, ctx(principal, meta), { action: 'ws.model.loaded', entityType: 'ws_sector', entityId: sector.id, after: { setor: model.name, pessoas: model.members.length, postos: model.posts.length, regras: model.rules.length }, summary: `${principal.name} carregou o modelo de escala ${model.name} (documento Escala de Trabalho 5x2)` });
      created.push(model.name);
    }, { timeout: 60_000, maxWait: 10_000 });
  }
  // Parâmetros CLT de partida (escala de 40h), para o DP conferir e validar.
  if (!(await prisma.wsLegalParam.findFirst({ where: { bond: 'CLT' } }))) {
    await saveLegal(principal, null, {
      bond: 'CLT', validFrom: '2026-01-01', maxDailyMin: 480, maxDailyExtraMin: 120, maxWeeklyMin: 2400, minRestBetweenMin: 660, maxConsecutiveDays: 6,
      sundayOffEveryWeeks: 3, breakLongOverMin: 360, breakLongMin: 60, breakShortOverMin: 240, breakShortMin: 15, validated: false,
      notes: 'Escala da Nação: 40h semanais e 8h efetivas por dia. Documento cita a EC 141/2026 (transição para 42h em 15/12/2026 e 40h em dez/2027, dois repousos semanais). Domingo: CLT art. 386 prevê descanso dominical quinzenal para mulheres; comércio: 1 domingo a cada 3 semanas. DP: conferir com contratos e CCT antes de validar.',
    }, meta);
  }
  return { created, skipped };
}

export const RULE_KIND_OPTIONS = (Object.keys(RULE_KINDS) as RuleKind[]).map((k) => ({ value: k, label: RULE_KINDS[k].label, help: RULE_KINDS[k].help }));
