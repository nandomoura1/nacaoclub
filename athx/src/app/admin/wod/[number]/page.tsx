import { notFound } from 'next/navigation';
import { WodEntry } from '@/components/admin/WodEntry';
import { EventErrorScreen } from '@/components/EventErrorScreen';
import { getSnapshot } from '@/services/leaderboard-service';
import type { Snapshot } from '@/services/snapshot';

export const dynamic = 'force-dynamic';

/** Qual WOD existe é decisão do evento, não do código. */
function parseWod(value: string): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export default async function AdminWodPage({
  params,
}: {
  params: Promise<{ number: string }>;
}) {
  const { number } = await params;
  const numero = parseWod(number);
  if (!numero) notFound();

  let snapshot: Snapshot;
  try {
    snapshot = await getSnapshot();
  } catch (error) {
    return <EventErrorScreen message={error instanceof Error ? error.message : ''} />;
  }

  const wod = snapshot.wods.find((w) => w.numero === numero);
  if (!wod) notFound();

  return (
    <div className="space-y-6">
      <header>
        <p className="font-display text-[10px] font-bold tracking-kicker text-nacao-cyan uppercase">
          Lançamento de resultados
        </p>
        {wod.resumo ? (
          <p className="mt-1.5 max-w-2xl text-sm text-white/55">{wod.resumo}</p>
        ) : null}
      </header>

      <WodEntry snapshot={snapshot} wod={wod} />
    </div>
  );
}
