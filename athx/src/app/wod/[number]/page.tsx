import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { PageIntro } from '@/components/PageIntro';
import { WodPageView } from '@/components/WodPageView';
import { MaintenanceScreen } from '@/components/MaintenanceScreen';
import { EventErrorScreen } from '@/components/EventErrorScreen';
import { getSnapshot } from '@/services/leaderboard-service';
import { capEmTexto } from '@/types/wod';
import type { Snapshot } from '@/services/snapshot';

export const dynamic = 'force-dynamic';

/** O número do WOD na URL. Qual existe é decisão do evento, não do código. */
function parseWod(value: string): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ number: string }>;
}): Promise<Metadata> {
  const { number } = await params;
  const numero = parseWod(number);
  if (!numero) return { title: 'WOD' };

  let nome = '';
  try {
    const snapshot = await getSnapshot();
    nome = snapshot.wods.find((w) => w.numero === numero)?.nome ?? '';
  } catch {
    nome = '';
  }

  return {
    title: nome ? `WOD ${numero} — ${nome}` : `WOD ${numero}`,
  };
}

export default async function WodPage({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const numero = parseWod(number);
  if (!numero) notFound();

  let snapshot: Snapshot;
  try {
    snapshot = await getSnapshot();
  } catch (error) {
    return <EventErrorScreen message={error instanceof Error ? error.message : ''} />;
  }

  if (snapshot.event.maintenanceMode) return <MaintenanceScreen />;

  const wod = snapshot.wods.find((w) => w.numero === numero);
  const cap = capEmTexto(wod?.capSegundos ?? null);

  return (
    <>
      <SiteHeader />
      <PageIntro
        kicker={[wod?.formato, cap ? `CAP ${cap}` : null].filter(Boolean).join(' · ')}
        title={`WOD ${numero}`}
        subtitle={wod?.nome ?? ''}
      >
        <nav aria-label="Escolher WOD">
          <ul className="flex flex-wrap gap-2">
            {snapshot.wods.map(({ numero: n }) => (
              <li key={n}>
                <Link
                  href={`/wod/${n}`}
                  aria-current={n === numero ? 'page' : undefined}
                  className={`block rounded-lg border px-3.5 py-2 font-display text-[11px] font-bold tracking-wider uppercase ${
                    n === numero
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
        <WodPageView initial={snapshot} numero={numero} />
      </main>

      <SiteFooter demo={snapshot.demo} />
    </>
  );
}
