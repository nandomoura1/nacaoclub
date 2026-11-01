'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Clock, KeyRound, Mail, Trash2, TriangleAlert, UserPlus } from 'lucide-react';
import type { Colaborador } from '@/services/equipe-service';
import type { ActionResult } from '@/app/admin/actions';
import { autorizarColaborador, removerColaborador } from '@/app/admin/actions';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, EmptyState } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';

/**
 * COLABORADORES DA ORGANIZAÇÃO.
 *
 * O fluxo é de duas pontas, e a tela existe para deixar isso óbvio:
 *
 *   1. aqui a organização AUTORIZA um e-mail
 *   2. a pessoa entra em /login e CRIA A PRÓPRIA SENHA
 *
 * Ninguém digita a senha de outra pessoa, e o sistema não precisa guardar a
 * chave mestra do banco para criar contas (§35). O preço é que existe um
 * estado intermediário — autorizado mas sem conta — e a coluna "Acesso"
 * mostra exatamente isso.
 */
export function EquipeManager({
  equipe,
  meuEmail,
}: {
  equipe: readonly Colaborador[];
  meuEmail: string | null;
}) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [form, setForm] = useState<{ email: string; nome: string } | null>(null);
  const [removendo, setRemovendo] = useState<Colaborador | null>(null);
  const [aviso, setAviso] = useState<ActionResult | null>(null);

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
            Organização
          </p>
          <h1 className="mt-1 font-display text-2xl font-extrabold uppercase">Colaboradores</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-white/55">
            Quem pode lançar resultados, editar WODs e mexer nas configurações. Autorize o e-mail
            da pessoa e ela cria a própria senha no primeiro acesso.
          </p>
        </div>
        <Button onClick={() => setForm({ email: '', nome: '' })} disabled={pendente}>
          <UserPlus size={16} /> Autorizar e-mail
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

      {equipe.length === 0 ? (
        <EmptyState
          title="Nenhum colaborador"
          description="Autorize o e-mail de quem vai lançar resultados no dia do evento."
          action={
            <Button onClick={() => setForm({ email: '', nome: '' })}>
              <UserPlus size={16} /> Autorizar e-mail
            </Button>
          }
        />
      ) : (
        <ul className="space-y-2.5">
          {equipe.map((p) => {
            const souEu = meuEmail !== null && p.email === meuEmail;

            return (
              <Card as="li" key={p.email} className="flex flex-wrap items-center gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-sm font-bold">
                      {p.nome?.trim() || p.email}
                    </span>
                    {souEu ? <Badge tone="cyan">Você</Badge> : null}
                    {p.temLogin ? (
                      <Badge tone="ok" title="Já criou a conta e consegue entrar">
                        <KeyRound size={11} /> Acesso ativo
                      </Badge>
                    ) : (
                      <Badge tone="warn" title="Autorizado, mas ainda não criou a senha">
                        <Clock size={11} /> Aguardando 1º acesso
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-white/50">
                    <Mail size={12} className="shrink-0" />
                    {p.email}
                  </p>
                </div>

                {p.origem === 'AUTORIZADO' && !souEu ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pendente}
                    onClick={() => setRemovendo(p)}
                  >
                    <Trash2 size={14} /> Remover
                  </Button>
                ) : (
                  <span
                    className="text-[11px] text-white/35"
                    title={
                      souEu
                        ? 'Você não pode remover o seu próprio acesso'
                        : 'Acesso criado direto no banco, na instalação do sistema'
                    }
                  >
                    {souEu ? '—' : 'acesso de instalação'}
                  </span>
                )}
              </Card>
            );
          })}
        </ul>
      )}

      <Card className="space-y-2 p-4 text-[13px] text-white/55">
        <p className="font-display text-[11px] font-bold tracking-wider text-white/70 uppercase">
          Como a pessoa entra
        </p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Você autoriza o e-mail aqui.</li>
          <li>
            A pessoa abre <strong className="text-white/80">/login</strong> e usa &quot;criar
            senha&quot; com esse mesmo e-mail.
          </li>
          <li>Pronto — já pode lançar resultados. O selo acima vira &quot;Acesso ativo&quot;.</li>
        </ol>
        <p className="pt-1">
          Se o e-mail estiver diferente de uma letra, o acesso não vale. Confira antes de avisar a
          pessoa.
        </p>
      </Card>

      {/* ---------------------------------------------------------------- */}
      <Modal
        open={form !== null}
        onClose={() => setForm(null)}
        title="Autorizar colaborador"
        footer={
          <>
            <Button variant="ghost" onClick={() => setForm(null)} disabled={pendente}>
              Cancelar
            </Button>
            <Button
              disabled={pendente || !form?.email.trim()}
              onClick={() =>
                form &&
                rodar(
                  () =>
                    autorizarColaborador({
                      email: form.email,
                      nome: form.nome.trim() || null,
                    }),
                  () => setForm(null),
                )
              }
            >
              {pendente ? 'Autorizando…' : 'Autorizar'}
            </Button>
          </>
        }
      >
        {form ? (
          <div className="space-y-4">
            <Input
              label="E-mail"
              type="email"
              inputMode="email"
              autoComplete="off"
              value={form.email}
              placeholder="colaborador@nacaoclub.com.br"
              hint="Tem de ser exatamente o e-mail que a pessoa vai usar para entrar."
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <Input
              label="Nome (opcional)"
              value={form.nome}
              placeholder="Para você reconhecer na lista"
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
            />
          </div>
        ) : null}
      </Modal>

      {/* ---------------------------------------------------------------- */}
      <Modal
        open={removendo !== null}
        onClose={() => setRemovendo(null)}
        title="Remover acesso"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemovendo(null)} disabled={pendente}>
              Voltar
            </Button>
            <Button
              variant="danger"
              disabled={pendente}
              onClick={() =>
                removendo &&
                rodar(() => removerColaborador(removendo.email), () => setRemovendo(null))
              }
            >
              {pendente ? 'Removendo…' : 'Remover acesso'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-white/70">
          <strong>{removendo?.email}</strong> deixa de poder lançar resultados e editar o evento. A
          conta continua existindo — só perde a permissão de organização. O que a pessoa já lançou
          fica registrado na auditoria, com o nome dela.
        </p>
      </Modal>
    </div>
  );
}
