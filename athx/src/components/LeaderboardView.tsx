'use client';

import { useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import type { Battery, Category, StandingRow, WodNumber } from '@/types/domain';
import { CATEGORIES, CATEGORY_LABEL, CATEGORY_SHORT, WOD_META } from '@/types/domain';
import type { Snapshot } from '@/services/snapshot';
import { buildLeaderboard } from '@/lib/scoring/build';
import { standingsByCategory } from '@/lib/scoring/overall';
import { matchesQuery } from '@/lib/search';
import { horariosDaBateria } from '@/lib/wods';
import { useLiveSnapshot } from '@/hooks/useLiveSnapshot';
import { LiveIndicator } from '@/components/LiveIndicator';
import { RankingTable } from '@/components/RankingTable';
import { WodRanking } from '@/components/WodRanking';
import { Podium } from '@/components/Podium';
import { SearchBar } from '@/components/SearchBar';
import { Tabs } from '@/components/ui/Tabs';
import { EmptyState } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

type CategoryFilter = 'TODAS' | Category;
type BatteryFilter = 'TODAS' | '1' | '2';
type ViewFilter = 'GERAL' | '1' | '2' | '3';

// "Todas as baterias" por extenso: com só "Todas", a tela mostraria dois
// chips idênticos — um da categoria e outro da bateria — e ninguém saberia
// qual é qual.
const BATTERY_TABS = [
  { value: 'TODAS' as const, label: 'Todas as baterias' },
  { value: '1' as const, label: 'Bateria 1' },
  { value: '2' as const, label: 'Bateria 2' },
];

const CATEGORY_TABS = [
  { value: 'TODAS' as const, label: 'Todas' },
  ...CATEGORIES.map((c) => ({ value: c, label: CATEGORY_SHORT[c] })),
];

const VIEW_TABS = [
  { value: 'GERAL' as const, label: 'Geral' },
  { value: '1' as const, label: 'WOD 1' },
  { value: '2' as const, label: 'WOD 2' },
  { value: '3' as const, label: 'WOD 3' },
];

/**
 * LeaderboardView — a tela principal do público.
 *
 * Recebe o snapshot renderizado no servidor (a primeira pintura já vem
 * pronta, sem spinner) e a partir daí se mantém viva pelo Realtime. Todo o
 * cálculo é o MESMO motor usado no servidor e no admin (§25).
 */
export function LeaderboardView({ initial }: { initial: Snapshot }) {
  const { snapshot, updatedAt } = useLiveSnapshot(initial);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('TODAS');
  const [battery, setBattery] = useState<BatteryFilter>('TODAS');
  const [view, setView] = useState<ViewFilter>('GERAL');

  const board = useMemo(
    () =>
      buildLeaderboard({
        teams: snapshot.teams,
        wod1: snapshot.wod1,
        wod2: snapshot.wod2,
        wod3: snapshot.wod3,
        settings: snapshot.settings,
      }),
    [snapshot],
  );

  // Filtro por categoria recalcula a posição DENTRO da categoria (§29).
  const scoped: StandingRow[] = useMemo(
    () =>
      category === 'TODAS'
        ? board.standings
        : standingsByCategory(board.standings, category),
    [board.standings, category],
  );

  const visible = useMemo(
    () =>
      scoped
        .filter((row) => battery === 'TODAS' || row.team.battery === (Number(battery) as Battery))
        .filter((row) => matchesQuery(row, query)),
    [scoped, battery, query],
  );

  const pendingDecision = board.standings.some((r) => r.needsDecision);

  return (
    <div className="space-y-6">
      {/* ---- Status ------------------------------------------------------ */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <LiveIndicator
          live={snapshot.event.liveMode}
          lastUpdate={new Date(updatedAt).toISOString()}
        />
        <button
          type="button"
          onClick={() => window.print()}
          className="no-print hidden items-center gap-1.5 sm:inline-flex rounded-lg border border-white/12 px-3 py-1.5 font-display text-[10px] font-bold tracking-wider text-white/55 uppercase hover:bg-white/[0.07] hover:text-white"
        >
          <Printer size={13} aria-hidden="true" />
          Imprimir
        </button>
      </div>

      {/* Cabeçalho que só existe no papel (§43). */}
      <div className="print-only print-header" aria-hidden="true">
        <p className="font-display text-xs font-bold uppercase">
          Nação Celebration — Etapa Setembro Amarelo · 12 de setembro · Nação Club
        </p>
        <p className="font-display text-2xl font-black uppercase">NAÇÃO ATHX — Leaderboard</p>
      </div>

      {/* ---- Título ------------------------------------------------------ */}
      <div>
        {/* §29 — ao filtrar, precisa ficar explícito que a posição exibida é
            a posição DENTRO da categoria, não a da classificação geral. */}
        {category !== 'TODAS' ? (
          <p className="font-display text-[10px] font-bold tracking-kicker text-nacao-cyan uppercase">
            Classificação da categoria
          </p>
        ) : null}
        <h2 className="mt-1 font-display text-2xl font-black tracking-tight uppercase sm:text-3xl">
          {category === 'TODAS' ? 'Classificação geral' : CATEGORY_LABEL[category]}
        </h2>
        <p className="mt-1 text-sm text-white/50">Menor pontuação = melhor classificação</p>

        {battery !== 'TODAS' ? (
          <p className="mt-2 inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-nacao-cyan/25 bg-nacao-cyan/[0.07] px-3 py-1.5 text-xs text-white/70">
            <strong className="font-display font-bold tracking-wider text-nacao-cyan uppercase">
              Bateria {battery}
            </strong>
            {horariosDaBateria(Number(battery) as Battery).map(({ wod, hora }) => (
              <span key={wod} className="tnum">
                WOD {wod} · {hora.split('–')[0]}
              </span>
            ))}
          </p>
        ) : null}
      </div>

      {/* ---- Busca e filtros --------------------------------------------- */}
      <div className="no-print space-y-3">
        <SearchBar value={query} onChange={setQuery} resultCount={visible.length} />

        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <Tabs
            options={CATEGORY_TABS}
            value={category}
            onChange={setCategory}
            label="Filtrar por categoria"
            size="sm"
          />
          <Tabs
            options={VIEW_TABS}
            value={view}
            onChange={setView}
            label="Escolher a visão dos resultados"
            size="sm"
          />
        </div>

        {/* Bateria: é por aqui que o atleta acha a própria no dia do evento. */}
        <Tabs
          options={BATTERY_TABS}
          value={battery}
          onChange={setBattery}
          label="Filtrar por bateria"
          size="sm"
        />
      </div>

      {/* ---- Aviso de empate --------------------------------------------- */}
      {pendingDecision ? (
        <p className="flex items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-400/[0.07] px-3.5 py-2.5 text-xs text-amber-200/90">
          <Badge tone="warn">Empate</Badge>
          <span>
            Há posições empatadas. O critério de desempate ainda será definido pela
            organização — até lá, a decisão é manual.
          </span>
        </p>
      ) : null}

      {/* ---- Pódio (só na visão geral e sem busca ativa) ------------------ */}
      {view === 'GERAL' && !query ? (
        <div className="no-print">
          <Podium rows={scoped} />
        </div>
      ) : null}

      {/* ---- Tabela ------------------------------------------------------ */}
      {visible.length === 0 ? (
        <EmptyState
          title="Nenhuma dupla encontrada"
          description={
            query
              ? `Nada corresponde a "${query}". Tente o nome da dupla, o nome de um atleta ou o número.`
              : 'Nenhuma dupla neste filtro. Experimente voltar para "Todas".'
          }
        />
      ) : view === 'GERAL' ? (
        <RankingTable rows={visible} categoryScoped={category !== 'TODAS'} />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="font-display text-lg font-extrabold uppercase">
              WOD {view} — {WOD_META[Number(view) as WodNumber].name}
            </h3>
            <span className="font-display text-[10px] font-bold tracking-wider text-white/40 uppercase">
              CAP {WOD_META[Number(view) as WodNumber].cap} ·{' '}
              {WOD_META[Number(view) as WodNumber].format}
            </span>
          </div>
          <WodRanking wod={Number(view) as WodNumber} rows={visible} />
        </div>
      )}

      {snapshot.demo ? (
        <p className="no-print rounded-xl border border-amber-400/25 bg-amber-400/[0.07] px-3.5 py-2.5 text-xs text-amber-200/85">
          <strong className="font-display font-bold uppercase">Modo demonstração.</strong>{' '}
          As 20 duplas e todos os resultados são fictícios. Configure o Supabase e
          defina NEXT_PUBLIC_DEMO_MODE=false para usar os dados reais do evento.
        </p>
      ) : null}
    </div>
  );
}
