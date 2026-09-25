import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { todayIso } from '@/lib/today';
import { formatDateBR } from '@/domain/dates';
import { parsePeriodKey, periodKey, periodLabel, periodOf, shiftPeriod } from '@/domain/period';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { prisma } from '@/server/db';
import { listOccurrences, periodOverview, periodStartDay } from '@/server/services/period-service';
import { CalendarClient } from './CalendarClient';

export const metadata: Metadata = { title: 'Calendário' };

const STATUS_LABEL: Record<string, string> = {
  ABERTO: 'aberta',
  EM_REVISAO_COORDENACAO: 'em revisão pela coordenação',
  APROVADO_COORDENACAO: 'aprovada pela coordenação',
  REVISAO_ADMINISTRATIVA: 'em revisão administrativa',
  FECHADO: 'fechada',
};

export default async function CalendarioPage({ searchParams }: { searchParams: Promise<{ c?: string; area?: string; aba?: string }> }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'schedule.view')) redirect('/hoje');
  const sp = await searchParams;
  const today = todayIso();
  const startDay = await periodStartDay();
  const ref = parsePeriodKey(sp.c) ?? periodOf(today, startDay);

  const scoped = principal.areaIds === null ? {} : { id: { in: [...principal.areaIds] } };
  const areas = await prisma.coordinationArea.findMany({ where: { deletedAt: null, active: true, ...scoped }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, color: true } });
  const areaId = sp.area && areas.some((a) => a.id === sp.area) ? sp.area : null;

  const overview = await periodOverview(principal, ref, areaId);
  const occurrences = overview.period ? await listOccurrences(principal, { start: overview.start, end: overview.end, areaId }) : [];

  const link = (r: typeof ref) => `/calendario?${new URLSearchParams({ c: periodKey(r), ...(areaId ? { area: areaId } : {}), ...(sp.aba ? { aba: sp.aba } : {}) })}`;

  return (
    <>
      <PageHeader
        title="Calendário"
        description="A competência gerada a partir da grade, com o calendário real: feriados, dias da semana e vigências."
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <Link href={link(shiftPeriod(ref, -1))} className={buttonVariants({ variant: 'secondary', size: 'sm' })} aria-label="Competência anterior"><ChevronLeft /></Link>
          <div className="min-w-44 text-center">
            <p className="text-lg font-extrabold leading-tight text-navy">{periodLabel(ref)}</p>
            <p className="tabular text-xs text-tinta-fraca">{formatDateBR(overview.start)} a {formatDateBR(overview.end)}</p>
          </div>
          <Link href={link(shiftPeriod(ref, 1))} className={buttonVariants({ variant: 'secondary', size: 'sm' })} aria-label="Próxima competência"><ChevronRight /></Link>
        </div>
        {overview.period && <Badge tone={overview.period.status === 'FECHADO' ? 'navy' : 'blue'}>{STATUS_LABEL[overview.period.status]}</Badge>}
        <div className="flex-1" />
        <div className="flex flex-wrap gap-1.5">
          {areas.length > 1 && (
            <Link href={`/calendario?${new URLSearchParams({ c: periodKey(ref), ...(sp.aba ? { aba: sp.aba } : {}) })}`} className={cn('rounded-full px-3 py-1 text-xs font-semibold', !areaId ? 'bg-navy text-white' : 'text-tinta-suave ring-1 ring-borda')}>Todas</Link>
          )}
          {areas.map((a) => (
            <Link key={a.id} href={`/calendario?${new URLSearchParams({ c: periodKey(ref), area: a.id, ...(sp.aba ? { aba: sp.aba } : {}) })}`}
              className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold', areaId === a.id ? 'bg-navy text-white' : 'text-tinta-suave ring-1 ring-borda')}>
              <span className="size-2 rounded-full" style={{ background: a.color }} />{a.name}
            </Link>
          ))}
        </div>
      </div>

      <CalendarClient
        overview={overview}
        occurrences={occurrences}
        today={today}
        areaId={areaId}
        tab={sp.aba === 'aulas' ? 'aulas' : 'horas'}
        canGenerate={can(principal, 'period.generate')}
        canDecide={can(principal, 'occurrence.exception')}
      />
    </>
  );
}
