import { notFound } from 'next/navigation';
import { ClipboardList } from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';
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
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-display text-[10px] font-bold tracking-kicker text-nacao-cyan uppercase">
            Lançamento de resultados
          </p>
          {wod.resumo ? (
            <p className="mt-1.5 max-w-2xl text-sm text-white/55">{wod.resumo}</p>
          ) : null}
        </div>

        {/* A súmula é o mesmo lançamento em formato de prancheta: dá para
            imprimir em branco antes da bateria, ou digitar por lá. */}
        <ButtonLink href={`/admin/wod/${numero}/sumula`} variant="secondary" size="sm">
          <ClipboardList size={15} /> Súmula do árbitro
        </ButtonLink>
      </header>

      <WodEntry snapshot={snapshot} wod={wod} />
    </div>
  );
}
