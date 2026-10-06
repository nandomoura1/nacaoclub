import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowDownRight, ArrowUpRight, CircleAlert, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, PageHeader } from '@/components/ui/card';
import { formatDateBR } from '@/domain/dates';
import { formatBRL, formatPct } from '@/domain/condominio/money';
import { monthLabel, monthLong, monthShort } from '@/domain/condominio/months';
import { cn } from '@/lib/cn';
import { todayIso } from '@/lib/today';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { condoDashboard } from '@/server/services/condo-dashboard-service';
import { HBars, MonthBars, Spark } from './_components/charts';

export const metadata: Metadata = { title: 'Condomínio Nação' };
const RANGES = [6, 12, 24] as const;

export default async function Page({ searchParams }: { searchParams: Promise<{ meses?: string }> }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'condo.view')) redirect('/hoje');
  const q = Number((await searchParams).meses);
  const months = (RANGES as readonly number[]).includes(q) ? q : 12;
  const today = todayIso();
  const d = await condoDashboard(principal, months, today);
  const last = d.series.at(-1);
  const prev = d.series.at(-2);
  const delta = last && prev ? (last.expensesCents - prev.expensesCents) / prev.expensesCents : null;
  const vsAvg = last && d.avgPrevCents ? (last.expensesCents - d.avgPrevCents) / d.avgPrevCents : null;
  const overdue = d.open.filter((o) => o.overdue);

  if (!d.series.length) {
    return (
      <>
        <PageHeader title="Condomínio Nação" description="Rateio mensal dos gastos comuns do espaço e cobrança dos parceiros." />
        <Card className="p-6 text-sm">
          <p className="font-bold text-navy">Ainda não há competência fechada.</p>
          <p className="mt-1 text-tinta-suave">Comece importando a planilha em <Link className="font-semibold text-nacao hover:underline" href="/condominio/cadastros?aba=importar">Cadastros → Importar planilha</Link>, ou abra a primeira competência em <Link className="font-semibold text-nacao hover:underline" href="/condominio/competencias">Competências</Link>.</p>
        </Card>
      </>
    );
  }

  const Kpi = ({ label, value, sub, tone }: { label: string; value: string; sub?: React.ReactNode; tone?: 'up' | 'down' }) => (
    <Card className="p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-tinta-suave">{label}</p>
      <p className="mt-1 text-2xl font-extrabold tabular-nums text-navy">{value}</p>
      {sub && <p className={cn('mt-1 flex items-center gap-1 text-xs', tone === 'up' ? 'text-atencao' : 'text-tinta-suave')}>{sub}</p>}
    </Card>
  );
  const pct = (v: number) => `${v > 0 ? '+' : ''}${(v * 100).toFixed(1).replace('.', ',')}%`;

  return (
    <>
      <PageHeader title="Condomínio Nação" description={`Última competência fechada: ${monthLong(last!.month)}.`}
        actions={<Link href="/condominio/competencias" className="text-sm font-semibold text-nacao hover:underline">Competências e cobranças →</Link>} />

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-tinta-suave">Período:</span>
        {RANGES.map((r) => (
          <Link key={r} href={`/condominio?meses=${r}`} className={cn('rounded-full border px-3 py-1 font-semibold', months === r ? 'border-navy bg-navy text-white' : 'border-borda text-tinta hover:bg-fundo')}>{r} meses</Link>
        ))}
        {d.draft && <Badge tone="amber"><Clock className="size-3" /> <Link href={`/condominio/competencias/${d.draft}`}>{monthLabel(d.draft)} em lançamento</Link></Badge>}
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 [&>*]:min-w-0">
        <Kpi label={`Despesas comuns · ${monthShort(last!.month)}`} value={formatBRL(last!.expensesCents)}
          tone={delta !== null && delta > 0 ? 'up' : undefined}
          sub={delta !== null ? <>{delta > 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />} {pct(delta)} vs. {monthShort(prev!.month)}{vsAvg !== null && ` · ${pct(vsAvg)} vs. média`}</> : undefined} />
        <Kpi label="Cobrado dos parceiros" value={formatBRL(last!.chargesCents)} sub={`${last!.charges.length} cobrança(s): energia, condomínio, IPTU e itens`} />
        <Kpi label="Condomínio coberto por parceiros" value={formatPct(last!.partnerCondoCents / last!.expensesCents)}
          sub={`A Nação (operações internas) absorve ${formatBRL(last!.expensesCents - last!.partnerCondoCents)}`} />
        <Kpi label="Cobranças em aberto" value={formatBRL(d.open.reduce((s, o) => s + o.cents, 0))}
          tone={overdue.length ? 'up' : undefined}
          sub={overdue.length ? <><CircleAlert className="size-3" /> {overdue.length} vencida(s): {formatBRL(overdue.reduce((s, o) => s + o.cents, 0))}</> : `${d.open.length} pendente(s), nenhuma vencida`} />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] [&>*]:min-w-0">
        <Card className="p-4">
          <h2 className="font-extrabold text-navy">Despesas comuns por mês</h2>
          <p className="mb-2 text-xs text-tinta-suave">Total da Tabela 1 de cada competência (base do rateio).</p>
          <MonthBars label="Despesas comuns por mês" data={d.series.map((s) => ({ label: monthShort(s.month), cents: s.expensesCents }))} />
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-xs font-semibold text-nacao">Ver em tabela</summary>
            <table className="mt-2 w-full tabular-nums"><tbody className="divide-y divide-borda">
              {d.series.map((s) => <tr key={s.month}><td className="py-1">{monthLabel(s.month)}</td><td className="text-right">{formatBRL(s.expensesCents)}</td><td className="text-right text-tinta-suave">cobrado {formatBRL(s.chargesCents)}</td></tr>)}
            </tbody></table>
          </details>
        </Card>
        <Card className="p-4">
          <h2 className="font-extrabold text-navy">Para onde vai · {monthShort(last!.month)}</h2>
          <p className="mb-3 text-xs text-tinta-suave">Despesas do mês por grupo.</p>
          <HBars rows={last!.groups.map((g) => ({ label: g.group, cents: g.cents }))} total={last!.expensesCents} />
        </Card>
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Card className="p-4">
          <h2 className="font-extrabold text-navy">Cobranças por parceiro · {monthShort(last!.month)}</h2>
          <p className="mb-3 text-xs text-tinta-suave">Valor total de cada cobrança do mês.</p>
          <HBars rows={[...last!.charges].sort((a, b) => b.cents - a.cents).map((c) => ({ label: c.name, cents: c.cents }))} />
        </Card>
        <Card className="p-4">
          <h2 className="font-extrabold text-navy">Despesas que mais subiram</h2>
          <p className="mb-3 text-xs text-tinta-suave">{monthShort(last!.month)} comparado com a média dos 3 meses anteriores.</p>
          {d.risers.length ? <HBars rows={d.risers.map((r) => ({ label: r.label, cents: r.deltaCents!, note: `agora ${formatBRL(r.cents)}` }))} /> : <p className="text-sm text-tinta-suave">Nenhuma despesa acima da média recente.</p>}
        </Card>
      </div>

      <Card className="mb-4 p-4">
        <h2 className="font-extrabold text-navy">Energia por parceiro (kWh/mês)</h2>
        <p className="mb-3 text-xs text-tinta-suave">Cada parceiro na própria escala — compare a tendência, não a altura.</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {d.energy.map((e) => {
            const lastP = e.points.at(-1)!;
            return (
              <div key={e.name}>
                <div className="flex items-baseline justify-between text-sm"><span className="font-bold text-navy">{e.name}</span><span className="tabular-nums text-tinta">{Math.round(lastP.kwh).toLocaleString('pt-BR')} kWh <span className="text-xs text-tinta-suave">{monthShort(lastP.month)}</span></span></div>
                <Spark unit="kWh" points={e.points.map((p) => ({ label: monthShort(p.month), value: p.kwh }))} />
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="mb-2 font-extrabold text-navy">Cobranças em aberto</h2>
        {d.open.length === 0 ? <p className="text-sm text-tinta-suave">Tudo pago.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="text-left text-xs text-tinta-suave"><tr><th className="py-1">Competência</th><th>Parceiro</th><th className="text-right">Valor</th><th className="text-right">Vencimento</th><th className="text-right">Situação</th></tr></thead>
              <tbody className="divide-y divide-borda tabular-nums">
                {d.open.map((o) => (
                  <tr key={o.id}>
                    <td className="py-1.5"><Link className="text-nacao hover:underline" href={`/condominio/competencias/${o.month}`}>{monthLabel(o.month)}</Link></td>
                    <td>{o.name}</td>
                    <td className="text-right font-semibold text-navy">{formatBRL(o.cents)}</td>
                    <td className="text-right">{formatDateBR(o.dueDate)}</td>
                    <td className="text-right">{o.overdue ? <Badge tone="red"><CircleAlert className="size-3" /> Vencida</Badge> : o.status === 'SENT' ? <Badge tone="blue">Enviada</Badge> : <Badge tone="amber">Pendente</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
