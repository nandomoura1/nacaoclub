'use client';

import Link from 'next/link';
import type { StandingRow, WodNumber } from '@/types/domain';
import { Badge } from '@/components/ui/Badge';
import { RankPosition } from '@/components/RankPosition';
import { EmptyState } from '@/components/ui/Card';
import { kg, km, points, teamNumber } from '@/lib/format';
import { formatSeconds } from '@/lib/time';

/**
 * WodRanking — classificação de UM WOD.
 *
 * Serve tanto a aba "WOD 1/2/3" do leaderboard quanto as páginas públicas
 * /wod/1, /wod/2 e /wod/3 (§28). O WOD 2 mostra corrida, bike e soma
 * SEPARADAMENTE, porque cada um tem ranking próprio.
 */
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
      const ra = wod === 1 ? a.wod1?.rank : wod === 2 ? a.wod2?.rankTotal : a.wod3?.rank;
      const rb = wod === 1 ? b.wod1?.rank : wod === 2 ? b.wod2?.rankTotal : b.wod3?.rank;
      return (ra ?? 999) - (rb ?? 999);
    });

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
              {wod === 1 ? <Th className="text-right">Carga total</Th> : null}
              {wod === 2 ? (
                <>
                  <Th className="text-right">2A Corrida</Th>
                  <Th className="hidden text-right sm:table-cell">2B Bike</Th>
                  <Th className="hidden text-right sm:table-cell">2C Soma</Th>
                </>
              ) : null}
              {wod === 3 ? <Th className="text-right">Tempo</Th> : null}
              <Th className="text-right">Pts</Th>
            </tr>
          </thead>

          <tbody>
            {scored.map((row) => {
              const rank =
                wod === 1 ? row.wod1?.rank : wod === 2 ? row.wod2?.rankTotal : row.wod3?.rank;
              const pts =
                wod === 1 ? row.wod1?.points : wod === 2 ? row.wod2?.points : row.wod3?.points;

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
                    <Td className="text-right">
                      <span className="tnum font-display font-bold">
                        {kg(row.wod1?.totalLoad)}
                      </span>
                    </Td>
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
                      <span className="tnum font-display font-bold">
                        {row.wod3?.completed ? formatSeconds(row.wod3.timeSeconds) : 'CAP'}
                      </span>
                      {row.wod3 && !row.wod3.completed ? (
                        <span className="block text-[10px] text-white/40">
                          {row.wod3.volumeCompleted !== null
                            ? `volume ${row.wod3.volumeCompleted}`
                            : 'não concluiu'}
                        </span>
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
