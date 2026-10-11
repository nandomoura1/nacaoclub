import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/card';
import { todayIso } from '@/lib/today';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { listEvents, mktOptions } from '@/server/services/marketing-service';
import { EventsClient } from './EventsClient';

export const metadata: Metadata = { title: 'Eventos' };

export default async function Page({ searchParams }: { searchParams: Promise<{ novo?: string }> }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'mkt.view')) redirect('/hoje');
  const today = todayIso();
  const [events, options, sp] = await Promise.all([listEvents(principal, today), mktOptions(), searchParams]);
  return (
    <>
      <PageHeader title="Eventos" description="Eventos da Nação e as campanhas que preparam cada um." />
      <EventsClient today={today} events={events} options={options} openNew={sp.novo === '1'} perms={{ edit: can(principal, 'mkt.edit'), del: can(principal, 'mkt.approve') }} />
    </>
  );
}
