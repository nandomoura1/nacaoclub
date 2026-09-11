'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Lock, Save, Send, TriangleAlert } from 'lucide-react';
import type { Battery, ResultStatus, Team, WodNumber } from '@/types/domain';
import { WOD_META } from '@/types/domain';
import type { Snapshot } from '@/services/snapshot';
import { salvarWod1, salvarWod2, salvarWod3, definirStatus } from '@/app/admin/actions';
import type { ActionResult } from '@/app/admin/actions';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { ScoreInput } from '@/components/ui/Input';
import { Tabs } from '@/components/ui/Tabs';
import { Modal } from '@/components/ui/Modal';
import { kg, km, teamNumber } from '@/lib/format';
import { formatSeconds, parseTimeToSeconds } from '@/lib/time';
import { WOD3_CAP_SECONDS } from '@/lib/scoring/wod3';

type BatteryFilter = 'TODAS' | '1' | '2';

/** Estado editável de uma linha. Tudo string: é o que o input devolve. */
interface RowState {
  sp1: string;
  sp2: string;
  bs1: string;
  bs2: string;
  dl1: string;
  dl2: string;
  runKm: string;
  bikeKm: string;
  time: string;
  completed: boolean;
  volume: string;
}

const vazio = (): RowState => ({
  sp1: '', sp2: '', bs1: '', bs2: '', dl1: '', dl2: '',
  runKm: '', bikeKm: '', time: '', completed: false, volume: '',
});

const txt = (v: number | null | undefined) =>
  v === null || v === undefined ? '' : String(v).replace('.', ',');

/**
 * WodEntry — lançamento de resultados (§19, §20, §21, §40).
 *
 * FLUXO DO DIA DO EVENTO:
 *   1. escolher a bateria  -> a tela mostra só aquelas 10 duplas
 *   2. digitar             -> total calculado na hora, sem conta na mão
 *   3. SALVAR RESULTADOS   -> grava como rascunho (DRAFT), ninguém vê ainda
 *   4. PUBLICAR RANKING    -> homologa, recalcula e o público vê na hora
 *
 * Rascunho existe para que um erro de digitação não vá parar no telão.
 */
export function WodEntry({ snapshot, wod }: { snapshot: Snapshot; wod: WodNumber }) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [bateria, setBateria] = useState<BatteryFilter>('1');
  const [aviso, setAviso] = useState<ActionResult | null>(null);
  const [confirmarPublicacao, setConfirmarPublicacao] = useState(false);
  const [confirmarTrava, setConfirmarTrava] = useState(false);

  const times = useMemo(
    () =>
      snapshot.teams
        .filter((t) => t.status !== 'DESCLASSIFICADA')
        .filter((t) => bateria === 'TODAS' || t.battery === (Number(bateria) as Battery))
        .sort((a, b) => a.teamNumber - b.teamNumber),
    [snapshot.teams, bateria],
  );

  // Estado inicial vindo do banco (inclusive rascunhos: o admin enxerga tudo).
  const [rows, setRows] = useState<Record<string, RowState>>(() => {
    const inicial: Record<string, RowState> = {};
    for (const team of snapshot.teams) {
      const r1 = snapshot.wod1.find((r) => r.teamId === team.id);
      const r2 = snapshot.wod2.find((r) => r.teamId === team.id);
      const r3 = snapshot.wod3.find((r) => r.teamId === team.id);
      inicial[team.id] = {
        sp1: txt(r1?.strictPressAthlete1),
        sp2: txt(r1?.strictPressAthlete2),
        bs1: txt(r1?.backSquatAthlete1),
        bs2: txt(r1?.backSquatAthlete2),
        dl1: txt(r1?.deadliftAthlete1),
        dl2: txt(r1?.deadliftAthlete2),
        runKm: txt(r2?.runKm),
        bikeKm: txt(r2?.bikeKm),
        time: r3?.timeSeconds !== null && r3?.timeSeconds !== undefined && r3.completed
          ? formatSeconds(r3.timeSeconds)
          : '',
        completed: r3?.completed ?? false,
        volume: txt(r3?.volumeCompleted),
      };
    }
    return inicial;
  });

  const statusPorTime = useMemo(() => {
    const mapa: Record<string, ResultStatus | null> = {};
    for (const team of snapshot.teams) {
      const r =
        wod === 1
          ? snapshot.wod1.find((x) => x.teamId === team.id)
          : wod === 2
            ? snapshot.wod2.find((x) => x.teamId === team.id)
            : snapshot.wod3.find((x) => x.teamId === team.id);
      mapa[team.id] = r?.status ?? null;
    }
    return mapa;
  }, [snapshot, wod]);

  const set = (teamId: string, campo: keyof RowState, valor: string | boolean) =>
    setRows((prev) => {
      const atual = prev[teamId] ?? vazio();
      return { ...prev, [teamId]: { ...atual, [campo]: valor } };
    });

  const numero = (v: string) => {
    const n = Number(v.replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  };

  const linha = (teamId: string) => rows[teamId] ?? vazio();

  const totalCarga = (teamId: string) => {
    const r = linha(teamId);
    return numero(r.sp1) + numero(r.sp2) + numero(r.bs1) + numero(r.bs2) + numero(r.dl1) + numero(r.dl2);
  };

  const totalKm = (teamId: string) => {
    const r = linha(teamId);
    return Math.round((numero(r.runKm) + numero(r.bikeKm)) * 100) / 100;
  };

  function salvar() {
    setAviso(null);
    startTransition(async () => {
      const payload = times.map((t) => {
        const r = linha(t.id);
        if (wod === 1) {
          return {
            teamId: t.id,
            strictPressAthlete1: r.sp1 || null,
            strictPressAthlete2: r.sp2 || null,
            backSquatAthlete1: r.bs1 || null,
            backSquatAthlete2: r.bs2 || null,
            deadliftAthlete1: r.dl1 || null,
            deadliftAthlete2: r.dl2 || null,
          };
        }
        if (wod === 2) {
          return { teamId: t.id, runKm: r.runKm || null, bikeKm: r.bikeKm || null };
        }
        return {
          teamId: t.id,
          time: r.time,
          completed: r.completed,
          volumeCompleted: r.volume || null,
        };
      });

      const resultado =
        wod === 1
          ? await salvarWod1(payload)
          : wod === 2
            ? await salvarWod2(payload)
            : await salvarWod3(payload);

      setAviso(resultado);
      if (resultado.ok) router.refresh();
    });
  }

  function mudarStatus(status: ResultStatus) {
    setAviso(null);
    setConfirmarPublicacao(false);
    setConfirmarTrava(false);
    startTransition(async () => {
      const resultado = await definirStatus(
        wod,
        times.map((t) => t.id),
        status,
      );
      setAviso(resultado);
      if (resultado.ok) router.refresh();
    });
  }

  const meta = WOD_META[wod];

  return (
    <div className="space-y-5">
      {/* ---- Bateria ------------------------------------------------------ */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-display text-[10px] font-bold tracking-kicker text-white/45 uppercase">
            Escolha a bateria
          </p>
          <div className="mt-1.5">
            <Tabs
              options={[
                { value: '1' as const, label: 'Bateria 1' },
                { value: '2' as const, label: 'Bateria 2' },
                { value: 'TODAS' as const, label: 'Todas' },
              ]}
              value={bateria}
              onChange={setBateria}
              label="Filtrar por bateria"
            />
          </div>
        </div>

        <p className="font-display text-[11px] font-bold tracking-wider text-white/40 uppercase">
          {times.length} duplas · {meta.format} · CAP {meta.cap}
        </p>
      </div>

      {/* ---- Aviso -------------------------------------------------------- */}
      {aviso ? (
        <p
          role="status"
          className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${
            aviso.ok
              ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
              : 'border-red-400/30 bg-red-500/10 text-red-200'
          }`}
        >
          {aviso.ok ? (
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          ) : (
            <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          )}
          {aviso.message}
        </p>
      ) : null}

      {/* ---- Tabela de lançamento ----------------------------------------- */}
      <Card className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-white/12">
              <th scope="col" className="px-3 py-3 font-display text-[10px] font-bold tracking-wider text-white/45 uppercase">
                Dupla
              </th>
              {wod === 1 ? (
                <>
                  <ThGroup>Strict Press</ThGroup>
                  <ThGroup>Back Squat</ThGroup>
                  <ThGroup>Deadlift</ThGroup>
                  <ThRight>Total</ThRight>
                </>
              ) : null}
              {wod === 2 ? (
                <>
                  <ThGroup>Corrida (km)</ThGroup>
                  <ThGroup>Bike (km)</ThGroup>
                  <ThRight>Soma</ThRight>
                </>
              ) : null}
              {wod === 3 ? (
                <>
                  <ThGroup>Tempo MM:SS</ThGroup>
                  <ThGroup>Concluiu?</ThGroup>
                  <ThGroup>Volume no CAP</ThGroup>
                </>
              ) : null}
              <ThRight>Status</ThRight>
            </tr>
          </thead>

          <tbody>
            {times.map((team) => {
              const r = linha(team.id);
              const erro = aviso?.fieldErrors?.[team.id];
              const status = statusPorTime[team.id] ?? null;

              return (
                <tr
                  key={team.id}
                  className={`border-b border-white/[0.07] ${erro ? 'bg-red-500/[0.07]' : ''}`}
                >
                  <td className="px-3 py-2.5">
                    <TeamCell team={team} />
                    {erro ? (
                      <p role="alert" className="mt-1 max-w-xs text-[11px] text-red-300">
                        {erro}
                      </p>
                    ) : null}
                  </td>

                  {wod === 1 ? (
                    <>
                      <Pair>
                        <ScoreInput
                          aria-label={`Strict Press de ${team.athlete1 || 'atleta 1'}`}
                          value={r.sp1}
                          onChange={(e) => set(team.id, 'sp1', e.target.value)}
                          suffix="kg"
                        />
                        <ScoreInput
                          aria-label={`Strict Press de ${team.athlete2 || 'atleta 2'}`}
                          value={r.sp2}
                          onChange={(e) => set(team.id, 'sp2', e.target.value)}
                          suffix="kg"
                        />
                      </Pair>
                      <Pair>
                        <ScoreInput
                          aria-label={`Back Squat de ${team.athlete1 || 'atleta 1'}`}
                          value={r.bs1}
                          onChange={(e) => set(team.id, 'bs1', e.target.value)}
                          suffix="kg"
                        />
                        <ScoreInput
                          aria-label={`Back Squat de ${team.athlete2 || 'atleta 2'}`}
                          value={r.bs2}
                          onChange={(e) => set(team.id, 'bs2', e.target.value)}
                          suffix="kg"
                        />
                      </Pair>
                      <Pair>
                        <ScoreInput
                          aria-label={`Deadlift de ${team.athlete1 || 'atleta 1'}`}
                          value={r.dl1}
                          onChange={(e) => set(team.id, 'dl1', e.target.value)}
                          suffix="kg"
                        />
                        <ScoreInput
                          aria-label={`Deadlift de ${team.athlete2 || 'atleta 2'}`}
                          value={r.dl2}
                          onChange={(e) => set(team.id, 'dl2', e.target.value)}
                          suffix="kg"
                        />
                      </Pair>
                      <td className="px-3 py-2.5 text-right">
                        <span className="tnum font-display text-lg font-black whitespace-nowrap text-nacao-cyan">
                          {kg(totalCarga(team.id))}
                        </span>
                      </td>
                    </>
                  ) : null}

                  {wod === 2 ? (
                    <>
                      <td className="px-3 py-2.5">
                        <ScoreInput
                          aria-label={`Quilômetros de corrida da dupla ${team.teamName}`}
                          value={r.runKm}
                          onChange={(e) => set(team.id, 'runKm', e.target.value)}
                          suffix="km"
                          className="w-28"
                        />
                        <span className="mt-1 block text-center text-[10px] text-white/35">
                          múltiplos de 0,5
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <ScoreInput
                          aria-label={`Quilômetros de bike da dupla ${team.teamName}`}
                          value={r.bikeKm}
                          onChange={(e) => set(team.id, 'bikeKm', e.target.value)}
                          suffix="km"
                          className="w-28"
                        />
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <span className="tnum font-display text-lg font-black whitespace-nowrap text-nacao-cyan">
                          {km(totalKm(team.id))}
                        </span>
                      </td>
                    </>
                  ) : null}

                  {wod === 3 ? (
                    <>
                      <td className="px-3 py-2.5">
                        <ScoreInput
                          aria-label={`Tempo da dupla ${team.teamName} em minutos e segundos`}
                          value={r.time}
                          onChange={(e) => set(team.id, 'time', e.target.value)}
                          placeholder="14:32"
                          disabled={!r.completed}
                          className="w-28"
                        />
                        <span className="mt-1 block text-center text-[10px] text-white/35">
                          {r.completed
                            ? r.time
                              ? `${parseTimeToSeconds(r.time) ?? '—'} s`
                              : 'MM:SS'
                            : `CAP ${formatSeconds(WOD3_CAP_SECONDS)}`}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <label className="flex cursor-pointer items-center justify-center gap-2">
                          <input
                            type="checkbox"
                            checked={r.completed}
                            onChange={(e) => set(team.id, 'completed', e.target.checked)}
                            className="h-5 w-5 accent-[#20C4FA]"
                          />
                          <span className="font-display text-xs font-bold uppercase">
                            {r.completed ? 'Sim' : 'Não'}
                          </span>
                        </label>
                      </td>
                      <td className="px-3 py-2.5">
                        <ScoreInput
                          aria-label={`Volume concluído pela dupla ${team.teamName}`}
                          value={r.volume}
                          onChange={(e) => set(team.id, 'volume', e.target.value)}
                          disabled={r.completed}
                          placeholder={r.completed ? '—' : '0'}
                          className="w-24"
                        />
                      </td>
                    </>
                  ) : null}

                  <td className="px-3 py-2.5 text-right">
                    <StatusBadge status={status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {/* ---- Ações -------------------------------------------------------- */}
      <div className="sticky bottom-0 flex flex-wrap gap-2.5 border-t border-white/10 bg-nacao-abyss/92 py-3 backdrop-blur-md">
        <Button type="button" size="xl" onClick={salvar} disabled={pendente}>
          <Save size={18} aria-hidden="true" />
          {pendente ? 'Salvando…' : 'Salvar resultados'}
        </Button>

        <Button
          type="button"
          size="xl"
          variant="cyan"
          onClick={() => setConfirmarPublicacao(true)}
          disabled={pendente}
        >
          <Send size={18} aria-hidden="true" />
          Publicar ranking
        </Button>

        <Button
          type="button"
          size="xl"
          variant="secondary"
          onClick={() => setConfirmarTrava(true)}
          disabled={pendente}
        >
          <Lock size={18} aria-hidden="true" />
          Travar
        </Button>
      </div>

      <Modal
        open={confirmarPublicacao}
        onClose={() => setConfirmarPublicacao(false)}
        title={`Publicar o WOD ${wod}?`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmarPublicacao(false)}>
              Cancelar
            </Button>
            <Button variant="cyan" onClick={() => mudarStatus('PUBLISHED')}>
              Publicar agora
            </Button>
          </>
        }
      >
        <p className="text-sm text-white/70">
          As <strong>{times.length} duplas</strong>{' '}
          {bateria === 'TODAS' ? 'do evento' : `da bateria ${bateria}`} passam de rascunho
          para publicado. A classificação é recalculada e o público vê na hora, sem
          precisar atualizar a página.
        </p>
      </Modal>

      <Modal
        open={confirmarTrava}
        onClose={() => setConfirmarTrava(false)}
        title={`Travar o WOD ${wod}?`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmarTrava(false)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={() => mudarStatus('LOCKED')}>
              Travar resultados
            </Button>
          </>
        }
      >
        <p className="text-sm text-white/70">
          Resultado travado não pode mais ser alterado por engano. Para mudar depois será
          preciso destravar em <strong>Conferência</strong>, informando o motivo — e a
          alteração fica registrada na auditoria.
        </p>
      </Modal>
    </div>
  );
}

function TeamCell({ team }: { team: Team }) {
  return (
    <>
      <span className="flex items-center gap-2">
        <span className="tnum font-display text-[11px] font-bold text-nacao-sky">
          {teamNumber(team.teamNumber)}
        </span>
        <span className="font-display text-sm font-bold">{team.teamName}</span>
      </span>
      <span className="block text-[11px] text-white/45">
        {team.athlete1 || 'Atleta 1'} · {team.athlete2 || 'Atleta 2'}
      </span>
    </>
  );
}

function StatusBadge({ status }: { status: ResultStatus | null }) {
  if (status === 'LOCKED') return <Badge tone="danger">Travado</Badge>;
  if (status === 'PUBLISHED') return <Badge tone="ok">Publicado</Badge>;
  if (status === 'DRAFT') return <Badge tone="warn">Rascunho</Badge>;
  return <Badge tone="neutral">Sem lançamento</Badge>;
}

function ThGroup({ children }: { children: React.ReactNode }) {
  return (
    <th
      scope="col"
      className="px-3 py-3 text-center font-display text-[10px] font-bold tracking-wider text-white/45 uppercase"
    >
      {children}
    </th>
  );
}

function ThRight({ children }: { children: React.ReactNode }) {
  return (
    <th
      scope="col"
      className="px-3 py-3 text-right font-display text-[10px] font-bold tracking-wider text-white/45 uppercase"
    >
      {children}
    </th>
  );
}

function Pair({ children }: { children: React.ReactNode }) {
  return (
    <td className="px-3 py-2.5">
      <div className="flex gap-1.5">{children}</div>
    </td>
  );
}
