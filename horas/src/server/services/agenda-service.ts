import { prisma } from '@/server/db';
import { can } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import { CALENDAR_KINDS, labelOf } from '@/domain/marketing/constants';
import { addDays } from '@/domain/dates';
import { dt, iso } from './marketing-service';

/**
 * Cronograma da Nação para a tela Hoje: eventos, datas do calendário de
 * marketing e (para quem vê marketing) campanhas — no dia e nos próximos dias.
 * Eventos e datas são informação da casa; campanhas ficam com o marketing.
 */

export interface AgendaItem {
  id: string;
  kind: 'evento' | 'campanha' | 'data';
  title: string;
  start: string;
  end: string | null;
  tag: string;
  href: string | null;
  tentative: boolean;
}

export async function nacaoAgenda(principal: Principal, day: string, ahead = 7): Promise<{ day: AgendaItem[]; next: AgendaItem[] } | null> {
  const mkt = can(principal, 'mkt.view');
  if (!mkt && !can(principal, 'schedule.view')) return null;
  const until = addDays(day, ahead);
  // Começa até o fim da janela e ainda não terminou no dia.
  const overlap = { startDate: { lte: dt(until)! }, OR: [{ endDate: { gte: dt(day)! } }, { endDate: null, startDate: { gte: dt(day)! } }] };
  const [events, items, campaigns] = await Promise.all([
    prisma.mktEvent.findMany({ where: { ...overlap, status: { not: 'CANCELADO' } }, orderBy: { startDate: 'asc' }, take: 40 }),
    prisma.mktCalendarItem.findMany({ where: overlap, orderBy: { startDate: 'asc' }, take: 40 }),
    mkt ? prisma.mktCampaign.findMany({ where: { ...overlap, status: { notIn: ['FINALIZADA', 'ANALISE'] } }, orderBy: { startDate: 'asc' }, take: 20 }) : Promise.resolve([]),
  ]);
  const all: AgendaItem[] = [
    ...events.map((e) => ({ id: e.id, kind: 'evento' as const, title: e.name, start: iso(e.startDate)!, end: iso(e.endDate), tag: 'Evento', href: mkt ? '/marketing/eventos' : null, tentative: e.status === 'PLANEJADO' })),
    ...campaigns.map((c) => ({ id: c.id, kind: 'campanha' as const, title: c.name, start: iso(c.startDate)!, end: iso(c.endDate), tag: 'Campanha', href: `/marketing/campanhas/${c.id}`, tentative: c.status === 'IDEIA' })),
    ...items.map((i) => ({ id: i.id, kind: 'data' as const, title: i.title, start: iso(i.startDate)!, end: iso(i.endDate), tag: labelOf(CALENDAR_KINDS, i.kind), href: mkt ? '/marketing/calendario' : null, tentative: false })),
  ].sort((a, b) => a.start.localeCompare(b.start) || a.kind.localeCompare(b.kind));
  const onDay = (a: AgendaItem) => a.start <= day && (a.end ?? a.start) >= day;
  return { day: all.filter(onDay), next: all.filter((a) => !onDay(a) && a.start > day) };
}
