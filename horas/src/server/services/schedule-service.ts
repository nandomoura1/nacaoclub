import { z } from 'zod';
import { prisma, type Tx } from '@/server/db';
import { audit } from '@/server/audit';
import { assertAreaAccess, assertCan } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import type { RequestMeta } from '@/server/auth/session';
import { AppError, NotFoundError } from '@/server/errors';
import { WEEKDAYS, formatClock, formatDateBR, fromUtc, isIsoDate, toUtc, type IsoDate } from '@/domain/dates';
import { planChange, planEnd, ScheduleRuleError, splitShift, type VersionSpan } from '@/domain/schedule';
import { onScheduleChanged } from './period-service';

const isoDate = z.string().refine(isIsoDate, 'Data inválida.');

const peopleSchema = z
  .array(z.object({ teacherId: z.string().uuid(), role: z.enum(['TITULAR', 'AUXILIAR', 'ESTAGIARIO']) }))
  .max(10)
  .refine((p) => new Set(p.map((x) => x.teacherId)).size === p.length, 'A mesma pessoa aparece duas vezes na aula.');

const slotFields = {
  startMin: z.coerce.number().int().min(0).max(1439, 'Horário inválido.'),
  durationMin: z.coerce.number().int().min(5, 'Duração mínima: 5 min.').max(600, 'Duração máxima: 10h.'),
  modalityId: z.string().uuid('Escolha a modalidade.'),
  activityTypeId: z.string().uuid('Escolha o tipo de atividade.'),
  spaceId: z.string().uuid().nullable().or(z.literal('').transform(() => null)),
  label: z.string().trim().max(60).transform((v) => v || null).nullable(),
  people: peopleSchema,
};

export const createSlotsSchema = z.object({
  ...slotFields,
  weekdays: z.array(z.coerce.number().int().min(1).max(7)).min(1, 'Escolha ao menos um dia.'),
  validFrom: isoDate,
  /** Turno: com término, cria o período inteiro (em blocos de `durationMin`, ou um bloco só). */
  endMin: z.coerce.number().int().min(1).max(1440).nullable().optional().or(z.literal('').transform(() => null)),
  split: z.boolean().optional().default(true),
});

export const changeSlotSchema = z.object({
  ...slotFields,
  weekday: z.coerce.number().int().min(1).max(7),
  from: isoDate,
  reason: z.string().trim().max(200).optional(),
});

const versionInclude = {
  modality: { select: { id: true, name: true, color: true, areaId: true } },
  activityType: { select: { id: true, name: true, kind: true, countsHours: true } },
  space: { select: { id: true, name: true } },
  teachers: { include: { teacher: { select: { id: true, name: true, displayName: true } } } },
} as const;

function describeVersion(v: { weekday: number; startMin: number; modality: { name: string }; label: string | null }) {
  return `${v.modality.name}${v.label ? ` (${v.label})` : ''} de ${WEEKDAYS[v.weekday - 1]!.long.toLowerCase()} ${formatClock(v.startMin)}`;
}

function peopleNames(v: { teachers: { teacher: { name: string; displayName: string | null } }[] }) {
  return v.teachers.map((t) => t.teacher.displayName || t.teacher.name).join(', ') || 'sem professor';
}

async function assertModalityInScope(tx: Tx, principal: Principal, modalityId: string) {
  const m = await tx.modality.findUnique({ where: { id: modalityId } });
  if (!m) throw new AppError('Modalidade inexistente.');
  assertAreaAccess(principal, m.areaId);
  return m;
}

/** Grade valendo numa data, escopada pelas áreas do usuário. */
export async function listGrade(principal: Principal | null, date: IsoDate, areaId?: string | null) {
  assertCan(principal, 'schedule.view');
  const d = toUtc(date);
  const areaFilter = principal.areaIds === null ? {} : { areaId: { in: [...principal.areaIds] } };
  const rows = await prisma.scheduleSlotVersion.findMany({
    where: {
      validFrom: { lte: d },
      OR: [{ validTo: null }, { validTo: { gte: d } }],
      modality: { ...areaFilter, ...(areaId ? { areaId } : {}) },
    },
    include: versionInclude,
    orderBy: [{ weekday: 'asc' }, { startMin: 'asc' }],
  });
  const futureChanges = await prisma.scheduleSlotVersion.findMany({
    where: { slotId: { in: rows.map((r) => r.slotId) }, validFrom: { gt: d } },
    select: { slotId: true, validFrom: true },
    orderBy: { validFrom: 'asc' },
  });
  const firsts = await prisma.scheduleSlotVersion.groupBy({ by: ['slotId'], where: { slotId: { in: rows.map((r) => r.slotId) } }, _min: { validFrom: true } });
  const since = new Map(firsts.map((f) => [f.slotId, fromUtc(f._min.validFrom!)]));
  const nextChange = new Map<string, IsoDate>();
  for (const f of futureChanges) if (!nextChange.has(f.slotId)) nextChange.set(f.slotId, fromUtc(f.validFrom));
  // Ausências lançadas na ficha aparecem na grade da data vista.
  const leaves = await prisma.leave.findMany({
    where: { cancelledAt: null, startDate: { lte: d }, endDate: { gte: d }, teacherId: { in: [...new Set(rows.flatMap((r) => r.teachers.map((t) => t.teacherId)))] } },
    select: { teacherId: true, type: true, endDate: true, substitute: { select: { name: true, displayName: true } } },
  });
  const leaveOf = new Map(leaves.map((l) => [l.teacherId, {
    type: l.type as string, until: fromUtc(l.endDate), substitute: l.substitute ? l.substitute.displayName || l.substitute.name : null,
  }]));

  return rows.map((v) => ({
    id: v.id,
    slotId: v.slotId,
    weekday: v.weekday,
    startMin: v.startMin,
    durationMin: v.durationMin,
    label: v.label,
    validFrom: fromUtc(v.validFrom),
    validTo: v.validTo ? fromUtc(v.validTo) : null,
    nextChange: nextChange.get(v.slotId) ?? null,
    /** Primeira data da aula na grade (lançamento). */
    since: since.get(v.slotId) ?? fromUtc(v.validFrom),
    modality: v.modality,
    activityType: v.activityType,
    space: v.space,
    people: v.teachers.map((t) => ({ teacherId: t.teacherId, role: t.role, name: t.teacher.displayName || t.teacher.name, leave: leaveOf.get(t.teacherId) ?? null })),
  }));
}

export type GradeItem = Awaited<ReturnType<typeof listGrade>>[number];

export async function slotHistory(principal: Principal | null, slotId: string) {
  assertCan(principal, 'schedule.view');
  const versions = await prisma.scheduleSlotVersion.findMany({
    where: { slotId },
    include: versionInclude,
    orderBy: { validFrom: 'asc' },
  });
  if (!versions.length) throw new NotFoundError();
  if (principal.areaIds !== null) assertAreaAccess(principal, versions[versions.length - 1]!.modality.areaId);
  return versions.map((v) => ({
    id: v.id,
    validFrom: fromUtc(v.validFrom),
    validTo: v.validTo ? fromUtc(v.validTo) : null,
    summary: `${describeVersion(v)} · ${v.durationMin} min · ${peopleNames(v)}`,
    changeReason: v.changeReason,
  }));
}

function parse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) throw new AppError(r.error.issues[0]?.message ?? 'Dados inválidos.');
  return r.data;
}

/** Cria uma aula recorrente por dia escolhido ("copiar para outros dias"). */
export async function createSlots(principal: Principal | null, input: unknown, meta: RequestMeta): Promise<string[]> {
  assertCan(principal, 'schedule.edit');
  const data = parse(createSlotsSchema, input);

  let blocks = [{ startMin: data.startMin, durationMin: data.durationMin }];
  if (data.endMin) {
    try {
      blocks = splitShift(data.startMin, data.endMin, data.durationMin, data.split);
    } catch (e) {
      if (e instanceof ScheduleRuleError) throw new AppError(e.message);
      throw e;
    }
  }

  return prisma.$transaction(async (tx) => {
    const modality = await assertModalityInScope(tx, principal, data.modalityId);
    const ids: string[] = [];
    for (const weekday of [...new Set(data.weekdays)].sort()) for (const block of blocks) {
      const slot = await tx.scheduleSlot.create({ data: { createdById: principal.id } });
      const v = await tx.scheduleSlotVersion.create({
        data: {
          slotId: slot.id,
          weekday,
          startMin: block.startMin,
          durationMin: block.durationMin,
          modalityId: data.modalityId,
          activityTypeId: data.activityTypeId,
          spaceId: data.spaceId,
          label: data.label,
          validFrom: toUtc(data.validFrom),
          createdById: principal.id,
          teachers: { create: data.people.map((p) => ({ teacherId: p.teacherId, role: p.role })) },
        },
        include: versionInclude,
      });
      ids.push(slot.id);
      await audit(tx, { actorId: principal.id, ...meta }, {
        action: 'schedule.created',
        entityType: 'schedule_slot',
        entityId: slot.id,
        after: { ...data, weekday, weekdays: undefined, startMin: block.startMin, durationMin: block.durationMin },
        summary: `${principal.name} criou a aula ${describeVersion({ ...v, modality })} (${peopleNames(v)}), valendo a partir de ${formatDateBR(data.validFrom)}${blocks.length > 1 ? ` — turno ${formatClock(data.startMin)}–${formatClock(data.endMin!)}` : ''}`,
      });
    }
    // Uma realinhada só para todas as aulas novas (turno com vários blocos × dias).
    await onScheduleChanged(tx, ids, data.validFrom);
    return ids;
  }, { timeout: 120_000, maxWait: 10_000 });
}

async function loadSpans(tx: Tx, slotId: string) {
  const versions = await tx.scheduleSlotVersion.findMany({ where: { slotId }, include: versionInclude, orderBy: { validFrom: 'asc' } });
  if (!versions.length) throw new NotFoundError('Aula não encontrada.');
  const spans: VersionSpan[] = versions.map((v) => ({ id: v.id, validFrom: fromUtc(v.validFrom), validTo: v.validTo ? fromUtc(v.validTo) : null }));
  return { versions, spans };
}

/** "Alterar grade a partir desta data" — preserva o passado. */
export async function changeSlot(principal: Principal | null, slotId: string, input: unknown, meta: RequestMeta): Promise<void> {
  assertCan(principal, 'schedule.edit');
  const data = parse(changeSlotSchema, input);

  await prisma.$transaction(async (tx) => {
    const { versions, spans } = await loadSpans(tx, slotId);
    let plan;
    try {
      plan = planChange(spans, data.from);
    } catch (e) {
      if (e instanceof ScheduleRuleError) throw new AppError(e.message);
      throw e;
    }
    const current = versions.find((v) => v.id === (plan.kind === 'replace' ? plan.versionId : plan.closeVersionId))!;
    assertAreaAccess(principal, current.modality.areaId);
    const modality = await assertModalityInScope(tx, principal, data.modalityId);

    const content = {
      weekday: data.weekday,
      startMin: data.startMin,
      durationMin: data.durationMin,
      modalityId: data.modalityId,
      activityTypeId: data.activityTypeId,
      spaceId: data.spaceId,
      label: data.label,
      changeReason: data.reason || null,
    };

    let versionId: string;
    if (plan.kind === 'replace') {
      await tx.slotVersionTeacher.deleteMany({ where: { versionId: plan.versionId } });
      await tx.scheduleSlotVersion.update({ where: { id: plan.versionId }, data: content });
      versionId = plan.versionId;
    } else {
      await tx.scheduleSlotVersion.update({ where: { id: plan.closeVersionId }, data: { validTo: toUtc(plan.closeAt) } });
      const v = await tx.scheduleSlotVersion.create({
        data: {
          ...content,
          slotId,
          validFrom: toUtc(plan.newValidFrom),
          validTo: plan.newValidTo ? toUtc(plan.newValidTo) : null,
          createdById: principal.id,
        },
      });
      versionId = v.id;
    }
    await tx.slotVersionTeacher.createMany({ data: data.people.map((p) => ({ versionId, teacherId: p.teacherId, role: p.role })) });

    const after = await tx.scheduleSlotVersion.findUniqueOrThrow({ where: { id: versionId }, include: versionInclude });
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: 'schedule.changed',
      entityType: 'schedule_slot',
      entityId: slotId,
      before: { aula: describeVersion(current), duracao: current.durationMin, pessoas: peopleNames(current) },
      after: { aula: describeVersion({ ...after, modality }), duracao: after.durationMin, pessoas: peopleNames(after), a_partir_de: data.from },
      summary: `${principal.name} alterou a aula ${describeVersion(current)} a partir de ${formatDateBR(data.from)}: ${describeVersion({ ...after, modality })} · ${after.durationMin} min · ${peopleNames(after)}${data.reason ? ` — ${data.reason}` : ''}`,
    });
    await onScheduleChanged(tx, slotId, data.from);
  });
}

/** Competência fechada não muda: excluir a partir de uma data só se nenhuma aula dela já foi fechada. */
async function assertOpenFrom(tx: Tx, slotId: string, from: IsoDate) {
  const closed = await tx.classOccurrence.findFirst({
    where: { slotId, date: { gte: toUtc(from) }, period: { status: 'FECHADO' } },
    select: { date: true }, orderBy: { date: 'desc' },
  });
  if (closed) throw new AppError(`Esta aula já tem horas em competência fechada (até ${formatDateBR(fromUtc(closed.date))}). Escolha uma data depois disso.`);
}

/** Encerra a aula a partir da data (a última acontece no dia anterior). */
export async function endSlot(principal: Principal | null, slotId: string, from: string, reason: string | undefined, meta: RequestMeta) {
  assertCan(principal, 'schedule.edit');
  if (!isIsoDate(from)) throw new AppError('Data inválida.');

  await prisma.$transaction(async (tx) => {
    const { versions, spans } = await loadSpans(tx, slotId);
    const last = versions[versions.length - 1]!;
    assertAreaAccess(principal, last.modality.areaId);
    await assertOpenFrom(tx, slotId, from);
    let plan;
    try {
      plan = planEnd(spans, from);
    } catch (e) {
      if (e instanceof ScheduleRuleError) throw new AppError(e.message);
      throw e;
    }
    if (plan.kind === 'close') {
      await tx.scheduleSlotVersion.update({ where: { id: plan.versionId }, data: { validTo: toUtc(plan.closeAt) } });
    }
    // Versões que somem: as aulas geradas delas saem antes (FK); as que alguém
    // mexeu ficam soltas, para revisão. Só depois o período é realinhado —
    // senão ele recriaria as aulas a partir das versões que vão sumir.
    if (plan.dropVersionIds.length) {
      const dropped = { slotVersionId: { in: plan.dropVersionIds } };
      await tx.classOccurrence.deleteMany({ where: { ...dropped, touched: false } });
      await tx.classOccurrence.updateMany({ where: dropped, data: { slotVersionId: null, needsReview: true } });
      await tx.scheduleSlotVersion.deleteMany({ where: { id: { in: plan.dropVersionIds } } });
    }
    await onScheduleChanged(tx, slotId, from, { ending: true });
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: 'schedule.ended',
      entityType: 'schedule_slot',
      entityId: slotId,
      summary: `${principal.name} encerrou a aula ${describeVersion(last)} a partir de ${formatDateBR(from)}${reason ? ` — ${reason}` : ''}`,
    });
  });
}

/**
 * "Sair desta aula" (ficha do professor): tira só essa pessoa a partir da data.
 * Se ela era a única, a aula continua na grade — sem professor — até alguém
 * decidir; para acabar com a aula, use encerrar.
 */
export async function removeTeacherFromSlot(principal: Principal | null, slotId: string, teacherId: string, from: string, meta: RequestMeta) {
  assertCan(principal, 'schedule.edit');
  if (!isIsoDate(from)) throw new AppError('Data inválida.');
  const v = await prisma.scheduleSlotVersion.findFirst({
    where: { slotId, validFrom: { lte: toUtc(from) }, OR: [{ validTo: null }, { validTo: { gte: toUtc(from) } }] },
    include: { teachers: true },
  });
  if (!v) throw new NotFoundError('Essa aula não está valendo nessa data.');
  if (!v.teachers.some((t) => t.teacherId === teacherId)) throw new AppError('Essa pessoa não está nessa aula.');
  await assertOpenFrom(prisma, slotId, from);
  await changeSlot(principal, slotId, {
    weekday: v.weekday, startMin: v.startMin, durationMin: v.durationMin, modalityId: v.modalityId, activityTypeId: v.activityTypeId,
    spaceId: v.spaceId ?? '', label: v.label ?? '', from, reason: 'Professor saiu da aula (ficha do professor)',
    people: v.teachers.filter((t) => t.teacherId !== teacherId).map((t) => ({ teacherId: t.teacherId, role: t.role })),
  }, meta);
}
