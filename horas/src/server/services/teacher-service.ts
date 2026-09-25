import { z } from 'zod';
import { prisma, type Tx } from '@/server/db';
import { audit } from '@/server/audit';
import { assertCan, can } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import type { RequestMeta } from '@/server/auth/session';
import { AppError, NotFoundError } from '@/server/errors';
import { fromUtc, isIsoDate, toUtc } from '@/domain/dates';
import { normalizeName } from '@/domain/names';

const optionalText = (max: number) =>
  z.string().trim().max(max).transform((v) => (v === '' ? null : v)).nullable().optional();
const optionalUuid = z.string().uuid().nullable().or(z.literal('').transform(() => null)).optional();
const optionalDate = z
  .string()
  .refine((v) => v === '' || isIsoDate(v), 'Data inválida.')
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .optional();

export const teacherSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome.').max(120),
  displayName: optionalText(40),
  email: z.string().trim().toLowerCase().email('E-mail inválido.').or(z.literal('').transform(() => null)).nullable().optional(),
  phone: optionalText(30),
  admissionDate: optionalDate,
  terminationDate: optionalDate,
  active: z.boolean().default(true),
  primaryModalityId: optionalUuid,
  positionId: optionalUuid,
  contractTypeId: optionalUuid,
  level: optionalText(20),
  notes: optionalText(1000),
  modalityIds: z.array(z.string().uuid()).default([]),
  aliases: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
});

export type TeacherInput = z.input<typeof teacherSchema>;

const include = {
  modalities: { include: { modality: { select: { id: true, name: true, color: true, areaId: true } } } },
  aliases: { select: { alias: true } },
  position: { select: { name: true } },
  contractType: { select: { name: true } },
} as const;

/**
 * Lista professores. Dado pessoal (e-mail, telefone) só sai do servidor
 * para quem tem teacher.view_personal — a tela nunca recebe o que não pode ver.
 */
export async function listTeachers(principal: Principal | null, opts: { q?: string; includeInactive?: boolean } = {}) {
  assertCan(principal, 'teacher.view');
  const rows = await prisma.teacher.findMany({
    where: {
      ...(opts.includeInactive ? {} : { active: true }),
      ...(opts.q
        ? { OR: [{ name: { contains: opts.q, mode: 'insensitive' } }, { displayName: { contains: opts.q, mode: 'insensitive' } }] }
        : {}),
    },
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
    include,
  });
  const personal = can(principal, 'teacher.view_personal');
  return rows.map((t) => ({
    id: t.id,
    name: t.name,
    displayName: t.displayName,
    email: personal ? t.email : null,
    phone: personal ? t.phone : null,
    admissionDate: t.admissionDate ? fromUtc(t.admissionDate) : null,
    terminationDate: t.terminationDate ? fromUtc(t.terminationDate) : null,
    active: t.active,
    primaryModalityId: t.primaryModalityId,
    positionId: t.positionId,
    contractTypeId: t.contractTypeId,
    positionName: t.position?.name ?? null,
    contractTypeName: t.contractType?.name ?? null,
    level: t.level,
    notes: personal ? t.notes : null,
    modalities: t.modalities.map((m) => m.modality),
    aliases: t.aliases.map((a) => a.alias),
  }));
}

export type TeacherRow = Awaited<ReturnType<typeof listTeachers>>[number];

async function snapshot(db: Tx, id: string) {
  const t = await db.teacher.findUnique({ where: { id }, include });
  if (!t) return null;
  return {
    name: t.name,
    displayName: t.displayName,
    active: t.active,
    level: t.level,
    position: t.position?.name ?? null,
    contractType: t.contractType?.name ?? null,
    modalities: t.modalities.map((m) => m.modality.name).sort(),
    aliases: t.aliases.map((a) => a.alias).sort(),
  };
}

export async function saveTeacher(principal: Principal | null, id: string | null, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'teacher.edit');
  const parsed = teacherSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const { modalityIds, aliases, admissionDate, terminationDate, ...fields } = parsed.data;

  if (fields.primaryModalityId && !modalityIds.includes(fields.primaryModalityId)) {
    modalityIds.push(fields.primaryModalityId);
  }
  if (admissionDate && terminationDate && terminationDate < admissionDate) {
    throw new AppError('O desligamento não pode ser antes da admissão.');
  }

  // Apelido = nome como aparece na planilha. Normalizado e sem repetir o próprio nome.
  const normalized = [...new Set(aliases.map(normalizeName))].filter((a) => a && a !== normalizeName(fields.name));

  return prisma.$transaction(async (tx) => {
    const before = id ? await snapshot(tx, id) : null;
    if (id && !before) throw new NotFoundError('Professor não encontrado.');

    const taken = await tx.teacherAlias.findMany({
      where: { alias: { in: normalized }, ...(id ? { teacherId: { not: id } } : {}) },
      include: { teacher: { select: { name: true } } },
    });
    if (taken.length) {
      throw new AppError(`O apelido "${taken[0]!.alias}" já pertence a ${taken[0]!.teacher.name}.`);
    }

    const data = {
      ...fields,
      admissionDate: admissionDate ? toUtc(admissionDate) : null,
      terminationDate: terminationDate ? toUtc(terminationDate) : null,
    };
    const t = id
      ? await tx.teacher.update({ where: { id }, data })
      : await tx.teacher.create({ data: { ...data, createdById: principal.id } });

    await tx.teacherModality.deleteMany({ where: { teacherId: t.id } });
    if (modalityIds.length) {
      await tx.teacherModality.createMany({ data: [...new Set(modalityIds)].map((modalityId) => ({ teacherId: t.id, modalityId })) });
    }
    await tx.teacherAlias.deleteMany({ where: { teacherId: t.id } });
    if (normalized.length) {
      await tx.teacherAlias.createMany({ data: normalized.map((alias) => ({ teacherId: t.id, alias })) });
    }

    const after = await snapshot(tx, t.id);
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: id ? 'teacher.updated' : 'teacher.created',
      entityType: 'teacher',
      entityId: t.id,
      before,
      after,
      summary: id ? `${principal.name} alterou o professor ${t.name}` : `${principal.name} cadastrou o professor ${t.name}`,
    });
    return t.id;
  });
}
