'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowDown,
  ArrowUp,
  Calculator,
  Pencil,
  Plus,
  Save,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import type { AgendaItem, Prova, Wod } from '@/types/wod';
import {
  DIRECAO_LABEL,
  DIRECOES,
  ORIGEM_LABEL,
  ORIGENS,
  UNIDADES,
  UNIDADE_LABEL,
  capEmTexto,
} from '@/types/wod';
import {
  excluirProva,
  excluirWod,
  salvarAgenda,
  salvarProva,
  salvarWod,
} from '@/app/admin/actions';
import type { ActionResult } from '@/app/admin/actions';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import { Input, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';

/**
 * A TELA QUE MONTA O EVENTO.
 *
 * Aqui a organização cria os workouts e as provas de cada um, sem
 * programador: nome, formato, CAP, prescrição, regras, e para cada prova a
 * unidade, a direção (maior ou menor vence), se é lançada por atleta e se
 * ela soma outras provas.
 *
 * O motor de pontuação lê este cadastro. Nada aqui é enfeite: trocar a
 * direção de uma prova muda a classificação na próxima leitura.
 */

/* ==========================================================================
   FORMULÁRIO DO WOD
   ========================================================================== */

interface WodForm {
  id: string | null;
  numero: string;
  nome: string;
  formato: string;
  capMinutos: string;
  resumo: string;
  permiteCap: boolean;
  regras: string;
  pendencias: string;
  blocos: { janela: string; movimento: string; detalhe: string; masculino: string; feminino: string }[];
}

function wodParaForm(wod: Wod | null, proximoNumero: number): WodForm {
  if (!wod) {
    return {
      id: null,
      numero: String(proximoNumero),
      nome: '',
      formato: '',
      capMinutos: '',
      resumo: '',
      permiteCap: false,
      regras: '',
      pendencias: '',
      blocos: [],
    };
  }

  return {
    id: wod.id,
    numero: String(wod.numero),
    nome: wod.nome,
    formato: wod.formato ?? '',
    capMinutos: wod.capSegundos === null ? '' : String(Math.round(wod.capSegundos / 60)),
    resumo: wod.resumo ?? '',
    permiteCap: wod.permiteCap,
    regras: wod.regras.join('\n'),
    pendencias: wod.pendencias.join('\n'),
    blocos: wod.blocos.map((b) => ({
      janela: b.janela,
      movimento: b.movimento,
      detalhe: b.detalhe ?? '',
      masculino: b.masculino ?? '',
      feminino: b.feminino ?? '',
    })),
  };
}

const linhas = (texto: string) =>
  texto
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

/* ==========================================================================
   FORMULÁRIO DA PROVA
   ========================================================================== */

interface ProvaForm {
  id: string | null;
  wodId: string;
  codigo: string;
  descricao: string;
  criterio: string;
  unidade: Prova['unidade'];
  direcao: Prova['direcao'];
  origem: Prova['origem'];
  porAtleta: boolean;
  componentes: string[];
  pontua: boolean;
  ordem: number;
}

function provaParaForm(wod: Wod, prova: Prova | null): ProvaForm {
  if (!prova) {
    return {
      id: null,
      wodId: wod.id,
      codigo: `${wod.numero}${String.fromCharCode(65 + wod.provas.length)}`,
      descricao: '',
      criterio: '',
      unidade: 'KG',
      direcao: 'MAIOR_VENCE',
      origem: 'DIGITADA',
      porAtleta: false,
      componentes: [],
      pontua: true,
      ordem: wod.provas.length + 1,
    };
  }

  return {
    id: prova.id,
    wodId: prova.wodId,
    codigo: prova.codigo,
    descricao: prova.descricao,
    criterio: prova.criterio ?? '',
    unidade: prova.unidade,
    direcao: prova.direcao,
    origem: prova.origem,
    porAtleta: prova.porAtleta,
    componentes: prova.componentes,
    pontua: prova.pontua,
    ordem: prova.ordem,
  };
}

/* ==========================================================================
   A TELA
   ========================================================================== */

export function WodsManager({ wods, agenda }: { wods: Wod[]; agenda: AgendaItem[] }) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [aviso, setAviso] = useState<ActionResult | null>(null);

  const [editandoWod, setEditandoWod] = useState<WodForm | null>(null);
  const [editandoProva, setEditandoProva] = useState<ProvaForm | null>(null);
  const [excluindo, setExcluindo] = useState<
    { tipo: 'wod'; wod: Wod } | { tipo: 'prova'; prova: Prova; wod: Wod } | null
  >(null);

  const proximoNumero = useMemo(
    () => (wods.length === 0 ? 1 : Math.max(...wods.map((w) => w.numero)) + 1),
    [wods],
  );

  function executar(acao: () => Promise<ActionResult>, aoTerminar?: () => void) {
    setAviso(null);
    startTransition(async () => {
      const resultado = await acao();
      setAviso(resultado);
      if (resultado.ok) {
        aoTerminar?.();
        router.refresh();
      }
    });
  }

  function salvarOWod() {
    if (!editandoWod) return;
    const f = editandoWod;
    const minutos = Number(f.capMinutos.replace(',', '.'));

    executar(
      () =>
        salvarWod({
          id: f.id,
          numero: Number(f.numero),
          nome: f.nome,
          formato: f.formato.trim() || null,
          capSegundos: Number.isFinite(minutos) && minutos > 0 ? Math.round(minutos * 60) : null,
          resumo: f.resumo.trim() || null,
          permiteCap: f.permiteCap,
          regras: linhas(f.regras),
          pendencias: linhas(f.pendencias),
          ordem: Number(f.numero),
          blocos: f.blocos.map((b, i) => ({
            ordem: i + 1,
            janela: b.janela,
            movimento: b.movimento,
            detalhe: b.detalhe.trim() || null,
            masculino: b.masculino.trim() || null,
            feminino: b.feminino.trim() || null,
          })),
        }),
      () => setEditandoWod(null),
    );
  }

  function salvarAProva() {
    if (!editandoProva) return;
    const f = editandoProva;

    executar(
      () =>
        salvarProva({
          id: f.id,
          wodId: f.wodId,
          codigo: f.codigo,
          descricao: f.descricao,
          criterio: f.criterio.trim() || null,
          unidade: f.unidade,
          direcao: f.direcao,
          origem: f.origem,
          porAtleta: f.origem === 'SOMA' ? false : f.porAtleta,
          componentes: f.origem === 'SOMA' ? f.componentes : [],
          pontua: f.pontua,
          ordem: f.ordem,
        }),
      () => setEditandoProva(null),
    );
  }

  const wodDaProva = editandoProva
    ? wods.find((w) => w.id === editandoProva.wodId)
    : undefined;

  return (
    <div className="space-y-6">
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-white/55">
          O evento é montado aqui. Cada workout tem as provas que a organização quiser, e é o
          cadastro da prova — unidade, direção, origem — que diz ao sistema como pontuar.
        </p>
        <Button onClick={() => setEditandoWod(wodParaForm(null, proximoNumero))}>
          <Plus size={16} aria-hidden="true" />
          Novo WOD
        </Button>
      </div>

      {wods.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="font-display font-bold uppercase">Nenhum workout cadastrado</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-white/50">
            Crie o primeiro WOD e, dentro dele, as provas que geram ranking. Sem provas, não há
            o que pontuar.
          </p>
        </Card>
      ) : null}

      {/* ---- Um cartão por WOD -------------------------------------------- */}
      {wods.map((wod) => {
        const cap = capEmTexto(wod.capSegundos);

        return (
          <Card key={wod.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-display text-[10px] font-bold tracking-kicker text-nacao-cyan uppercase">
                  {[wod.formato, cap ? `CAP ${cap}` : 'Sem CAP'].filter(Boolean).join(' · ')}
                </p>
                <h2 className="mt-1 font-display text-2xl font-black uppercase">
                  WOD {wod.numero} — {wod.nome}
                </h2>
                {wod.resumo ? (
                  <p className="mt-1 max-w-2xl text-sm text-white/55">{wod.resumo}</p>
                ) : null}
                <p className="mt-2 flex flex-wrap gap-1.5">
                  {wod.permiteCap ? <Badge tone="warn">Pode não concluir</Badge> : null}
                  <Badge tone="neutral">
                    {wod.provas.length} prova{wod.provas.length === 1 ? '' : 's'}
                  </Badge>
                  {wod.blocos.length > 0 ? (
                    <Badge tone="neutral">{wod.blocos.length} blocos</Badge>
                  ) : null}
                  {wod.pendencias.length > 0 ? (
                    <Badge tone="warn">{wod.pendencias.length} pendências</Badge>
                  ) : null}
                </p>
              </div>

              <div className="flex shrink-0 gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setEditandoWod(wodParaForm(wod, proximoNumero))}
                >
                  <Pencil size={14} aria-hidden="true" />
                  Editar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setExcluindo({ tipo: 'wod', wod })}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </Button>
              </div>
            </div>

            {/* ---- As provas deste WOD -------------------------------------- */}
            <div className="mt-4 border-t border-white/10 pt-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-display text-[10px] font-bold tracking-kicker text-white/45 uppercase">
                  Provas que pontuam
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setEditandoProva(provaParaForm(wod, null))}
                >
                  <Plus size={14} aria-hidden="true" />
                  Nova prova
                </Button>
              </div>

              {wod.provas.length === 0 ? (
                <p className="mt-3 text-sm text-white/40">
                  Nenhuma prova ainda. Um WOD sem provas não gera pontuação.
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-white/[0.07]">
                  {wod.provas.map((prova) => (
                    <li
                      key={prova.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2">
                          <span className="font-display text-sm font-bold text-nacao-sky">
                            {prova.codigo}
                          </span>
                          <span className="font-display text-sm font-bold">
                            {prova.descricao}
                          </span>
                          {prova.origem === 'SOMA' ? (
                            <Badge tone="cyan">
                              <Calculator size={11} aria-hidden="true" />
                              {prova.componentes.join(' + ')}
                            </Badge>
                          ) : null}
                          {prova.porAtleta ? <Badge tone="neutral">por atleta</Badge> : null}
                          {prova.pontua ? null : <Badge tone="warn">não pontua</Badge>}
                        </p>
                        <p className="text-[11px] text-white/40">
                          {UNIDADE_LABEL[prova.unidade]} · {DIRECAO_LABEL[prova.direcao]}
                        </p>
                      </div>

                      <div className="flex shrink-0 gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditandoProva(provaParaForm(wod, prova))}
                        >
                          <Pencil size={13} aria-hidden="true" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setExcluindo({ tipo: 'prova', prova, wod })}
                        >
                          <Trash2 size={13} aria-hidden="true" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        );
      })}

      <AgendaEditor
        agenda={agenda}
        wods={wods}
        pendente={pendente}
        onSalvar={(itens) => executar(() => salvarAgenda(itens))}
      />

      {/* ====================================================================
          Formulário do WOD
          ==================================================================== */}
      <Modal
        open={editandoWod !== null}
        onClose={() => setEditandoWod(null)}
        title={editandoWod?.id ? `Editar WOD ${editandoWod.numero}` : 'Novo WOD'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditandoWod(null)}>
              Cancelar
            </Button>
            <Button onClick={salvarOWod} disabled={pendente || !editandoWod?.nome.trim()}>
              <Save size={16} aria-hidden="true" />
              Salvar
            </Button>
          </>
        }
      >
        {editandoWod ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input
                id="wod-numero"
                label="Número"
                type="number"
                min={1}
                value={editandoWod.numero}
                onChange={(e) => setEditandoWod({ ...editandoWod, numero: e.target.value })}
                hint="Define a ordem e o prefixo dos códigos das provas"
              />
              <Input
                id="wod-nome"
                label="Nome"
                value={editandoWod.nome}
                onChange={(e) => setEditandoWod({ ...editandoWod, nome: e.target.value })}
                placeholder="STRENGTH"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input
                id="wod-formato"
                label="Formato"
                value={editandoWod.formato}
                onChange={(e) => setEditandoWod({ ...editandoWod, formato: e.target.value })}
                placeholder="AMRAP 22'"
              />
              <Input
                id="wod-cap"
                label="CAP (minutos)"
                type="number"
                min={0}
                value={editandoWod.capMinutos}
                onChange={(e) => setEditandoWod({ ...editandoWod, capMinutos: e.target.value })}
                hint="Vazio = sem tempo limite"
              />
            </div>

            <div>
              <label
                htmlFor="wod-resumo"
                className="mb-1.5 block font-display text-[11px] font-bold tracking-wider text-white/60 uppercase"
              >
                Resumo
              </label>
              <textarea
                id="wod-resumo"
                rows={3}
                value={editandoWod.resumo}
                onChange={(e) => setEditandoWod({ ...editandoWod, resumo: e.target.value })}
                className="w-full rounded-xl border border-white/15 bg-white/[0.06] px-3.5 py-2.5 text-sm text-white placeholder:text-white/35 focus:border-nacao-cyan/60"
                placeholder="Como o workout funciona, em uma ou duas frases."
              />
            </div>

            <label className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm">
              <input
                type="checkbox"
                checked={editandoWod.permiteCap}
                onChange={(e) =>
                  setEditandoWod({ ...editandoWod, permiteCap: e.target.checked })
                }
                className="mt-0.5 h-4 w-4 accent-nacao-cyan"
              />
              <span>
                <strong className="font-display font-bold uppercase">
                  A dupla pode não concluir
                </strong>
                <span className="block text-xs text-white/50">
                  Liga o campo “concluiu” e o volume parcial no lançamento, e faz a política de
                  incompletos (Configurações) valer para as provas deste WOD. Marque em workout
                  FOR TIME com tempo limite.
                </span>
              </span>
            </label>

            <ListaDeTextos
              id="wod-regras"
              label="Regras de execução"
              hint="Uma por linha"
              value={editandoWod.regras}
              onChange={(v) => setEditandoWod({ ...editandoWod, regras: v })}
            />

            <ListaDeTextos
              id="wod-pendencias"
              label="Regras ainda não definidas"
              hint="Uma por linha. Aparecem declaradas na página do WOD, em vez de inventadas."
              value={editandoWod.pendencias}
              onChange={(v) => setEditandoWod({ ...editandoWod, pendencias: v })}
            />

            <BlocosEditor
              blocos={editandoWod.blocos}
              onChange={(blocos) => setEditandoWod({ ...editandoWod, blocos })}
            />
          </div>
        ) : null}
      </Modal>

      {/* ====================================================================
          Formulário da prova
          ==================================================================== */}
      <Modal
        open={editandoProva !== null}
        onClose={() => setEditandoProva(null)}
        title={editandoProva?.id ? `Editar prova ${editandoProva.codigo}` : 'Nova prova'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditandoProva(null)}>
              Cancelar
            </Button>
            <Button
              onClick={salvarAProva}
              disabled={pendente || !editandoProva?.descricao.trim()}
            >
              <Save size={16} aria-hidden="true" />
              Salvar
            </Button>
          </>
        }
      >
        {editandoProva ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <Input
                id="prova-codigo"
                label="Código"
                value={editandoProva.codigo}
                onChange={(e) =>
                  setEditandoProva({ ...editandoProva, codigo: e.target.value.toUpperCase() })
                }
                hint="1A, 2C…"
              />
              <div className="col-span-2">
                <Input
                  id="prova-descricao"
                  label="Descrição"
                  value={editandoProva.descricao}
                  onChange={(e) =>
                    setEditandoProva({ ...editandoProva, descricao: e.target.value })
                  }
                  placeholder="1RM Strict Press"
                />
              </div>
            </div>

            <Input
              id="prova-criterio"
              label="Critério (texto exibido na página do WOD)"
              value={editandoProva.criterio}
              onChange={(e) => setEditandoProva({ ...editandoProva, criterio: e.target.value })}
              placeholder="Soma dos dois atletas · maior vence"
            />

            <div className="grid grid-cols-2 gap-3">
              <Select
                id="prova-unidade"
                label="Unidade"
                value={editandoProva.unidade}
                onChange={(e) =>
                  setEditandoProva({
                    ...editandoProva,
                    unidade: e.target.value as Prova['unidade'],
                  })
                }
              >
                {UNIDADES.map((u) => (
                  <option key={u} value={u}>
                    {UNIDADE_LABEL[u]}
                  </option>
                ))}
              </Select>

              <Select
                id="prova-direcao"
                label="Quem vence"
                value={editandoProva.direcao}
                onChange={(e) =>
                  setEditandoProva({
                    ...editandoProva,
                    direcao: e.target.value as Prova['direcao'],
                  })
                }
              >
                {DIRECOES.map((d) => (
                  <option key={d} value={d}>
                    {DIRECAO_LABEL[d]}
                  </option>
                ))}
              </Select>
            </div>

            <Select
              id="prova-origem"
              label="De onde vem o número"
              value={editandoProva.origem}
              onChange={(e) =>
                setEditandoProva({
                  ...editandoProva,
                  origem: e.target.value as Prova['origem'],
                  porAtleta: e.target.value === 'SOMA' ? false : editandoProva.porAtleta,
                })
              }
            >
              {ORIGENS.map((o) => (
                <option key={o} value={o}>
                  {ORIGEM_LABEL[o]}
                </option>
              ))}
            </Select>

            {editandoProva.origem === 'SOMA' ? (
              <div className="rounded-xl border border-nacao-cyan/25 bg-nacao-cyan/[0.06] px-3.5 py-3">
                <p className="font-display text-[10px] font-bold tracking-wider text-nacao-cyan uppercase">
                  Somar quais provas
                </p>
                <p className="mt-1 text-xs text-white/55">
                  Só provas lançadas pelo juiz podem entrar na soma — somar uma prova calculada
                  criaria uma conta de uma conta.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(wodDaProva?.provas ?? [])
                    .filter((p) => p.origem === 'DIGITADA' && p.id !== editandoProva.id)
                    .map((p) => {
                      const marcada = editandoProva.componentes.includes(p.codigo);
                      return (
                        <label
                          key={p.id}
                          className={`cursor-pointer rounded-lg border px-2.5 py-1.5 text-xs ${
                            marcada
                              ? 'border-nacao-cyan/55 bg-nacao-cyan/15 text-nacao-cyan'
                              : 'border-white/12 text-white/60'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={marcada}
                            onChange={() =>
                              setEditandoProva({
                                ...editandoProva,
                                componentes: marcada
                                  ? editandoProva.componentes.filter((c) => c !== p.codigo)
                                  : [...editandoProva.componentes, p.codigo],
                              })
                            }
                          />
                          <span className="font-display font-bold">{p.codigo}</span>{' '}
                          {p.descricao}
                        </label>
                      );
                    })}
                </div>
                {(wodDaProva?.provas ?? []).filter((p) => p.origem === 'DIGITADA').length === 0 ? (
                  <p className="mt-2 text-xs text-amber-200/90">
                    Este WOD ainda não tem prova lançada pelo juiz para somar. Crie uma antes.
                  </p>
                ) : null}
              </div>
            ) : (
              <label className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={editandoProva.porAtleta}
                  onChange={(e) =>
                    setEditandoProva({ ...editandoProva, porAtleta: e.target.checked })
                  }
                  className="mt-0.5 h-4 w-4 accent-nacao-cyan"
                />
                <span>
                  <strong className="font-display font-bold uppercase">Lançada por atleta</strong>
                  <span className="block text-xs text-white/50">
                    O juiz digita dois campos, um por atleta, e a prova vale a soma. É o caso das
                    cargas: cada atleta busca a sua.
                  </span>
                </span>
              </label>
            )}

            <label className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm">
              <input
                type="checkbox"
                checked={editandoProva.pontua}
                onChange={(e) => setEditandoProva({ ...editandoProva, pontua: e.target.checked })}
                className="mt-0.5 h-4 w-4 accent-nacao-cyan"
              />
              <span>
                <strong className="font-display font-bold uppercase">Soma no total</strong>
                <span className="block text-xs text-white/50">
                  Desmarque para uma prova que continua ranqueada e visível, mas fora da
                  pontuação do evento.
                </span>
              </span>
            </label>
          </div>
        ) : null}
      </Modal>

      {/* ====================================================================
          Exclusão
          ==================================================================== */}
      <Modal
        open={excluindo !== null}
        onClose={() => setExcluindo(null)}
        title={excluindo?.tipo === 'wod' ? 'Excluir o WOD?' : 'Excluir a prova?'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setExcluindo(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              disabled={pendente}
              onClick={() => {
                if (!excluindo) return;
                executar(
                  () =>
                    excluindo.tipo === 'wod'
                      ? excluirWod(excluindo.wod.id)
                      : excluirProva(excluindo.prova.id),
                  () => setExcluindo(null),
                );
              }}
            >
              <Trash2 size={16} aria-hidden="true" />
              Excluir
            </Button>
          </>
        }
      >
        <p className="flex items-start gap-2 text-sm text-white/70">
          <TriangleAlert size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-amber-300" />
          {excluindo?.tipo === 'wod' ? (
            <span>
              Excluir o <strong>WOD {excluindo.wod.numero} — {excluindo.wod.nome}</strong> apaga
              junto as {excluindo.wod.provas.length} prova(s) dele e todos os resultados já
              lançados. Não dá para desfazer.
            </span>
          ) : excluindo ? (
            <span>
              Excluir a prova <strong>{excluindo.prova.codigo}</strong> apaga os resultados dela
              em todas as duplas. Não dá para desfazer.
            </span>
          ) : null}
        </p>
      </Modal>
    </div>
  );
}

/* ==========================================================================
   PEDAÇOS DO FORMULÁRIO
   ========================================================================== */

function ListaDeTextos({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block font-display text-[11px] font-bold tracking-wider text-white/60 uppercase"
      >
        {label}
      </label>
      <textarea
        id={id}
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-white/15 bg-white/[0.06] px-3.5 py-2.5 text-sm text-white placeholder:text-white/35 focus:border-nacao-cyan/60"
      />
      <p className="mt-1 text-xs text-white/45">{hint}</p>
    </div>
  );
}

function BlocosEditor({
  blocos,
  onChange,
}: {
  blocos: WodForm['blocos'];
  onChange: (b: WodForm['blocos']) => void;
}) {
  const vazio = { janela: '', movimento: '', detalhe: '', masculino: '', feminino: '' };

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="font-display text-[10px] font-bold tracking-wider text-white/60 uppercase">
          Prescrição em blocos
        </p>
        <Button size="sm" variant="ghost" onClick={() => onChange([...blocos, { ...vazio }])}>
          <Plus size={13} aria-hidden="true" />
          Bloco
        </Button>
      </div>

      {blocos.length === 0 ? (
        <p className="mt-2 text-xs text-white/45">
          Os movimentos do workout, na ordem. Aparecem na página pública do WOD.
        </p>
      ) : null}

      <ul className="mt-2 space-y-2">
        {blocos.map((b, i) => (
          <li key={i} className="rounded-lg border border-white/10 bg-nacao-abyss/40 p-2.5">
            <div className="grid grid-cols-3 gap-2">
              <Input
                id={`bloco-${i}-janela`}
                label="Janela"
                value={b.janela}
                onChange={(e) =>
                  onChange(blocos.map((x, j) => (j === i ? { ...x, janela: e.target.value } : x)))
                }
                placeholder="0–5 min"
              />
              <div className="col-span-2">
                <Input
                  id={`bloco-${i}-mov`}
                  label="Movimento"
                  value={b.movimento}
                  onChange={(e) =>
                    onChange(
                      blocos.map((x, j) => (j === i ? { ...x, movimento: e.target.value } : x)),
                    )
                  }
                  placeholder="1RM Strict Press"
                />
              </div>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2">
              <Input
                id={`bloco-${i}-m`}
                label="Masculino"
                value={b.masculino}
                onChange={(e) =>
                  onChange(
                    blocos.map((x, j) => (j === i ? { ...x, masculino: e.target.value } : x)),
                  )
                }
                placeholder="20 kg"
              />
              <Input
                id={`bloco-${i}-f`}
                label="Feminino"
                value={b.feminino}
                onChange={(e) =>
                  onChange(blocos.map((x, j) => (j === i ? { ...x, feminino: e.target.value } : x)))
                }
                placeholder="10 kg"
              />
            </div>

            <div className="mt-2 flex items-end gap-2">
              <Input
                id={`bloco-${i}-det`}
                label="Detalhe"
                value={b.detalhe}
                onChange={(e) =>
                  onChange(blocos.map((x, j) => (j === i ? { ...x, detalhe: e.target.value } : x)))
                }
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onChange(blocos.filter((_, j) => j !== i))}
              >
                <Trash2 size={13} aria-hidden="true" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ==========================================================================
   A PROGRAMAÇÃO DO DIA
   ========================================================================== */

interface AgendaForm {
  hora: string;
  titulo: string;
  detalhe: string;
  itens: string;
  nota: string;
  wodId: string;
  bateria: string;
  destaque: boolean;
}

function AgendaEditor({
  agenda,
  wods,
  pendente,
  onSalvar,
}: {
  agenda: AgendaItem[];
  wods: Wod[];
  pendente: boolean;
  onSalvar: (itens: unknown[]) => void;
}) {
  const [itens, setItens] = useState<AgendaForm[]>(() =>
    agenda.map((a) => ({
      hora: a.hora,
      titulo: a.titulo,
      detalhe: a.detalhe ?? '',
      itens: a.itens.join('\n'),
      nota: a.nota ?? '',
      wodId: a.wodId ?? '',
      bateria: a.bateria === null ? '' : String(a.bateria),
      destaque: a.destaque,
    })),
  );

  const mover = (i: number, delta: number) => {
    const j = i + delta;
    if (j < 0 || j >= itens.length) return;
    const copia = [...itens];
    const a = copia[i];
    const b = copia[j];
    if (!a || !b) return;
    copia[i] = b;
    copia[j] = a;
    setItens(copia);
  };

  const atualizar = (i: number, campos: Partial<AgendaForm>) =>
    setItens(itens.map((x, j) => (j === i ? { ...x, ...campos } : x)));

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CardHeader kicker="§37 Programação" title="Horários do dia" />
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            setItens([
              ...itens,
              {
                hora: '',
                titulo: '',
                detalhe: '',
                itens: '',
                nota: '',
                wodId: '',
                bateria: '',
                destaque: false,
              },
            ])
          }
        >
          <Plus size={14} aria-hidden="true" />
          Momento
        </Button>
      </div>

      <p className="mt-2 text-sm text-white/55">
        A programação que o atleta abre no celular. Um momento ligado a um WOD e a uma bateria
        vira o horário daquela bateria; os outros — briefing, conferência, pódio — ficam soltos.
      </p>

      <ul className="mt-4 space-y-2">
        {itens.map((item, i) => (
          <li key={i} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="grid gap-2 sm:grid-cols-4">
              <Input
                id={`ag-${i}-hora`}
                label="Hora"
                value={item.hora}
                onChange={(e) => atualizar(i, { hora: e.target.value })}
                placeholder="09h00–09h16"
              />
              <div className="sm:col-span-2">
                <Input
                  id={`ag-${i}-titulo`}
                  label="Título"
                  value={item.titulo}
                  onChange={(e) => atualizar(i, { titulo: e.target.value })}
                  placeholder="Workout 01 — Bateria 1"
                />
              </div>
              <Input
                id={`ag-${i}-detalhe`}
                label="Detalhe"
                value={item.detalhe}
                onChange={(e) => atualizar(i, { detalhe: e.target.value })}
              />
            </div>

            <div className="mt-2 grid gap-2 sm:grid-cols-4">
              <Select
                id={`ag-${i}-wod`}
                label="WOD"
                value={item.wodId}
                onChange={(e) => atualizar(i, { wodId: e.target.value })}
              >
                <option value="">Nenhum</option>
                {wods.map((w) => (
                  <option key={w.id} value={w.id}>
                    WOD {w.numero} — {w.nome}
                  </option>
                ))}
              </Select>
              <Input
                id={`ag-${i}-bat`}
                label="Bateria"
                type="number"
                min={1}
                value={item.bateria}
                onChange={(e) => atualizar(i, { bateria: e.target.value })}
              />
              <div className="sm:col-span-2">
                <Input
                  id={`ag-${i}-nota`}
                  label="Observação"
                  value={item.nota}
                  onChange={(e) => atualizar(i, { nota: e.target.value })}
                  placeholder="Opcional"
                />
              </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-xs text-white/60">
                <input
                  type="checkbox"
                  checked={item.destaque}
                  onChange={(e) => atualizar(i, { destaque: e.target.checked })}
                  className="h-3.5 w-3.5 accent-nacao-cyan"
                />
                Destacar na programação
              </label>

              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => mover(i, -1)}>
                  <ArrowUp size={13} aria-hidden="true" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => mover(i, 1)}>
                  <ArrowDown size={13} aria-hidden="true" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setItens(itens.filter((_, j) => j !== i))}
                >
                  <Trash2 size={13} aria-hidden="true" />
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-4">
        <Button
          disabled={pendente}
          onClick={() =>
            onSalvar(
              itens.map((x, i) => ({
                ordem: i + 1,
                hora: x.hora.trim() || '—',
                titulo: x.titulo.trim() || 'Sem título',
                detalhe: x.detalhe.trim() || null,
                itens: linhas(x.itens),
                nota: x.nota.trim() || null,
                wodId: x.wodId || null,
                bateria: x.bateria ? Number(x.bateria) : null,
                destaque: x.destaque,
              })),
            )
          }
        >
          <Save size={16} aria-hidden="true" />
          Salvar programação
        </Button>
      </div>
    </Card>
  );
}
