'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import type { StandingRow } from '@/types/domain';
import type { Wod } from '@/types/wod';
import { rankValues } from '@/lib/scoring/rank';
import { RankPosition } from '@/components/RankPosition';
import { EmptyState } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { points, teamNumber, valorDaProva } from '@/lib/format';

/**
 * A classificação de UM workout.
 *
 * As colunas são as provas daquele WOD, lidas do cadastro. Um WOD com cinco
 * provas ganha cinco colunas; um com uma só, uma. A coluna da prova
 * calculada (a soma) vem destacada, porque é a que resume o workout.
 */
export function WodRanking({ wod, rows }: { wod: Wod; rows: readonly StandingRow[] }) {
  const comResultado = rows.filter((r) => r.wods[wod.id]?.hasResult);

  /**
   * Colocação NO WOD, derivada da pontuação somada do workout.
   *
   * Sem isto a coluna "Pos" mostraria a posição de uma prova só — e a tabela
   * apareceria ordenada por pontos exibindo outra numeração.
   */
  const colocacao = useMemo(() => {
    const entradas = comResultado
      .map((r) => ({ teamId: r.team.id, value: r.wods[wod.id]?.points ?? null }))
      .filter((e): e is { teamId: string; value: number } => typeof e.value === 'number');
    return new Map(rankValues(entradas, 'LOWER_IS_BETTER').map((e) => [e.teamId, e.rank]));
  }, [comResultado, wod.id]);

  const ordenadas = [...comResultado].sort(
    (a, b) =>
      (a.wods[wod.id]?.points ?? 9999) - (b.wods[wod.id]?.points ?? 9999) ||
      a.team.teamNumber - b.team.teamNumber,
  );

  const aguardando = rows.filter((r) => !r.wods[wod.id]?.hasResult);

  if (ordenadas.length === 0) {
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
            Classificação do WOD {wod.numero} — {wod.nome}. Menor pontuação é melhor.
          </caption>
          <thead>
            <tr className="border-b border-white/12">
              <Th className="w-14">Pos</Th>
              <Th className="w-full max-w-0">Dupla</Th>
              {wod.provas.map((prova, i) => (
                <Th
                  key={prova.id}
                  // A primeira prova e a calculada aparecem sempre; as do
                  // meio só a partir do tablet, senão o celular estoura.
                  className={`text-right ${
                    i === 0 || prova.origem === 'SOMA' ? '' : 'hidden sm:table-cell'
                  }`}
                >
                  {prova.codigo}
                </Th>
              ))}
              <Th className="text-right">Pts WOD</Th>
            </tr>
          </thead>

          <tbody>
            {ordenadas.map((row) => {
              const rank = colocacao.get(row.team.id) ?? null;
              const total = row.wods[wod.id];

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
                        {wod.permiteCap && total && !total.concluiu ? (
                          <Badge tone="warn" className="shrink-0">
                            CAP
                          </Badge>
                        ) : null}
                      </span>
                      <span className="block truncate text-[11px] text-white/40">
                        {row.team.athlete1 || 'Atleta 1'} · {row.team.athlete2 || 'Atleta 2'}
                      </span>
                    </Link>
                  </Td>

                  {wod.provas.map((prova, i) => {
                    const score = row.provas[prova.id];
                    return (
                      <Td
                        key={prova.id}
                        className={`text-right ${
                          i === 0 || prova.origem === 'SOMA' ? '' : 'hidden sm:table-cell'
                        }`}
                      >
                        <span
                          className={`tnum block font-display text-sm ${
                            prova.origem === 'SOMA' ? 'font-bold text-nacao-cyan' : 'font-bold'
                          }`}
                        >
                          {valorDaProva(prova.unidade, score?.valor)}
                        </span>
                        <span className="tnum block text-[10px] text-white/35">
                          {score?.rank ? `${score.rank}º · ${points(score.points)} pt` : '—'}
                        </span>
                      </Td>
                    );
                  })}

                  <Td className="text-right">
                    <span className="tnum font-display text-base font-black">
                      {points(total?.points)}
                    </span>
                    {wod.permiteCap && total && !total.concluiu && total.volume !== null ? (
                      <span className="block text-[10px] text-white/35">
                        {points(total.volume)} de volume
                      </span>
                    ) : null}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {aguardando.length > 0 ? (
        <p className="text-xs text-white/40">
          {aguardando.length} dupla{aguardando.length === 1 ? '' : 's'} ainda sem resultado
          homologado neste WOD.
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
  return <td className={`px-2 py-2 align-middle sm:px-3 ${className}`}>{children}</td>;
}
