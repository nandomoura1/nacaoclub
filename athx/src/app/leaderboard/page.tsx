import type { Metadata } from 'next';
import { LeaderboardView } from '@/components/LeaderboardView';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { PageIntro } from '@/components/PageIntro';
import { MaintenanceScreen } from '@/components/MaintenanceScreen';
import { EventErrorScreen } from '@/components/EventErrorScreen';
import { getSnapshot } from '@/services/leaderboard-service';
import type { Snapshot } from '@/services/snapshot';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Leaderboard ao vivo',
  description: 'Classificação geral do Nação Celebration em tempo real.',
};

/**
 * `?evento=<endereco>` abre uma etapa específica — é assim que um evento
 * arquivado continua consultável. Sem o parâmetro, mostra a etapa no ar.
 */
export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ evento?: string }>;
}) {
  const { evento } = await searchParams;

  let snapshot: Snapshot;
  try {
    snapshot = await getSnapshot({ slug: evento ?? null });
  } catch (error) {
    return <EventErrorScreen message={error instanceof Error ? error.message : ''} />;
  }

  if (snapshot.event.maintenanceMode) return <MaintenanceScreen />;

  const arquivado = snapshot.event.status === 'FINISHED';

  return (
    <>
      <SiteHeader />
      <PageIntro
        kicker={snapshot.event.name}
        title="Leaderboard"
        subtitle={arquivado ? 'Resultado final' : 'Ao vivo'}
      />

      <main id="conteudo" className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
        <LeaderboardView initial={snapshot} />
      </main>

      <SiteFooter demo={snapshot.demo} />
    </>
  );
}
