import { clearSessionCookie, getCurrentUser, requestMeta, revokeCurrentSession } from '@/server/auth/session';
import { AuditService } from '@/server/services/audit-service';
import { ok } from '@/lib/api';

export async function POST() {
  const user = await getCurrentUser();
  await revokeCurrentSession();
  await clearSessionCookie();

  if (user) {
    await AuditService.record({
      userId: user.id,
      action: 'LOGOUT',
      entity: 'User',
      entityId: user.id,
      ...(await requestMeta()),
    });
  }

  return ok({ success: true });
}
