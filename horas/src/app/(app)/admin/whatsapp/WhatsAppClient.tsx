'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, CircleAlert, Send, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { WA_KINDS } from '@/domain/whatsapp';
import { cn } from '@/lib/cn';
import type { WhatsAppOverview } from '@/server/services/whatsapp-service';
import { sendWhatsAppAction } from '../../whatsapp/actions';

const ENV = [
  { key: 'ZAPI_INSTANCE_ID', what: 'ID da instância (Z-API → Instâncias Web → ID da instância)', required: true },
  { key: 'ZAPI_INSTANCE_TOKEN', what: 'Token da instância (gere um novo antes de colar)', required: true },
  { key: 'ZAPI_CLIENT_TOKEN', what: 'Token de segurança da conta (Z-API → Segurança), se estiver ativado', required: false },
  { key: 'ZAPI_TEST_PHONE', what: 'Opcional: com ele, TODO envio vai só para este número (modo teste)', required: false },
];

export function WhatsAppClient({ v }: { v: WhatsAppOverview }) {
  const router = useRouter();
  const [to, setTo] = useState('');
  const [text, setText] = useState('Teste de integração do Nação ADM com a Z-API. ✅');
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();
  const connected = v.status?.connected;

  const send = () => start(async () => {
    setMsg(null);
    const r = await sendWhatsAppAction({ kind: 'TESTE', to, text });
    if (!r.ok) setMsg({ error: r.error });
    else setMsg({ ok: r.data.status === 'SIMULATED' ? 'Simulado (desenvolvimento).' : r.data.testMode ? `Enviado ao número de teste (destino: ${r.data.to}).` : `Enviado para ${r.data.to}.` });
    router.refresh();
  });

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <Card className="p-4">
          <h2 className="flex items-center gap-2 font-bold text-navy"><Smartphone className="size-4 text-nacao" /> Conexão</h2>
          {!v.configured ? (
            <p className="mt-2 flex items-start gap-2 text-sm text-atencao"><CircleAlert className="mt-0.5 size-4 shrink-0" /> Ainda não configurado. Cadastre as variáveis ao lado na Vercel e publique de novo.</p>
          ) : v.statusError ? (
            <p className="mt-2 flex items-start gap-2 text-sm text-critico"><CircleAlert className="mt-0.5 size-4 shrink-0" /> {v.statusError}</p>
          ) : (
            <p className={cn('mt-2 flex items-center gap-2 text-sm font-semibold', connected ? 'text-sucesso' : 'text-critico')}>
              {connected ? <CheckCircle2 className="size-4" /> : <CircleAlert className="size-4" />}
              {connected ? 'Instância conectada' : 'Instância desconectada — leia o QR Code de novo na Z-API'}
              {v.fake && ' (simulação)'}
            </p>
          )}
          {v.status?.error && <p className="mt-1 text-xs text-tinta-suave">Z-API: {v.status.error}</p>}
          <dl className="mt-3 space-y-1 text-xs">
            <div className="flex gap-2"><dt className="text-tinta-suave">Modo teste:</dt><dd className="font-semibold">{v.testPhone ? `sim → ${v.testPhone}` : 'não (envia para o destino real)'}</dd></div>
            <div className="flex gap-2"><dt className="text-tinta-suave">Client-Token:</dt><dd className="font-semibold">{v.clientToken ? 'configurado' : 'não usado'}</dd></div>
          </dl>
        </Card>

        <Card className="p-4 lg:col-span-2">
          <h2 className="font-bold text-navy">Configuração (variáveis de ambiente na Vercel)</h2>
          <p className="text-xs text-tinta-suave">As credenciais nunca ficam no código nem no banco: só nas variáveis do projeto na Vercel (Settings → Environment Variables), e depois um novo deploy.</p>
          <ul className="mt-2 space-y-1.5 text-sm">
            {ENV.map((e) => (
              <li key={e.key} className="flex flex-wrap items-baseline gap-2">
                <code className="rounded bg-fundo px-1.5 py-0.5 font-mono text-xs font-semibold text-navy">{e.key}</code>
                <span className="text-tinta-suave">{e.what}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="p-4">
        <h2 className="font-bold text-navy">Enviar mensagem de teste</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-[16rem_minmax(0,1fr)_auto] md:items-end">
          <div><Label>Para</Label><Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="61 98466-2806" inputMode="tel" /></div>
          <div><Label>Mensagem</Label><Input value={text} onChange={(e) => setText(e.target.value)} /></div>
          <Button disabled={pending || !v.configured || to.replace(/\D/g, '').length < 10 || !text.trim()} onClick={send}><Send /> {pending ? 'Enviando…' : 'Enviar teste'}</Button>
        </div>
        {msg?.error && <p className="mt-2 text-sm font-semibold text-critico">{msg.error}</p>}
        {msg?.ok && <p className="mt-2 text-sm font-semibold text-sucesso">{msg.ok}</p>}
      </Card>

      <Card className="overflow-hidden">
        <p className="bg-fundo px-4 py-2 text-sm font-bold text-navy">Últimos envios</p>
        {v.messages.length === 0 && <p className="p-4 text-sm text-tinta-suave">Nenhum envio ainda.</p>}
        <ul className="divide-y divide-borda text-sm">
          {v.messages.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
              <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold', m.status === 'SENT' ? 'bg-sucesso/15 text-sucesso' : m.status === 'FAILED' ? 'bg-critico/15 text-critico' : 'bg-fundo text-tinta-suave')}>
                {m.status === 'SENT' ? 'enviada' : m.status === 'FAILED' ? 'falhou' : 'simulada'}
              </span>
              <span className="w-36 text-xs text-tinta-suave">{new Date(m.at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
              <span className="font-semibold">{WA_KINDS.find((k) => k.id === m.kind)?.label ?? m.kind}</span>
              <span className="text-tinta-suave">→ {m.to}{m.testMode ? ' (teste)' : ''}{m.hasFile ? ' · PDF' : ''}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-tinta-fraca" title={m.error ?? m.preview ?? ''}>{m.error ?? m.preview ?? (m.kind === 'ACESSO' ? 'mensagem com senha (texto não guardado)' : '')}</span>
              <span className="text-xs text-tinta-suave">{m.by}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
