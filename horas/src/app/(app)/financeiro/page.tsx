import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FileUp, History, Plus } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Card, PageHeader } from '@/components/ui/card';
import { monthTitle, monthShort, type Month } from '@/domain/condominio/months';
import { yearToDate, type Ind, type Metrics } from '@/domain/financeiro/metrics';
import { cn } from '@/lib/cn';
import { todayIso } from '@/lib/today';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { finHistory } from '@/server/services/fin-service';
import { SeriesBars } from './_components/charts';
import { fmtValue } from './_components/fmt';

export const metadata: Metadata = { title: 'Painel financeiro' };

/** Painel do ano: só meses com versão aprovada; mês sem dado é lacuna, nunca zero nem projeção. */
export default async function Page({ searchParams }: { searchParams: Promise<{ ano?: string }> }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'fin.view')) redirect('/hoje');
  const history = await finHistory(principal);
  const years = [...new Set(history.map((h) => Number(h.month.slice(0, 4))))].sort((a, b) => b - a);
  const q = Number((await searchParams).ano);
  const year = years.includes(q) ? q : years[0] ?? Number(todayIso().slice(0, 4));
  const rows = history.filter((h) => h.month.startsWith(`${year}-`));
  const ytd = yearToDate(rows);
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}` as Month);
  const lastApproved = rows.at(-1)?.month;
  const until = lastApproved ? months.slice(0, Number(lastApproved.slice(5))) : [];
  const series = (get: (m: Metrics) => Ind) => until.map((mo) => ({ label: monthShort(mo).slice(0, 3), value: (() => { const r = rows.find((x) => x.month === mo); return r ? get(r.m).value : null; })() }));

  const actions = (
    <>
      {can(principal, 'fin.edit') && <Link href="/financeiro/competencias" className={buttonVariants({ size: 'sm' })}><Plus /> Novo relatório</Link>}
      {can(principal, 'fin.import') && <Link href="/financeiro/importar" className={buttonVariants({ variant: 'secondary', size: 'sm' })}><FileUp /> Importar histórico</Link>}
      <Link href="/financeiro/historico" className={buttonVariants({ variant: 'secondary', size: 'sm' })}><History /> Histórico</Link>
    </>
  );

  if (!history.length) {
    return (
      <>
        <PageHeader title="Painel financeiro" description="Recebimentos, pagamentos, pessoal, payout, lanchonete, caixa e alunos — mês a mês." actions={actions} />
        <Card className="p-6 text-sm">
          <p className="font-bold text-navy">Ainda não há mês aprovado.</p>
          <p className="mt-1 text-tinta-suave">Crie o relatório do mês em <Link className="font-semibold text-nacao hover:underline" href="/financeiro/competencias">Relatório Financeiro</Link> ou traga os meses anteriores em <Link className="font-semibold text-nacao hover:underline" href="/financeiro/importar">Importar relatórios antigos</Link>. O painel só mostra meses aprovados.</p>
        </Card>
      </>
    );
  }

  const Tile = ({ label, value, unit, sub }: { label: string; value: number | null; unit: Ind['unit']; sub?: string }) => (
    <Card className="min-w-0 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-tinta-suave">{label}</p>
      <p className={cn('mt-1 text-xl font-extrabold tabular-nums text-navy', value === null && 'text-sm font-normal italic text-tinta-fraca')}>{fmtValue(value, unit)}</p>
      {sub && <p className="mt-0.5 text-xs text-tinta-suave">{sub}</p>}
    </Card>
  );
  const n = ytd.recebimentos.months;
  const Chart = ({ title, unit, get, note }: { title: string; unit: Ind['unit']; get: (m: Metrics) => Ind; note?: string }) => {
    const data = series(get);
    return (
      <Card className="min-w-0 p-4">
        <h2 className="text-sm font-bold text-navy">{title}</h2>
        {note && <p className="text-[11px] text-tinta-fraca">{note}</p>}
        <div className="mt-2"><SeriesBars data={data} unit={unit} label={title} /></div>
        <details className="mt-1 text-xs">
          <summary className="cursor-pointer text-tinta-suave">Ver em tabela</summary>
          <table className="mt-1 w-full"><tbody>{data.map((d) => <tr key={d.label} className="border-b border-borda/60"><td className="py-0.5">{d.label}</td><td className="py-0.5 text-right tabular-nums">{fmtValue(d.value, unit)}</td></tr>)}</tbody></table>
        </details>
      </Card>
    );
  };

  return (
    <>
      <PageHeader title="Painel financeiro" description={lastApproved ? `Acumulado de ${year} até ${monthTitle(lastApproved)} — só meses aprovados.` : `Nenhum mês aprovado em ${year}.`} actions={actions} />
      {years.length > 1 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-tinta-suave">Ano:</span>
          {years.map((y) => <Link key={y} href={`?ano=${y}`} className={cn('rounded-full px-3 py-1 font-semibold', y === year ? 'bg-nacao text-white' : 'bg-fundo text-tinta-suave hover:text-tinta')}>{y}</Link>)}
        </div>
      )}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 [&>*]:min-w-0">
        <Tile label="Recebimentos no ano" value={ytd.recebimentos.value} unit="BRL" sub={`${n} ${n === 1 ? 'mês' : 'meses'} · média ${fmtValue(ytd.mediaMensal, 'BRL')}/mês`} />
        <Tile label="Pagamentos no ano" value={ytd.pagamentos.value} unit="BRL" />
        <Tile label="Custo de pessoal" value={ytd.pessoal.value} unit="BRL" sub={ytd.pessoal.value !== null && ytd.recebimentos.value ? `${fmtValue(ytd.pessoal.value / ytd.recebimentos.value, 'PCT')} dos recebimentos` : undefined} />
        <Tile label="Payout no ano" value={ytd.payout.value} unit="BRL" />
        <Tile label="Lanchonete (PDV)" value={ytd.lanchonete.value} unit="BRL" sub={ytd.cmvMedio !== null ? `CMV médio ${fmtValue(ytd.cmvMedio, 'PCT')}` : undefined} />
        <Tile label="Investimentos" value={ytd.investimentos.value} unit="BRL" />
        <Tile label="Caixa disponível" value={ytd.caixaAtual} unit="BRL" sub={lastApproved ? `posição de ${monthShort(lastApproved)}` : undefined} />
        <Tile label="Base de alunos" value={ytd.alunosAtual} unit="QTD" sub="matrículas no último mês" />
      </div>
      <div className="grid gap-3 lg:grid-cols-2 [&>*]:min-w-0">
        <Chart title="Recebimentos" unit="BRL" get={(m) => m.recebimentos} />
        <Chart title="Pagamentos" unit="BRL" get={(m) => m.pagamentos} />
        <Chart title="Geração de caixa antes do payout" unit="BRL" get={(m) => m.fluxo.geracaoAntesPayout} note="Recebimentos − pagamentos antes do payout. Fluxo financeiro, não lucro." />
        <Chart title="Caixa disponível" unit="BRL" get={(m) => m.caixa.disponivel} />
        <Chart title="Pessoal ÷ recebimentos" unit="PCT" get={(m) => m.pessoalPctRecebimentos} />
        <Chart title="Payout total" unit="BRL" get={(m) => m.payout.total} />
        <Chart title="CMV da lanchonete" unit="PCT" get={(m) => m.cmv.pct} note="Estimado por compras quando não há inventário." />
        <Chart title="Base de alunos" unit="QTD" get={(m) => m.alunos.total} />
      </div>
    </>
  );
}
