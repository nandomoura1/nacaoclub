import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card, PageHeader } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { isIsoDate } from '@/domain/dates';
import { dutyTitle } from '@/domain/duty';
import { cn } from '@/lib/cn';
import { todayIso } from '@/lib/today';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { dutyPeople, loadDuty, upcomingRanges } from '@/server/services/duty-service';
import { DutyClient } from './DutyClient';

export const metadata: Metadata = { title: 'Escalas' };

export default async function EscalasPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'duty.edit')) redirect('/hoje');
  const q = await searchParams;
  const ranges = await upcomingRanges(todayIso());
  const first = ranges.weekends[0]!;
  const de = isIsoDate(q.de ?? '') ? q.de! : first.start;
  const ate = isIsoDate(q.ate ?? '') && q.ate! >= de ? q.ate! : de === first.start ? first.end : de;
  const [duty, people] = await Promise.all([loadDuty(principal, de, ate), dutyPeople(principal)]);
  const shortcuts = [...ranges.weekends, ...ranges.holidays];

  return (
    <>
      <PageHeader
        title="Escalas de fim de semana e feriados"
        description="Lance quem fica em cada setor. As horas entram sozinhas como plantão de quem trabalhou (quadro de horas, relatórios e ficha). Depois é só gerar o PDF ou o texto para os grupos."
      />
      <Card className="mb-4 flex flex-wrap items-end gap-2 p-3">
        {/* No celular os atalhos viram uma faixa com rolagem lateral. */}
        <div className="-mx-3 flex w-[calc(100%+1.5rem)] gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:w-auto sm:flex-1 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
        {shortcuts.map((r) => (
          <Link key={`${r.start}${r.end}`} href={`/escalas?de=${r.start}&ate=${r.end}`}
            className={cn('shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-semibold', r.start === de && r.end === ate ? 'border-nacao bg-nacao text-white' : 'border-borda text-tinta hover:border-nacao')}>
            {r.label}
          </Link>
        ))}
        </div>
        <form className="flex w-full items-end gap-2 sm:ml-auto sm:w-auto" action="/escalas">
          <div className="min-w-0 flex-1 sm:flex-none"><Label htmlFor="de">De</Label><Input id="de" name="de" type="date" defaultValue={de} className="h-9" /></div>
          <div className="min-w-0 flex-1 sm:flex-none"><Label htmlFor="ate">Até</Label><Input id="ate" name="ate" type="date" defaultValue={ate} className="h-9" /></div>
          <Button type="submit" variant="secondary" className="h-9">Ver</Button>
        </form>
      </Card>
      <DutyClient key={`${de}${ate}`} duty={duty} people={people} title={dutyTitle(de, ate, duty.holidays)} />
    </>
  );
}
