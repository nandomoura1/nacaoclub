import { WaveField, SkyGlow } from '@/components/WaveField';
import { LiveIndicator } from '@/components/LiveIndicator';

/**
 * Hero — forte, mas compacto (§5). Branding não ocupa meia tela: em 390px
 * o topo do leaderboard já aparece na primeira rolagem.
 *
 * A construção NAÇÃO / filete / LIVE LEADERBOARD repete o lockup do
 * wordmark do manual (NAÇÃO / filete / C L U B).
 */
export function Hero({ live, lastUpdate }: { live: boolean; lastUpdate: string }) {
  return (
    <section className="relative overflow-hidden border-b border-white/[0.08]">
      <SkyGlow />
      <WaveField intensity="subtle" />

      <div className="relative mx-auto max-w-6xl px-4 pt-7 pb-8 sm:px-6 sm:pt-12 sm:pb-12">
        <div className="flex items-center gap-3">
          <span className="h-px w-6 bg-nacao-cyan" aria-hidden="true" />
          <p className="font-display text-[10px] font-bold tracking-kicker text-white/60 uppercase">
            Nação Celebration · Setembro Amarelo
          </p>
        </div>

        <h1 className="mt-4 font-display text-[40px] leading-[0.92] font-black tracking-[-0.04em] sm:text-6xl lg:text-7xl">
          NAÇÃO <span className="text-energy">ATHX</span>
        </h1>

        <div className="mt-3 flex items-center gap-3">
          <span className="h-px w-8 bg-nacao-cyan sm:w-12" aria-hidden="true" />
          <p className="font-display text-[10px] font-bold tracking-signature text-white/75 uppercase sm:text-xs">
            Live Leaderboard
          </p>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-nacao-cyan/45 bg-nacao-cyan/12 px-3 py-1 text-nacao-cyan">
            <LiveIndicator live={live} lastUpdate={lastUpdate} compact />
          </span>
          <span className="hidden h-4 w-px bg-white/15 sm:block" aria-hidden="true" />
          <p className="font-display text-[10px] font-bold tracking-wider text-white/60 uppercase sm:text-[11px]">
            12 de setembro · Nação Club · Brasília
          </p>
        </div>
      </div>
    </section>
  );
}
