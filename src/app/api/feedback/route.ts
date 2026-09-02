import { z } from 'zod';
import { assertCan } from '@/server/auth/rbac';
import { requestMeta } from '@/server/auth/session';
import { QUICK_FEEDBACKS, RelationshipService, type QuickFeedbackKey } from '@/server/services/relationship-service';
import { fail, ok, withAuth } from '@/lib/api';

const KEYS = QUICK_FEEDBACKS.map((f) => f.key) as [QuickFeedbackKey, ...QuickFeedbackKey[]];

const schema = z.object({
  studentId: z.string().min(1),
  key: z.enum(KEYS),
});

/** Feedback de um clique. Menos de cinco segundos, do toque ao registro. */
export const POST = withAuth(async (user, request: Request) => {
  assertCan(user, 'feedback:create');

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail('Feedback inválido.', 400);

  const event = await RelationshipService.createQuickFeedback(user, parsed.data, await requestMeta());

  return ok(
    {
      event: {
        id: event.id,
        type: event.type,
        label: event.label,
        author: event.user.name,
        at: event.createdAt.toISOString(),
      },
    },
    201,
  );
});
