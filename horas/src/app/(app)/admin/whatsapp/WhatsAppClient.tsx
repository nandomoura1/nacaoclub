'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock, CheckCircle2, CircleAlert, Copy, Eye, Inbox, Play, Send, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { WA_KINDS } from '@/domain/whatsapp';
import { cn } from '@/lib/cn';
import type { WhatsAppOverview } from '@/server/services/whatsapp-service';
import { previewWaJobAction, runWaJobAction, sendWhatsAppAction, toggleWaJobAction } from '../../whatsapp/actions';
import type { ReplyOverview, WaJobView } from '@/server/whatsapp/jobs';
import { monthName } from '@/domain/wa-jobs';

const ENV = [
  { key: 'ZAPI_INSTANCE_ID', what: 'ID da instância (Z-API → Instâncias Web → ID da instância)', required: true },
  { key: 'ZAPI_INSTANCE_TOKEN', what: 'Token da instância (gere um novo antes de colar)', required: true },
  { key: 'ZAPI_CLIENT_TOKEN', what: 'Token de segurança da conta (Z-API → Segurança), se estiver ativado', required: false },
  { key: 'ZAPI_TEST_PHONE', what: 'Opcional: com ele, TODO envio vai só para este número (modo teste)', required: false },
  { key: 'CRON_SECRET', what: 'Senha do agendador dos envios automáticos (qualquer texto longo)', required: false },
];

export function WhatsAppClient({ v, jobs, cronReady, replies, webhookUrl }: { v: WhatsAppOverview; jobs: WaJobView[]; cronReady: boolean; replies: ReplyOverview; webhookUrl: string | null }) {
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
          {v.configured && !v.fake && (
            <div className="mt-3 rounded-lg bg-fundo p-2 text-xs">
              <p className="font-semibold text-tinta-suave">Conferir com o painel da Z-API (início…fim):</p>
              <p>ID: <code className="font-mono">{v.hints.id ?? '—'}</code></p>
              <p>Token: <code className="font-mono">{v.hints.token ?? '—'}</code></p>
              {v.hints.client && <p>Client-Token: <code className="font-mono">{v.hints.client}</code></p>}
            </div>
          )}
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

      <AutoJobs jobs={jobs} cronReady={cronReady} configured={v.configured} testMode={!!v.testPhone} />
      <Replies r={replies} webhookUrl={webhookUrl} />

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

type Preview = { total: number; semTelefone: string[]; amostras: { para: string; nome: string; texto: string }[] };

/** Envios automáticos: liga/desliga, prévia (sem enviar) e enviar agora. */
function AutoJobs({ jobs, cronReady, configured, testMode }: { jobs: WaJobView[]; cronReady: boolean; configured: boolean; testMode: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ key: string; p: Preview } | null>(null);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const act = (key: string, fn: () => Promise<void>) => { setBusy(key); setMsg(null); start(async () => { await fn(); setBusy(null); router.refresh(); }); };
  const fmt = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  return (
    <Card className="p-4">
      <h2 className="flex items-center gap-2 font-bold text-navy"><CalendarClock className="size-4 text-nacao" /> Envios automáticos</h2>
      <p className="mt-1 text-sm text-tinta-suave">Rodam sozinhos às 8h, no dia de cada um. Cada período é enviado uma vez só.{testMode ? ' Em modo teste, cada envio manda só as 3 primeiras mensagens, todas para o número de teste.' : ''}</p>
      {!cronReady && <p className="mt-2 rounded-lg border border-atencao/40 bg-atencao/5 p-2 text-sm text-atencao"><b>Falta 1 passo:</b> crie a variável <code>CRON_SECRET</code> na Vercel (qualquer senha longa) e faça Redeploy. Sem ela o agendador não roda — os botões abaixo funcionam.</p>}
      {msg?.error && <p className="mt-2 text-sm font-semibold text-critico">{msg.error}</p>}
      {msg?.ok && <p className="mt-2 text-sm font-semibold text-sucesso">{msg.ok}</p>}
      <div className="mt-3 grid gap-3 lg:grid-cols-3 [&>*]:min-w-0">
        {jobs.map((j) => {
          const r = j.lastResult;
          return (
            <div key={j.key} className={cn('flex flex-col gap-2 rounded-xl border p-3', j.enabled ? 'border-nacao/30' : 'border-borda opacity-80')}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-navy">{j.label}</p>
                  <p className="text-xs font-semibold text-nacao">{j.when}</p>
                </div>
                <label className="flex items-center gap-1.5 text-xs font-semibold">
                  <input type="checkbox" checked={j.enabled} disabled={pending} onChange={(e) => act(j.key, async () => { const x = await toggleWaJobAction(j.key, e.target.checked); setMsg(x.ok ? { ok: x.message ?? undefined } : { error: x.error }); })} />
                  {j.enabled ? 'ligado' : 'desligado'}
                </label>
              </div>
              <p className="text-xs text-tinta-suave">{j.detail}</p>
              <p className="text-xs text-tinta-fraca">
                {j.lastRunAt ? <>Último: {fmt(j.lastRunAt)}{r ? ` · ${r.enviados} enviada(s)${r.falhas ? `, ${r.falhas} falha(s)` : ''}${r.semTelefone?.length ? `, ${r.semTelefone.length} sem telefone` : ''}${r.limitadoTeste ? `, ${r.limitadoTeste} não enviadas (modo teste)` : ''}${r.erro ? ` · ${r.erro}` : ''}` : ''}</> : 'Ainda não rodou.'}
              </p>
              <div className="mt-auto flex flex-wrap gap-1.5">
                <Button size="sm" variant="secondary" disabled={pending} onClick={() => act(j.key, async () => { const x = await previewWaJobAction(j.key); if (x.ok) setPreview({ key: j.key, p: x.data }); else setMsg({ error: x.error }); })}><Eye /> {busy === j.key && pending ? 'Montando…' : 'Prévia'}</Button>
                <Button size="sm" variant="ghost" disabled={pending || !configured} onClick={() => { if (confirm(`Enviar agora "${j.label}"?${testMode ? ' (modo teste: até 3 mensagens para o número de teste)' : ''}`)) act(j.key, async () => { const x = await runWaJobAction(j.key); setMsg(x.ok ? { ok: `${x.data.enviados} enviada(s)${x.data.falhas ? `, ${x.data.falhas} falha(s)` : ''}${x.data.semTelefone.length ? ` · sem telefone: ${x.data.semTelefone.join(', ')}` : ''}${x.data.erro ? ` · ${x.data.erro}` : ''}` } : { error: x.error }); }); }}><Play /> Enviar agora</Button>
              </div>
            </div>
          );
        })}
      </div>
      {preview && (
        <div className="mt-4 rounded-xl border border-borda bg-fundo p-3">
          <div className="flex items-center gap-2">
            <p className="flex-1 text-sm font-bold text-navy">Prévia · {jobs.find((j) => j.key === preview.key)?.label} — {preview.p.total} destinatário(s) hoje</p>
            <button type="button" className="text-xs font-semibold text-nacao" onClick={() => setPreview(null)}>fechar</button>
          </div>
          {preview.p.semTelefone.length > 0 && <p className="mt-1 text-xs text-atencao">Sem WhatsApp cadastrado (não recebem): {preview.p.semTelefone.join(', ')}</p>}
          {preview.p.amostras.length === 0 && <p className="mt-2 text-sm text-tinta-suave">Ninguém receberia hoje.</p>}
          <div className="mt-2 grid gap-2 md:grid-cols-3 [&>*]:min-w-0">
            {preview.p.amostras.map((a, i) => (
              <div key={i} className="rounded-lg bg-white p-2 text-xs ring-1 ring-borda">
                <p className="mb-1 font-semibold text-tinta-suave">{a.nome} · {a.para}</p>
                <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap font-corpo text-tinta">{a.texto}</pre>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

const CONF = { CONFIRMADO: { label: 'confirmou', cls: 'bg-sucesso/15 text-sucesso' }, AJUSTE: { label: 'pediu ajuste', cls: 'bg-atencao/15 text-atencao' }, PENDENTE: { label: 'aguardando', cls: 'bg-fundo text-tinta-suave' } } as const;

/** Webhook "Ao receber": endereço para a Z-API, confirmações da grade e últimas mensagens recebidas. */
function Replies({ r, webhookUrl }: { r: ReplyOverview; webhookUrl: string | null }) {
  const [copied, setCopied] = useState(false);
  const count = (s: string) => r.confirmations.filter((c) => c.status === s).length;
  return (
    <Card className="p-4">
      <h2 className="flex items-center gap-2 font-bold text-navy"><Inbox className="size-4 text-nacao" /> Respostas recebidas</h2>
      <div className="mt-2 rounded-lg bg-fundo p-3 text-sm">
        <p className="font-semibold text-navy">Endereço do webhook (cole na Z-API → Webhooks → “Ao receber”)</p>
        {webhookUrl ? (
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded bg-white px-2 py-1 text-xs ring-1 ring-borda">{webhookUrl}</code>
            <Button size="sm" variant="secondary" onClick={() => { void navigator.clipboard.writeText(webhookUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }}><Copy /> {copied ? 'Copiado!' : 'Copiar'}</Button>
          </div>
        ) : <p className="mt-1 text-atencao">Crie a variável <code>CRON_SECRET</code> na Vercel e faça Redeploy: o endereço aparece aqui.</p>}
        <p className="mt-1 text-xs text-tinta-suave">{r.lastReceivedAt ? `Última mensagem recebida: ${new Date(r.lastReceivedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}` : 'Nenhuma mensagem recebida ainda — depois de cadastrar, mande um “oi” para o WhatsApp da Nação para testar.'}</p>
      </div>

      <div className="mt-3">
        <p className="text-sm font-bold text-navy">Grade de {monthName(r.period)} — {count('CONFIRMADO')} confirmaram · {count('AJUSTE')} pediram ajuste · {count('PENDENTE')} aguardando</p>
        {r.confirmations.length === 0 ? <p className="mt-1 text-sm text-tinta-suave">A grade deste mês ainda não foi enviada pelo sistema.</p> : (
          <ul className="mt-1 divide-y divide-borda text-sm">
            {r.confirmations.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1.5">
                <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold', CONF[c.status as keyof typeof CONF]?.cls)}>{CONF[c.status as keyof typeof CONF]?.label ?? c.status}</span>
                <span className="font-semibold">{c.name}</span>
                {c.reply && <span className="min-w-0 flex-1 whitespace-pre-line text-xs text-tinta">“{c.reply}”</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {r.inbound.length > 0 && (
        <div className="mt-3">
          <p className="text-sm font-bold text-navy">Últimas mensagens recebidas</p>
          <ul className="mt-1 divide-y divide-borda text-sm">
            {r.inbound.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-x-3 py-1.5">
                <span className="w-32 text-xs text-tinta-suave">{new Date(m.at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                <span className="font-semibold">{m.from}</span>
                <span className="min-w-0 flex-1 truncate text-tinta" title={m.text ?? ''}>{m.text ?? '(sem texto: áudio, imagem…)'}</span>
                {m.handled && <span className="text-xs font-semibold text-nacao">{m.handled === 'CONFIRMOU_GRADE' ? 'confirmou a grade' : 'ajuste na grade'}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
