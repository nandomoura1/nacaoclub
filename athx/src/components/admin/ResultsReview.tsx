'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Download, FileJson, Printer, RefreshCw, Unlock } from 'lucide-react';
import type { ResultStatus, WodNumber } from '@/types/domain';
import type { Snapshot } from '@/services/snapshot';
import { buildLeaderboard } from '@/lib/scoring/build';
import { ADMIN_STATUSES, PUBLIC_STATUSES } from '@/lib/scoring/eligibility';
import { destravarResultado, recalcular } from '@/app/admin/actions';
import type { ActionResult } from '@/app/admin/actions';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Tabs } from '@/components/ui/Tabs';
import { points, teamNumber } from '@/lib/format';

/**
 * Conferência geral (§22) — a tela do "antes de anunciar o pódio".
 *
 * Mostra lado a lado a classificação que o PÚBLICO está vendo (só o que foi
 * homologado) e a PRÉVIA com os rascunhos incluídos. É como a organização
 * enxerga o efeito de publicar antes de publicar.
 */
export function ResultsReview({ snapshot }: { snapshot: Snapshot }) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [visao, setVisao] = useState<'PUBLICO' | 'PREVIA'>('PUBLICO');
  const [aviso, setAviso] = useState<ActionResult | null>(null);
  const [destravar, setDestravar] = useState<{ wod: WodNumber; teamId: string; nome: string } | null>(null);
  const [motivo, setMotivo] = useState('');

  const raw = {
    teams: snapshot.teams,
    wod1: snapshot.wod1,
    wod2: snapshot.wod2,
    wod3: snapshot.wod3,
    settings: snapshot.settings,
  };

  const board = useMemo(
    () =>
      buildLeaderboard(raw, {
        statuses: visao === 'PUBLICO' ? PUBLIC_STATUSES : ADMIN_STATUSES,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snapshot, visao],
  );

  const travados = useMemo(() => {
    const lista: { wod: WodNumber; teamId: string; nome: string; status: ResultStatus }[] = [];
    for (const team of snapshot.teams) {
      const checar = (wod: WodNumber, status?: ResultStatus) => {
        if (status === 'LOCKED') {
          lista.push({ wod, teamId: team.id, nome: team.teamName, status });
        }
      };
      checar(1, snapshot.wod1.find((r) => r.teamId === team.id)?.status);
      checar(2, snapshot.wod2.find((r) => r.teamId === team.id)?.status);
      checar(3, snapshot.wod3.find((r) => r.teamId === team.id)?.status);
    }
    return lista;
  }, [snapshot]);

  const empates = board.standings.filter((r) => r.needsDecision);

  function executarRecalculo() {
    setAviso(null);
    startTransition(async () => {
      const resultado = await recalcular();
      setAviso(resultado);
      if (resultado.ok) router.refresh();
    });
  }

  function confirmarDestravar() {
    if (!destravar) return;
    startTransition(async () => {
      const resultado = await destravarResultado(destravar.wod, destravar.teamId, motivo);
      setAviso(resultado);
      if (resultado.ok) {
        setDestravar(null);
        setMotivo('');
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* ---- Ações -------------------------------------------------------- */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Tabs
          options={[
            { value: 'PUBLICO' as const, label: 'O que o público vê' },
            { value: 'PREVIA' as const, label: 'Prévia com rascunhos' },
          ]}
          value={visao}
          onChange={setVisao}
          label="Escolher a visão da classificação"
        />

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={executarRecalculo} disabled={pendente}>
            <RefreshCw size={15} aria-hidden="true" />
            Recalcular
          </Button>
          <ButtonLink variant="secondary" href="/api/export?format=csv" download="resultados.csv">
            <Download size={15} aria-hidden="true" />
            CSV
          </ButtonLink>
          <ButtonLink variant="secondary" href="/api/export?format=json" download="resultados.json">
            <FileJson size={15} aria-hidden="true" />
            JSON
          </ButtonLink>
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer size={15} aria-hidden="true" />
            Imprimir / PDF
          </Button>
        </div>
      </div>

      {aviso ? (
        <p
          role="status"
          className={`rounded-xl border px-4 py-3 text-sm ${
            aviso.ok
              ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
              : 'border-red-400/30 bg-red-500/10 text-red-200'
          }`}
        >
          {aviso.message}
        </p>
      ) : null}

      {/* ---- Empates ------------------------------------------------------ */}
      {empates.length > 0 ? (
        <Card className="border-amber-400/30 p-5">
          <CardHeader kicker="Decisão da organização" title="Empates" />
          <p className="mt-2 text-sm text-white/60">
            {empates.length} dupla(s) estão empatadas. Nenhum critério de desempate foi
            aplicado automaticamente — defina o critério em{' '}
            <strong>Configurações</strong> ou resolva manualmente antes do pódio.
          </p>
          <ul className="mt-3 space-y-1">
            {empates.map((r) => (
              <li key={r.team.id} className="text-sm">
                <span className="tnum font-display font-bold text-nacao-sky">
                  {teamNumber(r.team.teamNumber)}
                </span>{' '}
                {r.team.teamName} — {r.position}º com {points(r.totalPoints)} pontos
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* ---- Resultados travados ------------------------------------------ */}
      {travados.length > 0 ? (
        <Card className="p-5">
          <CardHeader kicker="Homologação" title="Resultados travados" />
          <p className="mt-2 text-sm text-white/55">
            Travado não muda por acidente. Para alterar, destrave informando o motivo — a
            ação fica registrada na auditoria.
          </p>
          <ul className="mt-3 divide-y divide-white/[0.07]">
            {travados.map((t) => (
              <li key={`${t.wod}-${t.teamId}`} className="flex items-center justify-between gap-3 py-2">
                <span className="text-sm">
                  <Badge tone="danger">WOD {t.wod}</Badge>{' '}
                  <span className="ml-1.5 font-display font-bold">{t.nome}</span>
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setDestravar({ wod: t.wod, teamId: t.teamId, nome: t.nome })}
                >
                  <Unlock size={13} aria-hidden="true" />
                  Destravar
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* ---- Tabela de conferência ---------------------------------------- */}
      <Card className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <caption className="px-3 py-3 text-left">
            <span className="font-display text-sm font-bold tracking-wider uppercase">
              {visao === 'PUBLICO'
                ? 'Classificação publicada'
                : 'Prévia — inclui rascunhos ainda não publicados'}
            </span>
          </caption>
          <thead>
            <tr className="border-b border-white/12">
              {['Pos', 'Nº', 'Dupla', 'WOD 1', 'WOD 2', 'WOD 3', 'Total', 'WODs'].map((h) => (
                <th
                  key={h}
                  scope="col"
                  className="px-3 py-2.5 font-display text-[10px] font-bold tracking-wider text-white/45 uppercase"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {board.standings.map((row) => (
              <tr key={row.team.id} className="border-b border-white/[0.07]">
                <td className="tnum px-3 py-2 font-display font-black">
                  {row.scoredWods > 0 ? `${row.position}º` : '—'}
                </td>
                <td className="tnum px-3 py-2 font-display text-xs font-bold text-nacao-sky">
                  {teamNumber(row.team.teamNumber)}
                </td>
                <td className="px-3 py-2 font-display text-sm font-bold">
                  {row.team.teamName}
                  {row.tied ? (
                    <Badge tone="warn" className="ml-2">
                      Empate
                    </Badge>
                  ) : null}
                </td>
                <td className="tnum px-3 py-2">{points(row.wod1?.points)}</td>
                <td className="tnum px-3 py-2">{points(row.wod2?.points)}</td>
                <td className="tnum px-3 py-2">{points(row.wod3?.points)}</td>
                <td className="tnum px-3 py-2 font-display font-black">
                  {row.scoredWods > 0 ? points(row.totalPoints) : '—'}
                </td>
                <td className="tnum px-3 py-2 text-xs text-white/45">{row.scoredWods}/3</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Modal
        open={destravar !== null}
        onClose={() => setDestravar(null)}
        title={`Destravar WOD ${destravar?.wod} — ${destravar?.nome}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDestravar(null)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={confirmarDestravar} disabled={pendente || motivo.trim().length < 5}>
              Destravar
            </Button>
          </>
        }
      >
        <Input
          label="Motivo (obrigatório)"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Ex.: erro de digitação confirmado pelo juiz da pista 3"
          hint="Mínimo de 5 caracteres. Fica registrado na auditoria com seu usuário e horário."
        />
      </Modal>
    </div>
  );
}
