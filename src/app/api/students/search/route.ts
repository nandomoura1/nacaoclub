import { assertCan } from '@/server/auth/rbac';
import { StudentService } from '@/server/services/student-service';
import { ok, withAuth } from '@/lib/api';

/**
 * Busca global (seção 29).
 *
 * Retorna apenas o mínimo necessário para identificar e navegar. CPF nunca
 * é critério nem resultado — princípio da minimização.
 */
export const GET = withAuth(async (user, request: Request) => {
  assertCan(user, 'student:search');

  const q = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (q.length < 2) return ok({ results: [] });

  const students = await StudentService.search(q, 15);

  return ok({
    results: students.map((s) => ({
      id: s.id,
      fullName: s.fullName,
      photoUrl: s.photoUrl,
      planName: s.planName,
      modalities: s.modalities,
      lastSeenAt: s.lastSeenAt?.toISOString() ?? null,
    })),
  });
});
