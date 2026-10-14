'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BarChart3, CalendarDays, Check, CheckCircle2, ClipboardCopy, ListPlus, PenLine, Sparkles, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Input, Label, Select } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import { FORMATS, PILLARS } from '@/domain/marketing/studio';
import type { StudioItem } from '@/server/services/mkt-studio-service';
import { approveCopyAction, discardStudioAction, studioAnaliseAction, studioCopyAction, studioPautaAction, studioToTaskAction } from '../ia-actions';

type Opt = { id: string; name: string };
type Tab = 'textos' | 'pauta' | 'analise';
type Res<T> = { ok: true; data: T; message?: string } | { ok: false; error: string };
const TABS: { id: Tab; label: string; icon: typeof PenLine; hint: string }[] = [
  { id: 'textos', label: 'Legendas e roteiros', icon: PenLine, hint: 'Post, carrossel, reels, stories, WhatsApp ou e-mail a partir de uma campanha ou tema.' },
  { id: 'pauta', label: 'Pauta da semana', icon: CalendarDays, hint: 'Ideias de posts a partir dos eventos, campanhas e temas do período (70% comunidade, 20% autoridade, 10% oferta).' },
  { id: 'analise', label: 'Leitura da Performance', icon: BarChart3, hint: 'O que funcionou, o que preocupa e o que fazer — a partir dos números do painel.' },
];
const KIND: Record<Tab, StudioItem['kind']> = { textos: 'COPY', pauta: 'PAUTA', analise: 'ANALISE' };
const STATUS: Record<string, { label: string; tone: 'neutral' | 'green' | 'amber' | 'red' }> = { PENDENTE: { label: 'Para revisar', tone: 'amber' }, ACEITA: { label: 'Aprovado', tone: 'green' }, PARCIAL: { label: 'Em parte', tone: 'green' }, RECUSADA: { label: 'Descartado', tone: 'neutral' } };
const fmt = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
const br = (iso: string) => iso.split('-').reverse().slice(0, 2).join('/');
const PILAR_TONE = { COMUNIDADE: 'cyan', AUTORIDADE: 'navy', OFERTA: 'amber' } as const;

export function StudioClient({ items, campaigns, today, weekEnd, monthStart, tab: initialTab, campaignId, perms, configured }: {
  items: StudioItem[]; campaigns: Opt[]; today: string; weekEnd: string; monthStart: string; tab: Tab; campaignId: string;
  perms: { ai: boolean; edit: boolean }; configured: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [msg, setMsg] = useState<{ ok?: string | null; error?: string | null }>({});
  const [copy, setCopy] = useState({ formato: 'REELS', pilar: 'COMUNIDADE', campaignId, tema: '', instrucoes: '' });
  const [pauta, setPauta] = useState({ de: today, ate: weekEnd, foco: '' });
  const [analise, setAnalise] = useState({ de: monthStart, ate: today });

  const run = <T,>(fn: () => Promise<Res<T>>, okMsg?: string) => start(async () => {
    setMsg({}); const r = await fn();
    if (!r.ok) setMsg({ error: r.error }); else setMsg({ ok: okMsg ?? r.message ?? null });
    router.refresh();
  });
  const list = items.filter((i) => i.kind === KIND[tab]);
  const current = TABS.find((t) => t.id === tab)!;

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-1 rounded-xl bg-white p-1 ring-1 ring-borda">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => { setTab(t.id); setMsg({}); }} className={cn('inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold', tab === t.id ? 'bg-navy text-white' : 'text-tinta-suave hover:bg-fundo')}>
            <t.icon className="size-4" /> {t.label}
          </button>
        ))}
      </nav>

      {!configured && <Card className="border-atencao/40 p-3 text-sm text-tinta-suave">A IA ainda não está configurada no servidor (ANTHROPIC_API_KEY).</Card>}

      {perms.ai && (
        <Card className="p-4">
          <p className="text-sm text-tinta-suave">{current.hint}</p>
          {tab === 'textos' && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 [&>*]:min-w-0">
              <div><Label>Formato</Label><Select value={copy.formato} onChange={(e) => setCopy({ ...copy, formato: e.target.value })}>{FORMATS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</Select></div>
              <div><Label>Pilar</Label><Select value={copy.pilar} onChange={(e) => setCopy({ ...copy, pilar: e.target.value })}>{PILLARS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</Select></div>
              <div className="sm:col-span-2"><Label>Campanha</Label><Select value={copy.campaignId} onChange={(e) => setCopy({ ...copy, campaignId: e.target.value })}><option value="">— (tema livre)</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>
              <div className="sm:col-span-2"><Label>Tema {copy.campaignId ? '(opcional)' : ''}</Label><Input value={copy.tema} onChange={(e) => setCopy({ ...copy, tema: e.target.value })} placeholder="ex.: turma de Beach Tennis iniciante às 19h" /></div>
              <div className="sm:col-span-2"><Label>Instruções para a IA (opcional)</Label><Input value={copy.instrucoes} onChange={(e) => setCopy({ ...copy, instrucoes: e.target.value })} placeholder="ex.: mais curto, citar o professor da turma, tom divertido" /></div>
            </div>
          )}
          {tab === 'pauta' && (
            <div className="mt-3 grid gap-3 sm:grid-cols-[auto_auto_minmax(0,1fr)]">
              <div><Label>De</Label><Input type="date" value={pauta.de} onChange={(e) => setPauta({ ...pauta, de: e.target.value })} /></div>
              <div><Label>Até</Label><Input type="date" value={pauta.ate} onChange={(e) => setPauta({ ...pauta, ate: e.target.value })} /></div>
              <div><Label>Foco da semana (opcional)</Label><Input value={pauta.foco} onChange={(e) => setPauta({ ...pauta, foco: e.target.value })} placeholder="ex.: encher a turma de Hyrox das 18h" /></div>
            </div>
          )}
          {tab === 'analise' && (
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div><Label>De</Label><Input type="date" value={analise.de} onChange={(e) => setAnalise({ ...analise, de: e.target.value })} /></div>
              <div><Label>Até</Label><Input type="date" value={analise.ate} onChange={(e) => setAnalise({ ...analise, ate: e.target.value })} /></div>
              <Link href="/marketing/performance" className="pb-2 text-sm font-semibold text-nacao">Ver o painel →</Link>
            </div>
          )}
          <Button className="mt-3" disabled={pending || !configured} onClick={() => {
            if (tab === 'textos') run(() => studioCopyAction({ ...copy, campaignId: copy.campaignId || null, tema: copy.tema || null, instrucoes: copy.instrucoes || null }), 'Pronto! Revise as variações abaixo.');
            else if (tab === 'pauta') run(() => studioPautaAction({ ...pauta, foco: pauta.foco || null }), 'Pauta pronta! Escolha o que vira tarefa.');
            else run(() => studioAnaliseAction(analise), 'Leitura pronta.');
          }}><Sparkles /> {pending ? 'A IA está escrevendo… (até 1 min)' : 'Gerar com IA'}</Button>
        </Card>
      )}
      <FormMessage error={msg.error} success={msg.ok} />

      {list.length === 0 ? <Card className="p-6 text-center text-sm text-tinta-suave">Nada gerado ainda nesta aba.</Card> : (
        <div className="space-y-3">
          {list.map((it) => (
            <Card key={it.id} className={cn('p-4', it.status === 'RECUSADA' && 'opacity-60')}>
              <div className="flex flex-wrap items-center gap-2 text-xs text-tinta-suave">
                <Badge tone={STATUS[it.status]?.tone ?? 'neutral'}>{STATUS[it.status]?.label ?? it.status}</Badge>
                <span>{fmt(it.createdAt)}{it.createdBy ? ` · ${it.createdBy}` : ''}{it.model === 'exemplo local' ? ' · exemplo local' : ''}</span>
                {perms.edit && it.status === 'PENDENTE' && <button type="button" className="ml-auto inline-flex items-center gap-1 hover:text-critico" onClick={() => run(() => discardStudioAction(it.id))}><X className="size-3.5" /> descartar</button>}
              </div>
              {it.kind === 'COPY' && <CopyCard it={it} canEdit={perms.edit} pending={pending} onApprove={(i, t) => run(() => approveCopyAction(it.id, i, t))} />}
              {it.kind === 'PAUTA' && <PautaCard it={it} canEdit={perms.edit} pending={pending} onTask={(i) => run(() => studioToTaskAction(it.id, i))} />}
              {it.kind === 'ANALISE' && <AnaliseCard it={it} canEdit={perms.edit} pending={pending} onTask={(i) => run(() => studioToTaskAction(it.id, i))} />}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function CopyCard({ it, canEdit, pending, onApprove }: { it: Extract<StudioItem, { kind: 'COPY' }>; canEdit: boolean; pending: boolean; onApprove: (i: number, texto: string) => void }) {
  const p = it.payload;
  const full = (v: (typeof p.variacoes)[number]) => [v.texto, v.cta && !v.texto.includes(v.cta) ? v.cta : null, v.hashtags.length ? v.hashtags.map((h) => `#${h.replace(/^#/, '')}`).join(' ') : null].filter(Boolean).join('\n\n');
  const [texts, setTexts] = useState(() => p.variacoes.map(full));
  const [copied, setCopied] = useState<number | null>(null);
  const copy = (t: string, i: number) => { void navigator.clipboard.writeText(t); setCopied(i); setTimeout(() => setCopied(null), 1500); };
  return (
    <>
      <p className="mt-2 font-bold text-navy">{FORMATS.find((f) => f.id === p.pedido.formato)?.label} · {p.pedido.campanha ?? p.pedido.tema}</p>
      <p className="text-xs text-tinta-suave">Pilar {p.pedido.pilar.toLowerCase()}{p.pedido.instrucoes ? ` · “${p.pedido.instrucoes}”` : ''}</p>
      {p.aprovada ? (
        <div className="mt-3 rounded-lg border border-sucesso/30 bg-sucesso/5 p-3">
          <p className="flex items-center gap-1 text-xs font-semibold text-sucesso"><CheckCircle2 className="size-4" /> Aprovado: {p.variacoes[p.aprovada.index]?.titulo}</p>
          <p className="mt-1 whitespace-pre-line text-sm">{p.aprovada.texto}</p>
          {p.variacoes[p.aprovada.index]?.roteiro.length ? <Roteiro r={p.variacoes[p.aprovada.index]!.roteiro} /> : null}
          <p className="mt-2 text-xs text-tinta-suave">Visual: {p.variacoes[p.aprovada.index]?.visual}</p>
          <Button size="sm" variant="secondary" className="mt-2" onClick={() => copy(p.aprovada!.texto, -1)}><ClipboardCopy /> {copied === -1 ? 'Copiado!' : 'Copiar texto'}</Button>
        </div>
      ) : (
        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          {p.variacoes.map((v, i) => (
            <div key={i} className="flex min-w-0 flex-col rounded-lg bg-fundo p-3">
              <p className="text-sm font-semibold text-navy">{v.titulo}</p>
              <textarea value={texts[i]} onChange={(e) => setTexts(texts.map((t, j) => (j === i ? e.target.value : t)))} rows={9} disabled={!canEdit || it.status === 'RECUSADA'}
                className="mt-1 w-full flex-1 rounded-md border border-borda bg-white p-2 text-sm" aria-label={`Texto da variação ${v.titulo}`} />
              {v.roteiro.length > 0 && <Roteiro r={v.roteiro} />}
              <p className="mt-2 text-xs text-tinta-suave">Visual: {v.visual}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {canEdit && it.status === 'PENDENTE' && <Button size="sm" disabled={pending} onClick={() => onApprove(i, texts[i]!)}><Check /> Aprovar esta</Button>}
                <Button size="sm" variant="ghost" onClick={() => copy(texts[i]!, i)}><ClipboardCopy /> {copied === i ? 'Copiado!' : 'Copiar'}</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function Roteiro({ r }: { r: string[] }) {
  return <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-xs text-tinta">{r.map((c, i) => <li key={i}>{c.replace(/^\s*(cena|tela|slide)\s*\d+\s*[:.-]\s*/i, '')}</li>)}</ol>;
}

function PautaCard({ it, canEdit, pending, onTask }: { it: Extract<StudioItem, { kind: 'PAUTA' }>; canEdit: boolean; pending: boolean; onTask: (i: number) => void }) {
  const p = it.payload;
  return (
    <>
      <p className="mt-2 font-bold text-navy">Pauta de {br(p.pedido.de)} a {br(p.pedido.ate)}{p.pedido.foco ? ` · foco: ${p.pedido.foco}` : ''}</p>
      <p className="text-xs text-tinta-suave">{p.observacao}</p>
      <ul className="mt-3 divide-y divide-borda">
        {[...p.ideias.map((x, i) => ({ ...x, i }))].sort((a, b) => a.data.localeCompare(b.data)).map((x) => (
          <li key={x.i} className="flex flex-wrap items-start gap-2 py-2 text-sm">
            <span className="w-12 shrink-0 font-semibold tabular-nums text-navy">{br(x.data)}</span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-navy">{x.titulo} <Badge tone={PILAR_TONE[x.pilar]}>{x.pilar.toLowerCase()}</Badge> <span className="text-xs font-normal text-tinta-suave">{x.formato.replace('_', ' ').toLowerCase()}</span></p>
              <p className="text-tinta">“{x.gancho}”</p>
              <p className="text-xs text-tinta-suave">{x.porque}{x.campanha ? ` · ${x.campanha}` : ''}</p>
            </div>
            {p.tarefas?.[x.i] ? <span className="text-xs font-semibold text-sucesso">✓ virou tarefa</span>
              : canEdit && it.status !== 'RECUSADA' && <Button size="sm" variant="secondary" disabled={pending} onClick={() => onTask(x.i)}><ListPlus /> Virar tarefa</Button>}
          </li>
        ))}
      </ul>
    </>
  );
}

function AnaliseCard({ it, canEdit, pending, onTask }: { it: Extract<StudioItem, { kind: 'ANALISE' }>; canEdit: boolean; pending: boolean; onTask: (i: number) => void }) {
  const p = it.payload;
  return (
    <>
      <p className="mt-2 font-bold text-navy">Performance de {br(p.pedido.de)} a {br(p.pedido.ate)}</p>
      <p className="mt-1 text-sm">{p.resumo}</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div><p className="text-xs font-semibold uppercase text-sucesso">Funcionou</p><ul className="mt-1 list-disc pl-5 text-sm">{p.funcionou.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
        <div><p className="text-xs font-semibold uppercase text-critico">Atenção</p><ul className="mt-1 list-disc pl-5 text-sm">{p.atencao.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
      </div>
      <p className="mt-3 text-xs font-semibold uppercase text-tinta-suave">O que fazer</p>
      <ol className="mt-1 space-y-2">
        {p.acoes.map((a, i) => (
          <li key={i} className="flex flex-wrap items-start gap-2 text-sm">
            <span className="font-bold text-nacao">{i + 1}.</span>
            <div className="min-w-0 flex-1"><p className="font-semibold text-navy">{a.titulo}</p><p className="text-xs text-tinta-suave">{a.porque}</p></div>
            {a.tarefa && (p.tarefas?.[i] ? <span className="text-xs font-semibold text-sucesso">✓ virou tarefa</span>
              : canEdit && it.status !== 'RECUSADA' && <Button size="sm" variant="secondary" disabled={pending} onClick={() => onTask(i)}><ListPlus /> Virar tarefa</Button>)}
          </li>
        ))}
      </ol>
    </>
  );
}
