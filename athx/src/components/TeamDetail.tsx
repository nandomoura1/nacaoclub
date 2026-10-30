'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { ArrowLeft, Clock, Dumbbell, Timer } from 'lucide-react';
import type { Snapshot } from '@/services/snapshot';
import { tieBreakerCurto } from '@/types/domain';
import { capEmTexto, horariosDaBateria } from '@/types/wod';
import { leaderboardDoSnapshot } from '@/lib/scoring/build';
import { standingsByCategory } from '@/lib/scoring/overall';
import { useLiveSnapshot } from '@/hooks/useLiveSnapshot';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { LiveIndicator } from '@/components/LiveIndicator';
import { categoryLabel, points, teamNumber, valorDaProva } from '@/lib/format';

/**
 * Detalhe da dupla (§10) — a tela que o aluno abre para se ver.
 * Continua ao vivo: se a organização publicar um resultado enquanto ele
 * estiver olhando, a página muda sozinha.
 */
export function TeamDetail({ initial, teamId }: { initial: Snapshot; teamId: string }) {
  const { snapshot, updatedAt } = useLiveSnapshot(initial);

  const board = useMemo(
    () =>
      leaderboardDoSnapshot(snapshot),
    [snapshot],
  );

  const geral = board.standings.find((r) => r.team.id === teamId);
  const team = geral?.team ?? snapshot.teams.find((t) => t.id === teamId);

  // A posição que interessa ao atleta é a da CATEGORIA dele — é lá que a
  // disputa acontece. A posição no geral misturaria as três categorias e
  // diria "7º lugar" para quem é o 1º entre as duplas mistas.
  const horarios = useMemo(
    () => (team ? horariosDaBateria(snapshot.agenda, snapshot.wods, team.battery) : []),
    [snapshot.agenda, snapshot.wods, team],
  );

  const row = useMemo(() => {
    if (!geral || !team) return geral;
    return standingsByCategory(board.standings, team.category).find(
      (r) => r.team.id === teamId,
    );
  }, [board.standings, geral, team, teamId]);

  if (!team) {
    return (
      <Card className="p-8 text-center">
        <p className="font-display text-lg font-bold uppercase">Dupla não encontrada</p>
        <Link href="/leaderboard" className="mt-3 inline-block text-sm text-nacao-cyan">
          Voltar ao leaderboard
        </Link>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href="/leaderboard"
        className="no-print inline-flex items-center gap-1.5 font-display text-[11px] font-bold tracking-wider text-white/50 uppercase hover:text-nacao-cyan"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Leaderboard
      </Link>

      {/* ---- Identidade da dupla ----------------------------------------- */}
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <span className="tnum font-display text-sm font-bold text-nacao-sky">
            Dupla {teamNumber(team.teamNumber)}
          </span>
          <Badge tone="neutral">{categoryLabel(team.category)}</Badge>
          <Badge tone="sky">Bateria {team.battery}</Badge>
          {team.status === 'DESCLASSIFICADA' ? (
            <Badge tone="danger">Desclassificada</Badge>
          ) : null}
          {row?.tied ? <Badge tone="warn">Empate</Badge> : null}
        </div>

        <h1 className="mt-2 font-display text-3xl font-black tracking-[-0.035em] uppercase sm:text-5xl">
          {team.teamName}
        </h1>

        <p className="mt-2 text-white/60">
          {team.athlete1 || 'Atleta 1'} <span className="text-white/25">·</span>{' '}
          {team.athlete2 || 'Atleta 2'}
        </p>
      </header>

      {/* ---- Horários da bateria -----------------------------------------
          A pergunta que o atleta abre o celular para responder na manhã do
          evento: "a que horas eu entro?". Vem antes da classificação de
          propósito — enquanto o evento não começou, é a informação que
          importa. */}
      <Card className="border-nacao-cyan/25 bg-nacao-cyan/[0.05] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 font-display text-[10px] font-bold tracking-kicker text-nacao-cyan uppercase">
              <Clock size={12} aria-hidden="true" />
              Seus horários
            </p>
            <p className="mt-1 font-display text-2xl font-black uppercase">
              Bateria {team.battery}
            </p>
          </div>
          <p className="font-display text-[10px] font-bold tracking-wider text-white/45 uppercase">
            Sábado · 12 de setembro
          </p>
        </div>

        <ul
          className="mt-4 grid gap-2"
          style={{
            gridTemplateColumns: `repeat(${Math.min(
              Math.max(horarios.length, 1),
              3,
            )}, minmax(0, 1fr))`,
          }}
        >
          {horarios.map(({ wod, hora }) => (
            <li key={wod.id} className="rounded-xl bg-nacao-abyss/40 px-2.5 py-2.5 text-center">
              <p className="font-display text-[9px] font-bold tracking-wider text-white/45 uppercase">
                WOD {wod.numero}
              </p>
              <p className="font-display text-[10px] font-bold text-nacao-sky uppercase">
                {wod.nome}
              </p>
              <p className="tnum mt-1 font-display text-base font-extrabold text-white sm:text-lg">
                {hora.split('–')[0]}
              </p>
            </li>
          ))}
        </ul>

        <p className="mt-3 text-[11px] text-white/45">
          Briefing às 08h00, com presença obrigatória. Pódio às 11h30.
        </p>
      </Card>

      {/* ---- Posição e total --------------------------------------------- */}
      {row && row.scoredWods > 0 ? (
        <Card className="flex flex-wrap items-center justify-between gap-5 p-5 sm:p-6">
          <div>
            <p className="font-display text-[10px] font-bold tracking-kicker text-nacao-cyan uppercase">
              {team ? categoryLabel(team.category) : 'Classificação'}
            </p>
            <p className="mt-1 flex items-baseline gap-2">
              <span className="tnum font-display text-4xl font-black text-nacao-cyan sm:text-5xl">
                {row.position}º
              </span>
              <span className="font-display text-sm font-bold text-white/55 uppercase">
                lugar
              </span>
            </p>
            {row.scoredWods < 3 ? (
              <p className="mt-1 text-xs text-white/40">
                Parcial — {row.scoredWods} de 3 WODs pontuados
              </p>
            ) : null}
            {/* "Por que estamos em 2º se temos os mesmos pontos?" — a resposta
                tem que estar aqui, não na cabeça de quem organiza. */}
            {row.desempatadoPor ? (
              <p className="mt-1 text-xs text-nacao-sky">
                Empate de pontos resolvido pela melhor colocação no{' '}
                {tieBreakerCurto(row.desempatadoPor)}
              </p>
            ) : null}
          </div>

          <div className="text-right">
            <p className="font-display text-[10px] font-bold tracking-kicker text-white/45 uppercase">
              Total
            </p>
            <p className="tnum font-display text-4xl font-black sm:text-5xl">
              {points(row.totalPoints)}
            </p>
            <p className="font-display text-[10px] font-bold tracking-kicker text-white/45 uppercase">
              Pontos
            </p>
          </div>
        </Card>
      ) : (
        <Card className="p-6 text-center">
          <p className="font-display font-bold text-white/70 uppercase">
            Aguardando resultados
          </p>
          <p className="mt-1 text-sm text-white/45">
            Assim que a organização publicar, aparece aqui sozinho.
          </p>
        </Card>
      )}

      {/* ---- Um cartão por WOD do evento ---------------------------------- */}
      {snapshot.wods.map((wod) => {
        const total = row?.wods[wod.id];
        const cap = capEmTexto(wod.capSegundos);
        // A prova calculada resume o workout; as outras viram os cartões de cima.
        const resumo = wod.provas.find((p) => p.origem === 'SOMA');
        const parciais = wod.provas.filter((p) => p !== resumo);

        return (
          <Card key={wod.id} className="p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h2 className="font-display text-xl font-extrabold uppercase">
                WOD {wod.numero} — <span className="text-nacao-cyan">{wod.nome}</span>
              </h2>
              <span className="font-display text-[10px] font-bold tracking-wider text-white/40 uppercase">
                {[wod.formato, cap ? `CAP ${cap}` : null].filter(Boolean).join(' · ')}
              </span>
            </div>

            {total?.hasResult ? (
              <>
                {wod.permiteCap && !total.concluiu ? (
                  <p className="mt-4 rounded-xl border border-amber-400/25 bg-amber-400/[0.07] px-3.5 py-2.5 text-xs text-amber-200/90">
                    Não concluiu dentro do CAP{cap ? ` de ${cap}` : ''}.
                    {total.volume !== null ? ` Volume registrado: ${points(total.volume)}.` : ''}
                  </p>
                ) : null}

                {parciais.length > 1 ? (
                  <div
                    className="mt-4 grid gap-2"
                    style={{
                      gridTemplateColumns: `repeat(${Math.min(parciais.length, 3)}, minmax(0, 1fr))`,
                    }}
                  >
                    {parciais.map((prova) => {
                      const score = row?.provas[prova.id];
                      return (
                        <Stat
                          key={prova.id}
                          label={`${prova.codigo} ${prova.descricao}`}
                          value={valorDaProva(prova.unidade, score?.valor)}
                          hint={
                            score?.rank
                              ? `${score.rank}º · ${points(score.points)} pt`
                              : 'aguardando'
                          }
                          icon={<Dumbbell size={14} />}
                        />
                      );
                    })}
                  </div>
                ) : null}

                {(() => {
                  const principal = resumo ?? parciais[0];
                  if (!principal) return null;
                  const score = row?.provas[principal.id];
                  return (
                    <Result
                      label={`${principal.codigo} ${principal.descricao}`}
                      value={valorDaProva(principal.unidade, score?.valor)}
                      rank={score?.rank ?? null}
                      pts={total.points}
                      note={
                        wod.provas.length > 1
                          ? `Pontuação do WOD ${wod.numero} = ${wod.provas
                              .filter((p) => p.pontua)
                              .map((p) => p.codigo)
                              .join(' + ')}`
                          : undefined
                      }
                      icon={<Timer size={14} />}
                    />
                  );
                })()}
              </>
            ) : (
              <Pending />
            )}
          </Card>
        );
      })}

      <div className="no-print">
        <LiveIndicator
          live={snapshot.event.liveMode}
          lastUpdate={new Date(updatedAt).toISOString()}
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl bg-white/[0.045] px-3 py-2.5">
      {/* Sem truncate: em 390px o rótulo tem três colunas e "1C Deadlift"
          virava "1C DEADL…". Melhor quebrar a linha do que esconder a prova. */}
      <p className="flex items-start gap-1 font-display text-[9px] leading-tight font-bold tracking-wider text-white/45 uppercase">
        {icon ? <span className="mt-px shrink-0 text-nacao-sky">{icon}</span> : null}
        <span>{label}</span>
      </p>
      <p className="tnum mt-1 font-display text-sm font-bold sm:text-base">{value}</p>
      {hint ? <p className="text-[10px] text-white/35">{hint}</p> : null}
    </div>
  );
}

function Result({
  label,
  value,
  rank,
  pts,
  note,
  icon,
}: {
  label: string;
  value: string;
  rank: number | null;
  pts: number | null;
  note?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-end justify-between gap-4 rounded-xl border border-nacao-cyan/20 bg-nacao-cyan/[0.06] px-4 py-3">
      <div>
        <p className="flex items-center gap-1.5 font-display text-[10px] font-bold tracking-wider text-nacao-cyan uppercase">
          {icon}
          {label}
        </p>
        <p className="tnum font-display text-2xl font-black">{value}</p>
        {note ? <p className="mt-0.5 text-[10px] text-white/40">{note}</p> : null}
      </div>
      <div className="flex items-end gap-5 text-right">
        <div>
          <p className="font-display text-[9px] font-bold tracking-wider text-white/40 uppercase">
            Posição
          </p>
          <p className="tnum font-display text-xl font-extrabold">{rank ?? '—'}º</p>
        </div>
        <div>
          <p className="font-display text-[9px] font-bold tracking-wider text-white/40 uppercase">
            Pontos
          </p>
          <p className="tnum font-display text-xl font-extrabold text-nacao-cyan">
            {points(pts)}
          </p>
        </div>
      </div>
    </div>
  );
}

function Pending() {
  return (
    <p className="mt-4 text-sm text-white/40">
      Resultado ainda não homologado para esta dupla.
    </p>
  );
}
