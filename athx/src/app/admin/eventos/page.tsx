import { EventosManager } from '@/components/admin/EventosManager';
import { EventErrorScreen } from '@/components/EventErrorScreen';
import { listarEventos, slugEmEdicao, type EventoResumo } from '@/services/event-context';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Eventos' };

export default async function AdminEventosPage() {
  let eventos: EventoResumo[];
  let slug: string | null;

  try {
    [eventos, slug] = await Promise.all([listarEventos(), slugEmEdicao()]);
  } catch (error) {
    return <EventErrorScreen message={error instanceof Error ? error.message : ''} />;
  }

  return <EventosManager eventos={eventos} slugEmEdicao={slug} />;
}
