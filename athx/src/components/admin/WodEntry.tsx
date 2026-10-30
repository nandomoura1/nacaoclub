'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Lock, Save, Send, TriangleAlert } from 'lucide-react';
import type { ResultStatus, Team } from '@/types/domain';
import type { Prova, Wod } from '@/types/wod';
import { capEmTexto, UNIDADE_SUFIXO } from '@/types/wod';
import type { Snapshot } from '@/services/snapshot';
import { definirStatus, salvarLancamentos } from '@/app/admin/actions';
import type { ActionResult } from '@/app/admin/actions';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { ScoreInput } from '@/components/ui/Input';
import { Tabs } from '@/components/ui/Tabs';
import { Modal } from '@/components/ui/Modal';
import { teamNumber, valorDaProva } from '@/lib/format';
import { formatSeconds } from '@/lib/time';

/** O que o juiz digitou numa prova. Tudo string: é o que o input devolve. */
interface CampoState {
  valor: string;
  atleta1: string;
  atleta2: string;
}

interface LinhaState {
  campos: Record<string, CampoState>;
  concluiu: boolean;
  volume: string;
}

const campoVazio = (): CampoState => ({ valor: '', atleta1: '', atleta2: '' });

const txt = (v: number | null | undefined, unidade: Prova['unidade']) => {
  if (v === null || v === undefined) return '';
  if (unidade === 'SEGUNDOS') return formatSeconds(v);
  return String(v).replace('.', ',');
};

/** "2,41" -> 2.41 · "14:32" -> 872. Só para o total mostrado na tela. */
function paraNumero(texto: string, unidade: Prova['unidade']): number | null {
  const limpo = texto.trim();
  if (limpo === '') return null;

  if (unidade === 'SEGUNDOS') {
    const [m = '0', s = '0'] = limpo.split(':');
    const total = Number(m) * 60 + Number(s);
    return Number.isFinite(total) ? total : null;
  }

  const n = Number(limpo.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/**
 * WodEntry — lançamento de resultados (§19, §20, §21, §40).
 *
 * OS CAMPOS SAEM DO CADASTRO DA PROVA.
 *
 * Antes esta tela conhecia os três workouts: seis campos de carga para o
 * WOD 1, dois de distância para o WOD 2, um de tempo para o WOD 3. Um WOD
 * novo pedia um quarto bloco de código. Agora ela lê as provas do workout e
 * desenha um campo por prova digitada — dois, quando a prova é por atleta.
 *
 * FLUXO DO DIA DO EVENTO:
 *   1. escolher a bateria  -> a tela mostra só aquelas duplas
 *   2. digitar             -> o calculado aparece na hora, sem conta na mão
 *   3. SALVAR RESULTADOS   -> grava como rascunho, ninguém vê ainda
 *   4. PUBLICAR RANKING    -> homologa e o público vê na hora
 *
 * Rascunho existe para que um erro de digitação não vá parar no telão.
 */
export function WodEntry({ snapshot, wod }: { snapshot: Snapshot; wod: Wod }) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [bateria, setBateria] = useState<string>('1');
  const [aviso, setAviso] = useState<ActionResult | null>(null);
  const [confirmarPublicacao, setConfirmarPublicacao] = useState(false);
  const [confirmarTrava, setConfirmarTrava] = useState(false);

  // Só as provas digitadas viram campo. As calculadas aparecem como
  // resultado, logo abaixo — nunca como campo, para não divergirem.
  const digitadas = wod.provas.filter((p) => p.origem === 'DIGITADA');
  const calculadas = wod.provas.filter((p) => p.origem === 'SOMA');

  const baterias = useMemo(() => {
    const daAgenda = snapshot.agenda
      .filter((a) => a.wodId === wod.id && a.bateria !== null)
      .map((a) => a.bateria as number);
    const dasDuplas = snapshot.teams.map((t) => t.battery);
    const todas = [...new Set([...daAgenda, ...dasDuplas])].sort((a, b) => a - b);
    return todas.length > 0 ? todas : [1];
  }, [snapshot.agenda, snapshot.teams, wod.id]);

  const times = useMemo(
    () =>
      snapshot.teams
        .filter((t) => t.status !== 'DESCLASSIFICADA')
        .filter((t) => bateria === 'TODAS' || t.battery === Number(bateria))
        .sort((a, b) => a.teamNumber - b.teamNumber),
    [snapshot.teams, bateria],
  );

  // Estado inicial vindo do banco (inclusive rascunhos: o admin vê tudo).
  const [rows, setRows] = useState<Record<string, LinhaState>>(() => {
    const inicial: Record<string, LinhaState> = {};

    for (const team of snapshot.teams) {
      const entrada = snapshot.entries.find((e) => e.wodId === wod.id && e.teamId === team.id);
      const campos: Record<string, CampoState> = {};

      for (const prova of digitadas) {
        const lancado = snapshot.results.find(
          (r) => r.provaId === prova.id && r.teamId === team.id,
        );
        campos[prova.id] = {
          valor: txt(lancado?.valor, prova.unidade),
          atleta1: txt(lancado?.valorAtleta1, prova.unidade),
          atleta2: txt(lancado?.valorAtleta2, prova.unidade),
        };
      }

      inicial[team.id] = {
        campos,
        concluiu: entrada?.concluiu ?? !wod.permiteCap,
        volume: entrada?.volume === null || entrada?.volume === undefined
          ? ''
          : String(entrada.volume).replace('.', ','),
      };
    }

    return inicial;
  });

  const statusDe = (teamId: string): ResultStatus | undefined =>
    snapshot.entries.find((e) => e.wodId === wod.id && e.teamId === team(teamId)?.id)?.status;

  const team = (id: string): Team | undefined => snapshot.teams.find((t) => t.id === id);

  function atualizar(teamId: string, provaId: string, campo: keyof CampoState, valor: string) {
    setRows((prev) => {
      const linha = prev[teamId] ?? { campos: {}, concluiu: !wod.permiteCap, volume: '' };
      return {
        ...prev,
        [teamId]: {
          ...linha,
          campos: {
            ...linha.campos,
            [provaId]: { ...(linha.campos[provaId] ?? campoVazio()), [campo]: valor },
          },
        },
      };
    });
  }

  function atualizarLinha(teamId: string, campos: Partial<LinhaState>) {
    setRows((prev) => ({
      ...prev,
      [teamId]: {
        ...(prev[teamId] ?? { campos: {}, concluiu: !wod.permiteCap, volume: '' }),
        ...campos,
      },
    }));
  }

  /** O valor de uma prova para esta dupla, já somado quando é por atleta. */
  function valorDe(teamId: string, prova: Prova): number | null {
    const linha = rows[teamId];
    if (!linha) return null;

    if (prova.origem === 'SOMA') {
      const partes = prova.componentes
        .map((codigo) => wod.provas.find((p) => p.codigo === codigo))
        .filter((p): p is Prova => p !== undefined)
        .map((p) => valorDe(teamId, p));
      return partes.some((v) => v !== null)
        ? Math.round(partes.reduce<number>((a, v) => a + (v ?? 0), 0) * 1000) / 1000
        : null;
    }

    const campo = linha.campos[prova.id];
    if (!campo) return null;

    if (prova.porAtleta) {
      const a = paraNumero(campo.atleta1, prova.unidade);
      const b = paraNumero(campo.atleta2, prova.unidade);
      return a === null && b === null ? null : (a ?? 0) + (b ?? 0);
    }
    return paraNumero(campo.valor, prova.unidade);
  }

  function salvar() {
    setAviso(null);
    startTransition(async () => {
      const linhas = times.map((t) => {
        const linha = rows[t.id];
        return {
          teamId: t.id,
          concluiu: linha?.concluiu ?? !wod.permiteCap,
          volume: linha?.volume?.trim() ? linha.volume.replace(',', '.') : null,
          valores: Object.fromEntries(
            digitadas.map((p) => [
              p.id,
              {
                valor: linha?.campos[p.id]?.valor ?? null,
                atleta1: linha?.campos[p.id]?.atleta1 ?? null,
                atleta2: linha?.campos[p.id]?.atleta2 ?? null,
              },
            ]),
          ),
        };
      });

      const resultado = await salvarLancamentos(wod.id, linhas);
      setAviso(resultado);
      if (resultado.ok) router.refresh();
    });
  }

  function homologar(status: ResultStatus) {
    setAviso(null);
    startTransition(async () => {
      const resultado = await definirStatus(
        wod.id,
        times.map((t) => t.id),
        status,
      );
      setAviso(resultado);
      setConfirmarPublicacao(false);
      setConfirmarTrava(false);
      if (resultado.ok) router.refresh();
    });
  }

  const cap = capEmTexto(wod.capSegundos);

  return (
    <div className="space-y-5">
      {/* ---- Cabeçalho ---------------------------------------------------- */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-display text-[10px] font-bold tracking-kicker text-nacao-cyan uppercase">
            {[wod.formato, cap ? `CAP ${cap}` : null].filter(Boolean).join(' · ')}
          </p>
          <h1 className="mt-1 font-display text-3xl font-black tracking-tight uppercase">
            WOD {wod.numero} — {wod.nome}
          </h1>
          <p className="mt-1 text-sm text-white/50">
            {digitadas.length} prova{digitadas.length === 1 ? '' : 's'} para lançar
            {calculadas.length > 0
              ? ` · ${calculadas.map((p) => p.codigo).join(', ')} ${
                  calculadas.length === 1 ? 'é calculada' : 'são calculadas'
                } pelo sistema`
              : ''}
          </p>
        </div>
      </div>

      {/* ---- Bateria ------------------------------------------------------ */}
      <div>
        <p className="mb-2 font-display text-[10px] font-bold tracking-kicker text-white/45 uppercase">
          Escolha a bateria
        </p>
        <Tabs
          options={[
            ...baterias.map((b) => ({ value: String(b), label: `Bateria ${b}` })),
            { value: 'TODAS', label: 'Todas' },
          ]}
          value={bateria}
          onChange={setBateria}
          label="Filtrar por bateria"
        />
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

      {/* ---- As linhas ---------------------------------------------------- */}
      <div className="space-y-3">
        {times.map((t) => {
          const linha = rows[t.id];
          const status = statusDe(t.id);
          const travado = status === 'LOCKED';

          return (
            <Card key={t.id} className={`p-4 ${travado ? 'opacity-70' : ''}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2">
                  <span className="tnum font-display text-xs font-bold text-nacao-sky">
                    {teamNumber(t.teamNumber)}
                  </span>
                  <span className="font-display text-base font-bold">{t.teamName}</span>
                  <span className="text-xs text-white/40">
                    {t.athlete1 || 'Atleta 1'} · {t.athlete2 || 'Atleta 2'}
                  </span>
                </p>
                <span className="flex items-center gap-1.5">
                  {travado ? <Badge tone="danger">Travado</Badge> : null}
                  {status === 'PUBLISHED' ? <Badge tone="ok">Publicado</Badge> : null}
                  {status === 'DRAFT' ? <Badge tone="warn">Rascunho</Badge> : null}
                </span>
              </div>

              {/* Um campo por prova digitada — dois quando é por atleta. */}
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {digitadas.map((prova) => (
                  <div key={prova.id} className="rounded-xl bg-white/[0.04] px-3 py-2.5">
                    <p className="mb-1.5 font-display text-[10px] font-bold tracking-wider text-nacao-sky uppercase">
                      {prova.codigo} · {prova.descricao}
                    </p>

                    {prova.porAtleta ? (
                      <div className="grid grid-cols-2 gap-2">
                        <ScoreInput
                          label="Atleta 1"
                          suffix={UNIDADE_SUFIXO[prova.unidade]}
                          disabled={travado}
                          value={linha?.campos[prova.id]?.atleta1 ?? ''}
                          onChange={(e) => atualizar(t.id, prova.id, 'atleta1', e.target.value)}
                        />
                        <ScoreInput
                          label="Atleta 2"
                          suffix={UNIDADE_SUFIXO[prova.unidade]}
                          disabled={travado}
                          value={linha?.campos[prova.id]?.atleta2 ?? ''}
                          onChange={(e) => atualizar(t.id, prova.id, 'atleta2', e.target.value)}
                        />
                      </div>
                    ) : (
                      <ScoreInput
                        suffix={UNIDADE_SUFIXO[prova.unidade]}
                        placeholder={prova.unidade === 'SEGUNDOS' ? 'mm:ss' : undefined}
                        disabled={travado}
                        value={linha?.campos[prova.id]?.valor ?? ''}
                        onChange={(e) => atualizar(t.id, prova.id, 'valor', e.target.value)}
                      />
                    )}

                    <p className="tnum mt-1 text-[10px] text-white/40">
                      {valorDaProva(prova.unidade, valorDe(t.id, prova))}
                    </p>
                  </div>
                ))}
              </div>

              {/* O que o sistema calcula, mostrado para conferência. */}
              {calculadas.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {calculadas.map((prova) => (
                    <span
                      key={prova.id}
                      className="rounded-lg border border-nacao-cyan/25 bg-nacao-cyan/[0.07] px-3 py-1.5 text-xs text-white/75"
                    >
                      <strong className="font-display font-bold tracking-wider text-nacao-cyan uppercase">
                        {prova.codigo}
                      </strong>{' '}
                      <span className="tnum">
                        {valorDaProva(prova.unidade, valorDe(t.id, prova))}
                      </span>
                    </span>
                  ))}
                </div>
              ) : null}

              {/* Só workout com CAP pergunta se concluiu. */}
              {wod.permiteCap ? (
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={linha?.concluiu ?? false}
                      disabled={travado}
                      onChange={(e) => atualizarLinha(t.id, { concluiu: e.target.checked })}
                      className="h-4 w-4 accent-nacao-cyan"
                    />
                    Concluiu dentro do CAP
                  </label>

                  {!linha?.concluiu ? (
                    <div className="w-32">
                      <ScoreInput
                        label="Volume"
                        disabled={travado}
                        value={linha?.volume ?? ''}
                        onChange={(e) => atualizarLinha(t.id, { volume: e.target.value })}
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>

      {times.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="text-sm text-white/50">Nenhuma dupla nesta bateria.</p>
        </Card>
      ) : null}

      {/* ---- Ações -------------------------------------------------------- */}
      <div className="sticky bottom-0 flex flex-wrap gap-2 border-t border-white/10 bg-nacao-abyss/92 py-3 backdrop-blur-md">
        <Button size="lg" onClick={salvar} disabled={pendente || times.length === 0}>
          <Save size={17} aria-hidden="true" />
          {pendente ? 'Salvando…' : 'Salvar resultados'}
        </Button>
        <Button
          size="lg"
          variant="secondary"
          onClick={() => setConfirmarPublicacao(true)}
          disabled={pendente || times.length === 0}
        >
          <Send size={17} aria-hidden="true" />
          Publicar ranking
        </Button>
        <Button
          size="lg"
          variant="secondary"
          onClick={() => setConfirmarTrava(true)}
          disabled={pendente || times.length === 0}
        >
          <Lock size={17} aria-hidden="true" />
          Travar
        </Button>
      </div>

      <Modal
        open={confirmarPublicacao}
        onClose={() => setConfirmarPublicacao(false)}
        title="Publicar o ranking?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmarPublicacao(false)}>
              Cancelar
            </Button>
            <Button onClick={() => homologar('PUBLISHED')} disabled={pendente}>
              <CheckCircle2 size={16} aria-hidden="true" />
              Publicar
            </Button>
          </>
        }
      >
        <p className="text-sm text-white/70">
          Os resultados {bateria === 'TODAS' ? 'do evento' : `da bateria ${bateria}`} passam de
          rascunho para publicado e aparecem no leaderboard público na hora.
        </p>
      </Modal>

      <Modal
        open={confirmarTrava}
        onClose={() => setConfirmarTrava(false)}
        title="Travar os resultados?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmarTrava(false)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={() => homologar('LOCKED')} disabled={pendente}>
              <Lock size={16} aria-hidden="true" />
              Travar
            </Button>
          </>
        }
      >
        <p className="flex items-start gap-2 text-sm text-white/70">
          <TriangleAlert size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-amber-300" />
          Resultado travado não muda por acidente. Para alterar depois, é preciso destravar
          informando o motivo — e a ação fica registrada na auditoria.
        </p>
      </Modal>
    </div>
  );
}
