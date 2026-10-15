'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, CirclePlay, Lock, Plus, Target, Timer, Unlock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Input, Select } from '@/components/ui/input';
import { isOpen } from '@/domain/processos';
import { needsAttention, WEEKLY_STEPS } from '@/domain/proc-meeting';
import { cn } from '@/lib/cn';
import type { DemandRow } from '@/server/services/proc-service';
import type { ProcMeetingView } from '@/server/services/proc-meeting-service';
import { closeProcMeetingAction, quickUpdateDemandAction, saveDemandAction, saveMeetingNotesAction, setDemandBlockerAction, setDemandFocusAction, setDemandStatusAction } from '../../actions';

type Opt = { id: string; name: string };
type Res = { ok: true; message?: string } | { ok: false; error: string };
const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export function MeetingClient({ view, people, today }: { view: ProcMeetingView; people: Opt[]; today: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string | null; error?: string | null }>({});
  const [step, setStep] = useState<(typeof WEEKLY_STEPS)[number]['id']>('placar');
  const m = view.meeting;
  const open = m.status === 'ABERTA';
  const run = (fn: () => Promise<Res>, ok?: string) => start(async () => {
    setMsg({}); const r = await fn();
    if (!r.ok) setMsg({ error: r.error }); else if (ok) setMsg({ ok });
    router.refresh();
  });
  const act = {
    done: (d: DemandRow) => run(() => setDemandStatusAction(d.id, 'CONCLUIDA'), `“${d.title}” concluída ✓`),
    doing: (d: DemandRow) => run(() => setDemandStatusAction(d.id, 'EM_ANDAMENTO')),
    focus: (d: DemandRow, on: boolean) => run(() => setDemandFocusAction(d.id, on ? m.week : null)),
    block: (d: DemandRow) => { const why = prompt(`O que está travando “${d.title}”?`, d.blocker ?? ''); if (why !== null && why.trim()) run(() => setDemandBlockerAction(d.id, why)); },
    unblock: (d: DemandRow) => run(() => setDemandBlockerAction(d.id, null), 'Destravada.'),
    due: (d: DemandRow, v: string) => run(() => quickUpdateDemandAction(d.id, { dueDate: v || null }), 'Prazo atualizado.'),
    owner: (d: DemandRow, v: string) => run(() => quickUpdateDemandAction(d.id, { ownerId: v || null }), 'Responsável atualizado.'),
  };
  const ctx = { act, pending, open, week: m.week, today, people };

  if (m.kind === 'DIARIA') return <Daily view={view} ctx={ctx} msg={msg} run={run} />;

  const attention = view.demands.filter((d) => needsAttention(d, today).length).sort((a, b) => Number(b.late) - Number(a.late));
  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-1 rounded-xl bg-white p-1 ring-1 ring-borda" aria-label="Passos da reunião">
        {WEEKLY_STEPS.map((s, i) => (
          <button key={s.id} type="button" onClick={() => setStep(s.id)} className={cn('inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold', step === s.id ? 'bg-navy text-white' : 'text-tinta-suave hover:bg-fundo')}>
            <span className={cn('flex size-5 items-center justify-center rounded-full text-[11px]', step === s.id ? 'bg-white text-navy' : 'bg-fundo')}>{i + 1}</span>
            {s.label}{s.id === 'atrasadas' && attention.length > 0 && <span className="rounded-full bg-critico px-1.5 text-[10px] text-white">{attention.length}</span>}
          </button>
        ))}
      </nav>
      <p className="text-sm text-tinta-suave">{WEEKLY_STEPS.find((s) => s.id === step)!.hint}</p>
      <FormMessage error={msg.error} success={msg.ok} />

      {step === 'placar' && <Placar view={view} />}
      {step === 'atrasadas' && (
        attention.length === 0 ? <Card className="p-6 text-center text-sm text-tinta-suave">Nada atrasado ou travado. 👏</Card>
          : <Card className="divide-y divide-borda">{attention.map((d) => <Line key={d.id} d={d} ctx={ctx} mode="attention" />)}</Card>
      )}
      {step === 'foco' && <Lanes view={view} ctx={ctx} mode="focus" run={run} />}
      {step === 'encerrar' && <Close view={view} run={run} pending={pending} />}

      {open && step !== 'encerrar' && (
        <div className="flex justify-end">
          <Button variant="secondary" onClick={() => setStep(WEEKLY_STEPS[WEEKLY_STEPS.findIndex((s) => s.id === step) + 1]!.id)}>Próximo passo →</Button>
        </div>
      )}
    </div>
  );
}

type Ctx = {
  act: Record<'done' | 'doing' | 'block' | 'unblock', (d: DemandRow) => void> & { focus: (d: DemandRow, on: boolean) => void; due: (d: DemandRow, v: string) => void; owner: (d: DemandRow, v: string) => void };
  pending: boolean; open: boolean; week: string; today: string; people: Opt[];
};

function Placar({ view }: { view: ProcMeetingView }) {
  const s = view.score, l = view.lastWeek;
  const tiles = [
    { label: 'Foco da semana passada', value: l.focus ? `${l.focusDone}/${l.focus}` : '—', hint: l.focus ? `${Math.round((l.focusDone / l.focus) * 100)}% entregue` : 'sem foco combinado', strong: true },
    { label: 'Foco desta semana', value: s.focus ? `${s.focusDone}/${s.focus}` : '0', hint: 'combinado até agora' },
    { label: 'Concluídas na semana', value: String(s.doneWeek) },
    { label: 'Atrasadas', value: String(s.late), bad: s.late > 0 },
    { label: 'Travadas', value: String(s.blocked), bad: s.blocked > 0, hint: 'impedimento ou aguardando' },
    { label: 'Sem prazo · sem dono', value: `${s.noDue} · ${s.noOwner}`, bad: s.noDue + s.noOwner > 0 },
  ];
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {tiles.map((t) => (
          <Card key={t.label} className={cn('p-3', t.strong && 'border-nacao/30')}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-tinta-suave">{t.label}</p>
            <p className={cn('mt-1 text-2xl font-extrabold tabular-nums', t.bad ? 'text-critico' : t.strong ? 'text-nacao' : 'text-navy')}>{t.value}</p>
            {t.hint && <p className="text-[11px] text-tinta-suave">{t.hint}</p>}
          </Card>
        ))}
      </div>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-fundo text-xs text-tinta-suave"><tr><th className="px-3 py-2 text-left">Líder</th><th className="px-3 py-2 text-right">Em aberto</th><th className="px-3 py-2 text-right">Atrasadas</th><th className="px-3 py-2 text-right">Travadas</th><th className="px-3 py-2 text-right">🎯 desta semana</th></tr></thead>
          <tbody className="divide-y divide-borda">
            {view.lanes.map((l) => {
              const o = l.demands.filter((d) => isOpen(d.status));
              return (
                <tr key={l.id ?? 'none'}>
                  <td className="px-3 py-2"><b className="text-navy">{l.name}</b>{l.sectors.length > 0 && <span className="block text-xs text-tinta-suave">{l.sectors.join(', ')}</span>}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{o.length}</td>
                  <td className={cn('px-3 py-2 text-right tabular-nums', o.some((d) => d.late) && 'font-bold text-critico')}>{o.filter((d) => d.late).length}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{o.filter((d) => d.blocker || d.status === 'AGUARDANDO').length}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{l.demands.filter((d) => d.focusWeek === view.meeting.week).length}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </>
  );
}

/** Uma demanda com as ações rápidas da reunião. */
function Line({ d, ctx, mode }: { d: DemandRow; ctx: Ctx; mode: 'attention' | 'focus' | 'daily' }) {
  const focused = d.focusWeek === ctx.week;
  const can = ctx.open && d.canWork && isOpen(d.status);
  const why = needsAttention(d, ctx.today);
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 p-3 text-sm', !isOpen(d.status) && 'opacity-60')}>
      {mode !== 'attention' && (
        <button type="button" disabled={!can || ctx.pending} onClick={() => ctx.act.focus(d, !focused)} title={focused ? 'Tirar do foco da semana' : 'Colocar no foco da semana'}
          className={cn('rounded-md p-1', focused ? 'bg-nacao text-white' : 'text-tinta-fraca ring-1 ring-borda hover:text-nacao', !can && 'cursor-default')} aria-pressed={focused} aria-label="Foco da semana">
          <Target className="size-4" />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <p className={cn('font-semibold text-navy', d.status === 'CONCLUIDA' && 'line-through')}>{d.title}</p>
        <p className="text-xs text-tinta-suave">
          {d.sector}{d.owner ? ` · ${d.owner}` : ''}{d.dueDate ? ` · prazo ${br(d.dueDate)}` : ''}
          {d.status === 'EM_ANDAMENTO' && <span className="text-nacao"> · fazendo</span>}
        </p>
        {d.blocker && <p className="mt-0.5 text-xs font-semibold text-critico">⛔ {d.blocker}</p>}
        {mode === 'attention' && why.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{why.map((w) => <Badge key={w} tone={w === 'atrasada' || w === 'impedida' ? 'red' : 'amber'}>{w}</Badge>)}</div>}
      </div>
      {can && (
        <div className="flex flex-wrap items-center gap-1.5">
          {mode === 'attention' && <>
            <Input type="date" defaultValue={d.dueDate ?? ''} className="h-8 w-36 text-xs" aria-label="Novo prazo" onBlur={(e) => { if (e.target.value !== (d.dueDate ?? '')) ctx.act.due(d, e.target.value); }} />
            <Select defaultValue={d.ownerId ?? ''} className="h-8 w-40 text-xs" aria-label="Responsável" onChange={(e) => ctx.act.owner(d, e.target.value)}>
              <option value="">Sem responsável</option>{ctx.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </>}
          {mode === 'daily' && d.status !== 'EM_ANDAMENTO' && <Button size="sm" variant="secondary" disabled={ctx.pending} onClick={() => ctx.act.doing(d)}><CirclePlay /> Hoje</Button>}
          {d.blocker
            ? <Button size="sm" variant="secondary" disabled={ctx.pending} onClick={() => ctx.act.unblock(d)}><Unlock /> Destravar</Button>
            : (mode !== 'focus') && <Button size="sm" variant="ghost" disabled={ctx.pending} onClick={() => ctx.act.block(d)}><Lock /> Travou</Button>}
          <Button size="sm" disabled={ctx.pending} onClick={() => ctx.act.done(d)}><Check /> Feito</Button>
        </div>
      )}
    </div>
  );
}

function Lanes({ view, ctx, mode, run }: { view: ProcMeetingView; ctx: Ctx; mode: 'focus' | 'daily'; run: (fn: () => Promise<Res>, ok?: string) => void }) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {view.lanes.map((l) => {
        const list = l.demands.filter((d) => (mode === 'daily' ? isOpen(d.status) || (d.doneAt?.slice(0, 10) === ctx.today) : isOpen(d.status) || d.focusWeek === view.meeting.week))
          .sort((a, b) => Number(b.focusWeek === view.meeting.week) - Number(a.focusWeek === view.meeting.week) || Number(b.late) - Number(a.late));
        const focusN = l.demands.filter((d) => d.focusWeek === view.meeting.week && d.status !== 'CANCELADA').length;
        const sectorIds = view.sectors.filter((s) => l.sectors.includes(s.name));
        return (
          <Card key={l.id ?? 'none'} className="overflow-hidden">
            <div className="flex items-center gap-2 border-b border-borda bg-fundo px-3 py-2">
              <p className="min-w-0 flex-1 truncate font-bold text-navy">{l.name}<span className="ml-1 text-xs font-normal text-tinta-suave">{l.sectors.join(', ')}</span></p>
              <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', focusN > 3 ? 'bg-atencao/15 text-atencao' : 'bg-nacao/10 text-nacao')} title={focusN > 3 ? 'Muita coisa em foco: escolha até 3' : undefined}>🎯 {focusN}</span>
            </div>
            {list.length === 0 ? <p className="p-3 text-sm text-tinta-suave">Nada em aberto.</p> : <div className="divide-y divide-borda">{list.map((d) => <Line key={d.id} d={d} ctx={ctx} mode={mode} />)}</div>}
            {ctx.open && mode === 'focus' && sectorIds.length > 0 && <QuickAdd sectors={sectorIds} ownerId={l.id} week={view.meeting.week} meetingId={view.meeting.id} run={run} />}
          </Card>
        );
      })}
    </div>
  );
}

function QuickAdd({ sectors, ownerId, week, meetingId, run }: { sectors: Opt[]; ownerId: string | null; week: string; meetingId: string; run: (fn: () => Promise<Res>, ok?: string) => void }) {
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [sector, setSector] = useState(sectors[0]!.id);
  return (
    <form className="flex flex-wrap items-center gap-1.5 border-t border-borda p-2" onSubmit={(e) => {
      e.preventDefault();
      if (title.trim().length < 3) return;
      run(() => saveDemandAction(null, { sectorId: sector, title, description: null, ownerId, dueDate: due || null, priority: 'MEDIA', meetingId, focusWeek: week }), 'Demanda criada no foco da semana 🎯');
      setTitle(''); setDue('');
    }}>
      <Plus className="size-4 text-tinta-fraca" />
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nova demanda combinada…" className="h-8 min-w-40 flex-1 text-sm" />
      {sectors.length > 1 && <Select value={sector} onChange={(e) => setSector(e.target.value)} className="h-8 w-36 text-xs">{sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>}
      <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="h-8 w-36 text-xs" aria-label="Prazo" />
      <Button size="sm" type="submit">Adicionar</Button>
    </form>
  );
}

function Close({ view, run, pending }: { view: ProcMeetingView; run: (fn: () => Promise<Res>, ok?: string) => void; pending: boolean }) {
  const m = view.meeting;
  const [notes, setNotes] = useState(m.notes ?? '');
  const [notify, setNotify] = useState(true);
  if (m.status !== 'ABERTA') {
    return (
      <Card className="p-4 text-sm">
        <p className="font-bold text-navy">Reunião encerrada</p>
        {m.summary && <p className="mt-1 text-tinta-suave">🎯 {m.summary.focusDone}/{m.summary.focus} do foco · {m.summary.doneWeek} concluídas na semana · {m.summary.late} atrasadas · {m.summary.blocked} travadas{m.summary.enviados ? ` · ${m.summary.enviados} WhatsApp enviados` : ''}</p>}
        {m.notes && <p className="mt-3 whitespace-pre-line">{m.notes}</p>}
      </Card>
    );
  }
  return (
    <Card className="space-y-3 p-4">
      {view.canRun ? <>
        <div>
          <p className="text-sm font-semibold text-navy">Decisões e combinados</p>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => run(() => saveMeetingNotesAction(m.id, notes))} rows={6} className="mt-1 w-full rounded-lg border border-borda p-2 text-sm" placeholder={'• Comprar cloro em lote (Manutenção)\n• Revisar escala do fim de semana'} />
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Enviar a cada líder, por WhatsApp, o foco 🎯 dele e as decisões</label>
        <Button disabled={pending} onClick={() => { if (confirm('Encerrar a reunião?')) run(() => closeProcMeetingAction(m.id, notes || null, notify).then((r) => (r.ok ? { ok: true as const } : r)), 'Reunião encerrada.'); }}>Encerrar reunião</Button>
      </> : <p className="text-sm text-tinta-suave">Quem conduz a reunião encerra e envia o resumo.</p>}
    </Card>
  );
}

function Daily({ view, ctx, msg, run }: { view: ProcMeetingView; ctx: Ctx; msg: { ok?: string | null; error?: string | null }; run: (fn: () => Promise<Res>, ok?: string) => void }) {
  const [started] = useState(() => Date.now());
  const [now, setNow] = useState(started);
  useEffect(() => { if (!ctx.open) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [ctx.open]);
  const s = Math.floor((now - started) / 1000);
  const over = s > 15 * 60;
  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-3 p-3">
        {ctx.open && <span className={cn('inline-flex items-center gap-1 rounded-lg px-2 py-1 font-mono text-lg font-bold tabular-nums', over ? 'bg-critico/10 text-critico' : 'bg-nacao/10 text-nacao')}><Timer className="size-5" />{String(Math.floor(s / 60)).padStart(2, '0')}:{String(s % 60).padStart(2, '0')}</span>}
        <p className="min-w-0 flex-1 text-sm text-tinta-suave">Cada líder, em 1–2 min: <b className="text-navy">o que fechou</b> (✓ Feito), <b className="text-navy">o que faz hoje</b> (▶ Hoje) e <b className="text-navy">o que trava</b> (🔒 Travou). Problemas longos: resolver depois, com quem precisa.</p>
        <Link href="/processos/demandas?modo=kanban" className="text-sm font-semibold text-nacao">Kanban →</Link>
      </Card>
      <FormMessage error={msg.error} success={msg.ok} />
      <Lanes view={view} ctx={ctx} mode="daily" run={run} />
      <Close view={view} run={run} pending={ctx.pending} />
    </div>
  );
}
