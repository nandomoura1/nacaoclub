'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS: readonly { href: string; label: string; exact?: boolean }[] = [
  { href: '/admin', label: 'Painel', exact: true },
  { href: '/admin/teams', label: 'Duplas' },
  { href: '/admin/wod/1', label: 'WOD 1' },
  { href: '/admin/wod/2', label: 'WOD 2' },
  { href: '/admin/wod/3', label: 'WOD 3' },
  { href: '/admin/results', label: 'Conferência' },
  { href: '/admin/settings', label: 'Configurações' },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Navegação da organização" className="border-t border-white/[0.06]">
      <ul className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-2 py-1.5 sm:px-5">
        {LINKS.map((link) => {
          const active = link.exact ? pathname === link.href : pathname.startsWith(link.href);
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={`block rounded-lg px-3.5 py-2 font-display text-xs font-bold tracking-wider whitespace-nowrap uppercase transition-colors ${
                  active
                    ? 'bg-nacao-cyan/15 text-nacao-cyan'
                    : 'text-white/50 hover:bg-white/[0.07] hover:text-white'
                }`}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
