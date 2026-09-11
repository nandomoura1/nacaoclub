import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { WodNumber } from '@/types/domain';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { PageIntro } from '@/components/PageIntro';
import { WodPageView } from '@/components/WodPageView';
import { MaintenanceScreen } from '@/components/MaintenanceScreen';
import { EventErrorScreen } from '@/components/EventErrorScreen';
import { getSnapshot } from '@/services/leaderboard-service';
import { WODS } from '@/lib/wods';
import type { Snapshot } from '@/services/snapshot';

export const dynamic = 'force-dynamic';

function parseWod(value: string): WodNumber | null {
  return value === '1' || value === '2' || value === '3' ? (Number(value) as WodNumber) : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ number: string }>;
}): Promise<Metadata> {
  const { number } = await params;
  const wod = parseWod(number);
  if (!wod) return { title: 'WOD' };
  return {
    title: `WOD ${wod} — ${WODS[wod].nome}`,
    description: WODS[wod].resumo,
  };
}

export default async function WodPage({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const wod = parseWod(number);
  if (!wod) notFound();

  let snapshot: Snapshot;
  try {
    snapshot = await getSnapshot();
  } catch (error) {
    return <EventErrorScreen message={error instanceof Error ? error.message : ''} />;
  }

  if (snapshot.event.maintenanceMode) return <MaintenanceScreen />;

  const spec = WODS[wod];

  return (
    <>
      <SiteHeader />
      <PageIntro
        kicker={`${spec.formato} · CAP ${spec.cap}`}
        title={`WOD ${wod}`}
        subtitle={spec.nome}
      >
        <nav aria-label="Escolher WOD">
          <ul className="flex gap-2">
            {([1, 2, 3] as const).map((n) => (
              <li key={n}>
                <Link
                  href={`/wod/${n}`}
                  aria-current={n === wod ? 'page' : undefined}
                  className={`block rounded-lg border px-3.5 py-2 font-display text-[11px] font-bold tracking-wider uppercase ${
                    n === wod
                      ? 'border-nacao-cyan/55 bg-nacao-cyan/15 text-nacao-cyan'
                      : 'border-white/12 bg-white/[0.04] text-white/55 hover:text-white'
                  }`}
                >
                  WOD {n}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </PageIntro>

      <main id="conteudo" className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <WodPageView initial={snapshot} wod={wod} />
      </main>

      <SiteFooter demo={snapshot.demo} />
    </>
  );
}
