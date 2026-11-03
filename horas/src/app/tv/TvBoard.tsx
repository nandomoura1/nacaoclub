import { WEEKDAYS, weekdayOf, type IsoDate } from '@/domain/dates';
import { ART_LABEL, lines, type WorkoutBlockData } from '@/domain/workout';
import { tvLayout } from '@/domain/workout-tv';
import type { TvDay } from '@/server/services/tv-service';
import { describeTimer, suggestTimer, type TimerState } from '@/domain/timer';
import { TvTimer } from './TvTimer';
import { TvTimerWatch } from './TvTimerWatch';

const ddmm = (d: IsoDate) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const dayLong = (d: IsoDate) => WEEKDAYS[weekdayOf(d) - 1]!.long;
const nowSP = () => new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });

/** Relógio que anda sozinho (script mínimo: roda até em navegador de Smart TV antigo). */
const CLOCK = `(function(){var e=document.getElementById('tv-clock');if(!e)return;function t(){var d=new Date();e.textContent=d.toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'})}setInterval(t,15000)})();`;

/** Treino do dia em tela cheia, para a TV do box (16:9, letra grande, sem cortar). */
export function TvBoard({ v, refreshSeconds, live }: { v: TvDay; refreshSeconds: number; live?: { token: string; timer: TimerState | null; serverNow: number } }) {
  const timer = live?.timer ?? null;
  // Com cronômetro: relógio à esquerda (44%) e o treino à direita: só Força e WOD detalhados; o resto só com o tempo.
  const layout = tvLayout(v.blocks, timer ? { widthVh: 87, bodyVh: 66, maxColumns: 1, detailedKinds: ['FORCA', 'WOD'] } : {});
  // Bloco em destaque: o que gerou este timer (mesmo formato) ou, na dúvida, o WOD.
  const mainBlocks = layout.columns.flatMap((c) => c.blocks);
  const sug = timer ? describeTimer(timer.config) : null;
  let hot = timer ? mainBlocks.findIndex((b) => { const t = suggestTimer(b); return !!t && describeTimer(t) === sug; }) : -1;
  if (timer && hot < 0) hot = mainBlocks.findIndex((b) => b.kind === 'WOD');
  const chips = (v.footerChips ?? '').split('\n').map((l) => l.split('|')).filter((p) => p[0]?.trim()).slice(0, 4);
  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-[#011d3d] font-titulo text-white" style={{ background: 'radial-gradient(120% 90% at 0% 0%, #0169E9 0%, #022B57 45%, #011a36 100%)' }}>
      {/* Com cronômetro a página não recarrega sozinha (perderia o som e o ritmo da aula). */}
      {!timer && <meta httpEquiv="refresh" content={String(refreshSeconds)} />}
      {live && !timer && <TvTimerWatch token={live.token} />}
      <header className="flex items-center gap-[2vw] px-[3vw] pt-[2.6vh]" style={{ height: '13vh' }}>
        <div className="min-w-0">
          <p className="font-bold uppercase tracking-[0.3em] text-[#20C4FA]" style={{ fontSize: '1.9vh' }}>Nação Club · Treino do dia</p>
          <p className="truncate font-extrabold uppercase leading-none" style={{ fontSize: '6.4vh' }}>{v.modality}</p>
        </div>
        <div className="ml-auto text-right">
          <p className="font-extrabold uppercase leading-none" style={{ fontSize: '4.4vh' }}>{dayLong(v.date)} · {ddmm(v.date)}</p>
          {(v.title || v.pinned) && <p className="mt-[0.6vh] font-bold text-[#20C4FA]" style={{ fontSize: '2.4vh' }}>{v.title ?? ''}{v.title && v.pinned ? ' · ' : ''}{v.pinned ? 'treino fixado' : ''}</p>}
        </div>
        <div className="rounded-[1.4vh] bg-white/10 px-[1.6vw] py-[1vh] text-center">
          <p id="tv-clock" className="font-extrabold tabular-nums leading-none" style={{ fontSize: '5vh' }}>{nowSP()}</p>
          {layout.totalMinutes > 0 && <p className="mt-[0.4vh] font-bold text-white/70" style={{ fontSize: '1.7vh' }}>aula {layout.totalMinutes}&apos;</p>}
        </div>
      </header>

      {live && timer ? (
        <main className="grid min-h-0 flex-1 gap-[1.6vw] px-[3vw] pb-[1.6vh] pt-[0.6vh]" style={{ gridTemplateColumns: '44fr 56fr' }}>
          <TvTimer token={live.token} initial={timer} serverNow={live.serverNow} />
          <section className="flex min-h-0 flex-col gap-[1.4vh]">
            {(layout.quick.length > 0 || v.theme) && (
              <div className="flex flex-wrap items-center gap-[0.8vw]">
                {layout.quick.map((q, i) => (
                  <span key={i} className="rounded-full bg-white/12 px-[1.2vw] py-[0.6vh] font-bold uppercase ring-1 ring-white/20" style={{ fontSize: '2.2vh' }}>
                    {q.label}{q.minutes ? <span className="text-[#20C4FA]"> {q.minutes}&apos;</span> : null}
                  </span>
                ))}
                {v.theme && <span className="ml-auto truncate font-bold text-white/85" style={{ fontSize: '2.1vh' }}>🎯 {v.theme}</span>}
              </div>
            )}
            {mainBlocks.length === 0 ? (
              <div className="flex flex-1 items-center justify-center rounded-[1.8vh] bg-white/[0.05] text-center font-extrabold" style={{ fontSize: '4vh' }}>Sem treino lançado para hoje</div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col gap-[1.4vh]" style={{ fontSize: `${layout.fontVh}vh`, lineHeight: 1.3 }}>
                {mainBlocks.map((b, i) => <BlockCard key={i} b={b} hot={i === hot} grow={i === mainBlocks.length - 1} />)}
              </div>
            )}
          </section>
        </main>
      ) : v.blocks.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <p className="font-extrabold" style={{ fontSize: '6vh' }}>Sem treino lançado para hoje</p>
          {v.next && <p className="mt-[2vh] font-bold text-[#20C4FA]" style={{ fontSize: '3.6vh' }}>Próximo treino: {dayLong(v.next)}, {ddmm(v.next)}</p>}
        </div>
      ) : (
        <>
          {(layout.quick.length > 0 || v.theme) && (
            <div className="flex flex-wrap items-center gap-[1vw] px-[3vw] pt-[1.6vh]" style={{ minHeight: '7vh' }}>
              {layout.quick.map((q, i) => (
                <span key={i} className="rounded-full bg-white/12 px-[1.3vw] py-[0.7vh] font-bold uppercase ring-1 ring-white/20" style={{ fontSize: '2.3vh' }}>
                  {q.label}{q.minutes ? <span className="text-[#20C4FA]"> {q.minutes}&apos;</span> : null}{q.title ? <span className="font-semibold normal-case text-white/75"> · {q.title}</span> : null}
                </span>
              ))}
              {v.theme && <span className="ml-auto font-bold text-white/85" style={{ fontSize: '2.3vh' }}>🎯 {v.theme}</span>}
            </div>
          )}
          <main className="grid min-h-0 flex-1 gap-[1.6vw] px-[3vw] py-[2vh]" style={{ gridTemplateColumns: `repeat(${Math.max(1, layout.columns.length)}, minmax(0, 1fr))`, fontSize: `${layout.fontVh}vh`, lineHeight: 1.3 }}>
            {layout.columns.map((c, ci) => (
              <section key={ci} className="flex min-h-0 flex-col gap-[1.6vh]">
                {c.blocks.map((b, bi) => (
                  <BlockCard key={bi} b={b} />
                ))}
              </section>
            ))}
          </main>
        </>
      )}

      <footer className="flex items-center gap-[1.2vw] border-t border-white/10 px-[3vw]" style={{ height: '6vh' }}>
        {v.footerTitle && <span className="font-extrabold uppercase text-[#20C4FA]" style={{ fontSize: '2vh' }}>📣 {v.footerTitle}</span>}
        {chips.map((p, i) => <span key={i} className="rounded-full bg-white/10 px-[0.9vw] py-[0.3vh] font-bold" style={{ fontSize: '1.8vh' }}>{p[0]!.trim()}{p[1] ? ` · ${p[1].trim()}` : ''}</span>)}
        <span className="ml-auto font-semibold text-white/60" style={{ fontSize: '1.8vh' }}>Muitos esportes, muitas paixões, uma Nação! 💙</span>
      </footer>
      <script dangerouslySetInnerHTML={{ __html: CLOCK }} />
    </div>
  );
}

/** Card de um bloco do treino (força, WOD…). `hot` = bloco que está no cronômetro. */
function BlockCard({ b, hot = false, grow = false }: { b: WorkoutBlockData; hot?: boolean; grow?: boolean }) {
  return (
    <article className={`rounded-[1.6vh] px-[1.4vw] py-[1.4vh] ${hot ? 'bg-[#20C4FA]/[0.12] ring-[0.35vh] ring-[#20C4FA]' : 'bg-white/[0.07] ring-1 ring-white/15'} ${grow ? 'flex-1' : ''}`}>
      <p className="flex flex-wrap items-baseline gap-x-[0.6em] font-extrabold uppercase">
        <span className="text-[#20C4FA]" style={{ fontSize: '1.25em' }}>{ART_LABEL[b.kind] || b.title}</span>
        {b.durationMin ? <span className="text-white/70">{b.durationMin}&apos;</span> : null}
        {hot && <span className="ml-auto rounded-full bg-[#20C4FA] px-[0.8vw] py-[0.3vh] tracking-[0.1em] text-[#022B57]" style={{ fontSize: '1.6vh' }}>AGORA</span>}
      </p>
      {b.title && ART_LABEL[b.kind] && <p className="font-extrabold" style={{ fontSize: '1.1em' }}>{b.title}</p>}
      {(b.format || b.timeCapMin) && <p className="font-bold text-[#7fd8ff]">{[b.format, b.timeCapMin ? `Time cap ${b.timeCapMin}'` : null].filter(Boolean).join(' · ')}</p>}
      <ul className="mt-[0.3em] font-sans font-semibold">
        {lines(b.content).map((l, li) => <li key={li}>{l.replace(/^[-•]\s*/, '• ').replace(/^(?!•)/, '• ')}</li>)}
      </ul>
      {b.notes && <p className="mt-[0.3em] font-sans italic text-white/70" style={{ fontSize: '0.9em' }}>{b.notes}</p>}
    </article>
  );
}
