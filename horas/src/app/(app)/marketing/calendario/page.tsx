import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/card';
import { addDays } from '@/domain/dates';
import { mondayOf, monthEnd } from '@/domain/marketing/calendar';
import { todayIso } from '@/lib/today';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { calendarEntries, mktOptions } from '@/server/services/marketing-service';
import { CalendarClient, type CalView } from './CalendarClient';

export const metadata: Metadata = { title: 'Calendário de Marketing' };

type SP = { v?: string; d?: string; tipo?: string; area?: string; responsavel?: string; modalidade?: string; status?: string; campanha?: string };

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'mkt.view')) redirect('/hoje');
  const sp = await searchParams;
  const today = todayIso();
  const view: CalView = sp.v === 'semana' || sp.v === 'ano' ? sp.v : 'mes';
  const anchor = sp.d && /^\d{4}-\d{2}-\d{2}$/.test(sp.d) ? sp.d : today;
  const [from, to] = view === 'semana' ? [mondayOf(anchor), addDays(mondayOf(anchor), 6)]
    : view === 'ano' ? [`${anchor.slice(0, 4)}-01-01`, `${anchor.slice(0, 4)}-12-31`]
    : [mondayOf(`${anchor.slice(0, 7)}-01`), addDays(mondayOf(monthEnd(anchor.slice(0, 7))), 6)];
  const [all, options] = await Promise.all([calendarEntries(principal, from, to), mktOptions()]);
  const entries = all.filter((e) =>
    (!sp.tipo || e.kind === sp.tipo || e.kind === 'feriado')
    && (!sp.area || e.kind !== 'tarefa' || e.areaKey === sp.area)
    && (!sp.responsavel || e.ownerId === sp.responsavel || e.kind === 'feriado')
    && (!sp.modalidade || e.modalityId === sp.modalidade || e.kind === 'feriado' || e.kind === 'tarefa')
    && (!sp.status || e.status === sp.status || e.kind === 'feriado')
    && (!sp.campanha || e.campaignId === sp.campanha || e.kind === 'feriado'),
  );
  return (
    <>
      <PageHeader title="Calendário de Marketing" description="Campanhas, eventos, tarefas, datas e feriados num só lugar. Arraste para remarcar." />
      <CalendarClient view={view} anchor={anchor} today={today} entries={entries} options={options} filters={sp} canEdit={can(principal, 'mkt.edit')} />
    </>
  );
}
