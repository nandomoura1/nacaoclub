import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/server/db';
import { audit } from '@/server/audit';
import { assertAreaAccess, assertCan } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import type { RequestMeta } from '@/server/auth/session';
import { AppError, NotFoundError } from '@/server/errors';
import { formatDateBR, fromUtc, isIsoDate, toUtc } from '@/domain/dates';
import { applyLateness, type LateApplied } from '@/domain/lateness';
import { formatMinutes } from '@/lib/format';

/**
 * Atraso do professor horista (ficha → Ausências → "Lançar atraso"; decisão 24/11): 1h de atraso = 1h a menos na carga.
 * Tira os minutos das aulas que ele deu no dia, a partir da primeira (o total da competência cai sozinho). Anulável.
 */

const schema = z.object({
  date: z.string().refine(isIsoDate, 'Data inválida.'),
  minutes: z.number().int().min(1, 'Informe o tempo de atraso.').max(12 * 60, 'Atraso grande demais.'),
  notes: z.string().trim().max(300).nullable(),
});

const OK_ASSIGN = ['PREVISTA', 'REALIZADA', 'SUBSTITUIDA'] as const;

export async function saveLateness(principal: Principal | null, teacherId: string, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'leave.manage');
  const p = schema.safeParse(input);
  if (!p.success) throw new AppError(p.error.issues[0]?.message ?? 'Dados inválidos.');
  const d = p.data;
  return prisma.$transaction(async (tx) => {
    const teacher = await tx.teacher.findUnique({ where: { id: teacherId }, select: { name: true } });
    if (!teacher) throw new NotFoundError('Professor não encontrado.');
    const rows = await tx.classAssignment.findMany({
      where: {
        executingTeacherId: teacherId, status: { in: [...OK_ASSIGN] },
        occurrence: { date: toUtc(d.date), status: { in: ['PREVISTA', 'REALIZADA'] }, activityType: { countsHours: true } },
      },
      include: { occurrence: { select: { startMin: true, modality: { select: { areaId: true, name: true } }, period: { select: { status: true } } } } },
    });
    if (!rows.length) throw new AppError(`${teacher.name} não tem aula que conte horas em ${formatDateBR(d.date)} (a competência já foi gerada?).`);
    if (rows.some((r) => r.occurrence.period.status === 'FECHADO')) throw new AppError('A competência deste dia está fechada: não dá para lançar o atraso.');
    for (const r of rows) assertAreaAccess(principal, r.occurrence.modality.areaId);
    const { applied, rest } = applyLateness(rows.map((r) => ({ assignmentId: r.id, startMin: r.occurrence.startMin, minutes: r.minutes })), d.minutes);
    if (rest > 0) throw new AppError(`O atraso (${formatMinutes(d.minutes)}) é maior que as aulas do dia (${formatMinutes(d.minutes - rest)}). Lance uma falta.`);
    for (const a of applied) await tx.classAssignment.update({ where: { id: a.assignmentId }, data: { minutes: a.after } });
    const l = await tx.teacherLateness.create({ data: { teacherId, date: toUtc(d.date), minutes: d.minutes, notes: d.notes || null, applied: applied as unknown as Prisma.InputJsonValue, createdBy: principal.id } });
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: 'lateness.created', entityType: 'teacher_lateness', entityId: l.id, after: { professor: teacher.name, data: d.date, minutos: d.minutes, aulas: applied.length },
      summary: `${principal.name} lançou atraso de ${formatMinutes(d.minutes)} para ${teacher.name} em ${formatDateBR(d.date)} (${applied.length} aula(s) com menos tempo)`,
    });
    return { id: l.id, classes: applied.length };
  });
}

export async function cancelLateness(principal: Principal | null, id: string, meta: RequestMeta) {
  assertCan(principal, 'leave.manage');
  return prisma.$transaction(async (tx) => {
    const l = await tx.teacherLateness.findUnique({ where: { id }, include: { teacher: { select: { name: true } } } });
    if (!l || l.cancelledAt) throw new NotFoundError('Atraso não encontrado.');
    const applied = l.applied as unknown as LateApplied[];
    const current = await tx.classAssignment.findMany({ where: { id: { in: applied.map((a) => a.assignmentId) } }, include: { occurrence: { select: { period: { select: { status: true } } } } } });
    if (current.some((c) => c.occurrence.period.status === 'FECHADO')) throw new AppError('A competência deste dia está fechada: o atraso não pode mais ser anulado.');
    let restored = 0;
    for (const a of applied) {
      const c = current.find((x) => x.id === a.assignmentId);
      // Só volta o que ainda está como o atraso deixou (mudança posterior na aula é preservada).
      if (c && c.minutes === a.after) { await tx.classAssignment.update({ where: { id: c.id }, data: { minutes: a.before } }); restored++; }
    }
    await tx.teacherLateness.update({ where: { id }, data: { cancelledAt: new Date(), cancelledBy: principal.id } });
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: 'lateness.cancelled', entityType: 'teacher_lateness', entityId: id, before: { minutos: l.minutes, data: fromUtc(l.date) }, after: { aulasRestauradas: restored },
      summary: `${principal.name} anulou o atraso de ${formatMinutes(l.minutes)} de ${l.teacher.name} em ${formatDateBR(fromUtc(l.date))}`,
    });
    return { restored, skipped: applied.length - restored };
  });
}

export async function listLateness(principal: Principal | null, teacherId: string) {
  assertCan(principal, 'teacher.view');
  const rows = await prisma.teacherLateness.findMany({ where: { teacherId }, orderBy: { date: 'desc' }, take: 60 });
  return rows.map((l) => ({ id: l.id, date: fromUtc(l.date), minutes: l.minutes, notes: l.notes, classes: (l.applied as unknown as LateApplied[]).length, cancelled: !!l.cancelledAt }));
}
export type LatenessItem = Awaited<ReturnType<typeof listLateness>>[number];
