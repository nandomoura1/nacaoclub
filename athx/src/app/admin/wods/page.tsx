import { WodsManager } from '@/components/admin/WodsManager';
import { EventErrorScreen } from '@/components/EventErrorScreen';
import { getSnapshot } from '@/services/leaderboard-service';
import type { Snapshot } from '@/services/snapshot';

export const dynamic = 'force-dynamic';

/**
 * A tela que monta o evento (§48).
 *
 * Workouts, provas e programação deixaram de ser constantes de código. É
 * aqui que a organização desenha a próxima etapa — com outro número de
 * WODs, outras unidades, outros critérios — sem depender de deploy.
 */
export default async function AdminWodsPage() {
  let snapshot: Snapshot;
  try {
    snapshot = await getSnapshot();
  } catch (error) {
    return <EventErrorScreen message={error instanceof Error ? error.message : ''} />;
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="font-display text-[10px] font-bold tracking-kicker text-nacao-cyan uppercase">
          Definição do evento
        </p>
        <h1 className="mt-1 font-display text-3xl font-black tracking-tight uppercase">
          WODs e provas
        </h1>
      </header>

      <WodsManager wods={snapshot.wods} agenda={snapshot.agenda} />
    </div>
  );
}
