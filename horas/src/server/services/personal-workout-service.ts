import { z } from 'zod';
import { prisma } from '@/server/db';
import { audit } from '@/server/audit';
import { assertCan, can } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import type { RequestMeta } from '@/server/auth/session';
import { AppError, AuthorizationError, NotFoundError } from '@/server/errors';
import { WEEKDAYS, formatClock, formatDateBR, fromUtc, isIsoDate, toUtc, weekdayOf, type IsoDate } from '@/domain/dates';
import { PERSONAL_KINDS, hasContent } from '@/domain/personal';

/**
 * Treinos de Personal: o professor monta o treino de UMA aula de Personal dele
 * (aula da grade + data) para o aluno. Professor vê e edita só os dele; quem
 * edita o Cadastro de Treino (coordenação) vê e edita todos.
 */


const blockSchema = z.object({
  kind: z.enum(PERSONAL_KINDS),
  title: z.string().trim().max(120).optional().default(''),
  durationMin: z.coerce.number().int().min(0).max(240).nullable().optional().transform((v) => (v ? v : null)),
  format: z.string().trim().max(160).optional().default(''),
  content: z.string().trim().max(2000).optional().default(''),
  notes: z.string().trim().max(600).optional().default(''),
});
const workoutSchema = z.object({
  teacherId: z.string().uuid().nullable().optional(),
  slotId: z.string().uuid().nullable().optional().or(z.literal('').transform(() => null)),
  date: z.string().refine(isIsoDate, 'Data inválida.'),
  student: z.string().trim().max(120).optional().default(''),
  title: z.string().trim().min(2, 'Dê um nome ao treino.').max(120),
  goal: z.string().trim().max(600).optional().default(''),
  blocks: z.array(blockSchema).min(1, 'Inclua ao menos um bloco.').max(15),
});
export type PersonalBlock = z.output<typeof blockSchema>;

/** Professor (perfil Professor) gerencia só os próprios; coordenação (workout.edit) gerencia todos. */
function scopeOf(principal: Principal | null) {
  assertCan(principal, 'workout.personal');
  const all = can(principal!, 'workout.edit');
  if (!all && !principal!.teacherId) throw new AppError('Seu usuário ainda não está vinculado a um professor. Peça à coordenação para fazer o vínculo em Usuários.');
  return { all, teacherId: principal!.teacherId };
}

/** Aulas de Personal da grade (valendo hoje ou depois) — de um professor ou de todos. */
export async function personalSlots(principal: Principal | null, today: IsoDate, teacherId?: string | null) {
  const scope = scopeOf(principal);
  const who = scope.all ? teacherId ?? undefined : scope.teacherId!;
  const versions = await prisma.scheduleSlotVersion.findMany({
    where: {
      activityType: { kind: 'PERSONAL' },
      OR: [{ validTo: null }, { validTo: { gte: toUtc(today) } }],
      ...(who ? { teachers: { some: { teacherId: who } } } : {}),
    },
    include: { modality: { select: { name: true } }, teachers: { include: { teacher: { select: { id: true, name: true, displayName: true } } } } },
    orderBy: [{ weekday: 'asc' }, { startMin: 'asc' }],
  });
  const seen = new Set<string>();
  return versions.filter((v) => !seen.has(v.slotId) && seen.add(v.slotId)).map((v) => ({
    slotId: v.slotId, weekday: v.weekday, startMin: v.startMin, durationMin: v.durationMin, label: v.label, modality: v.modality.name,
    teachers: v.teachers.map((t) => ({ id: t.teacher.id, name: t.teacher.displayName || t.teacher.name })),
    description: `${WEEKDAYS[v.weekday - 1]!.long} ${formatClock(v.startMin)}${v.label ? ` · ${v.label}` : ''}`,
  }));
}

const include = { teacher: { select: { id: true, name: true, displayName: true } } } as const;
function toView(w: Awaited<ReturnType<typeof prisma.personalWorkout.findUniqueOrThrow<{ where: { id: string }; include: typeof include }>>>) {
  return {
    id: w.id, teacherId: w.teacherId, teacher: w.teacher.displayName || w.teacher.name, slotId: w.slotId, date: fromUtc(w.date), startMin: w.startMin,
    student: w.student ?? '', title: w.title, goal: w.goal ?? '', blocks: w.blocks as unknown as PersonalBlock[], updatedAt: w.updatedAt.toISOString(),
  };
}
export type PersonalWorkoutView = ReturnType<typeof toView>;

export async function listPersonalWorkouts(principal: Principal | null, opts: { from?: IsoDate; to?: IsoDate } = {}) {
  const scope = scopeOf(principal);
  const rows = await prisma.personalWorkout.findMany({
    where: {
      ...(scope.all ? {} : { teacherId: scope.teacherId! }),
      ...(opts.from || opts.to ? { date: { ...(opts.from ? { gte: toUtc(opts.from) } : {}), ...(opts.to ? { lte: toUtc(opts.to) } : {}) } } : {}),
    },
    include, orderBy: [{ date: 'desc' }, { startMin: 'asc' }], take: 300,
  });
  return rows.map(toView);
}

export async function getPersonalWorkout(principal: Principal | null, id: string) {
  const scope = scopeOf(principal);
  const w = await prisma.personalWorkout.findUnique({ where: { id }, include });
  if (!w) throw new NotFoundError('Treino não encontrado.');
  if (!scope.all && w.teacherId !== scope.teacherId) throw new AuthorizationError('Este treino é de outro professor.');
  return toView(w);
}

export async function savePersonalWorkout(principal: Principal | null, id: string | null, input: unknown, meta: RequestMeta) {
  const scope = scopeOf(principal);
  const parsed = workoutSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const d = { ...parsed.data, blocks: parsed.data.blocks.filter(hasContent) };
  if (!d.blocks.length) throw new AppError('Escreva ao menos um bloco do treino.');
  const teacherId = scope.all ? d.teacherId ?? scope.teacherId : scope.teacherId;
  if (!teacherId) throw new AppError('Escolha o professor.');

  return prisma.$transaction(async (tx) => {
    if (id) {
      const cur = await tx.personalWorkout.findUnique({ where: { id }, select: { teacherId: true } });
      if (!cur) throw new NotFoundError('Treino não encontrado.');
      if (!scope.all && cur.teacherId !== scope.teacherId) throw new AuthorizationError('Este treino é de outro professor.');
    }
    let startMin: number | null = null;
    let aula = 'aula avulsa';
    if (d.slotId) {
      const v = await tx.scheduleSlotVersion.findFirst({
        where: { slotId: d.slotId, validFrom: { lte: toUtc(d.date) }, OR: [{ validTo: null }, { validTo: { gte: toUtc(d.date) } }] },
        include: { activityType: { select: { kind: true } }, teachers: { select: { teacherId: true } } },
      });
      if (!v || v.activityType.kind !== 'PERSONAL') throw new AppError('Essa aula de Personal não está valendo nessa data.');
      if (!v.teachers.some((t) => t.teacherId === teacherId)) throw new AppError('Essa aula de Personal é de outro professor.');
      if (v.weekday !== weekdayOf(d.date)) throw new AppError(`Essa aula é de ${WEEKDAYS[v.weekday - 1]!.long.toLowerCase()}: escolha uma data nesse dia da semana.`);
      startMin = v.startMin;
      aula = `${WEEKDAYS[v.weekday - 1]!.long.toLowerCase()} ${formatClock(v.startMin)}`;
    }
    const data = {
      teacherId, slotId: d.slotId ?? null, date: toUtc(d.date), startMin, student: d.student || null, title: d.title, goal: d.goal || null,
      blocks: d.blocks as unknown as object,
    };
    const w = id
      ? await tx.personalWorkout.update({ where: { id }, data })
      : await tx.personalWorkout.create({ data: { ...data, createdById: principal!.id } });
    await audit(tx, { actorId: principal!.id, ...meta }, {
      action: id ? 'personal.updated' : 'personal.created', entityType: 'personal_workout', entityId: w.id,
      summary: `${principal!.name} ${id ? 'alterou' : 'criou'} o treino Personal "${d.title}" (${formatDateBR(d.date)}, ${aula}${d.student ? `, aluno ${d.student}` : ''})`,
    });
    return w.id;
  });
}

export async function deletePersonalWorkout(principal: Principal | null, id: string, meta: RequestMeta) {
  const scope = scopeOf(principal);
  await prisma.$transaction(async (tx) => {
    const w = await tx.personalWorkout.findUnique({ where: { id } });
    if (!w) throw new NotFoundError('Treino não encontrado.');
    if (!scope.all && w.teacherId !== scope.teacherId) throw new AuthorizationError('Este treino é de outro professor.');
    await tx.personalWorkout.delete({ where: { id } });
    await audit(tx, { actorId: principal!.id, ...meta }, {
      action: 'personal.deleted', entityType: 'personal_workout', entityId: id,
      summary: `${principal!.name} excluiu o treino Personal "${w.title}" (${formatDateBR(fromUtc(w.date))})`,
    });
  });
}

