import { z } from 'zod';
import { prisma } from '@/server/db';
import { audit } from '@/server/audit';
import { assertAreaAccess, assertCan, can, canAccessArea } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import type { RequestMeta } from '@/server/auth/session';
import { AppError, NotFoundError } from '@/server/errors';
import { addDays, fromUtc, toUtc, type IsoDate } from '@/domain/dates';
import type { ShareArea, ShareDuty, ShareSlot } from '@/domain/teacher-share';
import { listGrade } from './schedule-service';

/** Escalas que entram no texto: dos próximos 30 dias. */
const DUTY_DAYS = 30;

/** Tudo para montar o texto da grade de um professor. */
export async function teacherShareData(principal: Principal | null, teacherId: string, date: IsoDate) {
  assertCan(principal, 'teacher.view');
  const [teacher, grade, duties] = await Promise.all([
    prisma.teacher.findUnique({
      where: { id: teacherId },
      select: { name: true, displayName: true, phone: true, guidelines: true, primaryModality: { select: { areaId: true } }, modalities: { select: { modality: { select: { areaId: true } } } } },
    }),
    listGrade(principal, date),
    prisma.dutyShift.findMany({
      where: { date: { gte: toUtc(date), lte: toUtc(addDays(date, DUTY_DAYS)) }, people: { some: { teacherId } } },
      include: { sector: { select: { name: true } } }, orderBy: [{ date: 'asc' }, { startMin: 'asc' }],
    }),
  ]);
  if (!teacher) throw new NotFoundError('Professor não encontrado.');
  const slots: ShareSlot[] = grade.filter((g) => g.people.some((p) => p.teacherId === teacherId)).map((g) => ({
    weekday: g.weekday, startMin: g.startMin, durationMin: g.durationMin, modality: g.modality.name, label: g.label, space: g.space?.name ?? null,
    role: g.people.find((p) => p.teacherId === teacherId)!.role, counts: g.activityType.kind !== 'PERSONAL',
  }));
  // Áreas do professor: as das aulas dele na grade e as das modalidades habilitadas; a principal primeiro.
  const mine = grade.filter((g) => g.people.some((p) => p.teacherId === teacherId));
  const areaIds = new Set([...mine.map((g) => g.modality.areaId), ...teacher.modalities.map((m) => m.modality.areaId)]);
  const rows = await prisma.coordinationArea.findMany({
    where: { id: { in: [...areaIds] }, deletedAt: null },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, name: true, teacherGuidelines: true, modalities: { where: { active: true }, select: { name: true }, orderBy: { sortOrder: 'asc' } } },
  });
  const primary = teacher.primaryModality?.areaId;
  const areas: (ShareArea & { canEdit: boolean })[] = rows
    .sort((a, b) => Number(b.id === primary) - Number(a.id === primary))
    .map((a) => ({
      id: a.id, name: a.name, modalities: a.modalities.map((m) => m.name), guidelines: a.teacherGuidelines ?? '',
      canEdit: can(principal, 'schedule.edit') && canAccessArea(principal!, a.id),
    }));
  return {
    name: teacher.displayName || teacher.name, phone: teacher.phone, date, slots, areas,
    duties: duties.map((d): ShareDuty => ({ date: fromUtc(d.date), startMin: d.startMin, endMin: d.endMin, sector: d.sector.name })),
    specific: teacher.guidelines ?? '',
    canEdit: can(principal, 'schedule.edit'),
  };
}
export type TeacherShareData = Awaited<ReturnType<typeof teacherShareData>>;

const guidelinesSchema = z.object({
  /** areaId → texto das orientações daquela área. */
  areas: z.record(z.string().uuid(), z.string().max(4000, 'Orientações da área: no máximo 4.000 caracteres.')),
  specific: z.string().max(2000, 'Orientações do professor: no máximo 2.000 caracteres.'),
});

/** Salva as orientações das áreas (valem para todos os professores de cada área) e as deste professor. */
export async function saveGuidelines(principal: Principal | null, teacherId: string, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'schedule.edit');
  const parsed = guidelinesSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const { areas, specific } = parsed.data;
  await prisma.$transaction(async (tx) => {
    const t = await tx.teacher.findUnique({ where: { id: teacherId }, select: { name: true, guidelines: true } });
    if (!t) throw new NotFoundError('Professor não encontrado.');
    const current = await tx.coordinationArea.findMany({ where: { id: { in: Object.keys(areas) } }, select: { id: true, name: true, teacherGuidelines: true } });
    if (current.length !== Object.keys(areas).length) throw new NotFoundError('Área não encontrada.');
    for (const a of current) {
      const text = areas[a.id]!.trim();
      if ((a.teacherGuidelines ?? '') === text) continue;
      assertAreaAccess(principal, a.id); // coordenador só muda as orientações da própria área
      await tx.coordinationArea.update({ where: { id: a.id }, data: { teacherGuidelines: text || null } });
      await audit(tx, { actorId: principal.id, ...meta }, {
        action: 'area.guidelines', entityType: 'coordination_area', entityId: a.id,
        summary: `${principal.name} atualizou as orientações dos professores de ${a.name}`,
      });
    }
    if ((t.guidelines ?? '') !== specific.trim()) {
      await tx.teacher.update({ where: { id: teacherId }, data: { guidelines: specific.trim() || null } });
      await audit(tx, { actorId: principal.id, ...meta }, {
        action: 'teacher.guidelines', entityType: 'teacher', entityId: teacherId,
        summary: `${principal.name} atualizou as orientações de ${t.name}`,
      });
    }
  });
}
