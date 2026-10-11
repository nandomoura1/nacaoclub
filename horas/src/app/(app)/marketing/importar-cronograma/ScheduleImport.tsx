'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, FileText, RotateCcw, Sparkles, Upload } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Input, Select } from '@/components/ui/input';
import { CAMPAIGN_STATUSES, CAMPAIGN_TYPES, EVENT_STATUSES } from '@/domain/marketing/constants';
import { IMPORT_KINDS, importKind, type PlannedRow } from '@/domain/marketing/schedule-import';
import { cn } from '@/lib/cn';
import type { ScheduleReview } from '@/server/services/mkt-import-service';
import { analyzeScheduleAction, commitScheduleAction, undoImportAction } from '../actions';
import { useRun } from '../_components/useRun';

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const monthName = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
const CAMP_ST = CAMPAIGN_STATUSES.filter((s) => ['IDEIA', 'PLANEJAMENTO', 'FINALIZADA', 'ANALISE'].includes(s.id));
const TARGET_LABEL = { evento: 'Eventos', campanha: 'Campanhas', item: 'Datas do calendário' } as const;
type Imports = { id: string; source: string; counts: Record<string, number>; createdAt: string; undoneAt: string | null }[];

export function ScheduleImport({ review, imports, canAi }: { review: ScheduleReview | null; imports: Imports; canAi: boolean }) {
  return (
    <div className="space-y-4">
      {review ? <Review review={review} /> : <UploadStep canAi={canAi} />}
      {imports.length > 0 && <History imports={imports} />}
    </div>
  );
}

function UploadStep({ canAi }: { canAi: boolean }) {
  const router = useRouter();
  const { msg, setMsg, pending, run } = useRun();
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  const send = () => {
    const fd = new FormData();
    if (file) fd.set('file', file); else fd.set('text', text);
    run(() => analyzeScheduleAction(fd), (r) => { if (r.ok) router.push(`?leitura=${r.data}`); });
  };
  return (
    <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
      <Card className="p-4">
        <h2 className="font-bold text-navy">1. Exporte o documento</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
          <li>Abra o cronograma no Google Docs.</li>
          <li><b>Arquivo → Fazer download → Microsoft Word (.docx)</b>.</li>
          <li>Envie o arquivo aqui ao lado — ou copie todo o texto (Ctrl+A, Ctrl+C) e cole no campo.</li>
        </ol>
        <p className="mt-3 text-xs text-tinta-suave">A IA separa cada linha datada em <b>evento</b>, <b>campanha/ação</b>, <b>tema do mês</b>, <b>datas comemorativas e de saúde</b>, <b>pautas de conteúdo</b>, <b>oportunidades comerciais</b> e <b>avisos de funcionamento</b>. Festas particulares de alunos viram “evento privado”, sem nomes. Nada é gravado antes da sua revisão.</p>
      </Card>
      <Card className="space-y-2 p-4">
        <h2 className="font-bold text-navy">2. Envie ou cole</h2>
        <button type="button" onClick={() => ref.current?.click()} className={cn('flex w-full items-center gap-3 rounded-xl border-2 border-dashed p-4 text-left text-sm', file ? 'border-nacao bg-nacao/5' : 'border-borda hover:border-nacao/50')}>
          <FileText className="size-6 shrink-0 text-nacao" />
          <span className="min-w-0 flex-1 truncate">{file ? file.name : 'Escolher arquivo (.docx, PDF, TXT)'}</span>
          {file && <span className="text-xs text-tinta-suave" onClick={(e) => { e.stopPropagation(); setFile(null); }}>trocar</span>}
        </button>
        <input ref={ref} type="file" accept=".docx,.pdf,.txt,.md,.html" className="hidden" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setMsg({}); e.target.value = ''; }} />
        {!file && <textarea className="min-h-40 w-full rounded-lg border border-borda p-2 text-sm" placeholder="…ou cole aqui o texto do cronograma" value={text} onChange={(e) => setText(e.target.value)} />}
        <Button disabled={pending || !canAi || (!file && text.trim().length < 40)} onClick={send}><Sparkles /> {pending ? 'A IA está lendo o cronograma… (1–2 min)' : 'Ler cronograma (IA)'}</Button>
        {!canAi && <p className="text-xs text-critico">Seu perfil não usa a IA de marketing.</p>}
        <FormMessage error={msg.error} />
      </Card>
    </div>
  );
}

function Review({ review }: { review: ScheduleReview }) {
  const router = useRouter();
  const { msg, pending, run } = useRun();
  const [rows, setRows] = useState<PlannedRow[]>(review.rows);
  const [done, setDone] = useState<{ eventos: number; campanhas: number; datas: number; duplicados: number } | null>(null);
  const set = (i: number, patch: Partial<PlannedRow>) => setRows((cur) => cur.map((r) => (r.index === i ? { ...r, ...patch } : r)));
  const months = useMemo(() => [...new Set(rows.map((r) => r.startDate.slice(0, 7)))].sort(), [rows]);
  const chosen = rows.filter((r) => r.include);
  const byTarget = (['evento', 'campanha', 'item'] as const).map((t) => ({ t, n: chosen.filter((r) => r.target === t).length }));
  const toggleKind = (kind: string, on: boolean) => setRows((cur) => cur.map((r) => (r.kind === kind && !r.duplicate ? { ...r, include: on } : r)));
  const locked = review.status !== 'PENDENTE';

  if (done) {
    return (
      <Card className="p-6 text-center">
        <CheckCircle2 className="mx-auto size-10 text-sucesso" />
        <p className="mt-2 text-lg font-bold text-navy">Cronograma importado</p>
        <p className="text-sm text-tinta-suave">{done.eventos} evento(s) · {done.campanhas} campanha(s) · {done.datas} data(s) no calendário{done.duplicados ? ` · ${done.duplicados} já existiam` : ''}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Link href="/marketing/calendario?v=ano" className={buttonVariants({})}>Ver no calendário</Link>
          <Link href="/marketing/eventos" className={buttonVariants({ variant: 'secondary' })}>Eventos</Link>
          <Link href="/marketing/memoria" className={buttonVariants({ variant: 'secondary' })}>Ensinar a IA (Memória)</Link>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <FileText className="size-6 text-nacao" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold text-navy">{review.source}</p>
          <p className="text-xs text-tinta-suave">{rows.length} itens lidos pela IA ({review.model}) · {months.length ? `${monthName(months[0]!)} a ${monthName(months.at(-1)!)}` : ''}{locked ? ' · já importado' : ''}</p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => router.push('?')}>Outro documento</Button>
      </Card>
      {review.avisos.length > 0 && <Card className="border-atencao/40 bg-atencao/5 p-3 text-sm"><b>Avisos da leitura:</b><ul className="mt-1 list-disc pl-5">{review.avisos.map((a, i) => <li key={i}>{a}</li>)}</ul></Card>}

      <Card className="p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-tinta-suave">Marcar / desmarcar por tipo</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {IMPORT_KINDS.filter((k) => rows.some((r) => r.kind === k.id)).map((k) => {
            const all = rows.filter((r) => r.kind === k.id);
            const on = all.filter((r) => r.include).length;
            return (
              <button key={k.id} type="button" disabled={locked} onClick={() => toggleKind(k.id, on < all.length)}
                className={cn('rounded-full px-3 py-1 text-xs font-semibold ring-1', on ? 'bg-nacao text-white ring-nacao' : 'bg-white text-tinta-suave ring-borda')}>
                {k.label} {on}/{all.length}
              </button>
            );
          })}
        </div>
      </Card>

      {months.map((ym) => (
        <Card key={ym} className="overflow-hidden">
          <p className="bg-fundo px-3 py-2 text-sm font-bold capitalize text-navy">{monthName(ym)}</p>
          <ul className="divide-y divide-borda">
            {rows.filter((r) => r.startDate.startsWith(ym)).map((r) => {
              const k = importKind(r.kind);
              return (
                <li key={r.index} className={cn('grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1 px-3 py-2 text-sm md:grid-cols-[auto_8rem_minmax(0,1fr)_11rem_16rem]', !r.include && 'opacity-50')}>
                  <input type="checkbox" checked={r.include} disabled={locked} onChange={(e) => set(r.index, { include: e.target.checked })} aria-label={`Importar ${r.title}`} />
                  <Input type="date" className="h-8 text-xs" value={r.startDate} disabled={locked} onChange={(e) => set(r.index, { startDate: e.target.value })} />
                  <div className="col-start-2 min-w-0 md:col-start-auto">
                    <Input className="h-8 text-sm" value={r.title} disabled={locked} onChange={(e) => set(r.index, { title: e.target.value })} title={r.origem} />
                    <p className="mt-0.5 flex flex-wrap gap-1 text-[10px]">
                      {r.duplicate && <span className="rounded bg-atencao/15 px-1.5 font-semibold text-atencao">já existe</span>}
                      {r.aConfirmar && <span className="rounded bg-fundo px-1.5 text-tinta-suave">a confirmar</span>}
                      {r.endDate && <span className="text-tinta-suave">até {r.endDate.split('-').reverse().join('/')}</span>}
                      {r.notes && <span className="truncate text-tinta-fraca" title={r.notes}>{r.notes.split('\n')[0]}</span>}
                    </p>
                  </div>
                  <Select className="col-start-2 h-8 text-xs md:col-start-auto" value={r.kind} disabled={locked}
                    onChange={(e) => { const nk = importKind(e.target.value); set(r.index, { kind: nk.id, target: nk.target, status: nk.target === 'evento' ? (r.startDate < new Date().toISOString().slice(0, 10) ? 'REALIZADO' : 'PLANEJADO') : nk.target === 'campanha' ? 'IDEIA' : '' }); }}>
                    {IMPORT_KINDS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                  </Select>
                  <div className="col-start-2 md:col-start-auto">
                    {k.target === 'evento' && <Select className="h-8 text-xs" value={r.status} disabled={locked} onChange={(e) => set(r.index, { status: e.target.value })}>{EVENT_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Select>}
                    {k.target === 'campanha' && (
                      <div className="flex gap-1">
                        <Select className="h-8 min-w-0 text-xs" value={r.status} disabled={locked} onChange={(e) => set(r.index, { status: e.target.value })}>{CAMP_ST.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Select>
                        <Select className="h-8 min-w-0 text-xs" aria-label="Tipo de campanha" value={r.campaignType} disabled={locked} onChange={(e) => set(r.index, { campaignType: e.target.value })}>{CAMPAIGN_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</Select>
                      </div>
                    )}
                    {k.target === 'item' && <span className="text-xs text-tinta-fraca">data no calendário</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      ))}

      <Card className="sticky bottom-20 z-10 flex flex-wrap items-center gap-3 border-nacao/30 p-3 lg:bottom-4">
        <p className="min-w-0 flex-1 text-sm">{byTarget.map((b) => `${b.n} ${TARGET_LABEL[b.t].toLowerCase()}`).join(' · ')}</p>
        <FormMessage error={msg.error} />
        <Button disabled={pending || locked || !chosen.length}
          onClick={() => run(() => commitScheduleAction(review.id, chosen.map((r) => ({ index: r.index, kind: r.kind, title: r.title, startDate: r.startDate, endDate: r.endDate, status: r.status, campaignType: r.campaignType }))), (r) => { if (r.ok) setDone(r.data); })}>
          <Upload /> {pending ? 'Importando…' : `Importar ${chosen.length} item(ns)`}
        </Button>
      </Card>
    </div>
  );
}

function History({ imports }: { imports: Imports }) {
  const { msg, pending, run } = useRun();
  return (
    <Card className="p-4">
      <h2 className="font-bold text-navy">Importações anteriores</h2>
      <FormMessage error={msg.error} success={msg.ok} />
      <ul className="mt-2 divide-y divide-borda text-sm">
        {imports.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center gap-2 py-2">
            <span className="min-w-0 flex-1 truncate font-semibold">{i.source}</span>
            <span className="text-xs text-tinta-suave">{new Date(i.createdAt).toLocaleDateString('pt-BR')} · {i.counts.eventos ?? 0} eventos · {i.counts.campanhas ?? 0} campanhas · {i.counts.datas ?? 0} datas</span>
            {i.undoneAt ? <span className="text-xs text-tinta-fraca">desfeita</span> : (
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => confirm('Desfazer esta importação? Itens já usados (campanha com tarefas, evento com campanha) ficam.') && run(() => undoImportAction(i.id), (r) => r.ok && undefined)}><RotateCcw /> Desfazer</Button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
