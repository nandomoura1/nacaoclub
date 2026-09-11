import { Hero } from '@/components/Hero';
import { EventSummary } from '@/components/EventSummary';
import { LeaderboardView } from '@/components/LeaderboardView';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { getSnapshot } from '@/services/leaderboard-service';
import { MaintenanceScreen } from '@/components/MaintenanceScreen';
import { EventErrorScreen } from '@/components/EventErrorScreen';
import type { Snapshot } from '@/services/snapshot';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  let snapshot: Snapshot;
  try {
    snapshot = await getSnapshot();
  } catch (error) {
    return <EventErrorScreen message={error instanceof Error ? error.message : ''} />;
  }

  if (snapshot.event.maintenanceMode) {
    return <MaintenanceScreen />;
  }

  return (
    <>
      <SiteHeader />
      <Hero live={snapshot.event.liveMode} lastUpdate={snapshot.lastUpdate} />

      <main id="conteudo" className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <EventSummary teamCount={snapshot.teams.length} live={snapshot.event.liveMode} />

        <div className="mt-10">
          <LeaderboardView initial={snapshot} />
        </div>
      </main>

      <SiteFooter demo={snapshot.demo} />
    </>
  );
}
