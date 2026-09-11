'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import type { StandingRow } from '@/types/domain';
import { Badge } from '@/components/ui/Badge';
import { RankPosition } from '@/components/RankPosition';
import { categoryShort, kg, km, points, teamNumber } from '@/lib/format';
import { formatSeconds } from '@/lib/time';

/**
 * RankingTable — a tabela que 200 pessoas vão olhar no celular.
 *
 * É UMA tabela só, semântica, para as três saídas (§32, §43):
 *   celular   POS · DUPLA · TOTAL          (+ detalhe expansível)
 *   desktop   POS · DUPLA · CAT · WOD 1 · WOD 2 · WOD 3 · TOTAL
 *   impressão todas as colunas, A4 paisagem
 *
 * As colunas de WOD somem no celular via CSS, não via JavaScript: não há
 * re-render ao girar o aparelho e o leitor de tela vê a tabela inteira.
 */
export function RankingTable({
  rows,
  categoryScoped = false,
}: {
  rows: readonly StandingRow[];
  /** true quando a lista está filtrada por categoria (§29). */
  categoryScoped?: boolean;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">
          {categoryScoped
            ? 'Classificação da categoria. Menor pontuação é melhor.'
            : 'Classificação geral. Menor pontuação é melhor.'}
        </caption>

        <thead>
          {/* Faixa de agrupamento — só onde as oito provas aparecem. */}
          <tr className="hidden text-white/30 lg:table-row">
            <th colSpan={3} />
            {/* Rótulos curtos: as colunas 1A…3 são estreitas e um nome longo
                quebra em duas linhas e desalinha a faixa. */}
            <th
              colSpan={4}
              className="px-2 pt-2 text-center font-display text-[9px] font-bold tracking-wider whitespace-nowrap uppercase"
            >
              WOD 1
            </th>
            <th
              colSpan={3}
              className="px-2 pt-2 text-center font-display text-[9px] font-bold tracking-wider whitespace-nowrap uppercase"
            >
              WOD 2
            </th>
            <th className="px-2 pt-2 text-center font-display text-[9px] font-bold tracking-wider whitespace-nowrap uppercase">
              WOD 3
            </th>
            <th />
          </tr>

          <tr className="border-b border-white/12">
            <Th className="w-14 sm:w-20">Pos</Th>
            <Th className="w-full max-w-0">Dupla</Th>
            <Th className="hidden md:table-cell">Cat. · Bat.</Th>

            {/* Tablet: os três totais por WOD. */}
            <Th className="hidden text-right md:table-cell lg:hidden">WOD 1</Th>
            <Th className="hidden text-right md:table-cell lg:hidden">WOD 2</Th>
            <Th className="hidden text-right md:table-cell lg:hidden">WOD 3</Th>

            {/* Desktop: as OITO pontuações independentes. */}
            {PROVAS.map((prova) => (
              <Th key={prova} className="hidden text-center lg:table-cell">
                {prova}
              </Th>
            ))}

            <Th className="text-right">Total</Th>
            <Th className="w-10 md:hidden">
              <span className="sr-only">Detalhes</span>
            </Th>
          </tr>
        </thead>

        <tbody>
          {rows.map((row) => {
            const aberto = expanded === row.team.id;
            const semResultado = row.scoredWods === 0;

            return (
              <Fragment key={row.team.id}>
                <tr
                  className={`border-b border-white/[0.07] transition-colors hover:bg-white/[0.035] ${
                    row.position <= 3 && !semResultado ? 'bg-nacao-cyan/[0.045]' : ''
                  }`}
                >
                  <Td>
                    {semResultado ? (
                      <span className="text-sm text-white/25">—</span>
                    ) : (
                      <RankPosition position={row.position} />
                    )}
                  </Td>

                  {/* max-w-0 + w-full: é o que faz a célula encolher de verdade
                      e o nome truncar em telas de 360px, em vez de empurrar a
                      tabela para fora e criar scroll horizontal. */}
                  <Td className="w-full max-w-0">
                    <Link
                      href={`/team/${row.team.id}`}
                      className="group block min-w-0 py-0.5"
                      aria-label={`Ver detalhes da dupla ${row.team.teamName}`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="tnum shrink-0 font-display text-[11px] font-bold text-nacao-sky">
                          {teamNumber(row.team.teamNumber)}
                        </span>
                        <span className="truncate font-display text-[15px] font-bold text-white group-hover:text-nacao-cyan sm:text-base">
                          {row.team.teamName}
                        </span>
                        {row.tied ? (
                          <Badge tone="warn" className="shrink-0">
                            Empate
                          </Badge>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-white/45">
                        <span className="font-display font-bold text-nacao-sky">
                          B{row.team.battery}
                        </span>
                        {' · '}
                        {row.team.athlete1 || 'Atleta 1'} · {row.team.athlete2 || 'Atleta 2'}
                      </span>
                    </Link>
                  </Td>

                  <Td className="hidden md:table-cell">
                    <span className="flex flex-wrap items-center gap-1">
                      <Badge tone="neutral">{categoryShort(row.team.category)}</Badge>
                      <Badge tone="sky">B{row.team.battery}</Badge>
                    </span>
                  </Td>

                  {/* Tablet: totais por WOD */}
                  <Td className="hidden text-right md:table-cell lg:hidden">
                    <WodCell value={row.wod1?.hasResult ? row.wod1.points : null} />
                  </Td>
                  <Td className="hidden text-right md:table-cell lg:hidden">
                    <WodCell value={row.wod2?.hasResult ? row.wod2.points : null} />
                  </Td>
                  <Td className="hidden text-right md:table-cell lg:hidden">
                    <WodCell value={row.wod3?.hasResult ? row.wod3.points : null} />
                  </Td>

                  {/* Desktop: cada uma das oito pontuações independentes.
                      As de somatório (1D, 2C) e a do Metcon vêm destacadas. */}
                  <Prova value={row.wod1?.hasResult ? row.wod1.pointsStrictPress : null} />
                  <Prova value={row.wod1?.hasResult ? row.wod1.pointsBackSquat : null} />
                  <Prova value={row.wod1?.hasResult ? row.wod1.pointsDeadlift : null} />
                  <Prova value={row.wod1?.hasResult ? row.wod1.pointsTotal : null} destaque />
                  <Prova value={row.wod2?.hasResult ? row.wod2.pointsRun : null} />
                  <Prova value={row.wod2?.hasResult ? row.wod2.pointsBike : null} />
                  <Prova value={row.wod2?.hasResult ? row.wod2.pointsTotal : null} destaque />
                  <Prova value={row.wod3?.hasResult ? row.wod3.points : null} destaque />

                  <Td className="text-right">
                    {semResultado ? (
                      <span className="text-xs text-white/35">aguardando</span>
                    ) : (
                      <span className="tnum font-display text-xl font-extrabold text-white sm:text-2xl">
                        {points(row.totalPoints)}
                      </span>
                    )}
                    {row.scoredWods > 0 && row.scoredWods < 3 ? (
                      <span className="mt-0.5 block text-[10px] text-white/35">
                        {row.scoredWods} de 3 WODs
                      </span>
                    ) : null}
                  </Td>

                  <Td className="md:hidden">
                    <button
                      type="button"
                      onClick={() => setExpanded(aberto ? null : row.team.id)}
                      aria-expanded={aberto}
                      aria-label={`${aberto ? 'Ocultar' : 'Mostrar'} resultados por WOD da dupla ${row.team.teamName}`}
                      className="rounded-lg p-2 text-white/45 hover:bg-white/10 hover:text-white"
                    >
                      <ChevronDown
                        size={16}
                        aria-hidden="true"
                        className={`transition-transform ${aberto ? 'rotate-180' : ''}`}
                      />
                    </button>
                  </Td>
                </tr>

                {aberto ? (
                  <tr className="md:hidden">
                    <td colSpan={4} className="border-b border-white/[0.07] px-2 pb-4">
                      {/* As OITO pontuações independentes, também no celular. */}
                      <div className="animate-rise space-y-2.5">
                        <GrupoProvas
                          titulo="WOD 1 — Strength"
                          itens={[
                            { prova: '1A', rotulo: 'Press', pts: row.wod1?.pointsStrictPress, valor: kg(row.wod1?.strictPress) },
                            { prova: '1B', rotulo: 'Squat', pts: row.wod1?.pointsBackSquat, valor: kg(row.wod1?.backSquat) },
                            { prova: '1C', rotulo: 'Deadlift', pts: row.wod1?.pointsDeadlift, valor: kg(row.wod1?.deadlift) },
                            { prova: '1D', rotulo: 'Total', pts: row.wod1?.pointsTotal, valor: kg(row.wod1?.totalLoad), destaque: true },
                          ]}
                          disponivel={row.wod1?.hasResult ?? false}
                        />
                        <GrupoProvas
                          titulo="WOD 2 — Endurance"
                          itens={[
                            { prova: '2A', rotulo: 'Corrida', pts: row.wod2?.pointsRun, valor: km(row.wod2?.runKm) },
                            { prova: '2B', rotulo: 'Bike', pts: row.wod2?.pointsBike, valor: km(row.wod2?.bikeKm) },
                            { prova: '2C', rotulo: 'Soma', pts: row.wod2?.pointsTotal, valor: km(row.wod2?.totalKm), destaque: true },
                          ]}
                          disponivel={row.wod2?.hasResult ?? false}
                        />
                        <GrupoProvas
                          titulo="WOD 3 — Metcon"
                          itens={[
                            {
                              prova: '3',
                              rotulo: 'Tempo',
                              pts: row.wod3?.points,
                              valor: row.wod3?.completed
                                ? formatSeconds(row.wod3.timeSeconds)
                                : 'CAP',
                              destaque: true,
                            },
                          ]}
                          disponivel={row.wod3?.hasResult ?? false}
                        />
                      </div>

                      <Link
                        href={`/team/${row.team.id}`}
                        className="mt-3 block text-center font-display text-xs font-bold tracking-wider text-nacao-cyan uppercase"
                      >
                        Ver dupla completa
                      </Link>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={`px-2 py-2.5 font-display text-[10px] font-bold tracking-wider text-white/45 uppercase sm:px-3 ${className}`}
    >
      {children}
    </th>
  );
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-2 py-3 align-middle sm:px-3 ${className}`}>{children}</td>;
}

/** As oito provas que somam o total geral. */
const PROVAS = ['1A', '1B', '1C', '1D', '2A', '2B', '2C', '3'] as const;

/** Uma das oito pontuações independentes, na visão desktop. */
function Prova({
  value,
  destaque = false,
}: {
  value: number | null | undefined;
  destaque?: boolean;
}) {
  return (
    <td className="hidden px-2 py-3 text-center align-middle lg:table-cell">
      {value === null || value === undefined ? (
        <span className="text-white/20">—</span>
      ) : (
        <span
          className={`tnum font-display text-sm ${
            destaque ? 'font-bold text-white' : 'font-semibold text-white/60'
          }`}
        >
          {points(value)}
        </span>
      )}
    </td>
  );
}

function WodCell({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) {
    return <span className="text-white/25">—</span>;
  }
  return <span className="tnum font-display font-bold text-white/80">{points(value)}</span>;
}

interface ItemProva {
  prova: string;
  rotulo: string;
  pts: number | null | undefined;
  valor: string;
  destaque?: boolean;
}

/**
 * Um WOD e suas provas independentes, na visão de celular.
 * Cada prova mostra o resultado bruto e os pontos que ela gerou — porque são
 * pontuações separadas, não partes de uma nota só.
 */
function GrupoProvas({
  titulo,
  itens,
  disponivel,
}: {
  titulo: string;
  itens: ItemProva[];
  disponivel: boolean;
}) {
  return (
    <div className="surface p-2.5">
      <p className="font-display text-[9px] font-bold tracking-kicker text-nacao-cyan uppercase">
        {titulo}
      </p>

      {!disponivel ? (
        <p className="mt-1.5 text-[11px] text-white/35">Aguardando resultado</p>
      ) : (
        <ul className="mt-1.5 grid grid-cols-4 gap-1.5">
          {itens.map((item) => (
            <li
              key={item.prova}
              className={`rounded-lg px-1.5 py-1.5 text-center ${
                item.destaque ? 'bg-nacao-cyan/10' : 'bg-white/[0.04]'
              }`}
            >
              <p className="font-display text-[9px] font-bold text-white/45">{item.prova}</p>
              <p className="tnum font-display text-base font-extrabold text-white">
                {points(item.pts)}
              </p>
              <p className="tnum text-[9px] text-white/40">{item.valor}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
