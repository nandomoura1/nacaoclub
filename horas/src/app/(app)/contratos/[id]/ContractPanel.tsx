'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Ban, Copy, Download, RefreshCw, Send } from 'lucide-react';
import { ContractText } from '@/components/contracts/ContractText';
import { FormMessage } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { maskPhone, roleLabel } from '@/domain/contracts';
import type { ContractDetail } from '@/server/services/contract-service';
import { cancelContractAction, resendLinkAction, sendContractAction } from '../actions';

const EVENT: Record<string, string> = {
  CRIADO: 'criou o contrato', ENVIADO: 'enviou para assinatura', VISUALIZADO: 'abriu o contrato', CODIGO_ENVIADO: 'pediu o código no WhatsApp',
  CODIGO_ERRADO: 'digitou um código errado', ASSINADO: 'assinou', RECUSADO: 'recusou', LINK_NOVO: 'novo link gerado', CONCLUIDO: 'contrato concluído (todos assinaram)', CANCELADO: 'contrato cancelado',
};
const SIGNER: Record<string, { label: string; tone: 'green' | 'amber' | 'red' }> = {
  ASSINADO: { label: 'Assinou', tone: 'green' }, PENDENTE: { label: 'Pendente', tone: 'amber' }, RECUSADO: { label: 'Recusou', tone: 'red' },
};
const dt = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });

export function ContractPanel({ contract: c, canEdit }: { contract: ContractDetail; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ error?: string; success?: string }>({});
  const [links, setLinks] = useState<{ name: string; link: string; whatsapp: string }[]>([]);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');

  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); setMsg({ success: 'Link copiado.' }); } catch { setMsg({ error: 'Não deu para copiar; selecione o link e copie.' }); } };
  const send = () => {
    if (!confirm('Enviar para assinatura? O texto fica congelado e cada parte recebe o link no WhatsApp.')) return;
    start(async () => {
      const r = await sendContractAction(c.id);
      if (!r.ok) { setMsg({ error: r.error }); return; }
      setMsg({ success: r.message }); setLinks(r.data); router.refresh();
    });
  };
  const resend = (signerId: string, name: string) => {
    if (!confirm(`Gerar um novo link para ${name}? O link anterior deixa de valer.`)) return;
    start(async () => {
      const r = await resendLinkAction(signerId);
      if (!r.ok) { setMsg({ error: r.error }); return; }
      setMsg({ success: r.message }); setLinks((l) => [...l.filter((x) => x.name !== name), { name, ...r.data }]); router.refresh();
    });
  };
  const cancel = () => start(async () => {
    const r = await cancelContractAction(c.id, reason);
    if (!r.ok) { setMsg({ error: r.error }); return; }
    setMsg({ success: r.message }); setCancelling(false); router.refresh();
  });

  const open = c.status === 'AGUARDANDO';
  return (
    <div className="space-y-5">
      <Card className="flex flex-wrap items-center gap-2 p-4">
        <a href={`/contratos/${c.id}/pdf`} target="_blank" rel="noreferrer" className={buttonVariants({ variant: c.hasFinal ? 'primary' : 'secondary' })}>
          <Download /> {c.hasFinal ? 'Baixar contrato assinado' : 'Baixar minuta (PDF)'}
        </a>
        {canEdit && c.status === 'RASCUNHO' && <Button onClick={send} disabled={pending}><Send /> Enviar para assinatura</Button>}
        {canEdit && (c.status === 'RASCUNHO' || open) && <Button variant="ghost" onClick={() => setCancelling((v) => !v)} disabled={pending}><Ban /> Cancelar contrato</Button>}
        {c.status === 'CANCELADO' && c.cancelReason && <span className="text-sm text-critico">Cancelado: {c.cancelReason}</span>}
        {c.finalHash && <span className="w-full break-all font-mono text-[10px] text-tinta-fraca">SHA-256 do PDF assinado: {c.finalHash}</span>}
        {cancelling && (
          <div className="flex w-full flex-wrap gap-2 rounded-xl bg-fundo p-3">
            <Input className="min-w-60 flex-1" placeholder="Motivo do cancelamento" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
            <Button variant="danger" disabled={pending || reason.trim().length < 3} onClick={cancel}>Confirmar cancelamento</Button>
          </div>
        )}
        <div className="w-full"><FormMessage error={msg.error} success={msg.success} /></div>
      </Card>

      {links.length > 0 && (
        <Card className="space-y-2 border-nacao/40 p-4">
          <h2 className="text-sm font-extrabold text-navy">Links de assinatura</h2>
          <p className="text-xs text-tinta-suave">Cada link é pessoal e só aparece agora. Se o WhatsApp falhar, copie e envie você mesmo.</p>
          {links.map((l) => (
            <div key={l.link} className="flex flex-wrap items-center gap-2 rounded-lg bg-fundo p-2 text-sm">
              <b className="min-w-32">{l.name}</b>
              <span className="text-xs text-tinta-suave">WhatsApp: {l.whatsapp}</span>
              <code className="min-w-0 flex-1 truncate text-xs">{l.link}</code>
              <Button size="sm" variant="secondary" onClick={() => copy(l.link)}><Copy /> Copiar link</Button>
            </div>
          ))}
        </Card>
      )}

      {c.status !== 'RASCUNHO' && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <Card className="p-5"><ContractText text={c.body} /></Card>
          <div className="space-y-5">
            <Card className="divide-y divide-borda">
              <h2 className="px-4 py-3 text-sm font-extrabold text-navy">Partes</h2>
              {c.signers.map((s) => (
                <div key={s.id} className="space-y-1 px-4 py-3 text-sm">
                  <div className="flex items-center justify-between gap-2"><b className="text-tinta">{s.name}</b><Badge tone={SIGNER[s.status]?.tone ?? 'amber'}>{SIGNER[s.status]?.label ?? s.status}</Badge></div>
                  <p className="text-xs text-tinta-suave">{roleLabel(s.role)} · WhatsApp {maskPhone(s.phone)}</p>
                  <p className="text-xs text-tinta-suave">{s.signedAt ? `Assinou em ${dt(s.signedAt)}` : s.viewedAt ? `Abriu em ${dt(s.viewedAt)}` : 'Ainda não abriu o link'}</p>
                  {s.refusedReason && <p className="text-xs text-critico">Motivo: {s.refusedReason}</p>}
                  {canEdit && open && s.status === 'PENDENTE' && <Button size="sm" variant="ghost" disabled={pending} onClick={() => resend(s.id, s.name)}><RefreshCw /> Novo link</Button>}
                </div>
              ))}
            </Card>
            <Card className="p-4">
              <h2 className="mb-2 text-sm font-extrabold text-navy">Histórico</h2>
              <ol className="space-y-1.5 text-xs text-tinta-suave">
                {c.events.map((e, i) => (
                  <li key={i}><span className="font-mono">{dt(e.at)}</span> — {e.who ?? (e.detail as { por?: string } | null)?.por ? <b className="text-tinta">{e.who ?? (e.detail as { por?: string }).por}: </b> : null}{EVENT[e.type] ?? e.type}{e.ip ? ` (IP ${e.ip})` : ''}</li>
                ))}
              </ol>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
