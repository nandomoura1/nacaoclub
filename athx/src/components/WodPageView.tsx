'use client';

import { useMemo, useState } from 'react';
import type { Category, WodNumber } from '@/types/domain';
import { CATEGORIES, CATEGORY_LABEL, CATEGORY_SHORT } from '@/types/domain';
import type { Snapshot } from '@/services/snapshot';
import { buildLeaderboard } from '@/lib/scoring/build';
import { useLiveSnapshot } from '@/hooks/useLiveSnapshot';
import { WodRanking } from '@/components/WodRanking';
import { LiveIndicator } from '@/components/LiveIndicator';
import { Tabs } from '@/components/ui/Tabs';
import { Card } from '@/components/ui/Card';
import { WODS } from '@/lib/wods';

type CategoryFilter = 'TODAS' | Category;

const CATEGORY_TABS = [
  { value: 'TODAS' as const, label: 'Todas' },
  ...CATEGORIES.map((c) => ({ value: c, label: CATEGORY_SHORT[c] })),
];

/** Página pública de um WOD (§28): descrição, CAP, provas e ranking ao vivo. */
export function WodPageView({ initial, wod }: { initial: Snapshot; wod: WodNumber }) {
  const { snapshot, updatedAt } = useLiveSnapshot(initial);
  const [category, setCategory] = useState<CategoryFilter>('TODAS');
  const spec = WODS[wod];

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

  const rows = useMemo(
    () =>
      category === 'TODAS'
        ? board.standings
        : board.standings.filter((r) => r.team.category === category),
    [board.standings, category],
  );

  return (
    <div className="space-y-7">
      {/* ---- A prova ------------------------------------------------------ */}
      <Card className="p-5 sm:p-6">
        <p className="text-sm text-white/65">{spec.resumo}</p>

        {spec.blocos ? (
          <ul className="mt-4 space-y-1.5">
            {spec.blocos.map((b) => (
              <li
                key={b.janela}
                className="flex flex-wrap items-baseline gap-x-3 border-b border-white/[0.07] pb-1.5 last:border-0"
              >
                <span className="tnum font-display text-xs font-bold tracking-wider text-nacao-cyan uppercase">
                  {b.janela}
                </span>
                <span className="font-display text-sm font-bold">{b.movimento}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {spec.sequencia ? (
          <ol className="mt-4 space-y-1.5">
            {spec.sequencia.map((s) => (
              <li
                key={s.ordem}
                className="flex flex-wrap items-baseline gap-x-3 border-b border-white/[0.07] pb-1.5 last:border-0"
              >
                <span className="tnum font-display text-xs font-bold text-nacao-cyan">
                  {s.ordem}.
                </span>
                <span className="font-display text-sm font-bold">{s.movimento}</span>
                {s.masculino || s.feminino ? (
                  <span className="text-[11px] text-white/45">
                    M {s.masculino} · F {s.feminino}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        ) : null}

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {spec.provas.map((p) => (
            <div key={p.codigo} className="rounded-xl bg-white/[0.045] px-3.5 py-2.5">
              <p className="font-display text-[10px] font-bold tracking-wider text-nacao-sky uppercase">
                Prova {p.codigo}
              </p>
              <p className="font-display text-sm font-bold">{p.descricao}</p>
              <p className="text-[11px] text-white/45">{p.criterio}</p>
            </div>
          ))}
        </div>

        <p className="mt-4 rounded-xl border border-nacao-cyan/20 bg-nacao-cyan/[0.06] px-3.5 py-2.5 text-xs text-white/75">
          {spec.pontuacao}
        </p>

        {/* Pendências declaradas, não escondidas (§48). */}
        {spec.pendencias.length > 0 ? (
          <details className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5">
            <summary className="cursor-pointer font-display text-[10px] font-bold tracking-wider text-white/50 uppercase">
              Regras ainda não definidas ({spec.pendencias.length})
            </summary>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] text-white/50">
              {spec.pendencias.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </details>
        ) : null}
      </Card>

      {/* ---- Ranking ------------------------------------------------------ */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl font-extrabold uppercase">
            Resultados{category !== 'TODAS' ? ` · ${CATEGORY_LABEL[category]}` : ''}
          </h2>
          <LiveIndicator
            live={snapshot.event.liveMode}
            lastUpdate={new Date(updatedAt).toISOString()}
          />
        </div>

        <Tabs
          options={CATEGORY_TABS}
          value={category}
          onChange={setCategory}
          label="Filtrar por categoria"
          size="sm"
        />

        <WodRanking wod={wod} rows={rows} />
      </div>
    </div>
  );
}
