import { PatrocinadoresManager } from '@/components/admin/PatrocinadoresManager';
import { EventErrorScreen } from '@/components/EventErrorScreen';
import { getSnapshot } from '@/services/leaderboard-service';
import { slugEmEdicao } from '@/services/event-context';
import type { Snapshot } from '@/services/snapshot';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Patrocinadores' };

export default async function AdminPatrocinadoresPage() {
  let snapshot: Snapshot;
  try {
    // O evento em edição, não o que está no ar: a organização cadastra os
    // parceiros da próxima etapa enquanto a atual ainda roda.
    snapshot = await getSnapshot({ slug: await slugEmEdicao() });
  } catch (error) {
    return <EventErrorScreen message={error instanceof Error ? error.message : ''} />;
  }

  return (
    <PatrocinadoresManager
      patrocinadores={snapshot.patrocinadores}
      nomeDoEvento={snapshot.event.name}
    />
  );
}
