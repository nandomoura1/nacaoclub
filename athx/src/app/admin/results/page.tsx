import { ResultsReview } from '@/components/admin/ResultsReview';
import { AuditFeed } from '@/components/admin/AuditFeed';
import { EventErrorScreen } from '@/components/EventErrorScreen';
import { getSnapshot } from '@/services/leaderboard-service';
import { getAuditFeed } from '@/services/audit-service';
import type { Snapshot } from '@/services/snapshot';

export const dynamic = 'force-dynamic';

export default async function AdminResultsPage() {
  let snapshot: Snapshot;
  try {
    snapshot = await getSnapshot();
  } catch (error) {
    return <EventErrorScreen message={error instanceof Error ? error.message : ''} />;
  }

  const auditoria = await getAuditFeed(40);

  return (
    <div className="space-y-6">
      <header>
        <p className="font-display text-[10px] font-bold tracking-kicker text-nacao-cyan uppercase">
          Homologação e auditoria
        </p>
        <h1 className="mt-1 font-display text-3xl font-black tracking-tight uppercase">
          Conferência
        </h1>
      </header>

      <ResultsReview snapshot={snapshot} />
      <AuditFeed entries={auditoria} />
    </div>
  );
}
