import type { Metadata } from 'next';
import { DisplayLeaderboard } from '@/components/DisplayLeaderboard';
import { EventErrorScreen } from '@/components/EventErrorScreen';
import { MaintenanceScreen } from '@/components/MaintenanceScreen';
import { getSnapshot } from '@/services/leaderboard-service';
import type { Snapshot } from '@/services/snapshot';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Telão',
  description: 'Leaderboard ao vivo em modo telão.',
  robots: { index: false, follow: false },
};

/** /display — versão para TV/telão. Sem menu, sem rodapé, sem distração. */
export default async function DisplayPage() {
  let snapshot: Snapshot;
  try {
    snapshot = await getSnapshot();
  } catch (error) {
    return <EventErrorScreen message={error instanceof Error ? error.message : ''} />;
  }

  if (snapshot.event.maintenanceMode) return <MaintenanceScreen />;

  return <DisplayLeaderboard initial={snapshot} />;
}
