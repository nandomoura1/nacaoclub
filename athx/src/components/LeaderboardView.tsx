'use client';

import { useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import type { Battery, Category, StandingRow, WodNumber } from '@/types/domain';
import {
  CATEGORIES,
  CATEGORY_LABEL,
  CATEGORY_SHORT,
  TIE_BREAKER_SHORT,
  WOD_META,
  criteriosDeDesempate,
} from '@/types/domain';
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

/** Um bloco de classificação: uma categoria e as duplas dela, já reposicionadas. */
type Section = { category: Category; rows: StandingRow[] };

// "Todas as baterias" por extenso: com só "Todas", a tela mostraria dois
// chips idênticos — um da categoria e outro da bateria — e ninguém saberia
// qual é qual.
const BATTERY_TABS = [
  { value: 'TODAS' as const, label: 'Todas as baterias' },
  { value: '1' as const, label: 'Bateria 1' },
  { value: '2' as const, label: 'Bateria 2' },
];

// O primeiro chip não mostra uma classificação única misturando as três
// categorias: mostra as TRÊS classificações, uma embaixo da outra. Por isso
// o rótulo é "Todas as categorias" e não "Geral" — não existe um ranking
// geral disputado entre uma dupla masculina e uma dupla feminina.
const CATEGORY_TABS = [
  { value: 'TODAS' as const, label: 'Todas as categorias' },
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
 *
 * A classificação é SEMPRE por categoria (§29). A soma de pontos é a mesma
 * para todo mundo — 1A+1B+1C+1D+2A+2B+2C+3 —, mas quem disputa com quem é
 * decidido pela categoria: Dupla Masculina, Dupla Feminina e Dupla Mista
 * têm cada uma o seu pódio e a sua tabela.
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

  // Um bloco por categoria. standingsByCategory recalcula a posição DENTRO
  // da categoria — o 1º lugar da Mista é o 1º da Mista, não o 7º do geral.
  const sections: Section[] = useMemo(() => {
    const aplicarFiltros = (rows: readonly StandingRow[]) =>
      rows
        .filter((row) => battery === 'TODAS' || row.team.battery === (Number(battery) as Battery))
        .filter((row) => matchesQuery(row, query));

    const alvo = category === 'TODAS' ? CATEGORIES : [category];

    return alvo.map((c) => ({
      category: c,
      rows: aplicarFiltros(standingsByCategory(board.standings, c)),
    }));
  }, [board.standings, category, battery, query]);

  const visibleCount = sections.reduce((total, s) => total + s.rows.length, 0);

  // Com busca ou filtro de bateria ligado, categoria vazia é ruído: some.
  // Sem filtro nenhum, ela fica visível com um aviso — a categoria existe
  // no evento mesmo que ainda não tenha resultado.
  const filtrando = query !== '' || battery !== 'TODAS';
  const rendered = filtrando ? sections.filter((s) => s.rows.length > 0) : sections;

  const pendingDecision = board.standings.some((r) => r.needsDecision);
  const criterios = criteriosDeDesempate(snapshot.settings);
  const wodAtual = view === 'GERAL' ? null : (Number(view) as WodNumber);

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
        {/* §29 — a posição exibida é sempre a posição DENTRO da categoria.
            Isso precisa estar escrito na tela, não subentendido. */}
        <p className="font-display text-[10px] font-bold tracking-kicker text-nacao-cyan uppercase">
          {category === 'TODAS' ? 'Três disputas independentes' : 'Classificação da categoria'}
        </p>
        <h2 className="mt-1 font-display text-2xl font-black tracking-tight uppercase sm:text-3xl">
          {category === 'TODAS' ? 'Classificação por categoria' : CATEGORY_LABEL[category]}
        </h2>
        <p className="mt-1 text-sm text-white/50">
          Menor pontuação = melhor classificação · soma de 1A + 1B + 1C + 1D + 2A + 2B + 2C + 3
        </p>

        {/* Duas duplas com o mesmo total vão aparecer em posições diferentes.
            A regra que decidiu isso precisa estar escrita na tela. */}
        {criterios.length > 0 ? (
          <p className="mt-1 text-sm text-white/50">
            Empate de pontos: melhor colocação no{' '}
            {criterios.map((c, i) => (
              <span key={c}>
                {i > 0 ? ', depois no ' : ''}
                <strong className="text-white/70">{TIE_BREAKER_SHORT[c]}</strong>
              </span>
            ))}
          </p>
        ) : null}

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
        <SearchBar value={query} onChange={setQuery} resultCount={visibleCount} />

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
            {criterios.length > 0
              ? 'Há duplas que nem os critérios de desempate escolhidos conseguiram separar. A decisão é da organização.'
              : 'Há posições empatadas. O critério de desempate ainda será definido pela organização — até lá, a decisão é manual.'}
          </span>
        </p>
      ) : null}

      {/* ---- Cabeçalho do WOD (uma vez, acima das três categorias) -------- */}
      {wodAtual ? (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="font-display text-lg font-extrabold uppercase">
            WOD {wodAtual} — {WOD_META[wodAtual].name}
          </h3>
          <span className="font-display text-[10px] font-bold tracking-wider text-white/40 uppercase">
            CAP {WOD_META[wodAtual].cap} · {WOD_META[wodAtual].format}
          </span>
        </div>
      ) : null}

      {/* ---- Um bloco por categoria -------------------------------------- */}
      {visibleCount === 0 ? (
        <EmptyState
          title="Nenhuma dupla encontrada"
          description={
            query
              ? `Nada corresponde a "${query}". Tente o nome da dupla, o nome de um atleta ou o número.`
              : 'Nenhuma dupla neste filtro. Experimente voltar para "Todas as categorias".'
          }
        />
      ) : (
        <div className="space-y-10">
          {rendered.map(({ category: cat, rows }) => (
            <section
              key={cat}
              className="print-categoria space-y-4"
              aria-labelledby={`cat-${cat}`}
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-white/10 pb-2">
                <h3
                  id={`cat-${cat}`}
                  className="font-display text-xl font-black tracking-tight uppercase sm:text-2xl"
                >
                  {CATEGORY_LABEL[cat]}
                </h3>
                <span className="tnum font-display text-[10px] font-bold tracking-wider text-white/40 uppercase">
                  {rows.length} {rows.length === 1 ? 'dupla' : 'duplas'}
                </span>
              </div>

              {rows.length === 0 ? (
                <p className="text-sm text-white/45">
                  Nenhuma dupla inscrita nesta categoria.
                </p>
              ) : wodAtual ? (
                <WodRanking wod={wodAtual} rows={rows} />
              ) : (
                <>
                  {/* Com as três categorias na tela, três pódios empilhados
                      empurrariam a tabela para muito longe no celular — lá o
                      pódio começa a partir do tablet. Com uma categoria só,
                      aparece em qualquer tamanho. */}
                  {!query ? (
                    <div
                      className={`no-print ${
                        category === 'TODAS' ? 'hidden sm:block' : ''
                      }`}
                    >
                      <Podium rows={rows} categoryScoped />
                    </div>
                  ) : null}
                  <RankingTable rows={rows} categoryScoped />
                </>
              )}
            </section>
          ))}
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
