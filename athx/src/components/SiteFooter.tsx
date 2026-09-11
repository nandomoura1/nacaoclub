import Link from 'next/link';
import { BrandLogo } from '@/components/BrandLogo';

export function SiteFooter({ demo = false }: { demo?: boolean }) {
  return (
    <footer className="no-print mt-16 border-t border-white/[0.08] px-4 py-10 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-5 text-center">
        <BrandLogo size="sm" />

        {/* O conceito do manual, usado de forma pontual (§4). */}
        <p className="font-display text-xs tracking-wider text-white/45 uppercase">
          Muitos esportes, muitas paixões, uma Nação!
        </p>

        <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-white/40">
          <Link href="/leaderboard" className="hover:text-nacao-cyan">
            Leaderboard
          </Link>
          <Link href="/schedule" className="hover:text-nacao-cyan">
            Programação
          </Link>
          <Link href="/qr" className="hover:text-nacao-cyan">
            QR Code
          </Link>
          <Link href="/display" className="hover:text-nacao-cyan">
            Telão
          </Link>
          <Link href="/admin" className="hover:text-nacao-cyan">
            Área da organização
          </Link>
        </div>

        {demo ? (
          <p className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[11px] text-amber-200">
            Modo demonstração — duplas e resultados são fictícios.
          </p>
        ) : null}

        <p className="text-[11px] text-white/25">
          Nação Celebration · Etapa Setembro Amarelo · Nação Club · Brasília
        </p>
      </div>
    </footer>
  );
}
