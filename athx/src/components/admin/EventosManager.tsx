'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Archive,
  CheckCircle2,
  Copy,
  ExternalLink,
  PencilLine,
  Plus,
  Radio,
  Settings2,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import type { EventoResumo } from '@/services/event-context';
import type { ActionResult } from '@/app/admin/actions';
import {
  arquivarEvento,
  ativarEvento,
  criarEvento,
  editarEvento,
  excluirEvento,
  salvarEvento,
} from '@/app/admin/actions';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Input, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/Card';

/**
 * A TELA DE EVENTOS — o que transforma o app numa plataforma.
 *
 * Três ideias, e vale distinguir porque elas são fáceis de confundir:
 *
 *   NO AR        o evento que o público vê. Um só, garantido pelo banco.
 *   EM EDIÇÃO    o evento em que a organização está mexendo. Pode ser outro:
 *                montar março enquanto setembro roda é o caso normal.
 *   ARQUIVADO    saiu do ar. Continua inteiro — nada é apagado nunca.
 */

/** Transforma "Etapa de Março 2027" em "etapa-de-marco-2027". */
function slugificar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

interface FormState {
  nome: string;
  slug: string;
  /** true enquanto a pessoa não editar o endereço à mão. */
  slugAutomatico: boolean;
  data: string;
  copiarDe: string;
}

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

const STATUS: Record<string, { label: string; tone: 'ok' | 'warn' | 'neutral' }> = {
  LIVE: { label: 'No ar', tone: 'ok' },
  DRAFT: { label: 'Em montagem', tone: 'warn' },
  FINISHED: { label: 'Arquivado', tone: 'neutral' },
};

export function EventosManager({
  eventos,
  slugEmEdicao,
}: {
  eventos: readonly EventoResumo[];
  /** null = a organização está editando o evento que está no ar. */
  slugEmEdicao: string | null;
}) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [form, setForm] = useState<FormState | null>(null);
  const [arquivando, setArquivando] = useState<EventoResumo | null>(null);
  const [excluindo, setExcluindo] = useState<EventoResumo | null>(null);
  const [editando, setEditando] = useState<
    { id: string; nome: string; slug: string; data: string; slugOriginal: string } | null
  >(null);
  const [aviso, setAviso] = useState<ActionResult | null>(null);

  const noAr = eventos.find((e) => e.noAr) ?? null;
  const emEdicao = useMemo(
    () => eventos.find((e) => e.slug === slugEmEdicao) ?? noAr,
    [eventos, slugEmEdicao, noAr],
  );

  /** O mais recente com WODs cadastrados é o palpite certo de origem. */
  const sugestaoDeOrigem = eventos.find((e) => e.wods > 0)?.id ?? '';

  const abrirNovo = () =>
    setForm({
      nome: '',
      slug: '',
      slugAutomatico: true,
      data: hoje(),
      copiarDe: sugestaoDeOrigem,
    });

  const rodar = (acao: () => Promise<ActionResult>, aoDarCerto?: () => void) =>
    startTransition(async () => {
      const r = await acao();
      setAviso(r);
      if (r.ok) {
        aoDarCerto?.();
        router.refresh();
      }
    });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="font-display text-[10px] font-bold tracking-kicker text-nacao-cyan uppercase">
            Plataforma
          </p>
          <h1 className="mt-1 font-display text-2xl font-extrabold uppercase">Eventos</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-white/55">
            Cada etapa é um evento independente, com as próprias duplas e os próprios resultados.
            Um evento novo pode nascer copiando as regras de outro — e nada é apagado quando sai do
            ar.
          </p>
        </div>
        <Button onClick={abrirNovo} disabled={pendente}>
          <Plus size={16} /> Novo evento
        </Button>
      </header>

      {aviso ? (
        <div
          role="status"
          className={`flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm ${
            aviso.ok
              ? 'bg-emerald-500/12 text-emerald-200'
              : 'bg-red-500/12 text-red-200'
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

      {/* Dizer em qual evento a pessoa está mexendo. Sem isto, lançar
          resultado no evento errado é questão de tempo. */}
      {emEdicao ? (
        <Card className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3.5">
          <span className="flex items-center gap-2 text-sm">
            <PencilLine size={15} className="text-nacao-cyan" />
            <span className="text-white/55">Você está editando</span>
            <strong className="font-display font-bold">{emEdicao.name}</strong>
          </span>
          {noAr && noAr.slug !== emEdicao.slug ? (
            <span className="flex items-center gap-2 text-sm text-amber-200">
              <Radio size={15} className="shrink-0" />
              No ar para o público está <strong>{noAr.name}</strong>
            </span>
          ) : null}
        </Card>
      ) : null}

      {eventos.length === 0 ? (
        <EmptyState
          title="Nenhum evento ainda"
          description="Crie o primeiro para começar a cadastrar WODs e duplas."
          action={
            <Button onClick={abrirNovo}>
              <Plus size={16} /> Criar evento
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {eventos.map((evento) => {
            const status = STATUS[evento.status] ?? STATUS.DRAFT!;
            const editando = evento.slug === emEdicao?.slug;

            return (
              <Card as="li" key={evento.id} className="p-4 sm:p-5" raised={editando}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-display text-lg font-bold">{evento.name}</h2>
                      <Badge tone={status.tone}>{status.label}</Badge>
                      {editando ? <Badge tone="cyan">Editando</Badge> : null}
                    </div>
                    <p className="mt-1 text-[13px] text-white/50">
                      {new Date(`${evento.date}T12:00:00`).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: 'long',
                        year: 'numeric',
                      })}{' '}
                      · {evento.wods} WOD{evento.wods === 1 ? '' : 's'} · {evento.duplas} dupla
                      {evento.duplas === 1 ? '' : 's'}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {!editando ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={pendente}
                        onClick={() => rodar(() => editarEvento(evento.slug))}
                      >
                        <PencilLine size={14} /> Trabalhar neste
                      </Button>
                    ) : null}

                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={pendente}
                      onClick={() =>
                        setEditando({
                          id: evento.id,
                          nome: evento.name,
                          slug: evento.slug,
                          data: evento.date,
                          slugOriginal: evento.slug,
                        })
                      }
                    >
                      <Settings2 size={14} /> Nome e data
                    </Button>

                    {!evento.noAr ? (
                      <Button
                        variant="cyan"
                        size="sm"
                        disabled={pendente}
                        onClick={() => rodar(() => ativarEvento(evento.id))}
                      >
                        <Radio size={14} /> Colocar no ar
                      </Button>
                    ) : null}

                    {evento.status !== 'FINISHED' ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pendente}
                        onClick={() => setArquivando(evento)}
                      >
                        <Archive size={14} /> Arquivar
                      </Button>
                    ) : null}

                    <ButtonLink
                      href={`/leaderboard?evento=${evento.slug}`}
                      variant="ghost"
                      size="sm"
                    >
                      <ExternalLink size={14} /> Ver
                    </ButtonLink>

                    {/* Excluir só aparece onde faz sentido: fora do ar e sem
                        nenhum resultado lançado. Um evento que já virou
                        competição se arquiva, não se apaga — e oferecer o
                        botão para depois recusar seria pegadinha. */}
                    {!evento.noAr && evento.lancamentos === 0 ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pendente}
                        onClick={() => setExcluindo(evento)}
                      >
                        <Trash2 size={14} /> Excluir
                      </Button>
                    ) : null}
                  </div>
                </div>
              </Card>
            );
          })}
        </ul>
      )}

      {/* ---------------------------------------------------------------- */}
      <Modal
        open={form !== null}
        onClose={() => setForm(null)}
        title="Novo evento"
        footer={
          <>
            <Button variant="ghost" onClick={() => setForm(null)} disabled={pendente}>
              Cancelar
            </Button>
            <Button
              disabled={pendente || !form?.nome.trim() || !form?.slug.trim()}
              onClick={() =>
                form &&
                rodar(
                  () =>
                    criarEvento({
                      nome: form.nome,
                      slug: form.slug,
                      data: form.data,
                      copiarDe: form.copiarDe || null,
                    }),
                  () => setForm(null),
                )
              }
            >
              {pendente ? 'Criando…' : 'Criar evento'}
            </Button>
          </>
        }
      >
        {form ? (
          <div className="space-y-4">
            <Input
              label="Nome do evento"
              value={form.nome}
              placeholder="Nação Híbrida — Etapa Março"
              onChange={(e) => {
                const nome = e.target.value;
                setForm({
                  ...form,
                  nome,
                  slug: form.slugAutomatico ? slugificar(nome) : form.slug,
                });
              }}
            />

            <Input
              label="Endereço do evento"
              value={form.slug}
              placeholder="nacao-hibrida-marco"
              hint="Aparece no link do leaderboard. Só minúsculas, números e hífen."
              onChange={(e) =>
                setForm({ ...form, slug: slugificar(e.target.value), slugAutomatico: false })
              }
            />

            <Input
              label="Data"
              type="date"
              value={form.data}
              onChange={(e) => setForm({ ...form, data: e.target.value })}
            />

            <Select
              label="Copiar as regras de"
              value={form.copiarDe}
              hint="Traz WODs, provas, critérios de pontuação e a programação do dia. NÃO traz duplas nem resultados."
              onChange={(e) => setForm({ ...form, copiarDe: e.target.value })}
            >
              <option value="">Começar em branco</option>
              {eventos.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} ({e.wods} WOD{e.wods === 1 ? '' : 's'})
                </option>
              ))}
            </Select>

            {form.copiarDe ? (
              <p className="flex items-start gap-2 rounded-xl bg-nacao-cyan/10 px-3.5 py-3 text-[13px] text-nacao-cyan">
                <Copy size={15} className="mt-0.5 shrink-0" />
                O evento nasce em montagem, com o regulamento pronto e sem nenhuma dupla. Depois
                você cadastra as inscrições e coloca no ar.
              </p>
            ) : null}
          </div>
        ) : null}
      </Modal>

      {/* ---------------------------------------------------------------- */}
      <Modal
        open={editando !== null}
        onClose={() => setEditando(null)}
        title="Nome e data do evento"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditando(null)} disabled={pendente}>
              Cancelar
            </Button>
            <Button
              disabled={pendente || !editando?.nome.trim() || !editando?.slug.trim()}
              onClick={() =>
                editando &&
                rodar(
                  () =>
                    salvarEvento({
                      id: editando.id,
                      nome: editando.nome,
                      slug: editando.slug,
                      data: editando.data,
                    }),
                  () => setEditando(null),
                )
              }
            >
              {pendente ? 'Salvando…' : 'Salvar'}
            </Button>
          </>
        }
      >
        {editando ? (
          <div className="space-y-4">
            <Input
              label="Nome do evento"
              value={editando.nome}
              onChange={(e) => setEditando({ ...editando, nome: e.target.value })}
            />

            <Input
              label="Data"
              type="date"
              value={editando.data}
              onChange={(e) => setEditando({ ...editando, data: e.target.value })}
            />

            <Input
              label="Endereço do evento"
              value={editando.slug}
              hint="Aparece no link do leaderboard. Só minúsculas, números e hífen."
              onChange={(e) =>
                setEditando({ ...editando, slug: slugificar(e.target.value) })
              }
            />

            {editando.slug !== editando.slugOriginal ? (
              <p className="flex items-start gap-2 rounded-xl bg-amber-400/10 px-3.5 py-3 text-[13px] text-amber-200">
                <TriangleAlert size={15} className="mt-0.5 shrink-0" />
                Mudar o endereço quebra os links já compartilhados deste leaderboard. Quem tiver
                o link antigo vai receber &quot;evento não existe&quot;.
              </p>
            ) : null}

            <p className="text-[13px] text-white/45">
              Isto muda só a identificação do evento. Os WODs, as provas e as duplas ficam como
              estão — eles se editam nas outras abas.
            </p>
          </div>
        ) : null}
      </Modal>

      {/* ---------------------------------------------------------------- */}
      <Modal
        open={excluindo !== null}
        onClose={() => setExcluindo(null)}
        title="Excluir evento"
        footer={
          <>
            <Button variant="ghost" onClick={() => setExcluindo(null)} disabled={pendente}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              disabled={pendente}
              onClick={() =>
                excluindo &&
                rodar(() => excluirEvento(excluindo.id), () => setExcluindo(null))
              }
            >
              {pendente ? 'Excluindo…' : 'Excluir de vez'}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-white/70">
          <p>
            <strong>{excluindo?.name}</strong> será apagado de vez. Isto não tem volta.
          </p>
          <p>Some junto:</p>
          <ul className="list-disc space-y-0.5 pl-5 text-white/55">
            <li>
              {excluindo?.wods} WOD{excluindo?.wods === 1 ? '' : 's'} com suas provas, prescrição
              e regras
            </li>
            <li>a programação do dia</li>
            <li>
              {excluindo?.duplas} dupla{excluindo?.duplas === 1 ? '' : 's'} inscrita
              {excluindo?.duplas === 1 ? '' : 's'}
            </li>
          </ul>
          <p className="rounded-xl bg-emerald-500/10 px-3.5 py-3 text-[13px] text-emerald-200">
            Este evento não tem nenhum resultado lançado — nenhuma marca de competição se perde.
            Se tivesse, o botão nem apareceria: aí o caminho é Arquivar.
          </p>
        </div>
      </Modal>

      {/* ---------------------------------------------------------------- */}
      <Modal
        open={arquivando !== null}
        onClose={() => setArquivando(null)}
        title="Arquivar evento"
        footer={
          <>
            <Button variant="ghost" onClick={() => setArquivando(null)} disabled={pendente}>
              Voltar
            </Button>
            <Button
              variant="danger"
              disabled={pendente}
              onClick={() =>
                arquivando &&
                rodar(() => arquivarEvento(arquivando.id), () => setArquivando(null))
              }
            >
              {pendente ? 'Arquivando…' : 'Arquivar'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-white/70">
          <strong>{arquivando?.name}</strong> sai do ar, mas continua inteiro: as{' '}
          {arquivando?.duplas} duplas, os lançamentos e a classificação final ficam guardados e
          consultáveis. Nada é apagado.
        </p>
      </Modal>
    </div>
  );
}
