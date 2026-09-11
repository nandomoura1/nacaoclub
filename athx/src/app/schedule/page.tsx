import type { Metadata } from 'next';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { PageIntro } from '@/components/PageIntro';
import { SCHEDULE } from '@/lib/wods';

export const metadata: Metadata = {
  title: 'Programação',
  description: 'Cronograma do Nação Celebration — 12 de setembro, Nação Club.',
};

/** Timeline do evento (§37). */
export default function SchedulePage() {
  return (
    <>
      <SiteHeader />
      <PageIntro kicker="12 de setembro · Nação Club" title="Programação" subtitle="Nação Celebration" />

      <main id="conteudo" className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <ol className="relative space-y-0">
          {/* O filete vertical é o elemento gráfico de movimento do manual. */}
          <span
            aria-hidden="true"
            className="absolute top-2 bottom-2 left-[7px] w-px bg-gradient-to-b from-nacao-cyan/60 via-nacao-blue/35 to-transparent"
          />

          {SCHEDULE.map((item) => (
            <li key={`${item.hora}-${item.titulo}`} className="relative flex gap-4 py-3.5 pl-0">
              <span
                aria-hidden="true"
                className={`relative z-10 mt-1.5 h-[15px] w-[15px] shrink-0 rounded-full border-2 ${
                  item.destaque
                    ? 'border-nacao-cyan bg-nacao-cyan'
                    : 'border-nacao-blue/70 bg-nacao-abyss'
                }`}
              />
              <div className="min-w-0 flex-1 border-b border-white/[0.07] pb-3.5">
                <p className="tnum font-display text-[11px] font-bold tracking-wider text-nacao-cyan uppercase">
                  {item.hora}
                </p>
                <p
                  className={`font-display font-bold ${
                    item.destaque ? 'text-xl text-nacao-cyan uppercase' : 'text-base'
                  }`}
                >
                  {item.titulo}
                </p>
                {item.detalhe ? (
                  <p className="font-display text-[10px] font-bold tracking-wider text-white/40 uppercase">
                    {item.detalhe}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>

        <p className="mt-6 text-xs text-white/40">
          Horários previstos. A organização pode ajustar a programação durante o evento.
        </p>
      </main>

      <SiteFooter />
    </>
  );
}
