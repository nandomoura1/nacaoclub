import { assertCan, assertCanViewTurnstile } from '@/server/auth/rbac';
import { AccessService } from '@/server/services/access-service';
import { AlertService } from '@/server/services/alert-service';
import { RelationshipService } from '@/server/services/relationship-service';
import { TurnstileService } from '@/server/services/turnstile-service';
import { getSyncStatus } from '@/server/services/poller-service';
import { prisma } from '@/server/db/prisma';
import { ok, withAuth } from '@/lib/api';

/**
 * Payload completo do dashboard em UMA chamada.
 *
 * Escolha deliberada: o professor não deve ver a tela montar em pedaços.
 * Uma requisição, uma renderização. O SSE avisa que mudou; esta rota
 * entrega o estado.
 */
export const GET = withAuth(async (user, request: Request) => {
  assertCan(user, 'turnstile:read');

  const url = new URL(request.url);
  const raw = url.searchParams.get('turnstileId');
  const turnstileId = !raw || raw === 'all' ? null : raw;

  if (turnstileId) await assertCanViewTurnstile(user, turnstileId);

  const [turnstiles, events, stats, syncState] = await Promise.all([
    TurnstileService.listVisible(user),
    AccessService.listRecent(user, { turnstileId, limit: 60 }),
    AccessService.todayStats(user, turnstileId),
    getSyncStatus(),
  ]);

  const studentIds = [...new Set(events.map((e) => e.studentId))];

  // Uma nota e a contagem de alertas por aluno — o suficiente para o card
  // responder "o que eu preciso saber" sem abrir o perfil.
  const [latestNotes, alertRows, frequencies] = await Promise.all([
    RelationshipService.latestNoteFor(studentIds),
    studentIds.length
      ? prisma.alert.groupBy({
          by: ['studentId'],
          where: { studentId: { in: studentIds }, resolvedAt: null },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    Promise.all(
      studentIds.map(async (id) => [id, await AccessService.frequency(id)] as const),
    ),
  ]);

  const alertCount = new Map(alertRows.map((r) => [r.studentId, r._count._all]));
  const freqMap = new Map(frequencies);

  const arrivals = events.map((e) => {
    const freq = freqMap.get(e.studentId);
    const note = latestNotes.get(e.studentId);
    const isFirstVisit = (freq?.totalTracked ?? 0) <= 1;

    return {
      id: e.id,
      occurredAt: e.occurredAt.toISOString(),
      turnstile: e.turnstile
        ? { id: e.turnstile.id, name: e.turnstile.name }
        : e.rawTurnstileRef
          ? { id: null, name: e.rawTurnstileRef }
          : null,
      student: {
        id: e.student.id,
        fullName: e.student.fullName,
        firstName: e.student.firstName,
        photoUrl: e.student.photoUrl,
        planName: e.student.planName,
        modalities: e.student.modalities,
      },
      last30Days: freq?.last30Days ?? 0,
      isFirstVisit,
      isFrequent: (freq?.last30Days ?? 0) >= 12,
      latestNote: note ? { category: note.category, content: note.content } : null,
      alertCount: alertCount.get(e.studentId) ?? 0,
    };
  });

  return ok({
    turnstiles: turnstiles.map((t) => ({ id: t.id, name: t.name, location: t.location })),
    selectedTurnstileId: turnstileId,
    canSelectAll: turnstiles.length > 1,
    stats,
    arrivals,
    sync: {
      lastOkAt: syncState?.lastOkAt?.toISOString() ?? null,
      lastRunAt: syncState?.lastRunAt?.toISOString() ?? null,
      failureCount: syncState?.failureCount ?? 0,
    },
    serverTime: new Date().toISOString(),
  });
});
