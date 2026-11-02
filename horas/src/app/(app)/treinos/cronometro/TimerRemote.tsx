'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { Maximize2, Minimize2, Pause, Play, RotateCcw, Tv, X } from 'lucide-react';
import { FormMessage } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { TIMER_KINDS, describeTimer, elapsedOf, normalizeTimer, timerFrame, type TimerConfig, type TimerKind, type TimerState } from '@/domain/timer';
import { cn } from '@/lib/cn';
import type { TimerScreen } from '@/server/services/tv-service';
import { timerCommandAction, timerStateAction } from './actions';

/** "12:00" / "90" / "1:30" → segundos. */
const toSec = (v: string) => { const p = v.trim().split(':').map(Number); if (p.some((n) => !Number.isFinite(n))) return 0; return p.length === 1 ? p[0]! * 60 : p.length === 2 ? p[0]! * 60 + p[1]! : p[0]! * 3600 + p[1]! * 60 + p[2]!; };
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const PRESETS: { label: string; config: Partial<TimerConfig> & { kind: TimerKind } }[] = [
  { label: 'Tabata 8×20/10', config: { kind: 'INTERVAL', workSec: 20, restSec: 10, rounds: 8, label: 'Tabata' } },
  { label: 'EMOM 10', config: { kind: 'EMOM', workSec: 60, rounds: 10, label: 'EMOM' } },
  { label: 'AMRAP 12', config: { kind: 'AMRAP', durationSec: 720, label: 'AMRAP' } },
  { label: 'For Time cap 15', config: { kind: 'FOR_TIME', durationSec: 900, label: 'For Time' } },
  { label: 'Descanso 2 min', config: { kind: 'COUNTDOWN', durationSec: 120, leadInSec: 0, label: 'Descanso' } },
];

export function TimerRemote({ screens, initialId }: { screens: TimerScreen[]; initialId: string }) {
  const [screenId, setScreenId] = useState(initialId);
  const screen = screens.find((s) => s.id === screenId)!;
  const [state, setState] = useState<TimerState | null>(screen.timer);
  const offset = useRef(0);
  const [now, setNow] = useState(() => Date.now());
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Formulário.
  const base = screen.timer?.config ?? screen.suggestions[0]?.config ?? normalizeTimer({ kind: 'AMRAP', durationSec: 720 });
  const [kind, setKind] = useState<TimerKind>(base.kind);
  const [duration, setDuration] = useState(mmss(base.durationSec));
  const [work, setWork] = useState(mmss(base.workSec));
  const [rest, setRest] = useState(mmss(base.restSec));
  const [rounds, setRounds] = useState(String(base.rounds));
  const [lead, setLead] = useState(base.leadInSec > 0);
  const [label, setLabel] = useState(base.label);

  const fill = (c: Partial<TimerConfig> & { kind: TimerKind }) => {
    const n = normalizeTimer(c);
    setKind(n.kind); setDuration(mmss(n.durationSec)); setWork(mmss(n.workSec)); setRest(mmss(n.restSec)); setRounds(String(n.rounds)); setLead(n.leadInSec > 0); setLabel(n.label);
  };
  const config = normalizeTimer({ kind, durationSec: toSec(duration), workSec: toSec(work), restSec: toSec(rest), rounds: Number(rounds), leadInSec: lead ? 10 : 0, label });

  const apply = (r: Awaited<ReturnType<typeof timerStateAction>>) => {
    if (!r.ok) { setError(r.error); return; }
    setError(null); offset.current = r.data.now - Date.now(); setState(r.data.timer);
  };
  const send = (cmd: object) => start(async () => apply(await timerCommandAction(screenId, cmd)));
  const refresh = useCallback(async () => apply(await timerStateAction(screenId)), [screenId]);

  useEffect(() => { void refresh(); const id = setInterval(refresh, 4000); return () => clearInterval(id); }, [refresh]);
  useEffect(() => { const id = setInterval(() => setNow(Date.now() + offset.current), 250); return () => clearInterval(id); }, []);

  const f = state ? timerFrame(state.config, elapsedOf(state, now)) : null;
  const running = !!state && state.startedAt !== null && state.pausedAt === null && f?.phase !== 'DONE';
  const paused = !!state && state.pausedAt !== null;
  const ready = !!state && state.startedAt === null;
  const durationField = (lbl: string, v: string, set: (x: string) => void) => (
    <div><Label>{lbl}</Label><Input inputMode="numeric" value={v} onChange={(e) => set(e.target.value)} placeholder="mm:ss" /></div>
  );

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* Controle ao vivo */}
      <div className="space-y-4 lg:order-2">
        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <Tv className="size-4 text-nacao" />
            <Select value={screenId} onChange={(e) => { const s = screens.find((x) => x.id === e.target.value)!; setScreenId(s.id); setState(s.timer); }} className="flex-1">
              {screens.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.modality}</option>)}
            </Select>
          </div>
          <div className={cn('rounded-2xl p-5 text-center text-white', f?.phase === 'REST' ? 'bg-[#0b6f93]' : f?.phase === 'DONE' ? 'bg-[#8a2d2d]' : f?.phase === 'LEAD' ? 'bg-[#8a6510]' : 'bg-navy')}>
            {state && f ? (
              <>
                <p className="text-xs font-bold uppercase tracking-widest text-ciano">{state.config.label} · {describeTimer(state.config)}</p>
                <p className={cn('my-1 font-extrabold tabular-nums leading-none', paused && 'opacity-60')} style={{ fontSize: 'min(22vw, 6.5rem)' }}>{f.clock}</p>
                <p className="text-sm font-bold uppercase">{paused ? 'Pausado' : f.phase === 'READY' ? 'Pronto na TV — aperte Iniciar' : f.caption}</p>
              </>
            ) : <p className="py-8 text-sm text-white/80">Nenhum timer nesta TV. Programe abaixo e toque em <b>Enviar para a TV</b>.</p>}
          </div>
          <FormMessage error={error} />
          {state && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {ready || f?.phase === 'DONE'
                ? <Button size="lg" className="col-span-2" disabled={pending} onClick={() => send({ type: 'start' })}><Play /> {f?.phase === 'DONE' ? 'Iniciar de novo' : 'Iniciar'}</Button>
                : paused
                  ? <Button size="lg" className="col-span-2" disabled={pending} onClick={() => send({ type: 'resume' })}><Play /> Retomar</Button>
                  : <Button size="lg" variant="secondary" className="col-span-2" disabled={pending || !running} onClick={() => send({ type: 'pause' })}><Pause /> Pausar</Button>}
              <Button variant="secondary" disabled={pending || ready} onClick={() => { if (!running || confirm('Zerar o cronômetro em andamento?')) send({ type: 'reset' }); }}><RotateCcw /> Zerar</Button>
              <Button variant="secondary" disabled={pending} onClick={() => send({ type: 'full', on: !state.full })}>{state.full ? <><Minimize2 /> Mostrar WOD</> : <><Maximize2 /> Tela cheia</>}</Button>
              <Button variant="ghost" className="col-span-2" disabled={pending} onClick={() => { if (confirm('Tirar o cronômetro da TV? Ela volta a mostrar só o treino.')) send({ type: 'clear' }); }}><X /> Tirar o cronômetro da TV</Button>
            </div>
          )}
        </Card>
      </div>

      {/* Programar */}
      <Card className="space-y-4 p-4 lg:order-1">
        {screen.suggestions.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold text-tinta-suave">Do treino de hoje ({screen.modality})</p>
            <div className="flex flex-wrap gap-2">
              {screen.suggestions.map((s, i) => <Button key={i} size="sm" variant="secondary" onClick={() => fill(s.config)}>{s.block}: {describeTimer(s.config)}</Button>)}
            </div>
          </div>
        )}
        <div>
          <p className="mb-1.5 text-xs font-semibold text-tinta-suave">Atalhos</p>
          <div className="flex flex-wrap gap-2">{PRESETS.map((p) => <Button key={p.label} size="sm" variant="ghost" className="ring-1 ring-borda" onClick={() => fill(p.config)}>{p.label}</Button>)}</div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {TIMER_KINDS.map((k) => (
            <button key={k.id} type="button" onClick={() => setKind(k.id)} className={cn('rounded-xl px-2 py-2.5 text-xs font-bold ring-1', kind === k.id ? 'bg-nacao text-white ring-nacao' : 'bg-white text-tinta ring-borda')}>{k.label}</button>
          ))}
        </div>
        <p className="text-xs text-tinta-suave">{TIMER_KINDS.find((k) => k.id === kind)?.hint}</p>
        <div className="grid grid-cols-2 gap-3">
          {kind === 'FOR_TIME' && durationField('Time cap (mm:ss · 0 = sem cap)', duration, setDuration)}
          {(kind === 'AMRAP' || kind === 'COUNTDOWN') && durationField('Duração (mm:ss)', duration, setDuration)}
          {kind === 'EMOM' && <>{durationField('A cada (mm:ss)', work, setWork)}<div><Label>Rounds</Label><Input inputMode="numeric" value={rounds} onChange={(e) => setRounds(e.target.value)} /></div></>}
          {kind === 'INTERVAL' && <>{durationField('Trabalho (mm:ss)', work, setWork)}{durationField('Descanso (mm:ss)', rest, setRest)}<div><Label>Rounds</Label><Input inputMode="numeric" value={rounds} onChange={(e) => setRounds(e.target.value)} /></div></>}
          <div><Label>Nome na TV</Label><Input value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} /></div>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-nacao" checked={lead} onChange={(e) => setLead(e.target.checked)} /> Contagem de 10 s antes de começar</label>
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-fundo p-3">
          <span className="flex-1 text-sm font-semibold text-navy">{describeTimer(config)}</span>
          <Button disabled={pending} onClick={() => { if (!running || confirm('Tem um cronômetro rodando na TV. Trocar por este?')) send({ type: 'program', config }); }}><Tv /> Enviar para a TV</Button>
        </div>
        <p className="text-xs text-tinta-suave">Dica: na primeira vez, aperte <b>OK</b> no controle da TV em &quot;Ativar som&quot; para ouvir os bipes (3-2-1, troca de round e fim).</p>
      </Card>
    </div>
  );
}
