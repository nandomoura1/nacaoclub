'use client';

import { useMemo, useState } from 'react';
import type { Category } from '@/types/domain';
import { CATEGORIES, CATEGORY_LABEL, CATEGORY_SHORT } from '@/types/domain';
import type { Snapshot } from '@/services/snapshot';
import { leaderboardDoSnapshot } from '@/lib/scoring/build';
import { standingsByCategory } from '@/lib/scoring/overall';
import { useLiveSnapshot } from '@/hooks/useLiveSnapshot';
import { WodRanking } from '@/components/WodRanking';
import { LiveIndicator } from '@/components/LiveIndicator';
import { Tabs } from '@/components/ui/Tabs';
import { Card } from '@/components/ui/Card';


type CategoryFilter = 'TODAS' | Category;

const CATEGORY_TABS = [
  { value: 'TODAS' as const, label: 'Todas as categorias' },
  ...CATEGORIES.map((c) => ({ value: c, label: CATEGORY_SHORT[c] })),
];

/** Página pública de um WOD (§28): descrição, CAP, provas e ranking ao vivo. */
export function WodPageView({ initial, numero }: { initial: Snapshot; numero: number }) {
  const { snapshot, updatedAt } = useLiveSnapshot(initial);
  const [category, setCategory] = useState<CategoryFilter>('TODAS');
  const wod = snapshot.wods.find((w) => w.numero === numero);

  const board = useMemo(
    () =>
      leaderboardDoSnapshot(snapshot),
    [snapshot],
  );

  // Um bloco por categoria. Juntar as três numa lista só não faria sentido:
  // a pontuação de cada prova é disputada DENTRO da categoria, então o 1º da
  // Masculina e o 1º da Feminina teriam ambos 1 ponto e apareceriam
  // empatados numa disputa que não existe.
  const blocos = useMemo(() => {
    const alvo = category === 'TODAS' ? CATEGORIES : [category];
    return alvo.map((c) => ({ category: c, rows: standingsByCategory(board.standings, c) }));
  }, [board.standings, category]);

  if (!wod) {
    return (
      <Card className="p-6 text-center">
        <p className="font-display font-bold uppercase">WOD não encontrado</p>
        <p className="mt-1 text-sm text-white/50">
          Este evento não tem um WOD {numero}. A organização monta os workouts em
          Configurações → WODs.
        </p>
      </Card>
    );
  }



  return (
    <div className="space-y-7">
      {/* ---- A prova ------------------------------------------------------ */}
      <Card className="p-5 sm:p-6">
        {wod.resumo ? <p className="text-sm text-white/65">{wod.resumo}</p> : null}

        {wod.blocos.length > 0 ? (
          <ul className="mt-4 space-y-1.5">
            {wod.blocos.map((b) => (
              <li
                key={`${b.ordem}-${b.movimento}`}
                className="flex flex-wrap items-baseline gap-x-3 border-b border-white/[0.07] pb-1.5 last:border-0"
              >
                {b.janela ? (
                  <span className="tnum font-display text-xs font-bold tracking-wider text-nacao-cyan uppercase">
                    {b.janela}
                  </span>
                ) : null}
                <span className="font-display text-sm font-bold">{b.movimento}</span>
                {b.masculino || b.feminino ? (
                  <span className="text-[11px] text-white/45">
                    {[b.masculino ? `M ${b.masculino}` : null, b.feminino ? `F ${b.feminino}` : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                ) : null}
                {b.detalhe ? (
                  <span className="w-full text-[11px] text-white/45">{b.detalhe}</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {wod.provas.map((p) => (
            <div key={p.id} className="rounded-xl bg-white/[0.045] px-3.5 py-2.5">
              <p className="font-display text-[10px] font-bold tracking-wider text-nacao-sky uppercase">
                Prova {p.codigo}
                {p.origem === 'SOMA' ? ' · calculada' : ''}
                {p.pontua ? '' : ' · não pontua'}
              </p>
              <p className="font-display text-sm font-bold">{p.descricao}</p>
              {p.criterio ? <p className="text-[11px] text-white/45">{p.criterio}</p> : null}
            </div>
          ))}
        </div>

        {wod.regras.length > 0 ? (
          <div className="mt-5">
            <p className="font-display text-[10px] font-bold tracking-kicker text-white/45 uppercase">
              Regras de execução
            </p>
            <ul className="mt-2 space-y-1.5">
              {wod.regras.map((regra) => (
                <li key={regra} className="flex items-start gap-2 text-xs text-white/65">
                  <span aria-hidden="true" className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-nacao-cyan" />
                  {regra}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="mt-4 rounded-xl border border-nacao-cyan/20 bg-nacao-cyan/[0.06] px-3.5 py-2.5 text-xs text-white/75">
          {wod.provas.filter((p) => p.pontua).length > 1 ? (
            <>
              O WOD {wod.numero} gera {wod.provas.filter((p) => p.pontua).length} pontuações.{' '}
              <strong>
                PONTUAÇÃO DO WOD {wod.numero} ={' '}
                {wod.provas.filter((p) => p.pontua).map((p) => `Pts ${p.codigo}`).join(' + ')}
              </strong>
              .{' '}
            </>
          ) : null}
          Em cada prova, 1º lugar = 1 ponto, 2º = 2 pontos, e assim por diante — contando
          apenas as duplas da mesma categoria.
        </p>

        {/* Pendências declaradas, não escondidas (§48). */}
        {wod.pendencias.length > 0 ? (
          <details className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5">
            <summary className="cursor-pointer font-display text-[10px] font-bold tracking-wider text-white/50 uppercase">
              Regras ainda não definidas ({wod.pendencias.length})
            </summary>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] text-white/50">
              {wod.pendencias.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </details>
        ) : null}
      </Card>

      {/* ---- Ranking ------------------------------------------------------ */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl font-extrabold uppercase">Resultados</h2>
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

        <div className="space-y-8">
          {blocos.map(({ category: cat, rows }) => (
            <section key={cat} className="space-y-3" aria-labelledby={`wod-cat-${cat}`}>
              <h3
                id={`wod-cat-${cat}`}
                className="border-b border-white/10 pb-2 font-display text-lg font-black uppercase"
              >
                {CATEGORY_LABEL[cat]}
              </h3>
              <WodRanking wod={wod} rows={rows} />
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
