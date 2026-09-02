import { assertCan } from '@/server/auth/rbac';
import { AccessService } from '@/server/services/access-service';
import { AlertService } from '@/server/services/alert-service';
import { RelationshipService } from '@/server/services/relationship-service';
import { StudentService } from '@/server/services/student-service';
import { fail, ok, withAuth } from '@/lib/api';

type Ctx = { params: Promise<{ id: string }> };

/** Perfil completo do aluno (seções 15 a 22) em uma única chamada. */
export const GET = withAuth(async (user, _request: Request, ctx: Ctx) => {
  assertCan(user, 'student:read');
  const { id } = await ctx.params;

  const student = await StudentService.getById(id);
  if (!student) return fail('Aluno não encontrado.', 404);

  const [frequency, history, timeline, alerts] = await Promise.all([
    AccessService.frequency(id),
    AccessService.historyForStudent(id, 30),
    RelationshipService.timeline(id),
    AlertService.listForStudent(id),
  ]);

  const memberSince = student.memberSince;
  const membershipMonths = memberSince
    ? Math.max(0, Math.floor((Date.now() - memberSince.getTime()) / (30.44 * 86_400_000)))
    : null;

  return ok({
    student: {
      id: student.id,
      tecnofitStudentId: student.tecnofitStudentId,
      fullName: student.fullName,
      firstName: student.firstName,
      photoUrl: student.photoUrl,
      status: student.status,
      planName: student.planName,
      modalities: student.modalities,
      memberSince: memberSince?.toISOString() ?? null,
      membershipMonths,
      planExpiresAt: student.planExpiresAt?.toISOString() ?? null,
      syncedAt: student.syncedAt?.toISOString() ?? null,
    },
    frequency: {
      ...frequency,
      lastVisitAt: frequency.lastVisitAt?.toISOString() ?? null,
      firstSeenAt: frequency.firstSeenAt?.toISOString() ?? null,
    },
    history: history.map((h) => ({
      id: h.id,
      occurredAt: h.occurredAt.toISOString(),
      turnstileName: h.turnstile?.name ?? h.rawTurnstileRef ?? null,
      modality: h.turnstile?.modalityLabel ?? null,
      eventType: h.eventType,
    })),
    timeline: timeline.map((item) =>
      item.kind === 'note'
        ? {
            kind: 'note' as const,
            id: item.note.id,
            at: item.at.toISOString(),
            category: item.note.category,
            content: item.note.content,
            author: item.note.author.name,
            authorId: item.note.author.id,
            editedAt:
              item.note.updatedAt.getTime() - item.note.createdAt.getTime() > 1000
                ? item.note.updatedAt.toISOString()
                : null,
          }
        : {
            kind: 'event' as const,
            id: item.event.id,
            at: item.at.toISOString(),
            type: item.event.type,
            label: item.event.label,
            emoji: (item.event.metadata as { emoji?: string } | null)?.emoji ?? null,
            author: item.event.user.name,
            authorId: item.event.user.id,
          },
    ),
    alerts: alerts.map((a) => ({
      id: a.id,
      type: a.type,
      severity: a.severity,
      message: a.message,
      guidance: a.guidance,
      createdAt: a.createdAt.toISOString(),
    })),
  });
});
