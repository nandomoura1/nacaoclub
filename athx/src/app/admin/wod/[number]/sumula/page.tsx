import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Sumula } from '@/components/admin/Sumula';
import { EventErrorScreen } from '@/components/EventErrorScreen';
import { getSnapshot } from '@/services/leaderboard-service';
import type { Snapshot } from '@/services/snapshot';

export const dynamic = 'force-dynamic';

export default async function SumulaPage({
  params,
}: {
  params: Promise<{ number: string }>;
}) {
  const { number } = await params;
  const numero = Number(number);
  if (!Number.isInteger(numero) || numero <= 0) notFound();

  let snapshot: Snapshot;
  try {
    snapshot = await getSnapshot();
  } catch (error) {
    return <EventErrorScreen message={error instanceof Error ? error.message : ''} />;
  }

  const wod = snapshot.wods.find((w) => w.numero === numero);
  if (!wod) notFound();

  return (
    <div className="space-y-5">
      <Link
        href={`/admin/wod/${numero}`}
        className="no-print inline-flex items-center gap-1.5 font-display text-[11px] font-bold tracking-wider text-white/50 uppercase hover:text-nacao-cyan"
      >
        <ArrowLeft size={14} /> Voltar ao lançamento do WOD {numero}
      </Link>

      {/* A súmula é RETRATO; o resto do app imprime em paisagem (a tabela
          do pódio precisa da largura). Como o @page é global, a folha de
          estilo desta rota chega depois e vence — sem afetar as outras. */}
      <style>{'@media print { @page { size: A4 portrait; margin: 10mm; } }'}</style>

      <Sumula snapshot={snapshot} wod={wod} />
    </div>
  );
}
