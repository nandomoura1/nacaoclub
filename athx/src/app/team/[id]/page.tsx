import type { Metadata } from 'next';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { TeamDetail } from '@/components/TeamDetail';
import { MaintenanceScreen } from '@/components/MaintenanceScreen';
import { EventErrorScreen } from '@/components/EventErrorScreen';
import { getSnapshot } from '@/services/leaderboard-service';
import type { Snapshot } from '@/services/snapshot';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const snapshot = await getSnapshot();
    const team = snapshot.teams.find((t) => t.id === id);
    return { title: team ? team.teamName : 'Dupla' };
  } catch {
    return { title: 'Dupla' };
  }
}

export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let snapshot: Snapshot;
  try {
    snapshot = await getSnapshot();
  } catch (error) {
    return <EventErrorScreen message={error instanceof Error ? error.message : ''} />;
  }

  if (snapshot.event.maintenanceMode) return <MaintenanceScreen />;

  return (
    <>
      <SiteHeader />
      <main id="conteudo" className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
        <TeamDetail initial={snapshot} teamId={id} />
      </main>
      <SiteFooter demo={snapshot.demo} />
    </>
  );
}
