'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import type { StandingRow, WodNumber } from '@/types/domain';
import { rankValues } from '@/lib/scoring/rank';
import { Badge } from '@/components/ui/Badge';
import { RankPosition } from '@/components/RankPosition';
import { EmptyState } from '@/components/ui/Card';
import { kg, km, points, teamNumber } from '@/lib/format';
import { formatWod3Bruto } from '@/lib/time';

/**
 * WodRanking — classificação de UM WOD.
 *
 * Serve tanto a aba "WOD 1/2/3" do leaderboard quanto as páginas públicas
 * /wod/1, /wod/2 e /wod/3 (§28). O WOD 2 mostra corrida, bike e soma
 * SEPARADAMENTE, porque cada um tem ranking próprio.
 */
/** Pontuação da dupla neste WOD (soma das provas, quando há mais de uma). */
function wodPoints(row: StandingRow, wod: WodNumber): number | null | undefined {
  return wod === 1 ? row.wod1?.points : wod === 2 ? row.wod2?.points : row.wod3?.points;
}

export function WodRanking({
  wod,
  rows,
}: {
  wod: WodNumber;
  rows: readonly StandingRow[];
}) {
  const scored = rows
    .filter((r) => {
      if (wod === 1) return r.wod1?.hasResult;
      if (wod === 2) return r.wod2?.hasResult;
      return r.wod3?.hasResult;
    })
    .sort((a, b) => {
      // Ordena pela PONTUAÇÃO do WOD — é ela que define a colocação no
      // workout quando há mais de uma prova (1A+1B+1C+1D, 2A+2B+2C).
      const pa = wodPoints(a, wod) ?? 9999;
      const pb = wodPoints(b, wod) ?? 9999;
      if (pa !== pb) return pa - pb;

      const ra = wod === 1 ? a.wod1?.rankTotal : wod === 2 ? a.wod2?.rankTotal : a.wod3?.rank;
      const rb = wod === 1 ? b.wod1?.rankTotal : wod === 2 ? b.wod2?.rankTotal : b.wod3?.rank;
      return (ra ?? 999) - (rb ?? 999);
    });

  /**
   * Colocação NO WOD, derivada da pontuação somada.
   *
   * Sem isto a coluna "Pos" mostraria a posição de uma prova só (a 1D no WOD
   * 1, a 2C no WOD 2) — e a tabela apareceria ordenada por pontos exibindo
   * outra numeração. Menor pontuação = melhor colocação, com o mesmo
   * tratamento de empate do resto do sistema.
   */
  const placement = useMemo(() => {
    const entradas = scored
      .map((r) => ({ teamId: r.team.id, value: wodPoints(r, wod) }))
      .filter((e): e is { teamId: string; value: number } => typeof e.value === 'number');
    return new Map(rankValues(entradas, 'LOWER_IS_BETTER').map((e) => [e.teamId, e.rank]));
  }, [scored, wod]);

  const pending = rows.filter((r) => !scored.includes(r));

  if (scored.length === 0) {
    return (
      <EmptyState
        title="Sem resultados homologados"
        description="Assim que a organização publicar os resultados deste WOD, eles aparecem aqui automaticamente."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">
            Classificação do WOD {wod}. {wod === 3 ? 'Menor tempo é melhor.' : 'Maior resultado é melhor.'}
          </caption>
          <thead>
            <tr className="border-b border-white/12">
              <Th className="w-14">Pos</Th>
              <Th className="w-full max-w-0">Dupla</Th>
              {wod === 1 ? (
                <>
                  <Th className="hidden text-right sm:table-cell">1A Press</Th>
                  <Th className="hidden text-right sm:table-cell">1B Squat</Th>
                  <Th className="hidden text-right sm:table-cell">1C Deadlift</Th>
                  <Th className="text-right">1D Total</Th>
                </>
              ) : null}
              {wod === 2 ? (
                <>
                  <Th className="text-right">2A Corrida</Th>
                  <Th className="hidden text-right sm:table-cell">2B Bike</Th>
                  <Th className="hidden text-right sm:table-cell">2C Soma</Th>
                </>
              ) : null}
              {wod === 3 ? <Th className="text-right">Tempo</Th> : null}
              <Th className="text-right">
                {wod === 3 ? 'Pts' : 'Pts WOD'}
              </Th>
            </tr>
          </thead>

          <tbody>
            {scored.map((row) => {
              const rank = placement.get(row.team.id) ?? null;
              const pts = wodPoints(row, wod);

              return (
                <tr
                  key={row.team.id}
                  className="border-b border-white/[0.07] hover:bg-white/[0.035]"
                >
                  <Td>{rank ? <RankPosition position={rank} size="sm" /> : '—'}</Td>

                  <Td className="w-full max-w-0">
                    <Link href={`/team/${row.team.id}`} className="group block min-w-0">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="tnum shrink-0 font-display text-[11px] font-bold text-nacao-sky">
                          {teamNumber(row.team.teamNumber)}
                        </span>
                        <span className="truncate font-display text-sm font-bold group-hover:text-nacao-cyan">
                          {row.team.teamName}
                        </span>
                      </span>
                      <span className="block truncate text-[11px] text-white/40">
                        {row.team.athlete1 || 'Atleta 1'} · {row.team.athlete2 || 'Atleta 2'}
                      </span>
                    </Link>
                  </Td>

                  {wod === 1 ? (
                    <>
                      <Td className="hidden text-right sm:table-cell">
                        <span className="tnum font-display text-sm font-bold">
                          {kg(row.wod1?.strictPress)}
                        </span>
                        <span className="block text-[10px] text-white/35">
                          {row.wod1?.rankStrictPress}º · {points(row.wod1?.pointsStrictPress)} pt
                        </span>
                      </Td>
                      <Td className="hidden text-right sm:table-cell">
                        <span className="tnum font-display text-sm font-bold">
                          {kg(row.wod1?.backSquat)}
                        </span>
                        <span className="block text-[10px] text-white/35">
                          {row.wod1?.rankBackSquat}º · {points(row.wod1?.pointsBackSquat)} pt
                        </span>
                      </Td>
                      <Td className="hidden text-right sm:table-cell">
                        <span className="tnum font-display text-sm font-bold">
                          {kg(row.wod1?.deadlift)}
                        </span>
                        <span className="block text-[10px] text-white/35">
                          {row.wod1?.rankDeadlift}º · {points(row.wod1?.pointsDeadlift)} pt
                        </span>
                      </Td>
                      <Td className="text-right">
                        <span className="tnum font-display text-sm font-bold text-nacao-cyan">
                          {kg(row.wod1?.totalLoad)}
                        </span>
                        <span className="block text-[10px] text-white/35">
                          {row.wod1?.rankTotal}º · {points(row.wod1?.pointsTotal)} pt
                        </span>
                      </Td>
                    </>
                  ) : null}

                  {wod === 2 ? (
                    <>
                      <Td className="text-right">
                        <span className="tnum font-display text-sm font-bold">
                          {km(row.wod2?.runKm)}
                        </span>
                        <span className="block text-[10px] text-white/35">
                          {row.wod2?.rankRun}º · {points(row.wod2?.pointsRun)} pt
                        </span>
                      </Td>
                      <Td className="hidden text-right sm:table-cell">
                        <span className="tnum font-display text-sm font-bold">
                          {km(row.wod2?.bikeKm)}
                        </span>
                        <span className="block text-[10px] text-white/35">
                          {row.wod2?.rankBike}º · {points(row.wod2?.pointsBike)} pt
                        </span>
                      </Td>
                      <Td className="hidden text-right sm:table-cell">
                        <span className="tnum font-display text-sm font-bold text-nacao-cyan">
                          {km(row.wod2?.totalKm)}
                        </span>
                        <span className="block text-[10px] text-white/35">
                          {row.wod2?.rankTotal}º · {points(row.wod2?.pointsTotal)} pt
                        </span>
                      </Td>
                    </>
                  ) : null}

                  {wod === 3 ? (
                    <Td className="text-right">
                      <span className="tnum font-display font-bold whitespace-nowrap">
                        {row.wod3
                          ? formatWod3Bruto(
                              row.wod3.completed,
                              row.wod3.timeSeconds,
                              row.wod3.volumeCompleted,
                            )
                          : '—'}
                      </span>
                      {row.wod3 && !row.wod3.completed ? (
                        <span className="block text-[10px] text-white/40">não concluiu</span>
                      ) : null}
                    </Td>
                  ) : null}

                  <Td className="text-right">
                    <span className="tnum font-display text-lg font-extrabold">
                      {points(pts)}
                    </span>
                    {wod === 3 && row.wod3?.needsDecision ? (
                      <span className="mt-0.5 block">
                        <Badge tone="warn">Decisão</Badge>
                      </span>
                    ) : null}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pending.length > 0 ? (
        <p className="text-xs text-white/40">
          {pending.length} {pending.length === 1 ? 'dupla ainda sem' : 'duplas ainda sem'}{' '}
          resultado homologado neste WOD.
        </p>
      ) : null}
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
  return <td className={`px-2 py-2.5 align-middle sm:px-3 ${className}`}>{children}</td>;
}
