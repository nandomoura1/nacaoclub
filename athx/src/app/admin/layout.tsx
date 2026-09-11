import Link from 'next/link';
import { BrandLogo } from '@/components/BrandLogo';
import { AdminNav } from '@/components/admin/AdminNav';
import { IS_DEMO } from '@/lib/env';

export const metadata = {
  title: 'Organização',
  robots: { index: false, follow: false },
};

/**
 * Shell administrativo.
 *
 * Premissa de desenho (§16, §59): são 10h30, o WOD acabou, 200 pessoas
 * olhando o celular. A pessoa que opera isto está sob pressão. Então:
 * alvos grandes, poucos cliques, nada escondido em menu.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-nacao-abyss/92 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/admin" className="flex items-center gap-3">
            <BrandLogo size="sm" />
            <span className="h-7 w-px bg-white/15" aria-hidden="true" />
            <span>
              <span className="block font-display text-sm font-extrabold tracking-tight">
                NAÇÃO ATHX
              </span>
              <span className="block font-display text-[8px] font-bold tracking-kicker text-nacao-cyan uppercase">
                Organização
              </span>
            </span>
          </Link>

          <Link
            href="/leaderboard"
            className="font-display text-[10px] font-bold tracking-wider text-white/50 uppercase hover:text-nacao-cyan"
          >
            Ver leaderboard público →
          </Link>
        </div>

        <AdminNav />
      </header>

      {IS_DEMO ? (
        <p className="border-b border-amber-400/25 bg-amber-400/10 px-4 py-2 text-center text-xs text-amber-100 sm:px-6">
          <strong className="font-display font-bold uppercase">Modo demonstração.</strong> O
          painel está em somente leitura: não há banco conectado. Configure o Supabase e
          defina NEXT_PUBLIC_DEMO_MODE=false para lançar resultados de verdade.
        </p>
      ) : null}

      <main id="conteudo" className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
