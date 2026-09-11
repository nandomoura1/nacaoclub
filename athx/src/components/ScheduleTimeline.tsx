'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Users } from 'lucide-react';
import type { Battery, Team } from '@/types/domain';
import { SCHEDULE } from '@/lib/wods';
import { Tabs } from '@/components/ui/Tabs';
import { Badge } from '@/components/ui/Badge';
import { categoryShort, teamNumber } from '@/lib/format';

type Filtro = 'TODAS' | '1' | '2';

/**
 * Programação com as duplas de cada bateria.
 *
 * Na manhã do evento a pergunta do atleta não é "qual é o cronograma", é
 * "a que horas EU entro". Por isso o filtro de bateria fica no topo: em dois
 * toques a pessoa vê só os horários dela e quem mais está na bateria.
 */
export function ScheduleTimeline({
  bateria1,
  bateria2,
}: {
  bateria1: Team[];
  bateria2: Team[];
}) {
  const [filtro, setFiltro] = useState<Filtro>('TODAS');
  const [abertas, setAbertas] = useState<Set<string>>(new Set());

  const duplasDa = (b: Battery) => (b === 1 ? bateria1 : bateria2);
  const temDuplas = bateria1.length + bateria2.length > 0;

  const visiveis = SCHEDULE.filter(
    (item) => filtro === 'TODAS' || item.bateria === undefined || item.bateria === Number(filtro),
  );

  const alternar = (chave: string) =>
    setAbertas((prev) => {
      const proximo = new Set(prev);
      if (proximo.has(chave)) proximo.delete(chave);
      else proximo.add(chave);
      return proximo;
    });

  return (
    <div className="space-y-5">
      {temDuplas ? (
        <div>
          <p className="mb-2 font-display text-[10px] font-bold tracking-kicker text-white/45 uppercase">
            Ver os horários de
          </p>
          <Tabs
            options={[
              { value: 'TODAS' as const, label: 'Tudo' },
              { value: '1' as const, label: `Bateria 1 · ${bateria1.length} duplas` },
              { value: '2' as const, label: `Bateria 2 · ${bateria2.length} duplas` },
            ]}
            value={filtro}
            onChange={setFiltro}
            label="Filtrar a programação por bateria"
            size="sm"
          />
        </div>
      ) : null}

      <ol className="relative space-y-0">
        <span
          aria-hidden="true"
          className="absolute top-2 bottom-2 left-[7px] w-px bg-gradient-to-b from-nacao-cyan/60 via-nacao-blue/35 to-transparent"
        />

        {visiveis.map((item) => {
          const chave = `${item.hora}-${item.titulo}`;
          const duplas = item.bateria ? duplasDa(item.bateria) : [];
          const aberta = abertas.has(chave);

          return (
            <li key={chave} className="relative flex gap-4 py-3.5 pl-0">
              <span
                aria-hidden="true"
                className={`relative z-10 mt-1.5 h-[15px] w-[15px] shrink-0 rounded-full border-2 ${
                  item.destaque
                    ? 'border-nacao-cyan bg-nacao-cyan'
                    : 'border-nacao-blue/70 bg-nacao-abyss'
                }`}
              />
              <div className="min-w-0 flex-1 border-b border-white/[0.07] pb-3.5">
                <p className="tnum font-display text-[11px] font-bold tracking-wider text-nacao-cyan uppercase">
                  {item.hora}
                </p>
                <p
                  className={`font-display font-bold ${
                    item.destaque ? 'text-xl text-nacao-cyan uppercase' : 'text-base'
                  }`}
                >
                  {item.titulo}
                </p>
                {item.detalhe ? (
                  <p className="font-display text-[10px] font-bold tracking-wider text-white/40 uppercase">
                    {item.detalhe}
                  </p>
                ) : null}

                {item.itens ? (
                  <ul className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
                    {item.itens.map((sub) => (
                      <li key={sub} className="flex items-start gap-1.5 text-xs text-white/55">
                        <span
                          aria-hidden="true"
                          className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-nacao-sky"
                        />
                        {sub}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {item.nota ? (
                  <p className="mt-1.5 inline-block rounded-md border border-white/12 px-2 py-0.5 text-[10px] text-white/45">
                    {item.nota}
                  </p>
                ) : null}

                {/* Quem disputa neste horário */}
                {duplas.length > 0 ? (
                  <div className="mt-2.5">
                    <button
                      type="button"
                      onClick={() => alternar(chave)}
                      aria-expanded={aberta}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.04] px-2.5 py-1.5 font-display text-[10px] font-bold tracking-wider text-white/60 uppercase transition-colors hover:bg-white/[0.08] hover:text-white"
                    >
                      <Users size={12} aria-hidden="true" />
                      {duplas.length} duplas
                      <ChevronDown
                        size={12}
                        aria-hidden="true"
                        className={`transition-transform ${aberta ? 'rotate-180' : ''}`}
                      />
                    </button>

                    {aberta ? (
                      <ul className="animate-rise mt-2 grid gap-1.5 sm:grid-cols-2">
                        {duplas.map((t) => (
                          <li key={t.id}>
                            <Link
                              href={`/team/${t.id}`}
                              className="surface flex items-center gap-2 px-2.5 py-2 transition-colors hover:bg-white/[0.09]"
                            >
                              <span className="tnum shrink-0 font-display text-[11px] font-bold text-nacao-sky">
                                {teamNumber(t.teamNumber)}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-display text-sm font-bold">
                                  {t.teamName}
                                </span>
                                <span className="block truncate text-[11px] text-white/45">
                                  {t.athlete1 || 'Atleta 1'} · {t.athlete2 || 'Atleta 2'}
                                </span>
                              </span>
                              <Badge tone="neutral" className="shrink-0">
                                {categoryShort(t.category)}
                              </Badge>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      <p className="text-xs text-white/40">
        Horários previstos. A organização pode ajustar a programação durante o evento.
      </p>
    </div>
  );
}
