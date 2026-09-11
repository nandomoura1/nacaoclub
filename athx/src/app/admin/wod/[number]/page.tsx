import { notFound } from 'next/navigation';
import type { WodNumber } from '@/types/domain';
import { WOD_META } from '@/types/domain';
import { WodEntry } from '@/components/admin/WodEntry';
import { EventErrorScreen } from '@/components/EventErrorScreen';
import { getSnapshot } from '@/services/leaderboard-service';
import { WODS } from '@/lib/wods';
import type { Snapshot } from '@/services/snapshot';

export const dynamic = 'force-dynamic';

function parseWod(value: string): WodNumber | null {
  return value === '1' || value === '2' || value === '3' ? (Number(value) as WodNumber) : null;
}

export default async function AdminWodPage({
  params,
}: {
  params: Promise<{ number: string }>;
}) {
  const { number } = await params;
  const wod = parseWod(number);
  if (!wod) notFound();

  let snapshot: Snapshot;
  try {
    snapshot = await getSnapshot();
  } catch (error) {
    return <EventErrorScreen message={error instanceof Error ? error.message : ''} />;
  }

  const spec = WODS[wod];

  return (
    <div className="space-y-6">
      <header>
        <p className="font-display text-[10px] font-bold tracking-kicker text-nacao-cyan uppercase">
          Lançamento de resultados
        </p>
        <h1 className="mt-1 font-display text-3xl font-black tracking-tight uppercase">
          WOD {wod} — {WOD_META[wod].name}
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-white/55">{spec.resumo}</p>
      </header>

      <WodEntry snapshot={snapshot} wod={wod} />
    </div>
  );
}
