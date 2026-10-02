import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { buttonVariants } from '@/components/ui/button';
import { Card, PageHeader } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { HoursStatement } from '@/components/hours/HoursStatement';
import { periodKey, periodLabel, periodOf, shiftPeriod } from '@/domain/period';
import { todayIso } from '@/lib/today';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { prisma } from '@/server/db';
import { periodStartDay } from '@/server/services/period-service';
import { hoursReport, parseReportFilter } from '@/server/services/report-service';

export const metadata: Metadata = { title: 'Meu extrato' };

/** Perfil Professor: o próprio extrato de horas, competência a competência. */
export default async function MeuExtratoPage({ searchParams }: { searchParams: Promise<{ competencia?: string }> }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'hours.own')) redirect('/hoje');
  const teacher = principal.teacherId ? await prisma.teacher.findUnique({ where: { id: principal.teacherId }, select: { name: true } }) : null;
  if (!teacher) {
    return (
      <>
        <PageHeader title="Meu extrato" description="Suas horas na Nação, competência a competência." />
        <Card className="p-6 text-sm text-tinta">
          <p className="font-bold text-navy">Seu usuário ainda não está ligado ao seu cadastro de professor.</p>
          <p className="mt-1 text-tinta-suave">Peça à coordenação para fazer o vínculo em Administração → Usuários. Depois disso, seu extrato aparece aqui.</p>
        </Card>
      </>
    );
  }
  const filter = await parseReportFilter({ competencia: (await searchParams).competencia });
  const r = await hoursReport(principal, filter);
  const current = periodOf(todayIso(), await periodStartDay());
  const periods = Array.from({ length: 13 }, (_, i) => shiftPeriod(current, 1 - i));
  return (
    <>
      <PageHeader title="Meu extrato" description={`${teacher.name} · suas aulas, substituições, extras e o total a receber em horas. Domingo e feriado valem o dobro.`} />
      <form className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <Select name="competencia" defaultValue={periodKey(filter.period)} className="w-48" aria-label="Competência">
          {periods.map((p) => <option key={periodKey(p)} value={periodKey(p)}>{periodLabel(p)}</option>)}
        </Select>
        <button className={buttonVariants({ variant: 'secondary' })}>Ver</button>
      </form>
      <p className="mb-3 text-sm text-tinta-suave">{r.labels.period}{r.missing.length ? ` · competência ainda não gerada: ${r.missing.join(', ')}` : ''}</p>
      <HoursStatement r={r} teacherId={principal.teacherId!} />
      <p className="mt-4 text-xs text-tinta-fraca">Algo diferente do que você deu? Fale com a sua coordenação: ela registra a falta, a substituição ou a hora extra e o extrato se ajusta sozinho.</p>
    </>
  );
}
