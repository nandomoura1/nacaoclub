import { WEEKDAYS, weekdayOf, type IsoDate } from '@/domain/dates';
import { ART_LABEL, lines } from '@/domain/workout';
import { tvLayout } from '@/domain/workout-tv';
import type { TvDay } from '@/server/services/tv-service';

const ddmm = (d: IsoDate) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const dayLong = (d: IsoDate) => WEEKDAYS[weekdayOf(d) - 1]!.long;
const nowSP = () => new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });

/** Relógio que anda sozinho (script mínimo: roda até em navegador de Smart TV antigo). */
const CLOCK = `(function(){var e=document.getElementById('tv-clock');if(!e)return;function t(){var d=new Date();e.textContent=d.toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'})}setInterval(t,15000)})();`;

/** Treino do dia em tela cheia, para a TV do box (16:9, letra grande, sem cortar). */
export function TvBoard({ v, refreshSeconds }: { v: TvDay; refreshSeconds: number }) {
  const layout = tvLayout(v.blocks);
  const chips = (v.footerChips ?? '').split('\n').map((l) => l.split('|')).filter((p) => p[0]?.trim()).slice(0, 4);
  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-[#011d3d] font-titulo text-white" style={{ background: 'radial-gradient(120% 90% at 0% 0%, #0169E9 0%, #022B57 45%, #011a36 100%)' }}>
      <meta httpEquiv="refresh" content={String(refreshSeconds)} />
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

      {v.blocks.length === 0 ? (
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
                  <article key={bi} className="rounded-[1.6vh] bg-white/[0.07] px-[1.4vw] py-[1.4vh] ring-1 ring-white/15">
                    <p className="flex flex-wrap items-baseline gap-x-[0.6em] font-extrabold uppercase">
                      <span className="text-[#20C4FA]" style={{ fontSize: '1.25em' }}>{ART_LABEL[b.kind] || b.title}</span>
                      {b.durationMin ? <span className="text-white/70">{b.durationMin}&apos;</span> : null}
                    </p>
                    {b.title && ART_LABEL[b.kind] && <p className="font-extrabold" style={{ fontSize: '1.1em' }}>{b.title}</p>}
                    {(b.format || b.timeCapMin) && <p className="font-bold text-[#7fd8ff]">{[b.format, b.timeCapMin ? `Time cap ${b.timeCapMin}'` : null].filter(Boolean).join(' · ')}</p>}
                    <ul className="mt-[0.3em] font-sans font-semibold">
                      {lines(b.content).map((l, li) => <li key={li}>{l.replace(/^[-•]\s*/, '• ').replace(/^(?!•)/, '• ')}</li>)}
                    </ul>
                    {b.notes && <p className="mt-[0.3em] font-sans italic text-white/70" style={{ fontSize: '0.9em' }}>{b.notes}</p>}
                  </article>
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
