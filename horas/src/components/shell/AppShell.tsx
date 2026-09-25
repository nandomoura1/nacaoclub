'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3, CalendarDays, ClipboardCheck, History, LayoutGrid,
  LogOut, Settings2, Sun, TriangleAlert, Users, UserRoundCog,
} from 'lucide-react';
import { Logo } from '@/components/Logo';
import { cn } from '@/lib/cn';
import { initials } from '@/lib/format';
import { logoutAction } from '@/app/login/actions';
import type { NavIcon, NavItem } from './nav';

const ICONS: Record<NavIcon, React.ComponentType<{ className?: string }>> = {
  hoje: Sun,
  calendario: CalendarDays,
  pendencias: TriangleAlert,
  grade: LayoutGrid,
  professores: Users,
  fechamento: ClipboardCheck,
  relatorios: BarChart3,
  usuarios: UserRoundCog,
  historico: History,
  cadastros: Settings2,
};

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SideLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const Icon = ICONS[item.icon];
  if (item.soon) {
    return (
      <span
        className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/35"
        title={`Chega na etapa ${item.soon}`}
      >
        <Icon className="size-4" />
        <span className="flex-1">{item.label}</span>
        <span className="rounded bg-white/10 px-1.5 text-[10px] font-semibold">{item.soon}</span>
      </span>
    );
  }
  return (
    <Link
      href={item.href}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
        isActive(pathname, item.href) ? 'bg-white/12 text-white' : 'text-white/75 hover:bg-white/8 hover:text-white',
      )}
    >
      <Icon className="size-4" />
      {item.label}
    </Link>
  );
}

export function AppShell({
  user,
  main,
  admin,
  children,
}: {
  user: { name: string; roleLabel: string };
  main: NavItem[];
  admin: NavItem[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const mobileItems = [...main, ...admin].filter((i) => i.mobile && !i.soon);

  return (
    <div className="min-h-dvh lg:pl-64">
      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-navy px-3 py-5 text-white lg:flex">
        <div className="mb-8 px-3">
          <Logo />
        </div>
        <nav className="flex-1 space-y-1">
          {main.map((item) => (
            <SideLink key={item.href} item={item} pathname={pathname} />
          ))}
          {admin.length > 0 && (
            <>
              <p className="px-3 pb-1 pt-6 text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">
                Administração
              </p>
              {admin.map((item) => (
                <SideLink key={item.href} item={item} pathname={pathname} />
              ))}
            </>
          )}
        </nav>
        <UserBox user={user} />
      </aside>

      {/* Topo mobile */}
      <header className="sticky top-0 z-20 flex items-center justify-between bg-navy px-4 py-3 text-white lg:hidden">
        <Logo subtitle={false} />
        <form action={logoutAction}>
          <button className="flex items-center gap-2 text-xs text-white/80" aria-label="Sair">
            <span className="grid size-8 place-items-center rounded-full bg-white/15 text-[11px] font-bold">
              {initials(user.name)}
            </span>
            <LogOut className="size-4" />
          </button>
        </form>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-12 lg:pt-10">{children}</main>

      {/* Navegação inferior mobile */}
      {mobileItems.length > 0 && (
        <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-borda bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
          {mobileItems.map((item) => {
            const Icon = ICONS[item.icon];
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold',
                  active ? 'text-nacao' : 'text-tinta-fraca',
                )}
              >
                <Icon className="size-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}

function UserBox({ user }: { user: { name: string; roleLabel: string } }) {
  return (
    <div className="mt-4 flex items-center gap-3 rounded-xl bg-white/6 p-3">
      <span className="grid size-9 place-items-center rounded-full bg-nacao text-xs font-bold">
        {initials(user.name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{user.name}</p>
        <Link href="/conta/senha" className="text-[11px] text-white/55 hover:text-white">
          {user.roleLabel} · trocar senha
        </Link>
      </div>
      <form action={logoutAction}>
        <button className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white" aria-label="Sair" title="Sair">
          <LogOut className="size-4" />
        </button>
      </form>
    </div>
  );
}

