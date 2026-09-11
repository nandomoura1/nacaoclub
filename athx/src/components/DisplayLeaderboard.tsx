'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Snapshot } from '@/services/snapshot';
import { buildLeaderboard } from '@/lib/scoring/build';
import { useLiveSnapshot } from '@/hooks/useLiveSnapshot';
import { BrandLogo } from '@/components/BrandLogo';
import { WaveField, SkyGlow } from '@/components/WaveField';
import { points, teamNumber } from '@/lib/format';

const TOP = 10;

/**
 * MODO TELÃO (§31)
 *
 * Projetado para ser lido a 10 metros: tipo enorme, contraste alto, dez
 * linhas, zero navegação. Atualiza sozinho pelo Realtime e nunca precisa de
 * alguém com um mouse na mão durante o evento.
 *
 * As unidades são vw/vh de propósito — a mesma tela serve um monitor de 27"
 * e um telão de LED sem ajuste manual.
 */
export function DisplayLeaderboard({ initial }: { initial: Snapshot }) {
  const { snapshot, updatedAt } = useLiveSnapshot(initial);
  const [relogio, setRelogio] = useState('');

  useEffect(() => {
    const tick = () =>
      setRelogio(
        new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      );
    tick();
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, []);

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

  const rows = board.standings.filter((r) => r.scoredWods > 0).slice(0, TOP);

  return (
    <main
      id="conteudo"
      className="relative flex min-h-dvh flex-col overflow-hidden bg-nacao-abyss px-[2.2vw] py-[2vh]"
    >
      <SkyGlow />
      <WaveField intensity="subtle" />

      {/* ---- Cabeçalho do telão ------------------------------------------ */}
      <header className="relative flex items-center justify-between gap-6 border-b border-white/12 pb-[1.6vh]">
        <div className="flex items-center gap-[1.6vw]">
          <BrandLogo size="lg" />
          <span className="h-[5vh] w-px bg-white/20" aria-hidden="true" />
          <div>
            <h1 className="font-display text-[3.2vw] leading-none font-black tracking-[-0.03em]">
              NAÇÃO <span className="text-nacao-cyan">ATHX</span>
            </h1>
            <p className="mt-[0.4vh] font-display text-[0.85vw] font-bold tracking-signature text-white/60 uppercase">
              Classificação geral
            </p>
          </div>
        </div>

        <div className="flex items-center gap-[1.6vw] text-right">
          <div>
            <p className="font-display text-[0.8vw] font-bold tracking-wider text-white/45 uppercase">
              Menor pontuação vence
            </p>
            <p className="tnum font-display text-[2vw] leading-none font-black text-white/85">
              {relogio}
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-[0.6vw] rounded-full border px-[1.2vw] py-[0.7vh] ${
              snapshot.event.liveMode
                ? 'border-nacao-cyan/50 bg-nacao-cyan/12 text-nacao-cyan'
                : 'border-white/20 text-white/55'
            }`}
          >
            <span
              aria-hidden="true"
              className={`h-[0.9vw] w-[0.9vw] rounded-full ${
                snapshot.event.liveMode ? 'animate-live-dot bg-nacao-cyan' : 'bg-white/50'
              }`}
            />
            <span className="font-display text-[1vw] font-black tracking-wider uppercase">
              Ao vivo
            </span>
          </span>
        </div>
      </header>

      {/* ---- Ranking ------------------------------------------------------ */}
      <div className="relative mt-[1.4vh] flex-1">
        {rows.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="font-display text-[3vw] font-black tracking-wider text-white/35 uppercase">
              Aguardando os primeiros resultados
            </p>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-white/40">
                <th scope="col" className="w-[7vw] px-[0.8vw] pb-[0.8vh] text-left font-display text-[0.85vw] font-bold tracking-wider uppercase">
                  Pos
                </th>
                <th scope="col" className="px-[0.8vw] pb-[0.8vh] text-left font-display text-[0.85vw] font-bold tracking-wider uppercase">
                  Dupla
                </th>
                <th scope="col" className="w-[7vw] px-[0.8vw] pb-[0.8vh] text-right font-display text-[0.85vw] font-bold tracking-wider uppercase">
                  WOD 1
                </th>
                <th scope="col" className="w-[7vw] px-[0.8vw] pb-[0.8vh] text-right font-display text-[0.85vw] font-bold tracking-wider uppercase">
                  WOD 2
                </th>
                <th scope="col" className="w-[7vw] px-[0.8vw] pb-[0.8vh] text-right font-display text-[0.85vw] font-bold tracking-wider uppercase">
                  WOD 3
                </th>
                <th scope="col" className="w-[10vw] px-[0.8vw] pb-[0.8vh] text-right font-display text-[0.85vw] font-bold tracking-wider uppercase">
                  Total
                </th>
              </tr>
            </thead>

            <tbody>
              {rows.map((row) => {
                const top3 = row.position <= 3;
                return (
                  <tr
                    key={row.team.id}
                    className={`border-t border-white/[0.09] ${top3 ? 'bg-nacao-cyan/[0.07]' : ''}`}
                  >
                    <td className="px-[0.8vw] py-[0.9vh]">
                      <span className="flex items-center gap-[0.7vw]">
                        <span
                          aria-hidden="true"
                          className={`block h-[4vh] w-[0.35vw] rounded-full ${
                            row.position === 1
                              ? 'bg-nacao-cyan'
                              : row.position === 2
                                ? 'bg-nacao-sky'
                                : row.position === 3
                                  ? 'bg-nacao-blue'
                                  : 'bg-white/12'
                          }`}
                        />
                        <span
                          className={`tnum font-display text-[2.6vw] leading-none font-black ${
                            top3 ? 'text-nacao-cyan' : 'text-white/55'
                          }`}
                        >
                          {row.position}
                        </span>
                      </span>
                    </td>

                    <td className="px-[0.8vw] py-[0.9vh]">
                      <span className="flex items-baseline gap-[0.7vw]">
                        <span className="tnum font-display text-[1vw] font-bold text-nacao-sky">
                          {teamNumber(row.team.teamNumber)}
                        </span>
                        <span className="font-display text-[2vw] leading-none font-extrabold">
                          {row.team.teamName}
                        </span>
                        {row.tied ? (
                          <span className="rounded border border-amber-300/45 px-[0.5vw] py-[0.2vh] font-display text-[0.7vw] font-bold text-amber-300 uppercase">
                            Empate
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-[0.3vh] block text-[0.9vw] text-white/45">
                        {row.team.athlete1 || 'Atleta 1'} · {row.team.athlete2 || 'Atleta 2'}
                      </span>
                    </td>

                    <DisplayPoints value={row.wod1?.hasResult ? row.wod1.points : null} />
                    <DisplayPoints value={row.wod2?.hasResult ? row.wod2.points : null} />
                    <DisplayPoints value={row.wod3?.hasResult ? row.wod3.points : null} />

                    <td className="px-[0.8vw] py-[0.9vh] text-right">
                      <span className="tnum font-display text-[2.8vw] leading-none font-black">
                        {points(row.totalPoints)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ---- Rodapé ------------------------------------------------------- */}
      <footer className="relative flex items-center justify-between border-t border-white/12 pt-[1.2vh]">
        <p className="font-display text-[0.85vw] font-bold tracking-signature text-white/45 uppercase">
          Muitos esportes, muitas paixões, uma Nação!
        </p>
        <p className="font-display text-[0.85vw] font-bold tracking-wider text-white/35 uppercase">
          {snapshot.demo ? 'Modo demonstração · ' : ''}
          Atualizado {new Date(updatedAt).toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      </footer>
    </main>
  );
}

function DisplayPoints({ value }: { value: number | null | undefined }) {
  return (
    <td className="px-[0.8vw] py-[0.9vh] text-right">
      <span className="tnum font-display text-[1.6vw] font-bold text-white/75">
        {value === null || value === undefined ? '—' : points(value)}
      </span>
    </td>
  );
}
