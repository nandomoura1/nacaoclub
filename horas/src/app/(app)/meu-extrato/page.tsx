import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { buttonVariants } from '@/components/ui/button';
import { Card, PageHeader } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { formatMinutes } from '@/lib/format';
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
export default async function MeuExtratoPage({ searchParams }: { searchParams: Promise<{ competencia?: string; cadastro?: string }> }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'hours.own')) redirect('/hoje');
  const sp = await searchParams;
  const cadastros = await prisma.teacher.findMany({ where: { id: { in: principal.teacherIds } }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
  if (!cadastros.length) {
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
  const filter = await parseReportFilter({ competencia: sp.competencia });
  const selected = cadastros.find((c) => c.id === sp.cadastro) ?? cadastros[0]!;
  // Mais de um cadastro (ex.: CrossFit e Nação Fit): total de cada um e o total geral; o detalhe é do escolhido.
  const reports = await Promise.all(cadastros.map(async (c) => ({ ...c, r: await hoursReport(principal, { ...filter, teacherId: c.id }) })));
  const r = reports.find((x) => x.id === selected.id)!.r;
  const totalOf = (x: (typeof reports)[number]) => x.r.byTeacher[0]?.totalMin ?? 0;
  const href = (id: string) => `/meu-extrato?competencia=${periodKey(filter.period)}&cadastro=${id}`;
  const current = periodOf(todayIso(), await periodStartDay());
  const periods = Array.from({ length: 13 }, (_, i) => shiftPeriod(current, 1 - i));
  return (
    <>
      <PageHeader title="Meu extrato" description={`${cadastros.length > 1 ? cadastros.map((c) => c.name).join(' + ') : selected.name} · suas aulas, substituições, extras e o total a receber em horas. Domingo e feriado valem o dobro.`} />
      <form className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <Select name="competencia" defaultValue={periodKey(filter.period)} className="w-48" aria-label="Competência">
          {periods.map((p) => <option key={periodKey(p)} value={periodKey(p)}>{periodLabel(p)}</option>)}
        </Select>
        {cadastros.length > 1 && <input type="hidden" name="cadastro" value={selected.id} />}
        <button className={buttonVariants({ variant: 'secondary' })}>Ver</button>
      </form>
      {cadastros.length > 1 && (
        <Card className="mb-4 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-tinta-suave">Seus cadastros nesta competência</p>
          <div className="mt-2 flex flex-wrap items-stretch gap-2">
            {reports.map((x) => (
              <a key={x.id} href={href(x.id)} className={cn('rounded-xl border px-4 py-2', x.id === selected.id ? 'border-navy bg-navy text-white' : 'border-borda hover:border-nacao')}>
                <span className="block text-xs font-semibold opacity-80">{x.name}</span>
                <span className="tabular text-lg font-extrabold">{formatMinutes(totalOf(x))}</span>
              </a>
            ))}
            <div className="rounded-xl border border-dashed border-borda px-4 py-2">
              <span className="block text-xs font-semibold text-tinta-suave">Total geral</span>
              <span className="tabular text-lg font-extrabold text-navy">{formatMinutes(reports.reduce((t, x) => t + totalOf(x), 0))}</span>
            </div>
          </div>
          <p className="mt-2 text-xs text-tinta-suave">Abaixo, o detalhe de <b>{selected.name}</b>. Clique em outro cadastro para ver o dele.</p>
        </Card>
      )}
      <p className="mb-3 text-sm text-tinta-suave">{r.labels.period}{r.missing.length ? ` · competência ainda não gerada: ${r.missing.join(', ')}` : ''}</p>
      <HoursStatement r={r} teacherId={selected.id} />
      <p className="mt-4 text-xs text-tinta-fraca">Algo diferente do que você deu? Fale com a sua coordenação: ela registra a falta, a substituição ou a hora extra e o extrato se ajusta sozinho.</p>
    </>
  );
}
