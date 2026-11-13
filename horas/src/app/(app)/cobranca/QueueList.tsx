'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Phone, PhoneOff, UserRoundCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { AGING, brl } from '@/domain/cobranca';
import { formatDateBR } from '@/domain/dates';
import type { QueueRow } from '@/server/services/crm-service';
import { assignCasesAction } from './actions';

const agingTone = (id: string | null) => (id === null || id === 'A_VENCER' ? 'blue' : id === '1_7' ? 'amber' : 'red') as 'blue' | 'amber' | 'red';
const lateText = (d: number | null) => (d === null ? '' : d < 0 ? `vence em ${-d} dia(s)` : d === 0 ? 'vence hoje' : `${d} dia(s) de atraso`);

/** Fila de casos; o líder seleciona e distribui (um ou vários de uma vez). */
export function QueueList({ rows, agents, canAssign }: { rows: QueueRow[]; agents: { id: string; name: string }[]; canAssign: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [owner, setOwner] = useState('');
  const [msg, setMsg] = useState<{ error?: string; success?: string }>({});
  const [pending, start] = useTransition();
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="space-y-2">
      {canAssign && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-fundo p-2 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={selected.size === rows.length && rows.length > 0} onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} /> Selecionar todos</label>
          <span className="text-tinta-suave">{selected.size} selecionado(s)</span>
          <select value={owner} onChange={(e) => setOwner(e.target.value)} className="h-8 rounded-lg border border-borda bg-white px-2 text-xs" aria-label="Novo responsável">
            <option value="">Passar para…</option>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            <option value="__none">Sem responsável</option>
          </select>
          <Button size="sm" disabled={pending || !selected.size || !owner} onClick={() => start(async () => {
            setMsg({});
            const r = await assignCasesAction([...selected], owner === '__none' ? null : owner);
            if (!r.ok) return setMsg({ error: r.error });
            setSelected(new Set());
            setMsg({ success: `${r.data} caso(s) atualizados.` });
            router.refresh();
          })}><UserRoundCheck /> {pending ? 'Salvando…' : 'Aplicar'}</Button>
          {!agents.length && <span className="text-xs text-atencao">Ninguém com o perfil CRM / Cobrança ainda (Administração → Usuários).</span>}
        </div>
      )}
      <FormMessage error={msg.error} success={msg.success} />
      <Card className="divide-y divide-borda">
        {rows.map((r) => (
          <div key={r.id} className="p-3">
            <div className="flex items-start gap-3">
              {canAssign && <input type="checkbox" className="mt-1" checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Selecionar ${r.customer.name}`} />}
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen(open === r.id ? null : r.id)}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-tinta">{r.customer.name}</span>
                  {r.kind === 'PENDENCIA'
                    ? <Badge tone="amber">Pendência na recepção</Badge>
                    : <Badge tone={agingTone(r.aging)}>{AGING.find((a) => a.id === r.aging)?.label ?? '—'}</Badge>}
                  {r.customer.status && <Badge>{r.customer.status === 'blocked' ? 'Bloqueado' : r.customer.status === 'restricted' ? 'Restrito' : r.customer.status}</Badge>}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-tinta-suave">
                  {r.kind === 'COBRANCA' && <span className="font-semibold text-tinta" title="Parcelas vencidas (estimado pelo nº de parcelas da venda)">{brl(r.openValue)} vencido</span>}
                  {r.kind === 'COBRANCA' && r.balance > r.openValue + 0.01 && <span title="Saldo dos contratos na Tecnofit, com as parcelas que ainda vão vencer">saldo {brl(r.balance)}</span>}
                  {r.old && <Badge tone="red">+180 dias</Badge>}
                  {r.kind === 'COBRANCA' && <span>{lateText(r.daysLate)}</span>}
                  {r.step && <span>{r.step}</span>}
                  <span className="flex items-center gap-1">{r.hasPhone ? <Phone className="size-3" /> : <PhoneOff className="size-3" />}{r.phone ?? 'sem celular'}</span>
                  <span>Responsável: {r.ownerName ?? <em className="text-atencao">sem responsável</em>}</span>
                  {r.consultantName && <span>Consultor Tecnofit: {r.consultantName}</span>}
                </div>
              </button>
              <ChevronDown className={`mt-1 size-4 shrink-0 text-tinta-fraca transition-transform ${open === r.id ? 'rotate-180' : ''}`} />
            </div>
            {open === r.id && (
              <div className="mt-2 rounded-lg bg-fundo p-3 text-xs text-tinta-suave">
                {r.kind === 'PENDENCIA' ? (
                  <p>Aluno {r.customer.status === 'restricted' ? 'restrito' : 'bloqueado'} na Tecnofit sem venda em aberto. Pode ser outra pendência (cadastro, exame, documento): resolver na recepção ou por WhatsApp. Aberto em {formatDateBR(r.openedOn)}.</p>
                ) : (
                  <>
                    <p className="mb-1 font-semibold text-tinta">Vendas em aberto (Tecnofit)</p>
                    <ul className="space-y-0.5">
                      {r.debts.map((d, i) => <li key={i}>{d.description ?? 'Venda'} · 1ª parcela em aberto {d.dueDate ? formatDateBR(d.dueDate) : '—'} · <strong>{brl(d.overdueValue)} vencido</strong>{d.openValue > d.overdueValue + 0.01 ? ` · saldo ${brl(d.openValue)}` : ''}{d.installments ? ` · ${d.installments}x` : ''}</li>)}
                    </ul>
                    <p className="mt-2">Caso aberto em {formatDateBR(r.openedOn)} · saldo quando abriu {brl(r.originalValue)}{r.recoveredValue > 0 ? ` · já recuperado ${brl(r.recoveredValue)}` : ''}.</p>
                    <p className="mt-1">O vencido é estimado: parcelas mensais vencidas desde a 1ª em aberto × valor da parcela (a Tecnofit não detalha cada parcela). Confira na Tecnofit antes de falar valor com o aluno.</p>
                    <p className="mt-1">Formas de pagamento: app da Tecnofit, Pix ou recepção.</p>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
}
