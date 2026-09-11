import { TeamsManager } from '@/components/admin/TeamsManager';
import { EventErrorScreen } from '@/components/EventErrorScreen';
import { getSnapshot } from '@/services/leaderboard-service';
import type { Snapshot } from '@/services/snapshot';

export const dynamic = 'force-dynamic';

export default async function AdminTeamsPage() {
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
          Cadastro
        </p>
        <h1 className="mt-1 font-display text-3xl font-black tracking-tight uppercase">
          Duplas
        </h1>
      </header>

      <TeamsManager snapshot={snapshot} />
    </div>
  );
}
