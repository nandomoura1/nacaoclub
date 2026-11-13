'use client';

import { useState, useTransition } from 'react';
import { Copy, Webhook } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/alert';
import { registerWebhookAction } from '../actions';

interface Overview {
  secretConfigured: boolean;
  adminKeyConfigured: boolean;
  last7: { event: string; status: string; count: number }[];
  recent: { event: string; status: string; error: string | null; at: string }[];
}
const at = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });

/** Avisos em tempo real da Tecnofit: status, cadastro (uma vez) e últimos recebidos. */
export function WebhookPanel({ o }: { o: Overview }) {
  const [secret, setSecret] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const total = o.last7.reduce((s, x) => s + x.count, 0);
  const errors = o.last7.filter((x) => x.status === 'ERRO').reduce((s, x) => s + x.count, 0);
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap gap-2">
        <Badge tone={o.secretConfigured ? 'green' : 'amber'}>{o.secretConfigured ? 'Recebendo avisos (secret configurado)' : 'Secret não configurado'}</Badge>
        <Badge>{total} aviso(s) em 7 dias{errors ? ` · ${errors} com erro` : ''}</Badge>
      </div>
      {!o.secretConfigured && (
        <div className="rounded-lg bg-fundo p-3">
          <p className="mb-2 text-tinta">Para receber os avisos (pagamento, ligação, contrato, check-in) na hora:</p>
          <ol className="list-decimal space-y-1 pl-5 text-xs text-tinta-suave">
            <li>Na Tecnofit (Gerencial → Configuração → Integrações (API)) crie uma <b>chave separada</b> com a permissão de administrar webhooks e cadastre na Vercel como <code>TECNOFIT_WEBHOOK_API_KEY</code> e <code>TECNOFIT_WEBHOOK_API_SECRET</code>.</li>
            <li>Clique em “Cadastrar webhook na Tecnofit”. O secret aparece <b>uma única vez</b> aqui.</li>
            <li>Cole o secret na Vercel como <code>TECNOFIT_WEBHOOK_SECRET</code> e faça um novo deploy. O sistema não guarda o secret.</li>
          </ol>
          <Button className="mt-3" size="sm" disabled={pending || !o.adminKeyConfigured} onClick={() => start(async () => {
            setMsg(null);
            const r = await registerWebhookAction();
            if (!r.ok) return setMsg(r.error);
            setSecret(r.data.secret);
          })}><Webhook /> {pending ? 'Cadastrando…' : 'Cadastrar webhook na Tecnofit'}</Button>
          {!o.adminKeyConfigured && <p className="mt-1 text-xs text-atencao">Falta a chave de webhooks na Vercel (passo 1).</p>}
        </div>
      )}
      {secret && (
        <div className="rounded-lg border border-atencao bg-atencao/10 p-3">
          <p className="font-semibold text-tinta">Secret do webhook — copie agora (não aparece de novo):</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <code className="break-all rounded bg-white px-2 py-1">{secret}</code>
            <Button size="sm" variant="secondary" onClick={() => navigator.clipboard?.writeText(secret)}><Copy /> Copiar</Button>
          </div>
          <p className="mt-1 text-xs text-tinta-suave">Cole na Vercel como <code>TECNOFIT_WEBHOOK_SECRET</code> e faça um novo deploy. Até lá os avisos chegam e são recusados (a Tecnofit tenta de novo).</p>
        </div>
      )}
      <FormMessage error={msg} />
      {o.recent.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-tinta-suave"><tr><th className="py-1 pr-3">Quando</th><th className="pr-3">Evento</th><th>Situação</th></tr></thead>
            <tbody className="divide-y divide-borda">
              {o.recent.map((r, i) => <tr key={i}><td className="py-1 pr-3">{at(r.at)}</td><td className="pr-3"><code>{r.event}</code></td><td>{r.status}{r.error ? ` · ${r.error}` : ''}</td></tr>)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
