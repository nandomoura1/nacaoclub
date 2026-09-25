'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { CalendarCheck2, CalendarClock, RefreshCw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { OccurrenceCard } from '@/components/occurrence/OccurrenceCard';
import { WEEKDAYS, addDays, formatDateBR, weekdayOf } from '@/domain/dates';
import { cn } from '@/lib/cn';
import { formatMinutes } from '@/lib/format';
import type { OccurrenceItem, periodOverview } from '@/server/services/period-service';
import { decideHolidayAction, generatePeriodAction } from './actions';

type Overview = Awaited<ReturnType<typeof periodOverview>>;

export function CalendarClient({ overview, occurrences, today, areaId, tab, canGenerate, canDecide }: {
  overview: Overview; occurrences: OccurrenceItem[]; today: string; areaId: string | null;
  tab: 'horas' | 'aulas'; canGenerate: boolean; canDecide: boolean;
}) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const pathname = usePathname();
  const params = useSearchParams();
  const tabHref = (t: string) => { const p = new URLSearchParams(params); p.set('aba', t); return `${pathname}?${p}`; };

  const generate = () => start(async () => {
    const r = await generatePeriodAction(overview.ref.year, overview.ref.month);
    setMsg(r.ok
      ? { ok: true, text: r.data.created ? `${r.data.created} aula(s) gerada(s). ${r.data.aguardando ? `${r.data.aguardando} aguardam decisão de feriado.` : ''}` : 'Tudo em dia: a competência já refletia a grade.' }
      : { ok: false, text: r.error });
  });

  if (!overview.period?.generatedAt) {
    return (
      <Card className="flex flex-col items-center gap-3 p-10 text-center">
        <CalendarCheck2 className="size-10 text-nacao" />
        <h2 className="text-xl font-extrabold text-navy">{overview.label} ainda não foi gerada</h2>
        <p className="max-w-lg text-sm text-tinta-suave">
          Gerar cria todas as aulas previstas de {formatDateBR(overview.start)} a {formatDateBR(overview.end)} a partir da grade vigente,
          com os feriados já aplicados. Depois, a coordenação só registra as exceções.
        </p>
        {canGenerate ? (
          <Button size="lg" onClick={generate} disabled={pending}><Sparkles /> {pending ? 'Gerando…' : `Gerar ${overview.label}`}</Button>
        ) : (
          <p className="text-sm font-semibold text-tinta-suave">Peça ao administrador para gerar a competência.</p>
        )}
        {msg && <FormMessage error={msg.ok ? null : msg.text} success={msg.ok ? msg.text : null} />}
      </Card>
    );
  }

  const totalTeacherMin = overview.teachers.reduce((s, t) => s + t.totalMin, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Aulas no período" value={String(overview.counts.aulas)} />
        <Kpi label="Horas de aula" value={formatMinutes(overview.counts.horasAula)} />
        <Kpi label="Horas de professores" value={formatMinutes(totalTeacherMin)} hint="o que vai para a folha" />
        <Kpi label="Canceladas" value={String(overview.counts.canceladas)} />
        <Kpi label="Aguardando decisão" value={String(overview.counts.aguardando)} tone={overview.counts.aguardando ? 'amber' : undefined} />
      </div>

      {overview.pendingHolidays.map((h) => (
        <Card key={h.date} className="flex flex-col gap-3 border-purple-200 bg-purple-50/50 p-4 sm:flex-row sm:items-center">
          <CalendarClock className="size-6 shrink-0 text-purple-700" />
          <div className="flex-1">
            <p className="font-bold text-navy">{formatDateBR(h.date)} · {h.name}</p>
            <p className="text-sm text-tinta-suave">{h.count} aula(s) aguardando decisão{areaId ? ' nesta área' : ''}. Até decidir, elas contam 0h.</p>
          </div>
          {canDecide && (
            <div className="flex gap-2">
              <Button variant="secondary" disabled={pending} onClick={() => start(async () => {
                const r = await decideHolidayAction(h.date, 'MANTER', areaId);
                setMsg(r.ok ? { ok: true, text: `${r.data} aula(s) mantida(s).` } : { ok: false, text: r.error });
              })}>Manter todas</Button>
              <Button variant="danger" disabled={pending} onClick={() => start(async () => {
                const r = await decideHolidayAction(h.date, 'CANCELAR', areaId);
                setMsg(r.ok ? { ok: true, text: `${r.data} aula(s) cancelada(s) com o motivo "Feriado".` } : { ok: false, text: r.error });
              })}>Cancelar todas</Button>
            </div>
          )}
        </Card>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <nav className="flex rounded-lg bg-white p-1 ring-1 ring-borda">
          {(['horas', 'aulas'] as const).map((t) => (
            <Link key={t} href={tabHref(t)} className={cn('rounded-md px-3 py-1.5 text-sm font-semibold', tab === t ? 'bg-navy text-white' : 'text-tinta-suave')}>
              {t === 'horas' ? 'Horas por professor' : 'Aulas'}
            </Link>
          ))}
        </nav>
        <div className="flex-1" />
        {canGenerate && overview.period.status !== 'FECHADO' && (
          <Button variant="ghost" size="sm" onClick={generate} disabled={pending} title="Cria aulas que faltarem (ex.: grade nova). Não altera o que já existe.">
            <RefreshCw /> Sincronizar com a grade
          </Button>
        )}
      </div>
      {msg && <FormMessage error={msg.ok ? null : msg.text} success={msg.ok ? msg.text : null} />}

      {tab === 'horas' ? <HoursTable overview={overview} /> : <Lessons occurrences={occurrences} start={overview.start} end={overview.end} today={today} />}
    </div>
  );
}

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'amber' }) {
  return (
    <Card className={cn('p-4', tone === 'amber' && 'border-atencao/40 bg-atencao/5')}>
      <p className="text-[11px] font-bold uppercase tracking-wider text-tinta-fraca">{label}</p>
      <p className="tabular mt-1 text-2xl font-extrabold text-navy">{value}</p>
      {hint && <p className="text-[11px] text-tinta-fraca">{hint}</p>}
    </Card>
  );
}

function HoursTable({ overview }: { overview: Overview }) {
  const [q, setQ] = useState('');
  const rows = overview.teachers.filter((t) => t.name.toLowerCase().includes(q.trim().toLowerCase()));
  const cell = (m: number) => (m ? formatMinutes(m) : <span className="text-tinta-fraca">—</span>);
  return (
    <Card className="overflow-x-auto">
      <div className="border-b border-borda p-3">
        <input className="h-9 w-full rounded-lg border border-borda px-3 text-sm sm:w-64" placeholder="Filtrar professor" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b border-borda text-right text-[11px] font-bold uppercase tracking-wider text-tinta-fraca">
            <th className="px-4 py-3 text-left">Professor</th>
            <th className="px-3 py-3" title="O que a grade previa">Previstas</th>
            <th className="px-3 py-3" title="Aulas próprias dadas">Dadas</th>
            <th className="px-3 py-3">Substituições</th>
            <th className="px-3 py-3">Avulsas</th>
            <th className="px-3 py-3">Ausências</th>
            <th className="px-3 py-3">Canceladas</th>
            <th className="px-3 py-3">Aguardando</th>
            <th className="px-4 py-3 text-navy">Total</th>
          </tr>
        </thead>
        <tbody className="tabular divide-y divide-borda text-right">
          {rows.map((t) => (
            <tr key={t.teacherId} className="hover:bg-fundo/60">
              <td className="px-4 py-2.5 text-left font-semibold text-tinta">{t.name}</td>
              <td className="px-3 py-2.5">{cell(t.plannedMin)}</td>
              <td className="px-3 py-2.5">{cell(t.ownMin)}</td>
              <td className="px-3 py-2.5">{t.substitutionMin ? `+${formatMinutes(t.substitutionMin)}` : cell(0)}</td>
              <td className="px-3 py-2.5">{t.extraMin ? `+${formatMinutes(t.extraMin)}` : cell(0)}</td>
              <td className="px-3 py-2.5">{cell(t.absenceMin)}</td>
              <td className="px-3 py-2.5">{cell(t.cancelledMin)}</td>
              <td className={cn('px-3 py-2.5', t.pendingMin > 0 && 'font-semibold text-atencao')}>{cell(t.pendingMin)}</td>
              <td className="px-4 py-2.5 text-base font-extrabold text-navy">{formatMinutes(t.totalMin)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={9} className="p-8 text-center text-tinta-suave">Nenhuma hora nesta competência{q ? ' com esse filtro' : ''}.</td></tr>
          )}
        </tbody>
      </table>
    </Card>
  );
}

function Lessons({ occurrences, start, end, today }: { occurrences: OccurrenceItem[]; start: string; end: string; today: string }) {
  // Semanas da competência (segunda a domingo), começando na que contém hoje.
  const weeks = useMemo(() => {
    const out: { from: string; to: string }[] = [];
    let d = addDays(start, -(weekdayOf(start) - 1));
    while (d <= end) {
      out.push({ from: d < start ? start : d, to: addDays(d, 6) > end ? end : addDays(d, 6) });
      d = addDays(d, 7);
    }
    return out;
  }, [start, end]);
  const [week, setWeek] = useState(() => Math.max(0, weeks.findIndex((w) => w.from <= today && today <= w.to)));
  const w = weeks[week] ?? weeks[0]!;
  const byDay = new Map<string, OccurrenceItem[]>();
  for (const o of occurrences) if (o.date >= w.from && o.date <= w.to) byDay.set(o.date, [...(byDay.get(o.date) ?? []), o]);
  const days: string[] = [];
  for (let d = w.from; d <= w.to; d = addDays(d, 1)) days.push(d);

  return (
    <>
      <div className="flex gap-1 overflow-x-auto">
        {weeks.map((x, i) => (
          <button key={x.from} onClick={() => setWeek(i)} className={cn('whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold', i === week ? 'bg-nacao text-white' : 'bg-white text-tinta-suave ring-1 ring-borda')}>
            {formatDateBR(x.from).slice(0, 5)}–{formatDateBR(x.to).slice(0, 5)}
          </button>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {days.map((d) => {
          const list = byDay.get(d) ?? [];
          return (
            <section key={d} className={cn('rounded-xl p-2', d === today && 'bg-ciano/10 ring-1 ring-ciano')}>
              <h3 className="mb-2 flex items-baseline justify-between px-1 text-sm font-extrabold text-navy">
                <span>{WEEKDAYS[weekdayOf(d) - 1]!.long} <span className="tabular font-semibold text-tinta-fraca">{formatDateBR(d).slice(0, 5)}</span></span>
                <span className="text-xs font-semibold text-tinta-fraca">{list.length}</span>
              </h3>
              <div className="space-y-2">
                {list.map((o) => <OccurrenceCard key={o.id} o={o} />)}
                {list.length === 0 && <p className="rounded-lg border border-dashed border-borda p-3 text-center text-xs text-tinta-fraca">sem aulas</p>}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
