import { assertCan } from '@/server/auth/rbac';
import { TurnstileService } from '@/server/services/turnstile-service';
import { ok, withAuth } from '@/lib/api';

export const GET = withAuth(async (user) => {
  assertCan(user, 'turnstile:read');
  const turnstiles = await TurnstileService.listVisible(user);
  return ok({
    turnstiles: turnstiles.map((t) => ({
      id: t.id,
      name: t.name,
      location: t.location,
      modalityLabel: t.modalityLabel,
    })),
    isDefault: user.defaultTurnstileId,
  });
});

/** Sincroniza catracas a partir da API. Só ADMIN — é operação de integração. */
export const POST = withAuth(async (user) => {
  assertCan(user, 'turnstile:sync');
  const result = await TurnstileService.syncFromTecnofit(user.id);
  return ok(result);
});
