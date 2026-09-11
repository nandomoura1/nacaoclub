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
          <tr className="border-b border-white/12">
            <Th className="w-14 sm:w-20">Pos</Th>
            <Th className="w-full max-w-0">Dupla</Th>
            <Th className="hidden md:table-cell">Cat.</Th>
            <Th className="hidden text-right md:table-cell">WOD 1</Th>
            <Th className="hidden text-right md:table-cell">WOD 2</Th>
            <Th className="hidden text-right md:table-cell">WOD 3</Th>
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
                        {row.team.athlete1 || 'Atleta 1'} · {row.team.athlete2 || 'Atleta 2'}
                      </span>
                    </Link>
                  </Td>

                  <Td className="hidden md:table-cell">
                    <Badge tone="neutral">{categoryShort(row.team.category)}</Badge>
                  </Td>

                  <Td className="hidden text-right md:table-cell">
                    <WodCell value={row.wod1?.hasResult ? row.wod1.points : null} />
                  </Td>
                  <Td className="hidden text-right md:table-cell">
                    <WodCell value={row.wod2?.hasResult ? row.wod2.points : null} />
                  </Td>
                  <Td className="hidden text-right md:table-cell">
                    <WodCell value={row.wod3?.hasResult ? row.wod3.points : null} />
                  </Td>

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
                      <div className="animate-rise grid grid-cols-3 gap-2">
                        <MiniWod
                          label="WOD 1"
                          sub="Strength"
                          pts={row.wod1?.hasResult ? row.wod1.points : null}
                          detail={row.wod1?.hasResult ? kg(row.wod1.totalLoad) : null}
                          rank={row.wod1?.rankTotal ?? null}
                        />
                        <MiniWod
                          label="WOD 2"
                          sub="Endurance"
                          pts={row.wod2?.hasResult ? row.wod2.points : null}
                          detail={row.wod2?.hasResult ? km(row.wod2.totalKm) : null}
                          rank={row.wod2?.rankTotal ?? null}
                        />
                        <MiniWod
                          label="WOD 3"
                          sub="Metcon"
                          pts={row.wod3?.hasResult ? row.wod3.points : null}
                          detail={
                            row.wod3?.hasResult
                              ? row.wod3.completed
                                ? formatSeconds(row.wod3.timeSeconds)
                                : 'CAP'
                              : null
                          }
                          rank={row.wod3?.rank ?? null}
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

function WodCell({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) {
    return <span className="text-white/25">—</span>;
  }
  return <span className="tnum font-display font-bold text-white/80">{points(value)}</span>;
}

function MiniWod({
  label,
  sub,
  pts,
  detail,
  rank,
}: {
  label: string;
  sub: string;
  pts: number | null | undefined;
  detail: string | null;
  rank: number | null;
}) {
  return (
    <div className="surface px-2 py-2.5 text-center">
      <p className="font-display text-[9px] font-bold tracking-wider text-nacao-cyan uppercase">
        {label}
      </p>
      <p className="text-[9px] text-white/35 uppercase">{sub}</p>
      <p className="tnum mt-1.5 font-display text-lg font-extrabold text-white">
        {pts === null || pts === undefined ? '—' : points(pts)}
      </p>
      <p className="text-[10px] text-white/40">
        {pts === null || pts === undefined ? 'aguardando' : `${rank}º · ${detail}`}
      </p>
    </div>
  );
}
