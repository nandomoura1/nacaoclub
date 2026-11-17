import { z } from 'zod';
import { prisma } from '@/server/db';
import { audit } from '@/server/audit';
import { assertCan, can } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import type { RequestMeta } from '@/server/auth/session';
import { AppError, NotFoundError } from '@/server/errors';
import { fromUtc, toUtc, type IsoDate } from '@/domain/dates';
import { awardPeriod, awardTotal, lostLabel, maxOf, payDay, suggest, type AwardState, type AwardValues } from '@/domain/premiacao';

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

export interface AwardRow {
  teacherId: string; name: string; group: string; values: AwardValues; max: number;
  state: AwardState; reviewed: boolean; reasons: string[]; suggested: AwardState;
  total: number; note: string | null; lost: string; active: boolean;
}

async function computeRows(month: string): Promise<AwardRow[]> {
  const mi = awardPeriod(month);
  const people = await prisma.awardPerson.findMany({
    where: { OR: [{ active: true, teacher: { active: true } }, { teacher: { awardMonths: { some: { month } } } }] },
    include: { teacher: { select: { name: true, admissionDate: true, awardMonths: { where: { month } } } } },
  });
  const ids = people.map((p) => p.teacherId);
  const leaves = await prisma.leave.findMany({
    where: { teacherId: { in: ids }, cancelledAt: null, slotId: null, type: { in: ['FALTA', 'ATESTADO'] }, startDate: { lte: toUtc(mi.last) }, endDate: { gte: toUtc(mi.first) } },
    select: { teacherId: true, type: true, startDate: true, endDate: true },
  });
  return people.map((p): AwardRow => {
    const values = { productivity: p.productivityCents, punctuality: p.punctualityCents, attendance: p.attendanceCents };
    const sug = suggest(
      leaves.filter((l) => l.teacherId === p.teacherId).map((l) => ({ type: l.type, start: fromUtc(l.startDate), end: fromUtc(l.endDate) })),
      mi.first, mi.last, p.teacher.admissionDate ? fromUtc(p.teacher.admissionDate) as IsoDate : null,
    );
    const saved = p.teacher.awardMonths[0];
    const state: AwardState = saved ? { productivity: saved.productivity, punctuality: saved.punctuality, attendance: saved.attendance, extraCents: saved.extraCents } : sug.state;
    return {
      teacherId: p.teacherId, name: p.teacher.name, group: p.groupName, values, max: maxOf(values),
      state, reviewed: !!saved, reasons: sug.reasons, suggested: sug.state,
      total: awardTotal(values, state), note: saved?.note ?? null, lost: lostLabel(state), active: p.active,
    };
  }).sort((a, b) => a.group.localeCompare(b.group, 'pt-BR') || a.name.localeCompare(b.name, 'pt-BR'));
}

/** Tela do mês avaliado ("AAAA-MM"). Mês fechado mostra os valores congelados. */
export async function awardBoard(principal: P | null, month: string) {
  assertCan(principal, 'award.view');
  const mo = parse(MONTH, month);
  const canEdit = can(principal, 'award.edit');
  const closure = await prisma.awardClosure.findUnique({ where: { month: mo } });
  const rows = closure ? (closure.snapshot as unknown as AwardRow[]) : await computeRows(mo);
  const candidates = canEdit && !closure
    ? await prisma.teacher.findMany({ where: { active: true, awardPerson: null }, orderBy: { name: 'asc' }, select: { id: true, name: true, team: true } })
    : [];
  const groups = [...new Set((await prisma.awardPerson.findMany({ select: { groupName: true } })).map((g) => g.groupName))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return {
    month: mo, payDay: payDay(mo), period: awardPeriod(mo), canEdit, rows, candidates, groups,
    closure: closure ? { closedAt: closure.closedAt.toISOString(), paidAt: closure.paidAt?.toISOString() ?? null } : null,
  };
}
export type AwardBoard = Awaited<ReturnType<typeof awardBoard>>;

async function assertOpen(month: string) {
  if (await prisma.awardClosure.findUnique({ where: { month } })) throw new AppError('Mês fechado: reabra para alterar.');
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

/** Tira da Premiação (não apaga: avaliações antigas ficam). */
export async function setAwardPersonActive(principal: P | null, teacherId: string, active: boolean, meta: RequestMeta = {}) {
  assertCan(principal, 'award.edit');
  return prisma.$transaction(async (tx) => {
    const p = await tx.awardPerson.findUnique({ where: { teacherId }, include: { teacher: { select: { name: true } } } });
    if (!p) throw new NotFoundError('Pessoa não está na Premiação.');
    await tx.awardPerson.update({ where: { teacherId }, data: { active } });
    await audit(tx, actx(principal, meta), { action: active ? 'award.person_reactivated' : 'award.person_removed', entityType: 'teacher', entityId: teacherId, summary: `${principal.name} ${active ? 'voltou' : 'tirou'} ${p.teacher.name} ${active ? 'para a' : 'da'} Premiação` });
  });
}

const MonthSchema = z.object({
  teacherId: z.string().uuid(), month: MONTH,
  productivity: z.boolean(), punctuality: z.boolean(), attendance: z.boolean(),
  extraCents: z.number().int().min(-500_000).max(500_000),
  note: z.string().trim().max(200).nullable().optional(),
  /** true = volta à sugestão do sistema (apaga a avaliação do mês). */
  reset: z.boolean().optional(),
});

/** Avaliação do mês de uma pessoa (critérios, ajuste em R$ e observação). */
export async function saveAwardMonth(principal: P | null, input: unknown, meta: RequestMeta = {}) {
  assertCan(principal, 'award.edit');
  const v = parse(MonthSchema, input);
  await assertOpen(v.month);
  return prisma.$transaction(async (tx) => {
    const p = await tx.awardPerson.findUnique({ where: { teacherId: v.teacherId }, include: { teacher: { select: { name: true } } } });
    if (!p) throw new NotFoundError('Pessoa não está na Premiação.');
    const id = { teacherId_month: { teacherId: v.teacherId, month: v.month } };
    const before = await tx.awardMonth.findUnique({ where: id });
    const note = v.note || null;
    if (v.reset) await tx.awardMonth.deleteMany({ where: { teacherId: v.teacherId, month: v.month } });
    else {
      const data = { productivity: v.productivity, punctuality: v.punctuality, attendance: v.attendance, extraCents: v.extraCents, note };
      await tx.awardMonth.upsert({ where: id, create: { teacherId: v.teacherId, month: v.month, ...data }, update: data });
    }
    const values = { productivity: p.productivityCents, punctuality: p.punctualityCents, attendance: p.attendanceCents };
    const after = v.reset ? null : { produtividade: v.productivity, pontualidade: v.punctuality, assiduidade: v.attendance, ajuste: v.extraCents, obs: note };
    await audit(tx, actx(principal, meta), {
      action: 'award.month', entityType: 'teacher', entityId: v.teacherId,
      before: before ? { produtividade: before.productivity, pontualidade: before.punctuality, assiduidade: before.attendance, ajuste: before.extraCents, obs: before.note } : null,
      after: after ? { mes: v.month, ...after } : { mes: v.month, voltou_a_sugestao: true },
      summary: v.reset
        ? `${principal.name} voltou a Premiação de ${p.teacher.name} (${v.month}) à sugestão do sistema`
        : `${principal.name} avaliou ${p.teacher.name} na Premiação de ${v.month}: ${brl(awardTotal(values, { ...v }))}`,
    });
  });
}

/** Fecha o mês: congela os valores (a tela passa a mostrar o fechado). */
export async function closeAwardMonth(principal: P | null, month: string, meta: RequestMeta = {}) {
  assertCan(principal, 'award.edit');
  const mo = parse(MONTH, month);
  await assertOpen(mo);
  const rows = await computeRows(mo);
  if (!rows.length) throw new AppError('Ninguém na Premiação deste mês.');
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
  if (!c) throw new AppError('O mês não está fechado.');
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
  if (!c) throw new AppError('Feche o mês antes de registrar o pagamento.');
  await prisma.$transaction(async (tx) => {
    await tx.awardClosure.update({ where: { month: mo }, data: paid ? { paidAt: new Date(), paidById: principal.id } : { paidAt: null, paidById: null } });
    await audit(tx, actx(principal, meta), { action: paid ? 'award.paid' : 'award.unpaid', entityType: 'award_month', entityId: mo, summary: `${principal.name} ${paid ? 'registrou o pagamento' : 'desmarcou o pagamento'} da Premiação de ${mo}` });
  });
}
