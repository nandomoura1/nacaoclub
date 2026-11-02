'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  EyeOff,
  Handshake,
  ImageUp,
  Pencil,
  Plus,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import type { Patrocinador } from '@/types/domain';
import type { ActionResult } from '@/app/admin/actions';
import { excluirPatrocinador, salvarPatrocinador } from '@/app/admin/actions';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, EmptyState } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';

/**
 * PATROCINADORES E PARCEIROS DA ETAPA.
 *
 * A imagem sobe para um bucket público do Supabase; o banco guarda só o
 * caminho. É por isso que o formulário é um <form> com FormData de verdade,
 * e não um objeto: arquivo não atravessa uma Server Action de outro jeito.
 *
 * `ordem` existe porque cota de patrocínio é hierarquia: quem paga mais
 * aparece primeiro. O tamanho na tela é o mesmo para todos — ordenar é
 * suficiente, e dar tamanhos diferentes polui o rodapé.
 */

interface FormState {
  id: string | null;
  nome: string;
  site: string;
  cota: string;
  ordem: string;
  ativo: boolean;
  /** Caminho que já existe, quando a pessoa está editando sem trocar a imagem. */
  logoPath: string | null;
  logoUrl: string | null;
}

const novo = (proximaOrdem: number): FormState => ({
  id: null,
  nome: '',
  site: '',
  cota: '',
  ordem: String(proximaOrdem),
  ativo: true,
  logoPath: null,
  logoUrl: null,
});

export function PatrocinadoresManager({
  patrocinadores,
  nomeDoEvento,
}: {
  patrocinadores: readonly Patrocinador[];
  nomeDoEvento: string;
}) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [form, setForm] = useState<FormState | null>(null);
  const [excluindo, setExcluindo] = useState<Patrocinador | null>(null);
  const [aviso, setAviso] = useState<ActionResult | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);

  const ordenados = [...patrocinadores].sort(
    (a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome),
  );
  const proximaOrdem = (ordenados.at(-1)?.ordem ?? 0) + 1;

  const rodar = (acao: () => Promise<ActionResult>, aoDarCerto?: () => void) =>
    startTransition(async () => {
      const r = await acao();
      setAviso(r);
      if (r.ok) {
        aoDarCerto?.();
        router.refresh();
      }
    });

  const enviar = () => {
    if (!form) return;
    const fd = new FormData();
    if (form.id) fd.set('id', form.id);
    fd.set('nome', form.nome);
    fd.set('site', form.site);
    fd.set('cota', form.cota);
    fd.set('ordem', form.ordem);
    fd.set('ativo', String(form.ativo));
    if (form.logoPath) fd.set('logoPath', form.logoPath);

    const arquivo = arquivoRef.current?.files?.[0];
    if (arquivo) fd.set('logo', arquivo);

    rodar(
      () => salvarPatrocinador(fd),
      () => {
        setForm(null);
        setPrevia(null);
      },
    );
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="font-display text-[10px] font-bold tracking-kicker text-nacao-cyan uppercase">
            {nomeDoEvento}
          </p>
          <h1 className="mt-1 font-display text-2xl font-extrabold uppercase">Patrocinadores</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-white/55">
            As logomarcas aparecem numa faixa discreta no rodapé do site e no rodapé do telão —
            que fica horas projetado num ginásio cheio. Patrocínio é por etapa: ao criar uma etapa
            nova copiando esta, os parceiros vêm junto.
          </p>
        </div>
        <Button onClick={() => setForm(novo(proximaOrdem))} disabled={pendente}>
          <Plus size={16} /> Novo parceiro
        </Button>
      </header>

      {aviso ? (
        <div
          role="status"
          className={`flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm ${
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

      {ordenados.length === 0 ? (
        <EmptyState
          title="Nenhum parceiro cadastrado"
          description="Suba a logomarca de quem patrocina esta etapa. PNG com fundo transparente fica melhor sobre o navy."
          action={
            <Button onClick={() => setForm(novo(1))}>
              <Handshake size={16} /> Cadastrar o primeiro
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {ordenados.map((p) => (
            <Card as="li" key={p.id} className="flex items-center gap-4 p-4">
              {/* Fundo claro atrás da prévia: muita logomarca é branca com
                  fundo transparente e sumiria contra o navy do painel. */}
              <span className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-white/10 p-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.logoUrl}
                  alt={p.nome}
                  className="max-h-full max-w-full object-contain"
                />
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-sm font-bold">{p.nome}</span>
                  {p.cota ? <Badge tone="cyan">{p.cota}</Badge> : null}
                  {!p.ativo ? (
                    <Badge tone="neutral" title="Cadastrado, mas não aparece no site">
                      <EyeOff size={11} /> Oculto
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-0.5 truncate text-[12px] text-white/45">
                  {p.site ?? 'sem link'} · ordem {p.ordem}
                </p>
              </div>

              <div className="flex shrink-0 gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pendente}
                  onClick={() =>
                    setForm({
                      id: p.id,
                      nome: p.nome,
                      site: p.site ?? '',
                      cota: p.cota ?? '',
                      ordem: String(p.ordem),
                      ativo: p.ativo,
                      logoPath: p.logoPath,
                      logoUrl: p.logoUrl,
                    })
                  }
                >
                  <Pencil size={14} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pendente}
                  onClick={() => setExcluindo(p)}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            </Card>
          ))}
        </ul>
      )}

      {/* ---------------------------------------------------------------- */}
      <Modal
        open={form !== null}
        onClose={() => {
          setForm(null);
          setPrevia(null);
        }}
        title={form?.id ? 'Editar parceiro' : 'Novo parceiro'}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setForm(null);
                setPrevia(null);
              }}
              disabled={pendente}
            >
              Cancelar
            </Button>
            <Button disabled={pendente || !form?.nome.trim()} onClick={enviar}>
              {pendente ? 'Salvando…' : 'Salvar'}
            </Button>
          </>
        }
      >
        {form ? (
          <div className="space-y-4">
            <div>
              <p className="mb-1.5 font-display text-[11px] font-bold tracking-wider text-white/60 uppercase">
                Logomarca
              </p>

              <div className="flex items-center gap-4">
                <span className="flex size-20 shrink-0 items-center justify-center rounded-lg bg-white/10 p-2">
                  {previa || form.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={previa ?? form.logoUrl ?? ''}
                      alt="Prévia da logomarca"
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <ImageUp size={22} className="text-white/30" />
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  <input
                    ref={arquivoRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      setPrevia(f ? URL.createObjectURL(f) : null);
                    }}
                    className="block w-full text-[13px] text-white/70 file:mr-3 file:rounded-lg file:border-0 file:bg-white/12 file:px-3 file:py-2 file:font-display file:text-xs file:font-bold file:text-white file:uppercase hover:file:bg-white/20"
                  />
                  <p className="mt-1.5 text-xs text-white/45">
                    PNG, JPG, WEBP ou SVG · até 2 MB. Prefira PNG com fundo transparente e a
                    versão clara da marca — o fundo do site é escuro.
                  </p>
                </div>
              </div>

              {form.id ? (
                <p className="mt-2 text-[12px] text-white/40">
                  Deixe em branco para manter a imagem atual.
                </p>
              ) : null}
            </div>

            <Input
              label="Nome do parceiro"
              value={form.nome}
              placeholder="Como aparece no contrato"
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
            />

            <Input
              label="Link (opcional)"
              value={form.site}
              placeholder="https://..."
              hint="Para onde a logomarca leva ao ser clicada. Vazio = sem link."
              onChange={(e) => setForm({ ...form, site: e.target.value })}
            />

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Cota (opcional)"
                value={form.cota}
                placeholder="Master, Apoio…"
                hint="Só para você se organizar."
                onChange={(e) => setForm({ ...form, cota: e.target.value })}
              />
              <Input
                label="Ordem"
                type="number"
                min={1}
                max={99}
                value={form.ordem}
                hint="Menor aparece primeiro."
                onChange={(e) => setForm({ ...form, ordem: e.target.value })}
              />
            </div>

            <label className="flex items-center gap-2.5 text-sm text-white/75">
              <input
                type="checkbox"
                checked={form.ativo}
                onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
                className="size-5 accent-nacao-cyan"
              />
              Aparecer no site e no telão
            </label>
          </div>
        ) : null}
      </Modal>

      {/* ---------------------------------------------------------------- */}
      <Modal
        open={excluindo !== null}
        onClose={() => setExcluindo(null)}
        title="Remover parceiro"
        footer={
          <>
            <Button variant="ghost" onClick={() => setExcluindo(null)} disabled={pendente}>
              Voltar
            </Button>
            <Button
              variant="danger"
              disabled={pendente}
              onClick={() =>
                excluindo &&
                rodar(() => excluirPatrocinador(excluindo.id), () => setExcluindo(null))
              }
            >
              {pendente ? 'Removendo…' : 'Remover'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-white/70">
          <strong>{excluindo?.nome}</strong> deixa de aparecer no site e no telão desta etapa. A
          imagem também é apagada — a menos que outra etapa ainda use a mesma logomarca, caso em
          que o arquivo é preservado.
        </p>
        <p className="mt-2 text-[13px] text-white/45">
          Para tirar do ar sem apagar, use <strong>Editar</strong> e desmarque &quot;aparecer no
          site&quot;.
        </p>
      </Modal>
    </div>
  );
}
