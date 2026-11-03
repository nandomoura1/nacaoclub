'use client';

import { useEffect, useRef, useState } from 'react';
import { elapsedOf, shortTimer, timerFrame, type Frame, type TimerState } from '@/domain/timer';

/**
 * Cronômetro na TV. Consulta o estado a cada 2 s e calcula o tempo localmente a partir
 * do início guardado no servidor (corrigindo a diferença de relógio da TV).
 * - Timer some ou aparece → recarrega a página (o layout do treino muda).
 * - Som: TV costuma exigir um clique antes de tocar; mostramos "Ativar som".
 */
export function TvTimer({ token, initial, serverNow }: { token: string; initial: TimerState; serverNow: number }) {
  const [state, setState] = useState<TimerState>(initial);
  const offset = useRef(serverNow - Date.now());
  const [now, setNow] = useState(() => Date.now() + offset.current);
  const audio = useRef<AudioContext | null>(null);
  const [needsSound, setNeedsSound] = useState(false);
  const last = useRef<{ phase: Frame['phase']; clock: string; round: number | null; part: number | undefined; rev: number } | null>(null);

  // Consulta o servidor.
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const t0 = Date.now();
        const r = await fetch(`/tv/${token}/timer`, { cache: 'no-store' });
        if (r.status === 404) { location.reload(); return; }
        const j = (await r.json()) as { now: number; timer: TimerState | null };
        const t1 = Date.now();
        offset.current = j.now - (t0 + t1) / 2;
        if (!alive) return;
        if (!j.timer) { location.reload(); return; }
        setState(j.timer);
      } catch { /* rede oscilou: segue contando com o último estado */ }
    };
    const id = setInterval(poll, 2000);
    return () => { alive = false; clearInterval(id); };
  }, [token]);

  // Relógio local (4×/s: o segundo vira no tempo certo).
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + offset.current), 250);
    return () => clearInterval(id);
  }, []);

  // Som.
  useEffect(() => {
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      audio.current = new Ctx();
      setNeedsSound(audio.current.state === 'suspended');
    } catch { /* sem áudio */ }
  }, []);
  const beep = (freq: number, ms: number, times = 1) => {
    const ctx = audio.current;
    if (!ctx || ctx.state !== 'running') return;
    for (let i = 0; i < times; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      const at = ctx.currentTime + i * (ms / 1000 + 0.12);
      o.frequency.value = freq; o.type = 'square';
      g.gain.setValueAtTime(0.25, at); g.gain.exponentialRampToValueAtTime(0.001, at + ms / 1000);
      o.connect(g).connect(ctx.destination); o.start(at); o.stop(at + ms / 1000 + 0.05);
    }
  };
  const enableSound = () => { audio.current?.resume().then(() => { setNeedsSound(false); beep(880, 120); }).catch(() => {}); };

  const elapsed = elapsedOf(state, now);
  const f = timerFrame(state.config, elapsed);
  const paused = state.pausedAt !== null;

  // Bipes nas viradas: 3-2-1, largada, troca de round/descanso, fim.
  useEffect(() => {
    const prev = last.current;
    last.current = { phase: f.phase, clock: f.clock, round: f.round, part: f.part, rev: state.rev };
    if (!prev || paused || prev.rev !== state.rev && f.phase === 'READY') return;
    if (f.phase === 'LEAD' && prev.clock !== f.clock && Number(f.clock) <= 3) beep(660, 150);
    else if (f.phase === 'DONE' && prev.phase !== 'DONE') beep(520, 600, 3);
    else if ((f.phase === 'WORK' || f.phase === 'REST') && (prev.phase !== f.phase || prev.round !== f.round || prev.part !== f.part)) beep(f.phase === 'WORK' ? 990 : 440, 500);
    else if ((f.phase === 'WORK' || f.phase === 'REST') && /^00:0[1-3]$/.test(f.clock) && prev.clock !== f.clock && state.config.kind !== 'FOR_TIME') beep(660, 120);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.phase, f.clock, f.round, f.part, state.rev, paused]);

  const tone = f.phase === 'REST' ? '#20C4FA' : f.phase === 'LEAD' ? '#FFC24B' : f.phase === 'DONE' ? '#ff6b6b' : '#ffffff';
  const bg = f.phase === 'REST' ? 'rgba(32,196,250,0.16)' : f.phase === 'DONE' ? 'rgba(255,107,107,0.18)' : f.phase === 'LEAD' ? 'rgba(255,194,75,0.14)' : 'rgba(255,255,255,0.08)';
  const status = paused ? 'PAUSADO' : f.phase === 'READY' ? 'PRONTO · aguardando o professor' : f.caption;
  const bar = <div className="overflow-hidden rounded-full bg-white/15" style={{ height: '1.2vh' }}><div className="h-full rounded-full" style={{ width: `${Math.round(Math.min(1, Math.max(0, f.progress)) * 100)}%`, background: tone, transition: 'width .25s linear' }} /></div>;
  // Tela cheia: botão flutuando embaixo; no painel lateral: dentro do painel, sem cobrir o treino.
  const soundBtn = (floating: boolean) => needsSound && (
    // eslint-disable-next-line jsx-a11y/no-autofocus
    <button autoFocus onClick={enableSound} className={`${floating ? 'fixed bottom-[8vh] left-1/2 z-[60] -translate-x-1/2' : 'mt-[1.4vh] self-center'} rounded-full bg-[#FFC24B] px-[1.4vw] py-[0.8vh] font-extrabold text-[#022B57] shadow-2xl`} style={{ fontSize: '2.2vh' }}>🔊 Ativar som (OK no controle)</button>
  );

  if (state.full) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-[2vh] font-titulo text-white" style={{ background: 'radial-gradient(120% 90% at 0% 0%, #0169E9 0%, #022B57 45%, #011a36 100%)' }}>
        <p className="font-bold uppercase tracking-[0.3em] text-[#20C4FA]" style={{ fontSize: '3.4vh' }}>{state.config.label}{f.part ? ` · parte ${f.part} de ${f.parts}` : ''}</p>
        <p className="font-extrabold tabular-nums leading-none" style={{ fontSize: f.phase === 'LEAD' ? '46vh' : '34vh', color: tone, opacity: paused ? 0.55 : 1 }}>{f.clock}</p>
        <p className="font-extrabold uppercase" style={{ fontSize: '6vh', color: f.phase === 'DONE' ? tone : undefined }}>{status}</p>
        {f.round && f.rounds && <p className="font-bold text-white/80" style={{ fontSize: '4vh' }}>Round {f.round} / {f.rounds}</p>}
        {f.next && f.phase !== 'DONE' && <p className="font-bold text-white/70" style={{ fontSize: '3.2vh' }}>A seguir: {f.next}</p>}
        <div style={{ width: '70vw' }}>{bar}</div>
        {soundBtn(true)}
      </div>
    );
  }
  // Painel à esquerda da tela (o treino fica à direita): relógio grande, fase, rounds e as partes da sequência.
  const parts = state.config.kind === 'SEQUENCE' ? state.config.parts ?? [] : [];
  const cur = (f.part ?? 1) - 1;
  const panelBg = f.phase === 'REST' ? 'linear-gradient(160deg, rgba(32,196,250,0.32), rgba(32,196,250,0.08))'
    : f.phase === 'DONE' ? 'linear-gradient(160deg, rgba(255,107,107,0.30), rgba(255,107,107,0.08))'
    : f.phase === 'LEAD' ? 'linear-gradient(160deg, rgba(255,194,75,0.26), rgba(255,194,75,0.06))' : bg;
  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-[2.4vh] px-[2vw] pb-[2.6vh] pt-[3vh] ring-[0.25vh] ring-white/20" style={{ background: panelBg }}>
      <p className="truncate font-bold uppercase tracking-[0.25em] text-[#20C4FA]" style={{ fontSize: '2.3vh' }}>⏱ {state.config.label}{f.part ? ` · parte ${f.part} de ${f.parts}` : ''}</p>
      <div className="flex min-h-0 flex-1 flex-col justify-center">
        <p className="text-center font-extrabold tabular-nums leading-[0.9] tracking-[-0.02em]" style={{ fontSize: f.phase === 'LEAD' ? '26vh' : f.clock.length > 5 ? '15vh' : '19.5vh', color: tone, opacity: paused ? 0.55 : 1 }}>{f.clock}</p>
        <p className="mt-[1.6vh] text-center font-extrabold uppercase leading-tight" style={{ fontSize: '4.4vh', color: f.phase === 'DONE' ? tone : undefined }}>{status}</p>
        {f.next && f.phase !== 'DONE' && <p className="mt-[0.8vh] text-center font-bold text-white/75" style={{ fontSize: '2.6vh' }}>A seguir: {f.next}</p>}
        <div className="mt-[2.6vh]">{bar}</div>
        {f.round && f.rounds && f.rounds <= 20 ? (
          <div className="mt-[2vh] flex justify-center gap-[0.6vw]">
            {Array.from({ length: f.rounds }, (_, i) => (
              <span key={i} className="rounded-full" style={{ width: '2.4vh', height: '2.4vh', background: i + 1 < f.round! ? '#fff' : i + 1 === f.round ? '#20C4FA' : 'rgba(255,255,255,0.18)', boxShadow: i + 1 === f.round ? '0 0 0 0.5vh rgba(32,196,250,0.35)' : undefined }} />
            ))}
          </div>
        ) : null}
      </div>
      {parts.length > 1 && (
        <div className="flex gap-[0.8vw]">
          {parts.map((p, i) => (
            <div key={i} className={`min-w-0 flex-1 rounded-[1.4vh] px-[0.9vw] py-[1.2vh] ${i === cur ? 'bg-white text-[#022B57]' : 'bg-white/[0.06] ring-[0.2vh] ring-white/15'} ${i < cur ? 'opacity-45' : ''}`}>
              <p className={`font-extrabold uppercase tracking-[0.15em] ${i === cur ? 'text-[#0169E9]' : 'text-white/55'}`} style={{ fontSize: '1.6vh' }}>Parte {i + 1}</p>
              <p className="truncate font-extrabold" style={{ fontSize: parts.length > 4 ? '1.9vh' : '2.3vh' }}>{shortTimer(p)}</p>
            </div>
          ))}
        </div>
      )}
      {soundBtn(false)}
    </section>
  );
}
