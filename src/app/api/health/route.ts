import { prisma } from '@/server/db/prisma';
import { getTecnofitProvider } from '@/server/tecnofit';
import { getSyncStatus } from '@/server/services/poller-service';
import { listenerCount } from '@/server/realtime/event-bus';

export const dynamic = 'force-dynamic';

/**
 * Healthcheck. Público de propósito — é consumido por load balancer e
 * monitoramento. Não expõe nenhum dado pessoal nem credencial.
 */
export async function GET() {
  const checks: Record<string, { ok: boolean; detail: string }> = {};

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { ok: true, detail: 'conectado' };
  } catch (err) {
    checks.database = { ok: false, detail: (err as Error).message.slice(0, 120) };
  }

  try {
    const provider = getTecnofitProvider();
    const health = await provider.healthCheck();
    checks.tecnofit = { ok: health.ok, detail: `${provider.name}: ${health.detail}` };
  } catch (err) {
    checks.tecnofit = { ok: false, detail: (err as Error).message.slice(0, 160) };
  }

  const sync = await getSyncStatus().catch(() => null);
  const healthy = Object.values(checks).every((c) => c.ok);

  return Response.json(
    {
      status: healthy ? 'ok' : 'degraded',
      checks,
      sync: {
        lastOkAt: sync?.lastOkAt?.toISOString() ?? null,
        failureCount: sync?.failureCount ?? 0,
      },
      realtimeListeners: listenerCount(),
      at: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 },
  );
}
