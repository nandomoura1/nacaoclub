import { z } from 'zod';
import { prisma } from '@/server/db';
import { audit } from '@/server/audit';
import { assertCan, can } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import type { RequestMeta } from '@/server/auth/session';
import { AppError, NotFoundError } from '@/server/errors';
import { fromUtc, toUtc, type IsoDate } from '@/domain/dates';
import { DEFAULT_VALUES, NO_OVERRIDES, applyOverrides, awardPeriod, awardTotal, daysIn, lostLabel, maxOf, payDay, suggest, type AwardOverrides, type AwardState, type AwardValues } from '@/domain/premiacao';

/**
 * Premiação (Escalas 5x2 → Premiação; `award.view` / `award.edit` = Administrador e DP/Financeiro).
 * Gratificação mensal: competência do dia 15 ao dia 14 do mês seguinte, paga no dia 15 ("AAAA-MM" = mês do pagamento). Quem participa fica em `award_people`
 * (equipe + valor de cada critério); a avaliação do mês em `award_months` (sem linha = sugestão do sistema,
 * pelas faltas/atestados lançados e pela admissão). Fechar o mês congela os valores (`award_closures.snapshot`).
 */

type P = Principal;
const MONTH = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mês inválido.');
const CENTS = z.number().int().min(0).max(500_000);
const parse = <S extends z.ZodType>(s: S, v: unknown): z.output<S> => {
  const r = s.safeParse(v);
  if (!r.success) throw new AppError(r.error.issues[0]?.message ?? 'Dados inválidos.');
  return r.data;
};
const brl = (c: number) => `R$ ${(c / 100).toFixed(2).replace('.', ',')}`;
const actx = (p: Principal, meta: RequestMeta) => ({ actorId: p.id, ...meta });

/** Vínculos da escala 5x2 que entram na Premiação automaticamente. */
const AWARD_BONDS = ['CLT', 'FUNAP', 'ESTAGIO'] as const;

export interface AwardRow {
  teacherId: string; name: string; group: string; bond: string; values: AwardValues; max: number;
  /** De onde veio: equipe da escala 5x2 ou incluído à mão (professores e outros). */
  source: 'escala' | 'incluido';
  /** Onde lançar falta/atestado pela tela (equipe da escala). */
  ref: { sectorId: string; memberId: string } | null;
  faltas: string[]; atestados: string[]; lateCount: number;
  leaves: { id: string; type: string; start: string; end: string }[];
  auto: AwardState; overrides: AwardOverrides; state: AwardState;
  reasons: string[]; total: number; note: string | null; lost: string; reviewed: boolean;
}

async function computeRows(month: string): Promise<AwardRow[]> {
  const per = awardPeriod(month);
  const [members, people] = await Promise.all([
    prisma.wsMember.findMany({
      where: { active: true, bond: { in: [...AWARD_BONDS] }, sector: { active: true }, teacher: { active: true } },
      orderBy: [{ sector: { sortOrder: 'asc' } }, { sector: { name: 'asc' } }],
      select: { id: true, sectorId: true, bond: true, teacherId: true, sector: { select: { name: true } } },
    }),
    prisma.awardPerson.findMany(),
  ]);
  const cfg = new Map(people.map((p) => [p.teacherId, p]));
  // Equipe da escala (1ª equipe da pessoa) + incluídos à mão; "tirado da Premiação" (active = false) fica de fora.
  const base = new Map<string, { group: string; bond: string; ref: AwardRow['ref']; source: AwardRow['source'] }>();
  for (const m of members) if (!base.has(m.teacherId)) base.set(m.teacherId, { group: m.sector.name, bond: m.bond, ref: { sectorId: m.sectorId, memberId: m.id }, source: 'escala' });
  for (const p of people) if (!base.has(p.teacherId)) base.set(p.teacherId, { group: p.groupName, bond: '', ref: null, source: 'incluido' });
  const saved = new Map((await prisma.awardMonth.findMany({ where: { month } })).map((x) => [x.teacherId, x]));
  const ids = [...base.keys()].filter((id) => cfg.get(id)?.active !== false || saved.has(id));
  const [teachers, leaves] = await Promise.all([
    prisma.teacher.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, admissionDate: true, active: true, contractType: { select: { name: true } }, position: { select: { name: true } } } }),
    prisma.leave.findMany({
      where: { teacherId: { in: ids }, cancelledAt: null, slotId: null, type: { in: ['FALTA', 'ATESTADO'] }, startDate: { lte: toUtc(per.last) }, endDate: { gte: toUtc(per.first) } },
      select: { id: true, teacherId: true, type: true, startDate: true, endDate: true }, orderBy: { startDate: 'asc' },
    }),
  ]);
  return teachers.filter((t) => t.active || saved.has(t.id)).map((t): AwardRow => {
    const b = base.get(t.id)!, c = cfg.get(t.id), sv = saved.get(t.id);
    const values: AwardValues = c ? { productivity: c.productivityCents, punctuality: c.punctualityCents, attendance: c.attendanceCents } : DEFAULT_VALUES;
    const ls = leaves.filter((l) => l.teacherId === t.id).map((l) => ({ id: l.id, type: l.type, start: fromUtc(l.startDate), end: fromUtc(l.endDate) }));
    const lateCount = sv?.lateCount ?? 0;
    const sug = suggest(ls, per.first, per.last, t.admissionDate ? (fromUtc(t.admissionDate) as IsoDate) : null, lateCount);
    const overrides: AwardOverrides = sv ? { productivity: sv.productivity, punctuality: sv.punctuality, attendance: sv.attendance } : NO_OVERRIDES;
    const state = applyOverrides(sug.state, overrides, sv?.extraCents ?? 0);
    return {
      teacherId: t.id, name: t.name, group: c?.groupName ?? b.group, bond: b.bond || t.contractType?.name || t.position?.name || '—',
      values, max: maxOf(values), source: b.source, ref: b.ref,
      faltas: daysIn(ls, 'FALTA', per.first, per.last), atestados: daysIn(ls, 'ATESTADO', per.first, per.last), lateCount, leaves: ls,
      auto: sug.state, overrides, state, reasons: sug.reasons, total: awardTotal(values, state),
      note: sv?.note ?? null, lost: lostLabel(state),
      reviewed: !!sv && (Object.values(overrides).some((v) => v !== null) || !!sv.extraCents || !!sv.note),
    };
  }).sort((a, b) => (a.source === b.source ? 0 : a.source === 'escala' ? -1 : 1) || a.group.localeCompare(b.group, 'pt-BR') || a.name.localeCompare(b.name, 'pt-BR'));
}

/** Painel da competência ("AAAA-MM" = mês do pagamento). Competência fechada mostra os valores congelados. */
export async function awardBoard(principal: P | null, month: string) {
  assertCan(principal, 'award.view');
  const mo = parse(MONTH, month);
  const canEdit = can(principal, 'award.edit');
  const closure = await prisma.awardClosure.findUnique({ where: { month: mo } });
  const rows = closure ? (closure.snapshot as unknown as AwardRow[]) : await computeRows(mo);
  const inRows = new Set(rows.map((r) => r.teacherId));
  const candidates = canEdit && !closure
    ? (await prisma.teacher.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, team: true } })).filter((t) => !inRows.has(t.id))
    : [];
  const groups = [...new Set([...rows.map((r) => r.group), ...(await prisma.awardPerson.findMany({ select: { groupName: true } })).map((g) => g.groupName)])].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return {
    month: mo, payDay: payDay(mo), period: awardPeriod(mo), canEdit, canEditAbsences: can(principal, 'ws.edit'), rows, candidates, groups,
    closure: closure ? { closedAt: closure.closedAt.toISOString(), paidAt: closure.paidAt?.toISOString() ?? null } : null,
  };
}
export type AwardBoard = Awaited<ReturnType<typeof awardBoard>>;

async function assertOpen(month: string) {
  if (await prisma.awardClosure.findUnique({ where: { month } })) throw new AppError('Competência fechada: reabra para alterar.');
}

const PersonSchema = z.object({
  teacherId: z.string().uuid(),
  groupName: z.string().trim().min(2, 'Informe a equipe.').max(60),
  productivity: CENTS, punctuality: CENTS, attendance: CENTS,
  note: z.string().trim().max(200).nullable().optional(),
});

/** Inclui ou altera quem participa (equipe e valor de cada critério). */
export async function saveAwardPerson(principal: P | null, input: unknown, meta: RequestMeta = {}) {
  assertCan(principal, 'award.edit');
  const v = parse(PersonSchema, input);
  return prisma.$transaction(async (tx) => {
    const t = await tx.teacher.findUnique({ where: { id: v.teacherId }, select: { name: true } });
    if (!t) throw new NotFoundError('Colaborador não encontrado.');
    const before = await tx.awardPerson.findUnique({ where: { teacherId: v.teacherId } });
    const data = { groupName: v.groupName, productivityCents: v.productivity, punctualityCents: v.punctuality, attendanceCents: v.attendance, note: v.note || null, active: true };
    await tx.awardPerson.upsert({ where: { teacherId: v.teacherId }, create: { teacherId: v.teacherId, ...data }, update: data });
    await audit(tx, actx(principal, meta), {
      action: before ? 'award.person_updated' : 'award.person_added', entityType: 'teacher', entityId: v.teacherId,
      before: before ? { equipe: before.groupName, produtividade: before.productivityCents, pontualidade: before.punctualityCents, assiduidade: before.attendanceCents } : null,
      after: { equipe: v.groupName, produtividade: v.productivity, pontualidade: v.punctuality, assiduidade: v.attendance },
      summary: `${principal.name} ${before ? 'alterou' : 'incluiu'} ${t.name} na Premiação (${v.groupName}: ${brl(v.productivity)} + ${brl(v.punctuality)} + ${brl(v.attendance)})`,
    });
  });
}

/** Inclui várias pessoas de uma vez numa equipe, com os mesmos valores. */
export async function addAwardPeople(principal: P | null, input: unknown, meta: RequestMeta = {}) {
  assertCan(principal, 'award.edit');
  const v = parse(z.object({ teacherIds: z.array(z.string().uuid()).min(1, 'Escolha alguém.').max(100), groupName: PersonSchema.shape.groupName, productivity: CENTS, punctuality: CENTS, attendance: CENTS }), input);
  for (const teacherId of v.teacherIds) await saveAwardPerson(principal, { ...v, teacherId }, meta);
  return v.teacherIds.length;
}

/** Tira da Premiação (ou volta). Não apaga: apurações antigas ficam. Vale também para quem vem da escala. */
export async function setAwardPersonActive(principal: P | null, teacherId: string, active: boolean, meta: RequestMeta = {}, groupName = 'Outros') {
  assertCan(principal, 'award.edit');
  return prisma.$transaction(async (tx) => {
    const t = await tx.teacher.findUnique({ where: { id: teacherId }, select: { name: true } });
    if (!t) throw new NotFoundError('Colaborador não encontrado.');
    await tx.awardPerson.upsert({ where: { teacherId }, create: { teacherId, groupName, active }, update: { active } });
    await audit(tx, actx(principal, meta), { action: active ? 'award.person_reactivated' : 'award.person_removed', entityType: 'teacher', entityId: teacherId, summary: `${principal.name} ${active ? 'voltou' : 'tirou'} ${t.name} ${active ? 'para a' : 'da'} Premiação` });
  });
}

const MonthSchema = z.object({
  teacherId: z.string().uuid(), month: MONTH,
  /** Correção à mão por critério (null = automático pela regra). */
  productivity: z.boolean().nullable(), punctuality: z.boolean().nullable(), attendance: z.boolean().nullable(),
  lateCount: z.number().int().min(0).max(31),
  extraCents: z.number().int().min(-500_000).max(500_000),
  note: z.string().trim().max(200).nullable().optional(),
});

/** Apuração da pessoa na competência: correções dos critérios, atrasos > 15 min, ajuste em R$ e observação. */
export async function saveAwardMonth(principal: P | null, input: unknown, meta: RequestMeta = {}) {
  assertCan(principal, 'award.edit');
  const v = parse(MonthSchema, input);
  await assertOpen(v.month);
  return prisma.$transaction(async (tx) => {
    const t = await tx.teacher.findUnique({ where: { id: v.teacherId }, select: { name: true } });
    if (!t) throw new NotFoundError('Colaborador não encontrado.');
    const id = { teacherId_month: { teacherId: v.teacherId, month: v.month } };
    const before = await tx.awardMonth.findUnique({ where: id });
    const note = v.note || null;
    const data = { productivity: v.productivity, punctuality: v.punctuality, attendance: v.attendance, lateCount: v.lateCount, extraCents: v.extraCents, note };
    const empty = v.productivity === null && v.punctuality === null && v.attendance === null && !v.lateCount && !v.extraCents && !note;
    if (empty) await tx.awardMonth.deleteMany({ where: { teacherId: v.teacherId, month: v.month } });
    else await tx.awardMonth.upsert({ where: id, create: { teacherId: v.teacherId, month: v.month, ...data }, update: data });
    const show = (x: boolean | null) => (x === null ? 'auto' : x ? 'ganhou' : 'perdeu');
    await audit(tx, actx(principal, meta), {
      action: 'award.month', entityType: 'teacher', entityId: v.teacherId,
      before: before ? { produtividade: before.productivity, pontualidade: before.punctuality, assiduidade: before.attendance, atrasos: before.lateCount, ajuste: before.extraCents, obs: before.note } : null,
      after: { mes: v.month, produtividade: v.productivity, pontualidade: v.punctuality, assiduidade: v.attendance, atrasos: v.lateCount, ajuste: v.extraCents, obs: note },
      summary: `${principal.name} apurou a Premiação de ${t.name} (${v.month}): produtividade ${show(v.productivity)}, pontualidade ${show(v.punctuality)}, assiduidade ${show(v.attendance)}, ${v.lateCount} atraso(s)${v.extraCents ? `, ajuste ${brl(v.extraCents)}` : ''}`,
    });
  });
}

/** Valores da equipe: aplica os mesmos valores a todos (da equipe na tela). */
export async function setGroupValues(principal: P | null, input: unknown, meta: RequestMeta = {}) {
  assertCan(principal, 'award.edit');
  const v = parse(z.object({ month: MONTH, group: z.string().trim().min(2).max(60), productivity: CENTS, punctuality: CENTS, attendance: CENTS }), input);
  const rows = (await computeRows(v.month)).filter((r) => r.group === v.group);
  for (const r of rows) await saveAwardPerson(principal, { teacherId: r.teacherId, groupName: r.group, productivity: v.productivity, punctuality: v.punctuality, attendance: v.attendance }, meta);
  return rows.length;
}

/** Fecha o mês: congela os valores (a tela passa a mostrar o fechado). */
export async function closeAwardMonth(principal: P | null, month: string, meta: RequestMeta = {}) {
  assertCan(principal, 'award.edit');
  const mo = parse(MONTH, month);
  await assertOpen(mo);
  const rows = await computeRows(mo);
  if (!rows.length) throw new AppError('Ninguém na Premiação desta competência.');
  const total = rows.reduce((a, r) => a + r.total, 0);
  await prisma.$transaction(async (tx) => {
    await tx.awardClosure.create({ data: { month: mo, snapshot: rows as never, closedById: principal.id } });
    await audit(tx, actx(principal, meta), { action: 'award.closed', entityType: 'award_month', entityId: mo, after: { pessoas: rows.length, total }, summary: `${principal.name} fechou a Premiação de ${mo}: ${rows.length} pessoas, ${brl(total)}` });
  });
  return total;
}

/** Reabre o mês fechado (não vale depois de pago). */
export async function reopenAwardMonth(principal: P | null, month: string, reason: string, meta: RequestMeta = {}) {
  assertCan(principal, 'award.edit');
  const mo = parse(MONTH, month);
  const why = parse(z.string().trim().min(3, 'Informe o motivo.').max(200), reason);
  const c = await prisma.awardClosure.findUnique({ where: { month: mo } });
  if (!c) throw new AppError('A competência não está fechada.');
  if (c.paidAt) throw new AppError('Premiação já paga: desmarque o pagamento antes de reabrir.');
  await prisma.$transaction(async (tx) => {
    await tx.awardClosure.delete({ where: { month: mo } });
    await audit(tx, actx(principal, meta), { action: 'award.reopened', entityType: 'award_month', entityId: mo, after: { motivo: why }, summary: `${principal.name} reabriu a Premiação de ${mo}: ${why}` });
  });
}

/** Marca (ou desmarca) o mês fechado como pago. */
export async function setAwardPaid(principal: P | null, month: string, paid: boolean, meta: RequestMeta = {}) {
  assertCan(principal, 'award.edit');
  const mo = parse(MONTH, month);
  const c = await prisma.awardClosure.findUnique({ where: { month: mo } });
  if (!c) throw new AppError('Feche a competência antes de registrar o pagamento.');
  await prisma.$transaction(async (tx) => {
    await tx.awardClosure.update({ where: { month: mo }, data: paid ? { paidAt: new Date(), paidById: principal.id } : { paidAt: null, paidById: null } });
    await audit(tx, actx(principal, meta), { action: paid ? 'award.paid' : 'award.unpaid', entityType: 'award_month', entityId: mo, summary: `${principal.name} ${paid ? 'registrou o pagamento' : 'desmarcou o pagamento'} da Premiação de ${mo}` });
  });
}
