'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { formatBRL } from '@/domain/condominio/money';
import { delta, type PerformanceReport } from '@/domain/marketing/performance';
import { cn } from '@/lib/cn';

const NAVY = '#022B57';
const CYAN = '#20C4FA';
const BLUE = '#0169E9';
const GRID = '#E2E8F0';
const INK = '#64748B';

const money = (c: number | null) => (c === null ? '—' : formatBRL(c));
const int = (n: number) => n.toLocaleString('pt-BR');
const pct = (r: number | null) => (r === null ? '—' : `${(r * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);
const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const PRESETS = [{ id: 'mes', label: 'Este mês' }, { id: 'mes-passado', label: 'Mês passado' }, { id: '90d', label: '90 dias' }, { id: 'ano', label: 'No ano' }];

export function PerformanceView({ report: r, preset }: { report: PerformanceReport; preset: string }) {
  const router = useRouter();
  const [custom, setCustom] = useState(r.range);
  const c = r.current, p = r.previous;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        {PRESETS.map((x) => (
          <Link key={x.id} href={`/marketing/performance?periodo=${x.id}`} className={cn('rounded-full px-3 py-1 text-sm ring-1 ring-borda', preset === x.id ? 'bg-navy text-white ring-navy' : 'bg-white text-navy hover:bg-fundo')}>{x.label}</Link>
        ))}
        <form className="flex items-end gap-1" onSubmit={(e) => { e.preventDefault(); router.push(`/marketing/performance?de=${custom.from}&ate=${custom.to}`); }}>
          <Input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} className="w-36" aria-label="De" />
          <Input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} className="w-36" aria-label="Até" />
          <Button size="sm" variant="secondary" type="submit">Ver</Button>
        </form>
        <span className="ml-auto text-xs text-tinta-suave">{br(r.range.from)} a {br(r.range.to)} · comparado com {br(r.prev.from)} a {br(r.prev.to)}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Cliques nos links" value={int(c.clicks)} d={delta(c.clicks, p.clicks)} />
        <Kpi label="Leads" value={int(c.leads)} d={delta(c.leads, p.leads)} />
        <Kpi label="Matrículas" value={int(c.won)} d={delta(c.won, p.won)} strong />
        <Kpi label="Conversão" value={pct(c.conversion)} d={delta(c.conversion, p.conversion)} hint="lead → matrícula" />
        <Kpi label="Investimento" value={money(c.spendCents)} d={delta(c.spendCents, p.spendCents)} neutral />
        <Kpi label="Custo por matrícula" value={money(c.cac)} d={delta(c.cac, p.cac)} lowerIsBetter strong />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card className="p-3">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-tinta-suave">Leads por mês</p>
            <span className="ml-auto flex items-center gap-3 text-xs text-tinta-suave">
              <span className="flex items-center gap-1"><i className="size-2.5 rounded-sm" style={{ background: NAVY }} /> viraram matrícula</span>
              <span className="flex items-center gap-1"><i className="size-2.5 rounded-sm" style={{ background: CYAN }} /> demais</span>
            </span>
          </div>
          <StackedMonths data={r.months.map((m) => ({ label: m.label, a: m.won, b: m.leads - m.won }))} />
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-tinta-suave">Investimento em anúncios por mês</p>
          <SingleMonths data={r.months.map((m) => ({ label: m.label, v: m.spendCents }))} fmt={(v) => (v >= 100_000 ? `R$ ${(v / 100_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : formatBRL(v))} />
        </Card>

        <Card className="p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-tinta-suave">Funil do período</p>
          {c.leads === 0 ? <p className="mt-2 text-sm text-tinta-suave">Nenhum lead no período.</p> : (
            <div className="mt-2 space-y-2">
              {r.funnel.map((f, i) => (
                <div key={f.id} className="text-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-navy">{i === 0 ? 'Chegaram' : f.label}</span>
                    <span className="tabular-nums"><b className="text-navy">{f.count}</b> <span className="text-xs text-tinta-suave">{i > 0 ? pct(f.count / r.funnel[0]!.count) : ''}</span></span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-fundo"><div className="h-full rounded-full" style={{ width: `${f.count ? Math.max(2, (f.count / r.funnel[0]!.count) * 100) : 0}%`, background: i === r.funnel.length - 1 ? NAVY : BLUE }} /></div>
                </div>
              ))}
              {r.lost > 0 && <p className="text-xs text-tinta-suave">{r.lost} perdido(s) no período · veja os motivos em <Link href="/marketing/leads?etapa=PERDIDO&modo=lista" className="font-semibold text-nacao">Leads</Link>.</p>}
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Table title="De onde vêm os leads" empty="Sem leads no período." head={['Origem', 'Leads', 'Matr.', 'Conversão']}
          rows={r.bySource.map((s) => [s.label, int(s.leads), int(s.won), pct(s.conversion)])} />
        <Table title="Links que mais trouxeram gente" empty="Sem cliques no período. Crie links em Canais & Links." head={['Link', 'Cliques', 'Leads']}
          rows={r.topLinks.map((l) => [<span key={l.id}>{l.title} <span className="font-mono text-xs text-tinta-suave">/l/{l.slug}</span></span>, int(l.clicks), int(l.leads)])} />
      </div>

      <Table title="Campanhas" empty="Nenhuma campanha com leads, cliques ou investimento no período. Ligue leads, links e gastos às campanhas para ver o retorno de cada uma." head={['Campanha', 'Cliques', 'Leads', 'Matr.', 'Conversão', 'Investimento', 'Custo/matr.']}
        rows={r.byCampaign.map((x) => [<Link key={x.id} href={`/marketing/campanhas/${x.id}`} className="font-semibold text-navy hover:text-nacao">{x.name}</Link>, int(x.clicks), int(x.leads), int(x.won), pct(x.conversion), money(x.spendCents || null), money(x.cac)])} />

      <Table title="Mês a mês" head={['Mês', 'Cliques', 'Leads', 'Matr.', 'Conversão', 'Investimento', 'Custo/lead', 'Custo/matr.']}
        rows={[...r.months].reverse().map((m) => [m.label, int(m.clicks), int(m.leads), int(m.won), pct(m.conversion), money(m.spendCents || null), money(m.cpl), money(m.cac)])} />

      <p className="text-xs text-tinta-suave">Matrículas = leads que chegaram no período e hoje estão como “Matriculado” (mesmo critério do Tráfego Pago). “Este mês” compara até hoje com o mesmo número de dias antes. Investimento vem dos lançamentos de Tráfego Pago, rateado por dia.</p>
    </div>
  );
}

function Kpi({ label, value, d, hint, strong, lowerIsBetter, neutral }: { label: string; value: string; d: number | null; hint?: string; strong?: boolean; lowerIsBetter?: boolean; neutral?: boolean }) {
  const good = d === null || neutral ? null : lowerIsBetter ? d < 0 : d > 0;
  const Icon = d === null || Math.abs(d) < 0.005 ? Minus : d > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <Card className={cn('p-3', strong && 'border-nacao/30')}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-tinta-suave">{label}</p>
      <p className={cn('mt-1 font-extrabold tabular-nums', value.length > 12 ? 'text-base' : 'text-xl', strong ? 'text-nacao' : 'text-navy')}>{value}</p>
      <p className={cn('flex items-center gap-0.5 text-[11px] tabular-nums', good === null ? 'text-tinta-suave' : good ? 'text-sucesso' : 'text-critico')}>
        <Icon className="size-3" aria-hidden />{d === null ? 'sem comparação' : `${d > 0 ? '+' : ''}${(d * 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}% vs anterior`}
      </p>
      {hint && <p className="text-[11px] text-tinta-suave">{hint}</p>}
    </Card>
  );
}

function Table({ title, head, rows, empty }: { title: string; head: string[]; rows: React.ReactNode[][]; empty?: string }) {
  return (
    <Card className="overflow-hidden">
      <p className="border-b border-borda px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-tinta-suave">{title}</p>
      {rows.length === 0 ? <p className="p-4 text-sm text-tinta-suave">{empty ?? 'Sem dados.'}</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-fundo text-xs text-tinta-suave"><tr>{head.map((h, i) => <th key={h} className={cn('px-3 py-2 font-semibold', i === 0 ? 'text-left' : 'text-right')}>{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-borda">
              {rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j} className={cn('px-3 py-2', j === 0 ? 'text-left' : 'whitespace-nowrap text-right tabular-nums')}>{cell}</td>)}</tr>)}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/** Barras empilhadas por mês (2 séries, base ancorada, 2px de respiro entre segmentos). */
function StackedMonths({ data }: { data: { label: string; a: number; b: number }[] }) {
  const W = 600, H = 170, padB = 22, padT = 16;
  const max = Math.max(1, ...data.map((d) => d.a + d.b));
  const step = W / data.length, bw = Math.min(46, step - 18);
  const y = (v: number) => (H - padB - padT) * (v / max);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 h-auto w-full" role="img" aria-label="Leads por mês: viraram matrícula e demais">
      <line x1={0} x2={W} y1={H - padB} y2={H - padB} stroke={GRID} />
      {data.map((d, i) => {
        const x = i * step + (step - bw) / 2;
        const ha = y(d.a), hb = y(d.b);
        const total = d.a + d.b;
        return (
          <g key={d.label}>
            <title>{`${d.label}: ${total} leads · ${d.a} matrícula(s)`}</title>
            <rect x={i * step} y={0} width={step} height={H} fill="transparent" />
            {d.a > 0 && <rect x={x} y={H - padB - ha} width={bw} height={ha} rx={d.b > 0 ? 0 : 4} fill={NAVY} />}
            {d.b > 0 && <rect x={x} y={H - padB - ha - hb - (d.a > 0 ? 2 : 0)} width={bw} height={hb} rx={4} fill={CYAN} />}
            {total > 0 && <text x={x + bw / 2} y={H - padB - ha - hb - 6} textAnchor="middle" fontSize={11} fill={INK}>{total}</text>}
            <text x={i * step + step / 2} y={H - 6} textAnchor="middle" fontSize={11} fill={INK}>{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

function SingleMonths({ data, fmt }: { data: { label: string; v: number }[]; fmt: (v: number) => string }) {
  const W = 600, H = 110, padB = 22, padT = 16;
  const max = Math.max(1, ...data.map((d) => d.v));
  const step = W / data.length, bw = Math.min(46, step - 18);
  if (data.every((d) => d.v === 0)) return <p className="mt-1 text-sm text-tinta-suave">Sem gastos lançados em Tráfego Pago nesses meses.</p>;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 h-auto w-full" role="img" aria-label="Investimento em anúncios por mês">
      <line x1={0} x2={W} y1={H - padB} y2={H - padB} stroke={GRID} />
      {data.map((d, i) => {
        const h = (H - padB - padT) * (d.v / max);
        const x = i * step + (step - bw) / 2;
        return (
          <g key={d.label}>
            <title>{`${d.label}: ${fmt(d.v)}`}</title>
            <rect x={i * step} y={0} width={step} height={H} fill="transparent" />
            {d.v > 0 && <rect x={x} y={H - padB - h} width={bw} height={h} rx={4} fill={BLUE} />}
            {d.v > 0 && <text x={x + bw / 2} y={H - padB - h - 5} textAnchor="middle" fontSize={10} fill={INK}>{fmt(d.v)}</text>}
            <text x={i * step + step / 2} y={H - 6} textAnchor="middle" fontSize={11} fill={INK}>{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}
