'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import type { StandingRow } from '@/types/domain';
import { tieBreakerCurto } from '@/types/domain';
import type { Wod } from '@/types/wod';
import { Badge } from '@/components/ui/Badge';
import { RankPosition } from '@/components/RankPosition';
import { categoryShort, points, teamNumber, valorDaProva } from '@/lib/format';

/**
 * RankingTable — a tabela que 200 pessoas vão olhar no celular.
 *
 * AS COLUNAS SAEM DO EVENTO, NÃO DO CÓDIGO.
 *
 * Antes eram oito colunas cravadas (1A…3). Agora a tabela recebe os WODs do
 * evento e desenha uma coluna por prova, agrupadas sob o workout. Cadastrar
 * um quarto WOD com duas provas faz a tabela crescer sozinha.
 *
 * É UMA tabela só, semântica, para as três saídas (§32, §43):
 *   celular   POS · DUPLA · TOTAL          (+ detalhe expansível)
 *   tablet    POS · DUPLA · um total por WOD
 *   desktop   POS · DUPLA · uma coluna por prova · TOTAL
 *
 * As colunas somem no celular via CSS, não via JavaScript: não há re-render
 * ao girar o aparelho e o leitor de tela vê a tabela inteira.
 */
export function RankingTable({
  rows,
  wods,
  categoryScoped = false,
}: {
  rows: readonly StandingRow[];
  /** Os workouts do evento, na ordem. Define as colunas. */
  wods: readonly Wod[];
  /** true quando a lista está filtrada por categoria (§29). */
  categoryScoped?: boolean;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const provas = wods.flatMap((w) => w.provas);

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">
          {categoryScoped
            ? 'Classificação da categoria. Menor pontuação é melhor.'
            : 'Classificação geral. Menor pontuação é melhor.'}
        </caption>

        <thead>
          {/* Faixa de agrupamento — só onde as provas aparecem uma a uma. */}
          <tr className="hidden text-white/30 lg:table-row">
            <th colSpan={3} />
            {wods.map((wod) => (
              <th
                key={wod.id}
                colSpan={wod.provas.length}
                className="px-2 pt-2 text-center font-display text-[9px] font-bold tracking-wider whitespace-nowrap uppercase"
              >
                WOD {wod.numero}
              </th>
            ))}
            <th />
          </tr>

          <tr className="border-b border-white/12">
            <Th className="w-14 sm:w-20">Pos</Th>
            <Th className="w-full max-w-0">Dupla</Th>
            {/* Dentro de um bloco de categoria, repetir a categoria em toda
                linha é ruído: o título da seção já disse. */}
            <Th className="hidden md:table-cell">{categoryScoped ? 'Bat.' : 'Cat. · Bat.'}</Th>

            {/* Tablet: um total por WOD. */}
            {wods.map((wod) => (
              <Th key={wod.id} className="hidden text-right md:table-cell lg:hidden">
                WOD {wod.numero}
              </Th>
            ))}

            {/* Desktop: uma coluna por prova. */}
            {provas.map((prova) => (
              <Th key={prova.id} className="hidden text-center lg:table-cell">
                {prova.codigo}
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
                        {/* Mesma pontuação de outra dupla, posição decidida
                            por um critério. Sem este selo, duas linhas com o
                            mesmo total em posições diferentes parecem erro. */}
                        {row.desempatadoPor ? (
                          <Badge
                            tone="sky"
                            className="shrink-0"
                            title={`Empate de pontos resolvido pela melhor colocação no ${tieBreakerCurto(row.desempatadoPor)}`}
                          >
                            Desempate · {tieBreakerCurto(row.desempatadoPor)}
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
                      {categoryScoped ? null : (
                        <Badge tone="neutral">{categoryShort(row.team.category)}</Badge>
                      )}
                      <Badge tone="sky">B{row.team.battery}</Badge>
                    </span>
                  </Td>

                  {/* Tablet: pontos do WOD com o resultado bruto embaixo. */}
                  {wods.map((wod) => {
                    const score = row.wods[wod.id];
                    const principal = wod.provas.find((p) => p.origem === 'SOMA') ?? wod.provas[0];
                    const bruto = principal ? row.provas[principal.id]?.valor : null;

                    return (
                      <Td key={wod.id} className="hidden text-right md:table-cell lg:hidden">
                        <Prova
                          value={score?.hasResult ? score.points : null}
                          bruto={
                            score?.hasResult && principal
                              ? valorDaProva(principal.unidade, bruto)
                              : null
                          }
                          destaque
                        />
                      </Td>
                    );
                  })}

                  {/* Desktop: uma coluna por prova, com o bruto embaixo. */}
                  {provas.map((prova) => {
                    const score = row.provas[prova.id];
                    return (
                      <Td key={prova.id} className="hidden text-center lg:table-cell">
                        <Prova
                          value={score?.hasResult ? score.points : null}
                          bruto={
                            score?.hasResult ? valorDaProva(prova.unidade, score.valor) : null
                          }
                          destaque={prova.origem === 'SOMA'}
                        />
                      </Td>
                    );
                  })}

                  <Td className="text-right">
                    <span className="tnum font-display text-lg font-black sm:text-xl">
                      {semResultado ? '—' : points(row.totalPoints)}
                    </span>
                    {row.scoredWods > 0 && row.scoredWods < row.totalWods ? (
                      <span className="block text-[10px] text-white/35">
                        {row.scoredWods} de {row.totalWods} WODs
                      </span>
                    ) : null}
                  </Td>

                  <Td className="md:hidden">
                    <button
                      type="button"
                      onClick={() => setExpanded(aberto ? null : row.team.id)}
                      aria-expanded={aberto}
                      aria-label={`${aberto ? 'Esconder' : 'Ver'} as provas da dupla ${row.team.teamName}`}
                      className="rounded-lg p-1.5 text-white/45 hover:bg-white/8 hover:text-white"
                    >
                      <ChevronDown
                        size={16}
                        aria-hidden="true"
                        className={`transition-transform ${aberto ? 'rotate-180' : ''}`}
                      />
                    </button>
                  </Td>
                </tr>

                {/* Celular: o detalhe de todas as provas, sob demanda. */}
                {aberto ? (
                  <tr className="md:hidden">
                    <td colSpan={4} className="border-b border-white/[0.07] px-2 pb-3">
                      <div className="grid grid-cols-2 gap-1.5 xs:grid-cols-3">
                        {wods.map((wod) =>
                          wod.provas.map((prova) => {
                            const score = row.provas[prova.id];
                            return (
                              <GrupoProvas
                                key={prova.id}
                                codigo={prova.codigo}
                                descricao={prova.descricao}
                                pontos={score?.hasResult ? score.points : null}
                                bruto={
                                  score?.hasResult
                                    ? valorDaProva(prova.unidade, score.valor)
                                    : null
                                }
                              />
                            );
                          }),
                        )}
                      </div>
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
  return <td className={`px-2 py-2 align-middle sm:px-3 ${className}`}>{children}</td>;
}

/** Os pontos de uma prova, com o resultado que os gerou logo abaixo. */
function Prova({
  value,
  bruto,
  destaque = false,
}: {
  value: number | null | undefined;
  bruto: string | null;
  destaque?: boolean;
}) {
  return (
    <span className="block leading-tight">
      <span
        className={`tnum block font-display text-sm ${
          destaque ? 'font-bold text-white' : 'font-medium text-white/65'
        }`}
      >
        {points(value)}
      </span>
      {bruto ? (
        <span className="tnum block text-[9px] whitespace-nowrap text-white/35">{bruto}</span>
      ) : null}
    </span>
  );
}

/** Uma prova no detalhe expansível do celular. */
function GrupoProvas({
  codigo,
  descricao,
  pontos,
  bruto,
}: {
  codigo: string;
  descricao: string;
  pontos: number | null;
  bruto: string | null;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5">
      <p
        className="truncate font-display text-[9px] font-bold tracking-wider text-nacao-sky uppercase"
        title={descricao}
      >
        {codigo}
      </p>
      <p className="tnum font-display text-base font-bold">{points(pontos)}</p>
      {bruto ? <p className="tnum text-[10px] text-white/40">{bruto}</p> : null}
    </div>
  );
}
