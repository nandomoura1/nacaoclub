'use client';

import Link from 'next/link';
import { Fragment, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  BarChart3, CalendarDays, ClipboardCheck, History, LayoutGrid,
  LogOut, Settings2, Sun, TriangleAlert, Users, UserRoundCog, Dumbbell, CalendarClock, Sparkles, Menu, X, Trophy, Dna, ChevronRight, Building2, Receipt, Landmark, LineChart, FileUp, FolderOpen, Briefcase,
  Megaphone, Flag, Columns3, PartyPopper, MessagesSquare, Clapperboard, Bell, Link2, Target, Library, MousePointerClick, Gauge, Brain, MessageCircle, Workflow, ListTodo, Network, SquareArrowOutUpRight, Users2 } from 'lucide-react';
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
  mkt: Megaphone,
  'mkt-campanhas': Flag,
  'mkt-kanban': Columns3,
  'mkt-eventos': PartyPopper,
  'mkt-reuniao': MessagesSquare,
  'mkt-conteudo': Clapperboard,
  'mkt-interna': Bell,
  'mkt-canais': Link2,
  'mkt-leads': Target,
  'mkt-biblioteca': Library,
  'mkt-trafego': MousePointerClick,
  'mkt-performance': Gauge,
  'mkt-memoria': Brain,
  whatsapp: MessageCircle,
  processos: Workflow,
  'proc-demandas': ListTodo,
  'proc-setores': Network,
  'proc-task': SquareArrowOutUpRight,
  'proc-reuniao': Users2,
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
  if (item.external) {
    return (
      <a href={item.href} target="_blank" rel="noreferrer" className={cn('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold text-white/75 transition-colors hover:bg-white/8 hover:text-white', nested && 'py-1.5 pl-9')}>
        <Icon className="size-4" />
        <span className="flex-1">{item.label}</span>
        <span className="text-[10px] text-white/45">↗</span>
      </a>
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
  // Barra inferior: um botão por área (Horas, Treinos, Financeiro…). Com uma área só, os atalhos dela.
  const barSections = sections.filter((s) => s.bar && s.items.some((i) => !i.soon)).sort((a, b) => a.bar!.order - b.bar!.order).slice(0, 4);
  const bySection = barSections.length >= 2;
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheet, setSheet] = useState<string | null>(null);
  useEffect(() => { setMenuOpen(false); setSheet(null); }, [pathname]);
  const sheetSection = sections.find((s) => s.title === sheet);
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
          {bySection && barSections.map((s) => {
            const Icon = ICONS[s.bar!.icon];
            const items = s.items.filter((i) => !i.soon);
            const active = sheet ? sheet === s.title : s.items.some((i) => i.href === activeHref);
            const cls = cn('flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-0.5 text-[11px] font-semibold', active ? 'text-nacao' : 'text-tinta-fraca');
            const label = <><Icon className="size-5" /><span className="max-w-full truncate">{s.bar!.label}</span></>;
            return items.length === 1
              ? <Link key={s.title} href={items[0]!.href} className={cls}>{label}</Link>
              : <button key={s.title} type="button" aria-expanded={sheet === s.title} onClick={() => { setMenuOpen(false); setSheet(sheet === s.title ? null : s.title); }} className={cls}>{label}</button>;
          })}
          {!bySection && mobileItems.map((item) => {
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
            onClick={() => { setSheet(null); setMenuOpen(true); }}
            aria-expanded={menuOpen}
            className={cn('flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold', menuOpen ? 'text-nacao' : 'text-tinta-fraca')}
          >
            <Menu className="size-5" />
            Menu
          </button>
        </nav>

      {/* Área tocada na barra: as telas dela, de baixo para cima */}
      {sheetSection && (
        <div className="fixed inset-0 z-20 lg:hidden print:hidden" role="dialog" aria-modal="true" aria-label={sheetSection.title}>
          <button type="button" aria-label="Fechar" className="absolute inset-0 bg-navy/40" onClick={() => setSheet(null)} />
          <div className="absolute inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] max-h-[70dvh] overflow-y-auto rounded-t-2xl bg-white p-3 shadow-2xl">
            <p className="px-2 pb-2 font-titulo text-xs font-bold uppercase tracking-[0.18em] text-nacao">{sheetSection.title}</p>
            <div className="grid grid-cols-2 gap-1.5">
              {sheetSection.items.filter((i) => !i.soon).map((item, idx, arr) => {
                const Icon = ICONS[item.icon];
                const showGroup = item.group && item.group !== arr[idx - 1]?.group;
                return (
                  <Fragment key={item.href}>
                    {showGroup && <p className="col-span-2 px-2 pt-2 text-[11px] font-semibold uppercase tracking-wide text-tinta-fraca">{item.group}</p>}
                    {item.external
                      ? <a href={item.href} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl border border-borda px-3 py-2.5 text-[13px] font-semibold leading-tight text-navy"><Icon className="size-4 shrink-0" /><span className="min-w-0">{item.label} ↗</span></a>
                      : <Link href={item.href} className={cn('flex items-center gap-2 rounded-xl border px-3 py-2.5 text-[13px] font-semibold leading-tight', item.href === activeHref ? 'border-nacao bg-nacao/5 text-nacao' : 'border-borda text-navy')}>
                          <Icon className="size-4 shrink-0" /><span className="min-w-0">{item.label}</span>
                        </Link>}
                  </Fragment>
                );
              })}
            </div>
          </div>
        </div>
      )}

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

const NAV_KEY = 'nacao.nav.abertas';

/**
 * Menu com as seções sempre visíveis e os itens recolhíveis: abre a seção da
 * página atual e lembra (neste navegador) quais o usuário deixou abertas.
 */
function SectionsNav({ sections, activeHref }: { sections: NavSection[]; activeHref: string | undefined }) {
  const activeSection = sections.find((s) => s.items.some((i) => i.href === activeHref))?.title;
  const single = sections.length === 1;
  const [open, setOpen] = useState<Set<string>>(() => new Set(activeSection ? [activeSection] : []));
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(NAV_KEY) ?? '[]') as unknown;
      if (Array.isArray(saved)) setOpen((cur) => new Set([...cur, ...saved.filter((x): x is string => typeof x === 'string')]));
    } catch { /* sem armazenamento: só a seção atual */ }
  }, []);
  useEffect(() => { if (activeSection) setOpen((cur) => (cur.has(activeSection) ? cur : new Set([...cur, activeSection]))); }, [activeSection]);
  const toggle = (title: string) => setOpen((cur) => {
    const next = new Set(cur);
    if (next.has(title)) next.delete(title); else next.add(title);
    try { localStorage.setItem(NAV_KEY, JSON.stringify([...next])); } catch { /* ignora */ }
    return next;
  });
  return (
    <nav className="flex-1 space-y-1 overflow-y-auto">
      {sections.map((section) => {
        const isOpen = single || open.has(section.title);
        const here = section.title === activeSection;
        return (
          <div key={section.title} className="space-y-0.5">
            {single ? (
              <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">{section.title}</p>
            ) : (
              <button type="button" onClick={() => toggle(section.title)} aria-expanded={isOpen}
                className={cn('flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[11px] font-bold uppercase tracking-[0.16em] transition-colors hover:bg-white/8', here ? 'text-white' : 'text-white/55')}>
                <span className={cn('size-1.5 shrink-0 rounded-full', here ? 'bg-ciano' : 'bg-white/20')} />
                <span className="flex-1">{section.title}</span>
                <ChevronRight className={cn('size-3.5 transition-transform', isOpen && 'rotate-90')} />
              </button>
            )}
            {isOpen && (
              <div className={cn('space-y-0.5', !single && 'pb-2')}>
                {groupItems(section.items).map((g) =>
                  g.group
                    ? <NavGroup key={g.group} title={g.group} items={g.items} activeHref={activeHref} />
                    : <Fragment key={g.items[0]!.href}>{g.items.map((item) => <SideLink key={item.href} item={item} active={item.href === activeHref} />)}</Fragment>,
                )}
              </div>
            )}
          </div>
        );
      })}
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

