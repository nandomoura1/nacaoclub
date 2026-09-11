'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BrandLogo } from '@/components/BrandLogo';

const NAV = [
  { href: '/leaderboard', label: 'Leaderboard' },
  { href: '/wod/1', label: 'WODs' },
  { href: '/schedule', label: 'Programação' },
] as const;

/**
 * Cabeçalho público. Navy do manual, filete ciano e nada mais — o conteúdo
 * é o ranking, não a navegação (§38).
 */
export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="no-print sticky top-0 z-40 border-b border-white/[0.08] bg-nacao-abyss/88 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-3" aria-label="NAÇÃO ATHX — início">
          <BrandLogo size="sm" />
          <span className="hidden h-7 w-px bg-white/15 sm:block" aria-hidden="true" />
          <span className="hidden sm:block">
            <span className="block font-display text-sm font-extrabold tracking-tight text-white">
              NAÇÃO ATHX
            </span>
            <span className="block font-display text-[8px] font-bold tracking-kicker text-nacao-cyan uppercase">
              Live Leaderboard
            </span>
          </span>
        </Link>

        <nav aria-label="Navegação principal">
          <ul className="flex items-center gap-0.5 sm:gap-1">
            {NAV.map((item) => {
              const active =
                pathname === item.href ||
                (item.href === '/wod/1' && pathname.startsWith('/wod'));
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={`block rounded-lg px-2 py-2 font-display text-[10px] font-bold tracking-wide whitespace-nowrap uppercase transition-colors sm:px-3 sm:text-[11px] sm:tracking-wider ${
                      active
                        ? 'bg-nacao-cyan/12 text-nacao-cyan'
                        : 'text-white/55 hover:bg-white/[0.07] hover:text-white'
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </header>
  );
}
