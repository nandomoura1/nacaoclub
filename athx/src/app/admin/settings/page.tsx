import { SettingsForm } from '@/components/admin/SettingsForm';
import { EventErrorScreen } from '@/components/EventErrorScreen';
import { getSnapshot } from '@/services/leaderboard-service';
import type { Snapshot } from '@/services/snapshot';

export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
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
          Regras do evento
        </p>
        <h1 className="mt-1 font-display text-3xl font-black tracking-tight uppercase">
          Configurações
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-white/55">
          Tudo o que a especificação do evento ainda não fechou está aqui, explícito e
          editável. O sistema não assume nenhuma regra em silêncio.
        </p>
      </header>

      <SettingsForm settings={snapshot.settings} />
    </div>
  );
}
