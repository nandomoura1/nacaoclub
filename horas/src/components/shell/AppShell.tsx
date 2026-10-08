'use client';

import Link from 'next/link';
import { Fragment, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  BarChart3, CalendarDays, ClipboardCheck, History, LayoutGrid,
  LogOut, Settings2, Sun, TriangleAlert, Users, UserRoundCog, Dumbbell, CalendarClock, Sparkles, Menu, X, Trophy, Dna, ChevronRight, Building2, Receipt, Landmark, LineChart, FileUp, FolderOpen, Briefcase } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { cn } from '@/lib/cn';
import { initials } from '@/lib/format';
import { logoutAction } from '@/app/login/actions';
import type { NavIcon, NavItem, NavSection } from './nav';

const ICONS: Record<NavIcon, React.ComponentType<{ className?: string }>> = {
  hoje: Sun,
  calendario: CalendarDays,
  pendencias: TriangleAlert,
  grade: LayoutGrid,
  professores: Users,
  fechamento: ClipboardCheck,
  relatorios: BarChart3,
  escalas: CalendarClock,
  treinos: Dumbbell,
  benchmarks: Trophy,
  dna: Dna,
  'treinos-ia': Sparkles,
  usuarios: UserRoundCog,
  historico: History,
  cadastros: Settings2,
  condominio: Building2,
  cobrancas: Receipt,
  financeiro: Landmark,
  'fin-historico': LineChart,
  'fin-importar': FileUp,
  documentos: FolderOpen,
  empresas: Briefcase,
};

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SideLink({ item, active, nested }: { item: NavItem; active: boolean; nested?: boolean }) {
  const Icon = ICONS[item.icon];
  if (item.soon) {
    return (
      <span
        className={cn('flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/35', nested && 'py-1.5 pl-9')}
        title={/^E\d/.test(item.soon) ? `Chega na etapa ${item.soon}` : 'Em breve'}
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
        nested && 'py-1.5 pl-9',
        active ? 'bg-white/12 text-white' : 'text-white/75 hover:bg-white/8 hover:text-white',
      )}
    >
      <Icon className="size-4" />
      {item.label}
    </Link>
  );
}

export function AppShell({
  user,
  sections,
  children,
}: {
  user: { name: string; roleLabel: string };
  sections: NavSection[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const mobileItems = sections.flatMap((s) => s.items).filter((i) => i.mobile && !i.soon).slice(0, 4);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [pathname]);
  const all = sections.flatMap((s) => s.items).filter((i) => !i.soon);
  // Item ativo = o de href mais longo que casa (Cadastro de Treino não acende em /treinos/ia).
  const activeHref = all.filter((i) => isActive(pathname, i.href)).sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <div className="min-h-dvh lg:pl-64 print:pl-0">
      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-navy px-3 py-5 text-white lg:flex print:hidden">
        <div className="mb-6 px-3">
          <Logo />
        </div>
        <SectionsNav sections={sections} activeHref={activeHref} />
        <UserBox user={user} />
      </aside>

      {/* Topo mobile */}
      <header className="sticky top-0 z-20 flex items-center justify-between bg-navy px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white lg:hidden print:hidden">
        <Logo />
        <form action={logoutAction}>
          <button className="flex items-center gap-2 text-xs text-white/80" aria-label="Sair">
            <span className="grid size-8 place-items-center rounded-full bg-white/15 text-[11px] font-bold">
              {initials(user.name)}
            </span>
            <LogOut className="size-4" />
          </button>
        </form>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-12 lg:pt-10 print:max-w-none print:p-0">{children}</main>

      {/* Navegação inferior mobile */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-borda bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden print:hidden">
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
                {item.short ?? item.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-expanded={menuOpen}
            className={cn('flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold', menuOpen ? 'text-nacao' : 'text-tinta-fraca')}
          >
            <Menu className="size-5" />
            Menu
          </button>
        </nav>

      {/* Menu completo no celular: todas as ferramentas, conta e sair */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden print:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Fechar menu" className="absolute inset-0 bg-navy/50" onClick={() => setMenuOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[82%] max-w-xs flex-col bg-navy px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] text-white shadow-2xl">
            <div className="mb-5 flex items-center justify-between px-3">
              <Logo />
              <button type="button" onClick={() => setMenuOpen(false)} aria-label="Fechar" className="rounded-lg p-2 text-white/70 hover:bg-white/10">
                <X className="size-5" />
              </button>
            </div>
            {/* Tocar em qualquer item fecha o menu. */}
            <div className="flex min-h-0 flex-1 flex-col" onClick={(e) => { if ((e.target as HTMLElement).closest('a')) setMenuOpen(false); }}>
              <SectionsNav sections={sections} activeHref={activeHref} />
            </div>
            <UserBox user={user} />
          </aside>
        </div>
      )}
    </div>
  );
}

function SectionsNav({ sections, activeHref }: { sections: NavSection[]; activeHref: string | undefined }) {
  return (
    <nav className="flex-1 space-y-1 overflow-y-auto">
      {sections.map((section, i) => (
        <div key={section.title} className="space-y-1">
          <p className={cn('px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white/40', i > 0 ? 'pt-6' : 'pt-0')}>
            {section.title}
          </p>
          {groupItems(section.items).map((g) =>
            g.group
              ? <NavGroup key={g.group} title={g.group} items={g.items} activeHref={activeHref} />
              : <Fragment key={g.items[0]!.href}>{g.items.map((item) => <SideLink key={item.href} item={item} active={item.href === activeHref} />)}</Fragment>,
          )}
        </div>
      ))}
    </nav>
  );
}

/** Itens seguidos do mesmo subgrupo ficam juntos; itens sem grupo passam direto. */
function groupItems(items: NavItem[]): { group?: string; items: NavItem[] }[] {
  const out: { group?: string; items: NavItem[] }[] = [];
  for (const item of items) {
    const last = out.at(-1);
    if (last && last.group === item.group) last.items.push(item);
    else out.push({ group: item.group, items: [item] });
  }
  return out;
}

/** Subgrupo recolhível (a modalidade em Treinos). Abre sozinho quando a página atual está nele. */
function NavGroup({ title, items, activeHref }: { title: string; items: NavItem[]; activeHref: string | undefined }) {
  const hasActive = items.some((i) => i.href === activeHref);
  const [open, setOpen] = useState(hasActive);
  useEffect(() => { if (hasActive) setOpen(true); }, [hasActive]);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn('flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm font-bold transition-colors hover:bg-white/8', hasActive ? 'text-white' : 'text-white/70')}
      >
        <ChevronRight className={cn('size-4 transition-transform', open && 'rotate-90')} />
        {title}
      </button>
      {open && <div className="space-y-0.5">{items.map((item) => <SideLink key={item.href} item={item} active={item.href === activeHref} nested />)}</div>}
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

