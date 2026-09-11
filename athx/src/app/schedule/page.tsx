import type { Metadata } from 'next';
import type { Battery } from '@/types/domain';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { PageIntro } from '@/components/PageIntro';
import { ScheduleTimeline } from '@/components/ScheduleTimeline';
import { getSnapshot } from '@/services/leaderboard-service';
import type { Team } from '@/types/domain';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Programação',
  description: 'Cronograma e baterias do Nação Celebration — 12 de setembro, Nação Club.',
};

/** Timeline do evento (§37), com as duplas de cada bateria. */
export default async function SchedulePage() {
  // A programação não depende do banco para existir: se o evento não carregar,
  // os horários continuam sendo exibidos, só sem a lista de duplas.
  let teams: Team[] = [];
  let demo = false;
  try {
    const snapshot = await getSnapshot();
    teams = snapshot.teams.filter((t) => t.status !== 'DESCLASSIFICADA');
    demo = snapshot.demo;
  } catch {
    teams = [];
  }

  const porBateria = (b: Battery) =>
    teams.filter((t) => t.battery === b).sort((a, c) => a.teamNumber - c.teamNumber);

  return (
    <>
      <SiteHeader />
      <PageIntro
        kicker="12 de setembro · Nação Club"
        title="Programação"
        subtitle="Horários e baterias"
      />

      <main id="conteudo" className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <ScheduleTimeline bateria1={porBateria(1)} bateria2={porBateria(2)} />
      </main>

      <SiteFooter demo={demo} />
    </>
  );
}
