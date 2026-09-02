import { z } from 'zod';
import { assertCan } from '@/server/auth/rbac';
import { AlertService } from '@/server/services/alert-service';
import { fail, ok, withAuth } from '@/lib/api';

export const GET = withAuth(async (user) => {
  assertCan(user, 'alert:read');
  const alerts = await AlertService.listOpen(50);
  return ok({
    alerts: alerts.map((a) => ({
      id: a.id,
      type: a.type,
      severity: a.severity,
      message: a.message,
      guidance: a.guidance,
      createdAt: a.createdAt.toISOString(),
      student: { id: a.student.id, fullName: a.student.fullName },
    })),
  });
});

export const POST = withAuth(async (user, request: Request) => {
  assertCan(user, 'alert:acknowledge');
  const parsed = z.object({ alertId: z.string().min(1) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail('Alerta inválido.', 400);

  await AlertService.acknowledge(parsed.data.alertId, user.id);
  return ok({ success: true });
});
