import { z } from 'zod';
import { prisma } from '@/server/db';
import { audit } from '@/server/audit';
import { assertCan, can } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import type { RequestMeta } from '@/server/auth/session';
import { AppError, AuthorizationError, NotFoundError } from '@/server/errors';
import { addDays, fromUtc, toUtc, type IsoDate } from '@/domain/dates';
import { GROUP_LABEL, groupsOf, isMusculacao, type GuidelineGroup, type ShareDuty, type ShareSlot } from '@/domain/teacher-share';
import { listGrade } from './schedule-service';

/** Escalas que entram no texto: dos próximos 30 dias. */
const DUTY_DAYS = 30;

/** Tudo para montar o texto da grade de um professor. */
export async function teacherShareData(principal: Principal | null, teacherId: string, date: IsoDate) {
  assertCan(principal, 'teacher.view');
  const [teacher, settings, grade, duties] = await Promise.all([
    prisma.teacher.findUnique({
      where: { id: teacherId },
      select: { name: true, displayName: true, phone: true, guidelines: true, primaryModality: { select: { name: true } }, modalities: { select: { modality: { select: { name: true } } } } },
    }),
    prisma.appSettings.findUnique({ where: { id: 1 }, select: { teacherGuidelines: true, gymGuidelines: true } }),
    listGrade(principal, date),
    prisma.dutyShift.findMany({
      where: { date: { gte: toUtc(date), lte: toUtc(addDays(date, DUTY_DAYS)) }, people: { some: { teacherId } } },
      include: { sector: { select: { name: true } } }, orderBy: [{ date: 'asc' }, { startMin: 'asc' }],
    }),
  ]);
  if (!teacher) throw new NotFoundError('Professor não encontrado.');
  const mine = grade.filter((g) => g.people.some((p) => p.teacherId === teacherId));
  const slots: ShareSlot[] = mine.map((g) => ({
    weekday: g.weekday, startMin: g.startMin, durationMin: g.durationMin, modality: g.modality.name, label: g.label, space: g.space?.name ?? null,
    role: g.people.find((p) => p.teacherId === teacherId)!.role, counts: g.activityType.kind !== 'PERSONAL',
  }));
  const edit = await editableGroups(principal);
  const text: Record<GuidelineGroup, string> = { musculacao: settings?.gymGuidelines ?? '', coletivas: settings?.teacherGuidelines ?? '' };
  const groups = groupsOf([...mine.map((g) => g.modality.name), ...teacher.modalities.map((m) => m.modality.name)], teacher.primaryModality?.name)
    .map((id) => ({ id, name: GROUP_LABEL[id], guidelines: text[id], canEdit: edit.has(id) }));
  return {
    name: teacher.displayName || teacher.name, phone: teacher.phone, date, slots, groups,
    duties: duties.map((d): ShareDuty => ({ date: fromUtc(d.date), startMin: d.startMin, endMin: d.endMin, sector: d.sector.name })),
    specific: teacher.guidelines ?? '',
    canEdit: can(principal, 'schedule.edit'),
  };
}
export type TeacherShareData = Awaited<ReturnType<typeof teacherShareData>>;

/** Quem edita cada mensagem geral: quem edita a grade, na área da Musculação ou em alguma das Aulas Coletivas. */
async function editableGroups(principal: Principal | null): Promise<Set<GuidelineGroup>> {
  const out = new Set<GuidelineGroup>();
  if (!principal || !can(principal, 'schedule.edit')) return out;
  if (principal.areaIds === null) return new Set(['musculacao', 'coletivas']);
  const mods = await prisma.modality.findMany({ where: { areaId: { in: [...principal.areaIds] } }, select: { name: true } });
  for (const m of mods) out.add(isMusculacao(m.name) ? 'musculacao' : 'coletivas');
  return out;
}

const guidelinesSchema = z.object({
  groups: z.object({
    musculacao: z.string().max(4000, 'Mensagem da Musculação: no máximo 4.000 caracteres.').optional(),
    coletivas: z.string().max(4000, 'Mensagem das Aulas Coletivas: no máximo 4.000 caracteres.').optional(),
  }),
  specific: z.string().max(2000, 'Orientações do professor: no máximo 2.000 caracteres.'),
});

/** Salva as mensagens gerais (Musculação × Aulas Coletivas) e as orientações deste professor. */
export async function saveGuidelines(principal: Principal | null, teacherId: string, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'schedule.edit');
  const parsed = guidelinesSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const { groups, specific } = parsed.data;
  const edit = await editableGroups(principal);
  await prisma.$transaction(async (tx) => {
    const t = await tx.teacher.findUnique({ where: { id: teacherId }, select: { name: true, guidelines: true } });
    if (!t) throw new NotFoundError('Professor não encontrado.');
    const cur = await tx.appSettings.findUnique({ where: { id: 1 }, select: { teacherGuidelines: true, gymGuidelines: true } });
    const field = { musculacao: 'gymGuidelines', coletivas: 'teacherGuidelines' } as const;
    for (const g of ['musculacao', 'coletivas'] as const) {
      const text = groups[g]?.trim();
      if (text === undefined || (cur?.[field[g]] ?? '') === text) continue;
      if (!edit.has(g)) throw new AuthorizationError(`A mensagem de ${GROUP_LABEL[g]} não está sob a sua coordenação.`);
      await tx.appSettings.upsert({ where: { id: 1 }, create: { id: 1, [field[g]]: text || null }, update: { [field[g]]: text || null } });
      await audit(tx, { actorId: principal.id, ...meta }, {
        action: 'settings.guidelines', entityType: 'app_settings', entityId: g,
        summary: `${principal.name} atualizou a mensagem geral dos professores de ${GROUP_LABEL[g]}`,
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
