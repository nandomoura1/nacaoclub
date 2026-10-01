import { z } from 'zod';
import { prisma } from '@/server/db';
import { audit } from '@/server/audit';
import { assertCan, can } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import type { RequestMeta } from '@/server/auth/session';
import { NotFoundError } from '@/server/errors';
import { addDays, fromUtc, toUtc, type IsoDate } from '@/domain/dates';
import type { ShareDuty, ShareSlot } from '@/domain/teacher-share';
import { listGrade } from './schedule-service';

/** Escalas que entram no texto: dos próximos 30 dias. */
const DUTY_DAYS = 30;

/** Tudo para montar o texto da grade de um professor. */
export async function teacherShareData(principal: Principal | null, teacherId: string, date: IsoDate) {
  assertCan(principal, 'teacher.view');
  const [teacher, settings, grade, duties] = await Promise.all([
    prisma.teacher.findUnique({ where: { id: teacherId }, select: { name: true, displayName: true, phone: true, guidelines: true } }),
    prisma.appSettings.findUnique({ where: { id: 1 }, select: { teacherGuidelines: true } }),
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
  return {
    name: teacher.displayName || teacher.name, phone: teacher.phone, date, slots,
    duties: duties.map((d): ShareDuty => ({ date: fromUtc(d.date), startMin: d.startMin, endMin: d.endMin, sector: d.sector.name })),
    general: settings?.teacherGuidelines ?? '', specific: teacher.guidelines ?? '',
    canEdit: can(principal, 'schedule.edit'),
  };
}
export type TeacherShareData = Awaited<ReturnType<typeof teacherShareData>>;

const guidelinesSchema = z.object({
  general: z.string().max(4000, 'Orientações gerais: no máximo 4.000 caracteres.'),
  specific: z.string().max(2000, 'Orientações do professor: no máximo 2.000 caracteres.'),
});

/** Salva as orientações gerais (todos os professores) e as deste professor. */
export async function saveGuidelines(principal: Principal | null, teacherId: string, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'schedule.edit');
  const { general, specific } = guidelinesSchema.parse(input);
  await prisma.$transaction(async (tx) => {
    const t = await tx.teacher.findUnique({ where: { id: teacherId }, select: { name: true, guidelines: true } });
    if (!t) throw new NotFoundError('Professor não encontrado.');
    const before = (await tx.appSettings.findUnique({ where: { id: 1 }, select: { teacherGuidelines: true } }))?.teacherGuidelines ?? '';
    if (before !== general.trim()) {
      await tx.appSettings.upsert({ where: { id: 1 }, create: { id: 1, teacherGuidelines: general.trim() || null }, update: { teacherGuidelines: general.trim() || null } });
      await audit(tx, { actorId: principal.id, ...meta }, {
        action: 'settings.guidelines', entityType: 'app_settings', entityId: '1',
        summary: `${principal.name} atualizou as orientações gerais dos professores`,
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
