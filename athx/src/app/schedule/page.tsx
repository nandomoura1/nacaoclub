import type { Metadata } from 'next';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { PageIntro } from '@/components/PageIntro';
import { ScheduleTimeline } from '@/components/ScheduleTimeline';
import { getSnapshot } from '@/services/leaderboard-service';
import type { Team } from '@/types/domain';
import type { AgendaItem } from '@/types/wod';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Programação',
  description: 'Cronograma e baterias do Nação Celebration — 12 de setembro, Nação Club.',
};

/** Timeline do evento (§37), com as duplas de cada bateria. */
export default async function SchedulePage() {
  // A programação agora é dado: sem evento carregado não há horários a
  // mostrar, e dizer isso é melhor do que inventar um cronograma.
  let teams: Team[] = [];
  let agenda: AgendaItem[] = [];
  let demo = false;
  try {
    const snapshot = await getSnapshot();
    teams = snapshot.teams.filter((t) => t.status !== 'DESCLASSIFICADA');
    agenda = snapshot.agenda;
    demo = snapshot.demo;
  } catch {
    teams = [];
  }

  // Quais baterias existem sai da agenda e das duplas, não de um 1 e um 2.
  const baterias = [
    ...new Set([
      ...agenda.map((a) => a.bateria).filter((b): b is number => b !== null),
      ...teams.map((t) => t.battery),
    ]),
  ].sort((a, b) => a - b);

  const duplasPorBateria: Record<number, typeof teams> = {};
  for (const b of baterias) {
    duplasPorBateria[b] = teams
      .filter((t) => t.battery === b)
      .sort((a, c) => a.teamNumber - c.teamNumber);
  }

  return (
    <>
      <SiteHeader />
      <PageIntro
        kicker="12 de setembro · Nação Club"
        title="Programação"
        subtitle="Horários e baterias"
      />

      <main id="conteudo" className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <ScheduleTimeline agenda={agenda} duplasPorBateria={duplasPorBateria} />
      </main>

      <SiteFooter demo={demo} />
    </>
  );
}
