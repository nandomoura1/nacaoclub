import type { Metadata } from 'next';
import Link from 'next/link';
import { CalendarClock, CalendarPlus, ShieldCheck, Repeat2 } from 'lucide-react';
import { Card, PageHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { OccurrenceCard } from '@/components/occurrence/OccurrenceCard';
import { cn } from '@/lib/cn';
import { formatMinutes } from '@/lib/format';
import { todayIso } from '@/lib/today';
import { WEEKDAYS, addDays, formatClock, formatDateBR, weekdayOf } from '@/domain/dates';
import { periodKey, periodLabel, periodOf } from '@/domain/period';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { prisma } from '@/server/db';
import { listOccurrences, periodStartDay } from '@/server/services/period-service';

export const metadata: Metadata = { title: 'Hoje' };

const saudacao = () => {
  const h = Number(new Intl.DateTimeFormat('pt-BR', { hour: 'numeric', hour12: false, timeZone: 'America/Sao_Paulo' }).format(new Date()));
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
};

const NEXT = [
  { icon: Repeat2, etapa: 'E5', titulo: 'Exceções em 4 toques', texto: 'Falta, substituição, cancelamento com motivo, aula avulsa e férias em lote — direto do celular.' },
  { icon: ShieldCheck, etapa: 'E6', titulo: 'Fechamento por área', texto: 'Cada coordenação aprova a sua parte; o admin fecha e exporta para a folha.' },
];

export default async function HojePage({ searchParams }: { searchParams: Promise<{ dia?: string }> }) {
  const principal = await requirePrincipal();
  const sp = await searchParams;
  const today = todayIso();
  const tomorrow = sp.dia === 'amanha';
  const day = tomorrow ? addDays(today, 1) : today;
  const startDay = await periodStartDay();
  const ref = periodOf(day, startDay);
  const period = await prisma.payrollPeriod.findUnique({ where: { year_month: { year: ref.year, month: ref.month } } });
  const canView = can(principal, 'schedule.view');
  const lessons = canView && period?.generatedAt ? await listOccurrences(principal, { start: day, end: day }) : [];

  const nowMin = (() => {
    const [h, m] = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Sao_Paulo' }).format(new Date()).split(':').map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  })();
  const active = lessons.filter((l) => l.status !== 'CANCELADA');
  const minutes = active.filter((l) => l.activityType.countsHours).reduce((s, l) => s + l.durationMin * Math.max(1, l.people.length), 0);
  const pending = lessons.filter((l) => l.status === 'AGUARDANDO_DECISAO_FERIADO' || (l.status !== 'CANCELADA' && l.people.length === 0));
  const hours = [...new Set(lessons.map((l) => l.startMin))].sort((a, b) => a - b);

  return (
    <>
      <PageHeader
        title={`${saudacao()}, ${principal.name.split(' ')[0]}`}
        description={`${WEEKDAYS[weekdayOf(day) - 1]!.long}, ${formatDateBR(day)} · competência ${periodLabel(ref)}`}
      />

      <div className="mb-4 flex items-center gap-2">
        <nav className="flex rounded-lg bg-white p-1 ring-1 ring-borda">
          <Link href="/hoje" className={cn('rounded-md px-3 py-1.5 text-sm font-semibold', !tomorrow ? 'bg-navy text-white' : 'text-tinta-suave')}>Hoje</Link>
          <Link href="/hoje?dia=amanha" className={cn('rounded-md px-3 py-1.5 text-sm font-semibold', tomorrow ? 'bg-navy text-white' : 'text-tinta-suave')}>Amanhã</Link>
        </nav>
        <div className="flex-1" />
        {lessons.length > 0 && (
          <p className="text-right text-sm text-tinta-suave">
            <b className="tabular text-navy">{active.length}</b> aulas · <b className="tabular text-navy">{formatMinutes(minutes)}</b> de professores
          </p>
        )}
      </div>

      {pending.length > 0 && (
        <Card className="mb-4 flex items-center gap-3 border-critico/30 bg-critico/5 p-4">
          <CalendarClock className="size-5 shrink-0 text-critico" />
          <p className="flex-1 text-sm font-semibold text-critico">
            {pending.length} aula(s) precisam de atenção: {pending.filter((p) => p.status === 'AGUARDANDO_DECISAO_FERIADO').length ? 'feriado a decidir' : 'sem professor'}.
          </p>
          <Link href={`/calendario?c=${periodKey(ref)}`} className={buttonVariants({ size: 'sm', variant: 'secondary' })}>Resolver</Link>
        </Card>
      )}

      {!period?.generatedAt ? (
        <Card className="mb-6 flex flex-col items-center gap-3 p-8 text-center">
          <CalendarPlus className="size-8 text-nacao" />
          <p className="font-bold text-navy">A competência {periodLabel(ref)} ainda não foi gerada</p>
          <p className="max-w-md text-sm text-tinta-suave">Assim que for gerada a partir da grade, as aulas do dia aparecem aqui.</p>
          {can(principal, 'period.generate') && <Link href={`/calendario?c=${periodKey(ref)}`} className={buttonVariants()}>Ir para o calendário</Link>}
        </Card>
      ) : lessons.length === 0 ? (
        <Card className="mb-6 p-8 text-center text-sm text-tinta-suave">Nenhuma aula {tomorrow ? 'amanhã' : 'hoje'} nas suas áreas.</Card>
      ) : (
        <div className="mb-8 space-y-4">
          {hours.map((h) => {
            const now = !tomorrow && nowMin >= h && lessons.some((l) => l.startMin === h && nowMin < l.startMin + l.durationMin);
            return (
              <section key={h}>
                <h2 className="mb-2 flex items-center gap-2 text-xs font-extrabold tracking-[0.14em] text-tinta-fraca">
                  <span className={cn('tabular', now && 'text-nacao')}>{formatClock(h)}</span>
                  {now && <Badge tone="blue">agora</Badge>}
                  <span className="h-px flex-1 bg-borda" />
                </h2>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {lessons.filter((l) => l.startMin === h).map((l) => <OccurrenceCard key={l.id} o={l} />)}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <h2 className="mb-3 text-sm font-bold text-navy">Chegando nas próximas etapas</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {NEXT.map(({ icon: Icon, etapa, titulo, texto }) => (
          <Card key={titulo} className="flex gap-4 p-5">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-nacao/10 text-nacao"><Icon className="size-5" /></span>
            <div>
              <div className="flex items-center gap-2"><p className="font-bold text-navy">{titulo}</p><Badge tone="cyan">{etapa}</Badge></div>
              <p className="mt-1 text-sm text-tinta-suave">{texto}</p>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
