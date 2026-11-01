'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Printer, Save, TriangleAlert } from 'lucide-react';
import type { Snapshot } from '@/services/snapshot';
import type { Team } from '@/types/domain';
import { CATEGORIES, CATEGORY_LABEL } from '@/types/domain';
import type { Prova, Wod } from '@/types/wod';
import { UNIDADE_SUFIXO, capEmTexto } from '@/types/wod';
import { salvarAtletas, salvarLancamentos } from '@/app/admin/actions';
import type { ActionResult } from '@/app/admin/actions';
import { leaderboardDoSnapshot } from '@/lib/scoring/build';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { BrandLogo } from '@/components/BrandLogo';
import { Select } from '@/components/ui/Input';
import { formatSeconds } from '@/lib/time';
import { dataCurta, points, teamNumber, valorDaProva } from '@/lib/format';

/**
 * A SÚMULA DO ÁRBITRO — uma folha por DUPLA, por WOD.
 *
 * O formato é o da súmula de papel que a organização já usa: o juiz atende
 * uma dupla de cada vez, com a prancheta dela na mão. Uma tabela com as
 * vinte duplas serviria à mesa de controle, não a quem está no equipamento
 * — e é o juiz que esta folha atende.
 *
 * O MESMO documento serve a dois momentos, e isso é deliberado:
 *
 *   NO PAPEL   impressa antes da bateria, com os campos vazios. O juiz
 *              escreve à mão, à beira do equipamento, onde não há tablet.
 *   NA TELA    os mesmos campos, editáveis, salvando na plataforma.
 *
 * Um <input> vazio imprime como caixa vazia e um preenchido imprime o
 * valor. Então a folha em branco e a de conferência — aquela que a dupla
 * assina de acordo — são o mesmo arquivo em dois momentos.
 *
 * TUDO vem do cadastro do WOD: os movimentos são as provas, a prescrição
 * são os blocos, o objetivo é o resumo, as regras críticas são as regras.
 * Uma etapa com outros workouts gera a súmula dela sozinha.
 */

type Valores = Record<string, { valor: string; atleta1: string; atleta2: string }>;

interface Folha {
  teamId: string;
  atleta1: string;
  atleta2: string;
  concluiu: boolean;
  volume: string;
  observacao: string;
  valores: Valores;
}

function textoDoValor(n: number | null, prova: Prova): string {
  if (n === null) return '';
  if (prova.unidade === 'SEGUNDOS') return formatSeconds(n);
  return String(n).replace('.', ',');
}

function folhasIniciais(snapshot: Snapshot, wod: Wod, times: readonly Team[]): Folha[] {
  const entradas = new Map(
    snapshot.entries.filter((e) => e.wodId === wod.id).map((e) => [e.teamId, e]),
  );
  const lancados = new Map(snapshot.results.map((r) => [`${r.provaId}:${r.teamId}`, r]));

  return times.map((team) => {
    const entrada = entradas.get(team.id);
    const valores: Valores = {};

    for (const prova of wod.provas) {
      if (prova.origem !== 'DIGITADA') continue;
      const r = lancados.get(`${prova.id}:${team.id}`);
      valores[prova.id] = {
        valor: textoDoValor(r?.valor ?? null, prova),
        atleta1: textoDoValor(r?.valorAtleta1 ?? null, prova),
        atleta2: textoDoValor(r?.valorAtleta2 ?? null, prova),
      };
    }

    return {
      teamId: team.id,
      atleta1: team.athlete1,
      atleta2: team.athlete2,
      concluiu: entrada?.concluiu ?? false,
      volume: entrada?.volume == null ? '' : String(entrada.volume),
      observacao: entrada?.observacao ?? '',
      valores,
    };
  });
}

export function Sumula({ snapshot, wod }: { snapshot: Snapshot; wod: Wod }) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [aviso, setAviso] = useState<ActionResult | null>(null);
  /** 0 = todas as baterias. */
  const [bateria, setBateria] = useState(1);

  const digitadas = useMemo(
    () => wod.provas.filter((p) => p.origem === 'DIGITADA'),
    [wod.provas],
  );
  const calculadas = useMemo(
    () => wod.provas.filter((p) => p.origem === 'SOMA'),
    [wod.provas],
  );

  const ativas = useMemo(
    () =>
      [...snapshot.teams]
        .filter((t) => t.status !== 'DESCLASSIFICADA')
        .sort((a, b) => a.teamNumber - b.teamNumber),
    [snapshot.teams],
  );

  const baterias = useMemo(() => {
    const vistas = new Set(ativas.map((t) => t.battery));
    const total = Math.max(snapshot.settings.baterias, ...vistas, 1);
    return Array.from({ length: total }, (_, i) => i + 1);
  }, [ativas, snapshot.settings.baterias]);

  const visiveis = bateria === 0 ? ativas : ativas.filter((t) => t.battery === bateria);

  // A coluna ALVO só existe quando algum bloco tem alvo. No METCON o alvo
  // está dentro do nome do movimento ("120 m Burpee Broad Jumps"), e uma
  // coluna inteira de travessões é pior que coluna nenhuma.
  const temAlvo = wod.blocos.some((b) => (b.detalhe ?? '').trim().length > 0);

  const [folhas, setFolhas] = useState<Folha[]>(() => folhasIniciais(snapshot, wod, ativas));
  const porTime = useMemo(() => new Map(folhas.map((f) => [f.teamId, f])), [folhas]);

  /** O que o sistema já calculou — preenche "resultado oficial" e "pontos". */
  const board = useMemo(() => leaderboardDoSnapshot(snapshot), [snapshot]);

  const mexer = (teamId: string, muda: (f: Folha) => Folha) =>
    setFolhas((atual) => atual.map((f) => (f.teamId === teamId ? muda(f) : f)));

  const salvar = () => {
    const ids = new Set(visiveis.map((t) => t.id));
    const minhas = folhas.filter((f) => ids.has(f.teamId));

    const atletas = minhas.map((f) => ({
      teamId: f.teamId,
      athlete1: f.atleta1,
      athlete2: f.atleta2,
    }));

    const lancamentos = minhas.map((f) => ({
      teamId: f.teamId,
      concluiu: wod.permiteCap ? f.concluiu : true,
      volume: wod.permiteCap ? f.volume || null : null,
      observacao: f.observacao.trim() || null,
      valores: f.valores,
    }));

    startTransition(async () => {
      const nomes = await salvarAtletas(atletas);
      if (!nomes.ok) {
        setAviso(nomes);
        return;
      }
      const r = await salvarLancamentos(wod.id, lancamentos);
      setAviso(r);
      if (r.ok) router.refresh();
    });
  };

  return (
    <div className="space-y-5">
      <Card className="no-print flex flex-wrap items-end justify-between gap-4 p-4">
        <div className="w-full max-w-[240px]">
          <Select
            label="Bateria"
            value={String(bateria)}
            hint={`${visiveis.length} folha${visiveis.length === 1 ? '' : 's'} — uma por dupla`}
            onChange={(e) => setBateria(Number(e.target.value))}
          >
            {baterias.map((b) => (
              <option key={b} value={String(b)}>
                Bateria {b}
              </option>
            ))}
            <option value="0">Todas as baterias</option>
          </Select>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer size={16} /> Imprimir
          </Button>
          <Button onClick={salvar} disabled={pendente}>
            <Save size={16} /> {pendente ? 'Salvando…' : 'Salvar na plataforma'}
          </Button>
        </div>
      </Card>

      {aviso ? (
        <div
          role="status"
          className={`no-print flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm ${
            aviso.ok ? 'bg-emerald-500/12 text-emerald-200' : 'bg-red-500/12 text-red-200'
          }`}
        >
          {aviso.ok ? (
            <CheckCircle2 size={17} className="mt-0.5 shrink-0" />
          ) : (
            <TriangleAlert size={17} className="mt-0.5 shrink-0" />
          )}
          <span>{aviso.message}</span>
        </div>
      ) : null}

      {visiveis.length === 0 ? (
        <p className="no-print text-sm text-white/45">
          Nenhuma dupla nesta bateria. Cadastre as inscrições em Duplas.
        </p>
      ) : null}

      {visiveis.map((team) => {
        const f = porTime.get(team.id);
        const total = board.standings.find((r) => r.team.id === team.id);
        const noWod = total?.wods[wod.id];

        return (
          <article key={team.id} className="sumula-folha surface p-5 sm:p-7">
            {/* ---------------------------------------------- cabeçalho */}
            <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-white/25 pb-3">
              <div className="flex items-start gap-3">
                <BrandLogo size="sm" className="shrink-0" />
                <div>
                <h2 className="font-display text-xl font-black uppercase">
                  {snapshot.event.name} — Súmula
                </h2>
                <p className="mt-0.5 font-display text-sm font-bold text-nacao-cyan uppercase">
                  WOD {String(wod.numero).padStart(2, '0')} — {wod.nome}
                  {wod.formato ? ` | ${wod.formato}` : ''}
                  {capEmTexto(wod.capSegundos) ? ` | CAP ${capEmTexto(wod.capSegundos)}` : ''}
                </p>
                </div>
              </div>
              <p className="text-[11px] text-white/45">{dataCurta(snapshot.event.date)}</p>
            </header>

            {/* ------------------------------------------ identificação */}
            <div className="sumula-rolagem mt-4 overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-[13px]">
              <tbody>
                <tr>
                  <Rotulo>Bateria</Rotulo>
                  <Campo>
                    <span className="font-display font-bold">{team.battery}</span>
                  </Campo>
                  <Rotulo>Dupla</Rotulo>
                  <Campo>
                    <span className="font-display font-bold">
                      {teamNumber(team.teamNumber)} · {team.teamName}
                    </span>
                  </Campo>
                </tr>
                <tr>
                  <Rotulo>Categoria</Rotulo>
                  <Campo>
                    <span className="flex flex-wrap gap-3">
                      {CATEGORIES.map((c) => (
                        <span key={c} className="inline-flex items-center gap-1">
                          <span
                            className={`inline-block size-3 border ${
                              team.category === c
                                ? 'border-nacao-cyan bg-nacao-cyan'
                                : 'border-white/35'
                            }`}
                            aria-hidden="true"
                          />
                          {CATEGORY_LABEL[c]}
                        </span>
                      ))}
                    </span>
                  </Campo>
                  <Rotulo>Juiz</Rotulo>
                  <Campo>
                    {/* Sem campo no banco de propósito: na tela, quem salva
                        fica registrado na auditoria pelo login. No papel,
                        a linha é para o juiz assinar o nome. */}
                    <span className="block h-5 border-b border-dashed border-white/30" />
                  </Campo>
                </tr>
                <tr>
                  <Rotulo>Atleta 1</Rotulo>
                  <Campo>
                    <CampoTexto
                      aria-label={`Atleta 1 da dupla ${team.teamName}`}
                      value={f?.atleta1 ?? ''}
                      onChange={(v) => mexer(team.id, (x) => ({ ...x, atleta1: v }))}
                    />
                  </Campo>
                  <Rotulo>Atleta 2</Rotulo>
                  <Campo>
                    <CampoTexto
                      aria-label={`Atleta 2 da dupla ${team.teamName}`}
                      value={f?.atleta2 ?? ''}
                      onChange={(v) => mexer(team.id, (x) => ({ ...x, atleta2: v }))}
                    />
                  </Campo>
                </tr>
              </tbody>
            </table>
            </div>

            {/* ------------------------------------------------ objetivo */}
            {wod.resumo ? (
              <p className="mt-4 text-[12.5px] leading-snug text-white/70">
                <strong className="font-display font-bold uppercase">Objetivo:</strong>{' '}
                {wod.resumo}
              </p>
            ) : null}

            {wod.regras.length > 0 ? (
              <div className="mt-2 text-[12px] leading-snug text-white/60">
                <strong className="font-display font-bold text-amber-300 uppercase">
                  Regras críticas:
                </strong>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {wod.regras.map((regra, i) => (
                    <li key={i}>{regra}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* ------------------------------------------- o lançamento */}
            <div className="sumula-rolagem mt-4 overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-[13px]">
              <thead>
                <tr className="bg-white/[0.07]">
                  <Th className="w-[40%] text-left">Movimento / prova</Th>
                  <Th>Atleta 1</Th>
                  <Th>Atleta 2</Th>
                  <Th className="w-28">Somatório</Th>
                </tr>
              </thead>
              <tbody>
                {digitadas.map((prova) => {
                  const bloco = wod.blocos.find((b) => b.movimento === prova.descricao);
                  const unidade = UNIDADE_SUFIXO[prova.unidade] || (prova.unidade === 'SEGUNDOS' ? 'mm:ss' : '');
                  const score = board.provas.get(prova.id)?.get(team.id);

                  return (
                    <tr key={prova.id} className="border-b border-white/12">
                      <Td>
                        <span className="font-display font-bold">{prova.descricao}</span>
                        {unidade ? (
                          <span className="text-white/45"> ({unidade})</span>
                        ) : null}
                        {bloco?.janela ? (
                          <span className="ml-2 text-nacao-cyan">{bloco.janela}</span>
                        ) : null}
                        {bloco?.masculino || bloco?.feminino ? (
                          <span className="block text-[11px] text-white/45">
                            {bloco.masculino ? `M ${bloco.masculino}` : ''}
                            {bloco.masculino && bloco.feminino ? ' · ' : ''}
                            {bloco.feminino ? `F ${bloco.feminino}` : ''}
                          </span>
                        ) : null}
                      </Td>

                      {prova.porAtleta ? (
                        <>
                          <Td className="text-center">
                            <CampoNumero
                              aria-label={`${prova.descricao} — atleta 1`}
                              value={f?.valores[prova.id]?.atleta1 ?? ''}
                              onChange={(v) => mexerValor(mexer, team.id, prova.id, 'atleta1', v)}
                            />
                          </Td>
                          <Td className="text-center">
                            <CampoNumero
                              aria-label={`${prova.descricao} — atleta 2`}
                              value={f?.valores[prova.id]?.atleta2 ?? ''}
                              onChange={(v) => mexerValor(mexer, team.id, prova.id, 'atleta2', v)}
                            />
                          </Td>
                        </>
                      ) : (
                        <Td className="text-center" colSpan={2}>
                          <CampoNumero
                            aria-label={`${prova.descricao} — ${team.teamName}`}
                            value={f?.valores[prova.id]?.valor ?? ''}
                            onChange={(v) => mexerValor(mexer, team.id, prova.id, 'valor', v)}
                          />
                        </Td>
                      )}

                      <Td className="text-center">
                        <span className="font-display text-[10px] font-bold tracking-wider text-white/40 uppercase">
                          WOD {prova.codigo}
                        </span>
                        <span className="tnum block font-display text-sm font-bold">
                          {valorDaProva(prova.unidade, score?.valor ?? null)}
                        </span>
                      </Td>
                    </tr>
                  );
                })}

                {/* As provas calculadas não têm campo: o sistema soma. No
                    papel a linha sai vazia, para o juiz conferir a conta. */}
                {calculadas.map((prova) => {
                  const score = board.provas.get(prova.id)?.get(team.id);
                  return (
                    <tr key={prova.id} className="border-b border-white/20 bg-white/[0.05]">
                      <Td>
                        <span className="font-display font-bold uppercase">{prova.descricao}</span>
                        <span className="block text-[11px] text-white/45">
                          {prova.componentes.join(' + ')}
                        </span>
                      </Td>
                      <Td className="text-center" colSpan={2}>
                        <span className="block h-7 border-b border-dashed border-white/25" />
                      </Td>
                      <Td className="text-center">
                        <span className="font-display text-[10px] font-bold tracking-wider text-white/40 uppercase">
                          WOD {prova.codigo}
                        </span>
                        <span className="tnum block font-display text-sm font-black text-nacao-cyan">
                          {valorDaProva(prova.unidade, score?.valor ?? null)}
                        </span>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>

            {/* ------------------------------ etapas, quando há prescrição
                que não é a própria lista de provas (caso do METCON) */}
            {wod.blocos.length > 0 &&
            !wod.blocos.every((b) => digitadas.some((p) => p.descricao === b.movimento)) ? (
              <table className="mt-4 w-full border-collapse text-[13px]">
                <thead>
                  <tr className="bg-white/[0.07]">
                    <Th className="text-left">Etapa</Th>
                    {temAlvo ? <Th>Alvo</Th> : null}
                    <Th className="w-24">Concluído</Th>
                  </tr>
                </thead>
                <tbody>
                  {wod.blocos.map((bloco) => (
                    <tr key={bloco.ordem} className="border-b border-white/12">
                      <Td>
                        <span className="font-display font-bold">{bloco.movimento}</span>
                        {bloco.masculino || bloco.feminino ? (
                          <span className="block text-[11px] text-white/45">
                            {bloco.masculino ? `M ${bloco.masculino}` : ''}
                            {bloco.masculino && bloco.feminino ? ' · ' : ''}
                            {bloco.feminino ? `F ${bloco.feminino}` : ''}
                          </span>
                        ) : null}
                      </Td>
                      {temAlvo ? (
                        <Td className="text-center text-white/55">{bloco.detalhe ?? ''}</Td>
                      ) : null}
                      <Td className="text-center">
                        <span className="mx-auto block size-5 border border-white/35" />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}

            {/* ------------------------------------------ controle final */}
            {wod.permiteCap ? (
              <table className="mt-4 w-full border-collapse text-[13px]">
                <tbody>
                  <tr className="border-b border-white/12">
                    <Rotulo className="w-[45%]">Concluiu dentro do CAP?</Rotulo>
                    <Campo>
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={f?.concluiu ?? false}
                          onChange={(e) =>
                            mexer(team.id, (x) => ({ ...x, concluiu: e.target.checked }))
                          }
                          className="size-5 accent-nacao-cyan"
                        />
                        <span>Sim</span>
                      </label>
                    </Campo>
                  </tr>
                  <tr>
                    <Rotulo>Se não concluiu: volume final</Rotulo>
                    <Campo>
                      <CampoNumero
                        aria-label={`Volume de ${team.teamName}`}
                        value={f?.volume ?? ''}
                        onChange={(v) => mexer(team.id, (x) => ({ ...x, volume: v }))}
                      />
                    </Campo>
                  </tr>
                </tbody>
              </table>
            ) : null}

            {/* -------------------------------------------- observações */}
            <div className="mt-4">
              <p className="font-display text-[11px] font-bold tracking-wider uppercase">
                Observações / penalidades
              </p>
              <textarea
                aria-label={`Observações sobre ${team.teamName}`}
                rows={3}
                value={f?.observacao ?? ''}
                onChange={(e) => mexer(team.id, (x) => ({ ...x, observacao: e.target.value }))}
                className="sumula-obs mt-1.5 w-full rounded-lg border border-white/20 bg-white/[0.04] px-3 py-2 text-[13px] text-white focus:border-nacao-cyan/60 focus:outline-none"
              />
            </div>

            {/* ------------------------------------------- resultado e assinatura */}
            <div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-3 border-t border-white/15 pt-3 text-[12.5px]">
              <span>
                <strong className="font-display font-bold uppercase">
                  Resultado oficial WOD {String(wod.numero).padStart(2, '0')}:
                </strong>{' '}
                <span className="tnum font-display font-bold">
                  {noWod?.hasResult ? points(noWod.points) : '__________'}
                </span>
              </span>
              <span>
                <strong className="font-display font-bold uppercase">Colocação:</strong>{' '}
                <span className="tnum font-display font-bold">
                  {noWod?.rank ? `${noWod.rank}º` : '______'}
                </span>
              </span>
              <span>
                <strong className="font-display font-bold uppercase">Pontos:</strong>{' '}
                <span className="tnum font-display font-bold">
                  {noWod?.hasResult ? points(noWod.points) : '______'}
                </span>
              </span>
            </div>

            <div className="mt-6 grid grid-cols-3 gap-x-5 text-[11px]">
              <Assinatura label="Assinatura / identificação do juiz" />
              <Assinatura label="Atleta 1 — de acordo" />
              <Assinatura label="Atleta 2 — de acordo" />
            </div>

            {wod.pendencias.length > 0 ? (
              <p className="mt-3 text-[10.5px] leading-snug text-white/40">
                {wod.pendencias.join(' · ')}
              </p>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

function mexerValor(
  mexer: (teamId: string, muda: (f: Folha) => Folha) => void,
  teamId: string,
  provaId: string,
  campo: 'valor' | 'atleta1' | 'atleta2',
  v: string,
) {
  mexer(teamId, (f) => ({
    ...f,
    valores: {
      ...f.valores,
      [provaId]: {
        ...(f.valores[provaId] ?? { valor: '', atleta1: '', atleta2: '' }),
        [campo]: v,
      },
    },
  }));
}

/**
 * `text` e não `number`: tempo chega "14:32", carga chega "137,5", e um
 * input numérico recusa os dois. A conversão é do servidor, que é quem
 * conhece a unidade da prova.
 */
function CampoNumero({
  value,
  onChange,
  ...rest
}: {
  value: string;
  onChange: (v: string) => void;
  'aria-label': string;
}) {
  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="tnum h-9 w-24 rounded-lg border border-white/20 bg-white/[0.06] px-2 text-center font-display text-sm font-bold text-white focus:border-nacao-cyan/60 focus:outline-none"
    />
  );
}

function CampoTexto({
  value,
  onChange,
  ...rest
}: {
  value: string;
  onChange: (v: string) => void;
  'aria-label': string;
}) {
  return (
    <input
      {...rest}
      type="text"
      autoComplete="off"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="sumula-nome h-8 w-full rounded-lg border border-white/15 bg-white/[0.04] px-2 text-[13px] text-white focus:border-nacao-cyan/60 focus:outline-none"
    />
  );
}

function Assinatura({ label }: { label: string }) {
  return (
    <div>
      <span className="block h-8 border-b border-white/40" />
      <span className="mt-1 block text-white/50">{label}</span>
    </div>
  );
}

function Rotulo({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      scope="row"
      className={`w-[16%] border border-white/15 bg-white/[0.06] px-2.5 py-1.5 text-left font-display text-[11px] font-bold tracking-wider uppercase ${className}`}
    >
      {children}
    </th>
  );
}

function Campo({ children }: { children: React.ReactNode }) {
  return <td className="border border-white/15 px-2.5 py-1.5 align-middle">{children}</td>;
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={`border border-white/15 px-2.5 py-1.5 text-center font-display text-[11px] font-bold tracking-wider uppercase ${className}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className = '',
  colSpan,
}: {
  children: React.ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td colSpan={colSpan} className={`border border-white/15 px-2.5 py-2 align-middle ${className}`}>
      {children}
    </td>
  );
}
