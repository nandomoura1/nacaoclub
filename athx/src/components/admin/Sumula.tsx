'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Printer, Save, TriangleAlert } from 'lucide-react';
import type { Snapshot } from '@/services/snapshot';
import type { Team } from '@/types/domain';
import { CATEGORY_SHORT } from '@/types/domain';
import type { Prova, Wod } from '@/types/wod';
import { UNIDADE_SUFIXO, capEmTexto } from '@/types/wod';
import { salvarAtletas, salvarLancamentos } from '@/app/admin/actions';
import type { ActionResult } from '@/app/admin/actions';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Input';
import { formatSeconds } from '@/lib/time';
import { teamNumber } from '@/lib/format';

/**
 * A SÚMULA DO ÁRBITRO.
 *
 * É UM documento que serve a dois momentos, de propósito:
 *
 *   NA PRANCHETA   impressa antes da bateria, com a prescrição do workout e
 *                  os campos vazios. O juiz escreve à mão, à beira do
 *                  equipamento, onde não há tablet nem sinal.
 *
 *   NA TELA        os mesmos campos, editáveis, salvando direto na
 *                  plataforma. Quem lança pelo app não precisa de papel.
 *
 * Por que o mesmo componente faz as duas coisas: um `<input>` vazio imprime
 * como uma caixa vazia, e um preenchido imprime o valor. Então a folha em
 * branco e a folha de conferência são o mesmo arquivo em dois momentos — e
 * não existe risco de o papel e a tela discordarem de layout.
 *
 * Uma folha por BATERIA, porque é assim que a competição acontece: o juiz
 * fica num equipamento e as duplas passam por ele em grupos.
 */

/** Um valor por prova, como texto — é o que o input dá e o servidor converte. */
type Valores = Record<string, { valor: string; atleta1: string; atleta2: string }>;

interface Linha {
  teamId: string;
  concluiu: boolean;
  volume: string;
  valores: Valores;
  /** Quem de fato competiu. O juiz confirma com as duas pessoas na frente dele. */
  atleta1: string;
  atleta2: string;
}

/** Monta o estado inicial a partir do que já está lançado. */
function linhasIniciais(snapshot: Snapshot, wod: Wod, times: readonly Team[]): Linha[] {
  const entradas = new Map(
    snapshot.entries.filter((e) => e.wodId === wod.id).map((e) => [e.teamId, e]),
  );

  const lancados = new Map(
    snapshot.results.map((r) => [`${r.provaId}:${r.teamId}`, r]),
  );

  const texto = (n: number | null, prova: Prova): string => {
    if (n === null) return '';
    if (prova.unidade === 'SEGUNDOS') return formatSeconds(n);
    return String(n).replace('.', ',');
  };

  return times.map((team) => {
    const entrada = entradas.get(team.id);
    const valores: Valores = {};

    for (const prova of wod.provas) {
      if (prova.origem !== 'DIGITADA') continue;
      const r = lancados.get(`${prova.id}:${team.id}`);
      valores[prova.id] = {
        valor: texto(r?.valor ?? null, prova),
        atleta1: texto(r?.valorAtleta1 ?? null, prova),
        atleta2: texto(r?.valorAtleta2 ?? null, prova),
      };
    }

    return {
      teamId: team.id,
      concluiu: entrada?.concluiu ?? false,
      volume: entrada?.volume === null || entrada?.volume === undefined ? '' : String(entrada.volume),
      valores,
      atleta1: team.athlete1,
      atleta2: team.athlete2,
    };
  });
}

export function Sumula({ snapshot, wod }: { snapshot: Snapshot; wod: Wod }) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [aviso, setAviso] = useState<ActionResult | null>(null);

  /** 0 = imprimir todas as baterias, uma folha cada. */
  const [bateria, setBateria] = useState(1);

  const digitadas = useMemo(
    () => wod.provas.filter((p) => p.origem === 'DIGITADA'),
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

  const folhas = bateria === 0 ? baterias : [bateria];

  const [linhas, setLinhas] = useState<Linha[]>(() =>
    linhasIniciais(snapshot, wod, ativas),
  );

  const porTime = useMemo(() => new Map(linhas.map((l) => [l.teamId, l])), [linhas]);

  const mexer = (teamId: string, muda: (l: Linha) => Linha) =>
    setLinhas((atual) => atual.map((l) => (l.teamId === teamId ? muda(l) : l)));

  /** Salva só as duplas das folhas abertas — não mexe nas outras baterias. */
  const salvar = () => {
    const idsVisiveis = new Set(
      ativas.filter((t) => folhas.includes(t.battery)).map((t) => t.id),
    );

    const payload = linhas
      .filter((l) => idsVisiveis.has(l.teamId))
      .map((l) => ({
        teamId: l.teamId,
        concluiu: wod.permiteCap ? l.concluiu : true,
        volume: wod.permiteCap ? l.volume || null : null,
        valores: l.valores,
      }));

    // Nomes e resultados são tabelas diferentes. Os nomes vão primeiro:
    // se o lançamento falhar, pelo menos a correção de quem competiu ficou
    // gravada, e o juiz não redigita tudo.
    const atletas = linhas
      .filter((l) => idsVisiveis.has(l.teamId))
      .map((l) => ({ teamId: l.teamId, athlete1: l.atleta1, athlete2: l.atleta2 }));

    startTransition(async () => {
      const nomes = await salvarAtletas(atletas);
      if (!nomes.ok) {
        setAviso(nomes);
        return;
      }

      const r = await salvarLancamentos(wod.id, payload);
      setAviso(r);
      if (r.ok) router.refresh();
    });
  };

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------ barra de controle */}
      <Card className="no-print flex flex-wrap items-end justify-between gap-4 p-4">
        <div className="w-full max-w-[220px]">
          <Select
            label="Bateria"
            value={String(bateria)}
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

      <p className="no-print text-xs text-white/45">
        Imprima antes da bateria para o juiz preencher à mão, ou digite aqui mesmo e salve. O que
        já estiver lançado aparece nos campos — então a folha impressa depois do lançamento serve
        de conferência para a dupla assinar.
      </p>

      {/* ------------------------------------------------------- as folhas */}
      {folhas.map((b) => {
        const daBateria = ativas.filter((t) => t.battery === b);

        return (
          <article key={b} className="sumula-folha surface p-4 sm:p-6">
            {/* Cabeçalho da folha */}
            <header className="border-b border-white/15 pb-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-display text-[10px] font-bold tracking-kicker text-nacao-cyan uppercase">
                    Súmula do árbitro
                  </p>
                  <h2 className="mt-1 font-display text-xl font-black uppercase">
                    WOD {wod.numero} — {wod.nome}
                  </h2>
                  <p className="mt-1 text-[13px] text-white/60">
                    {snapshot.event.name} ·{' '}
                    {new Date(`${snapshot.event.date}T12:00:00`).toLocaleDateString('pt-BR')}
                  </p>
                </div>

                <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-[13px]">
                  <dt className="text-white/50">Bateria</dt>
                  <dd className="font-display font-bold">{b}</dd>
                  {wod.formato ? (
                    <>
                      <dt className="text-white/50">Formato</dt>
                      <dd className="font-display font-bold">{wod.formato}</dd>
                    </>
                  ) : null}
                  {capEmTexto(wod.capSegundos) ? (
                    <>
                      <dt className="text-white/50">Tempo limite</dt>
                      <dd className="font-display font-bold">{capEmTexto(wod.capSegundos)}</dd>
                    </>
                  ) : null}
                  <dt className="text-white/50">Juiz</dt>
                  <dd className="min-w-[140px] border-b border-dashed border-white/35">&nbsp;</dd>
                </dl>
              </div>
            </header>

            {/* A prescrição: é para isto que o juiz olha quando a dupla
                pergunta "quantas repetições?" no meio da prova. */}
            {wod.blocos.length > 0 ? (
              <section className="mt-4">
                <h3 className="font-display text-[10px] font-bold tracking-wider text-white/50 uppercase">
                  O workout
                </h3>
                <ol className="mt-2 space-y-1.5">
                  {wod.blocos.map((bloco) => (
                    <li key={bloco.ordem} className="flex flex-wrap gap-x-2 text-[13px]">
                      {bloco.janela ? (
                        <span className="font-display font-bold text-nacao-cyan">
                          {bloco.janela}
                        </span>
                      ) : null}
                      <span className="font-display font-bold">{bloco.movimento}</span>
                      {bloco.masculino || bloco.feminino ? (
                        <span className="text-white/55">
                          ({bloco.masculino ? `M ${bloco.masculino}` : ''}
                          {bloco.masculino && bloco.feminino ? ' · ' : ''}
                          {bloco.feminino ? `F ${bloco.feminino}` : ''})
                        </span>
                      ) : null}
                      {bloco.detalhe ? (
                        <span className="text-white/45">— {bloco.detalhe}</span>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}

            {/* A tabela de lançamento */}
            {daBateria.length === 0 ? (
              <p className="mt-5 text-sm text-white/45">
                Nenhuma dupla inscrita na bateria {b}.
              </p>
            ) : (
              <div className="mt-5 overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <caption className="sr-only">
                    Lançamento do WOD {wod.numero}, bateria {b}
                  </caption>
                  <thead>
                    <tr className="border-b border-white/20">
                      <Th className="w-10">Nº</Th>
                      <Th>Dupla e atletas</Th>
                      {digitadas.map((prova) => (
                        <Th key={prova.id} className="text-center">
                          {prova.codigo}
                          <span className="block font-normal normal-case text-white/45">
                            {prova.descricao}
                            {UNIDADE_SUFIXO[prova.unidade]
                              ? ` (${UNIDADE_SUFIXO[prova.unidade]})`
                              : prova.unidade === 'SEGUNDOS'
                                ? ' (mm:ss)'
                                : ''}
                          </span>
                        </Th>
                      ))}
                      {wod.permiteCap ? (
                        <>
                          <Th className="text-center">Concluiu?</Th>
                          <Th className="text-center">Volume</Th>
                        </>
                      ) : null}
                      <Th className="w-24 text-center">Visto</Th>
                    </tr>
                  </thead>

                  <tbody>
                    {daBateria.map((team) => {
                      const linha = porTime.get(team.id);

                      return (
                        <tr key={team.id} className="border-b border-white/10">
                          <Td className="tnum font-display font-bold text-nacao-sky">
                            {teamNumber(team.teamNumber)}
                          </Td>

                          <Td>
                            <span className="block font-display text-sm font-bold">
                              {team.teamName}{' '}
                              <span className="font-normal text-white/45">
                                {CATEGORY_SHORT[team.category]}
                              </span>
                            </span>
                            {/* O nome é campo, não texto fixo. A dupla pode
                                estar inscrita sem os nomes, ou ter trocado de
                                parceiro na véspera — e quem sabe a verdade é o
                                juiz, com as duas pessoas na frente dele. */}
                            <span className="mt-1 flex flex-wrap items-center gap-1.5">
                              <CampoNome
                                aria-label={`Atleta 1 da dupla ${team.teamName}`}
                                placeholder="Atleta 1"
                                value={linha?.atleta1 ?? ''}
                                onChange={(v) => mexer(team.id, (l) => ({ ...l, atleta1: v }))}
                              />
                              <span className="text-white/25">·</span>
                              <CampoNome
                                aria-label={`Atleta 2 da dupla ${team.teamName}`}
                                placeholder="Atleta 2"
                                value={linha?.atleta2 ?? ''}
                                onChange={(v) => mexer(team.id, (l) => ({ ...l, atleta2: v }))}
                              />
                            </span>
                          </Td>

                          {digitadas.map((prova) => (
                            <Td key={prova.id} className="text-center">
                              {prova.porAtleta ? (
                                <span className="flex items-center justify-center gap-1">
                                  <CampoSumula
                                    aria-label={`${prova.descricao} — ${team.athlete1 || 'atleta 1'}`}
                                    value={linha?.valores[prova.id]?.atleta1 ?? ''}
                                    onChange={(v) =>
                                      mexer(team.id, (l) => ({
                                        ...l,
                                        valores: {
                                          ...l.valores,
                                          [prova.id]: {
                                            ...(l.valores[prova.id] ?? {
                                              valor: '',
                                              atleta1: '',
                                              atleta2: '',
                                            }),
                                            atleta1: v,
                                          },
                                        },
                                      }))
                                    }
                                  />
                                  <span className="text-white/25">+</span>
                                  <CampoSumula
                                    aria-label={`${prova.descricao} — ${team.athlete2 || 'atleta 2'}`}
                                    value={linha?.valores[prova.id]?.atleta2 ?? ''}
                                    onChange={(v) =>
                                      mexer(team.id, (l) => ({
                                        ...l,
                                        valores: {
                                          ...l.valores,
                                          [prova.id]: {
                                            ...(l.valores[prova.id] ?? {
                                              valor: '',
                                              atleta1: '',
                                              atleta2: '',
                                            }),
                                            atleta2: v,
                                          },
                                        },
                                      }))
                                    }
                                  />
                                </span>
                              ) : (
                                <CampoSumula
                                  aria-label={`${prova.descricao} — ${team.teamName}`}
                                  value={linha?.valores[prova.id]?.valor ?? ''}
                                  onChange={(v) =>
                                    mexer(team.id, (l) => ({
                                      ...l,
                                      valores: {
                                        ...l.valores,
                                        [prova.id]: {
                                          ...(l.valores[prova.id] ?? {
                                            valor: '',
                                            atleta1: '',
                                            atleta2: '',
                                          }),
                                          valor: v,
                                        },
                                      },
                                    }))
                                  }
                                />
                              )}
                            </Td>
                          ))}

                          {wod.permiteCap ? (
                            <>
                              <Td className="text-center">
                                <input
                                  type="checkbox"
                                  aria-label={`${team.teamName} concluiu`}
                                  checked={linha?.concluiu ?? false}
                                  onChange={(e) =>
                                    mexer(team.id, (l) => ({ ...l, concluiu: e.target.checked }))
                                  }
                                  className="size-5 accent-nacao-cyan"
                                />
                              </Td>
                              <Td className="text-center">
                                <CampoSumula
                                  aria-label={`Volume de ${team.teamName}`}
                                  value={linha?.volume ?? ''}
                                  onChange={(v) => mexer(team.id, (l) => ({ ...l, volume: v }))}
                                />
                              </Td>
                            </>
                          ) : null}

                          {/* Assinatura do juiz, linha a linha: é o que
                              transforma o papel em documento. */}
                          <Td>
                            <span className="block h-7 border-b border-dashed border-white/30" />
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Regras e pendências — o juiz decide no calor da hora */}
            {wod.regras.length > 0 ? (
              <section className="mt-5 border-t border-white/12 pt-4">
                <h3 className="font-display text-[10px] font-bold tracking-wider text-white/50 uppercase">
                  Regras
                </h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-[12px] text-white/60">
                  {wod.regras.map((regra, i) => (
                    <li key={i}>{regra}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            <footer className="mt-6 flex flex-wrap gap-x-10 gap-y-5 border-t border-white/12 pt-5 text-[12px]">
              <Assinatura label="Assinatura do juiz" />
              <Assinatura label="Atleta 1 — de acordo" />
              <Assinatura label="Atleta 2 — de acordo" />
              <Assinatura label="Hora" largura="w-24" />
            </footer>
          </article>
        );
      })}
    </div>
  );
}

/**
 * O campo da súmula.
 *
 * `text` e não `number` de propósito: tempo chega "14:32", carga chega
 * "137,5", e um input numérico recusa os dois. A conversão é do servidor,
 * que é quem sabe a unidade da prova.
 */
function CampoSumula({
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
      className="tnum h-9 w-[72px] rounded-lg border border-white/20 bg-white/[0.06] px-2 text-center font-display text-sm font-bold text-white focus:border-nacao-cyan/60 focus:bg-white/[0.1] focus:outline-none"
    />
  );
}

/** Campo de nome: largo, porque nome de gente não cabe em 72 px. */
function CampoNome({
  value,
  onChange,
  placeholder,
  ...rest
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  'aria-label': string;
}) {
  return (
    <input
      {...rest}
      type="text"
      autoComplete="off"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="sumula-nome h-8 w-[136px] rounded-lg border border-white/15 bg-white/[0.04] px-2 text-[12px] text-white/85 placeholder:text-white/30 focus:border-nacao-cyan/60 focus:bg-white/[0.09] focus:outline-none"
    />
  );
}

function Assinatura({ label, largura = 'w-52' }: { label: string; largura?: string }) {
  return (
    <div className={largura}>
      <span className="block h-8 border-b border-white/40" />
      <span className="mt-1 block text-white/50">{label}</span>
    </div>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={`px-2 py-2 align-bottom font-display text-[10px] font-bold tracking-wider text-white/55 uppercase ${className}`}
    >
      {children}
    </th>
  );
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-2 py-2 align-middle ${className}`}>{children}</td>;
}
