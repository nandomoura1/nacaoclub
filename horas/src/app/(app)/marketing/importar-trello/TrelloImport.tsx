'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { CheckCircle2, FileJson, Upload } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Select } from '@/components/ui/input';
import { AREAS, TASK_COLUMNS, labelOf } from '@/domain/marketing/constants';
import { parseTrelloBoard, planImport, slimBoard, suggestMapping, type TrelloBoard, type TrelloMapping } from '@/domain/marketing/trello';
import { cn } from '@/lib/cn';
import type { MktOptions } from '@/server/services/marketing-service';
import type { TrelloImportResult } from '@/server/services/mkt-trello-service';
import { importTrelloAction, trelloAlreadyImportedAction } from '../actions';
import { AreaChip, fmtDate } from '../_components/ui';

const MAX_SEND = 5.5 * 1024 * 1024;
const TRELLO_COLORS: Record<string, string> = { green: '#61bd4f', yellow: '#f2d600', orange: '#ff9f1a', red: '#eb5a46', purple: '#c377e0', blue: '#0079bf', sky: '#00c2e0', lime: '#51e898', pink: '#ff78cb', black: '#344563' };
const areaOf = (k: string | null) => (k ? AREAS.find((a) => a.key === k) ?? null : null);

export function TrelloImport({ people, campaigns }: { people: MktOptions['people']; campaigns: MktOptions['campaigns'] }) {
  const [board, setBoard] = useState<TrelloBoard | null>(null);
  const [mapping, setMapping] = useState<TrelloMapping | null>(null);
  const [existing, setExisting] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TrelloImportResult | null>(null);
  const [drag, setDrag] = useState(false);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const plan = useMemo(() => (board && mapping ? planImport(board, mapping, existing) : null), [board, mapping, existing]);
  const personName = (id: string | null) => (id ? people.find((p) => p.id === id)?.name ?? '—' : '—');

  const load = (file: File | undefined) => {
    if (!file) return;
    setError(null); setResult(null);
    start(async () => {
      try {
        const b = parseTrelloBoard(JSON.parse(await file.text()));
        if (!b.cards.length) throw new Error('O quadro não tem cards.');
        const r = await trelloAlreadyImportedAction(b.cards.map((c) => c.id));
        setExisting(new Set(r.ok ? r.data : []));
        setBoard(b); setMapping(suggestMapping(b));
      } catch (e) {
        setError(e instanceof SyntaxError ? 'Não consegui ler o arquivo: ele não é um JSON válido.' : (e as Error).message);
      }
    });
  };
  const set = <K extends keyof TrelloMapping>(k: K, v: TrelloMapping[K]) => setMapping((m) => m && { ...m, [k]: v });
  const setIn = (k: 'lists' | 'labels' | 'members', id: string, v: string) => setMapping((m) => m && { ...m, [k]: { ...m[k], [id]: v } });

  const confirm = () => board && mapping && start(async () => {
    setError(null);
    const payload = { board: slimBoard(board, mapping), mapping };
    if (JSON.stringify(payload).length > MAX_SEND) return setError('O quadro é grande demais para uma importação só. Desmarque “Importar comentários” ou ignore algumas listas e importe em partes.');
    const r = await importTrelloAction(payload);
    if (!r.ok) return setError(r.error);
    setResult(r.data); setBoard(null); setMapping(null);
  });

  if (result) {
    return (
      <Card className="p-6 text-center">
        <CheckCircle2 className="mx-auto size-10 text-sucesso" />
        <p className="mt-2 text-lg font-bold text-navy">{result.created} card(s) importado(s)</p>
        <p className="text-sm text-tinta-suave">
          {result.checklist} item(ns) de checklist · {result.links} link(s) · {result.comments} comentário(s)
          {result.duplicates > 0 && ` · ${result.duplicates} já existiam`}{result.archived > 0 && ` · ${result.archived} arquivado(s) ignorado(s)`}{result.ignoredList > 0 && ` · ${result.ignoredList} em listas ignoradas`}
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Link href="/marketing/kanban" className={buttonVariants({})}>Abrir o Kanban</Link>
          <Button variant="secondary" onClick={() => setResult(null)}>Importar outro quadro</Button>
        </div>
      </Card>
    );
  }

  if (!board || !mapping || !plan) {
    return (
      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Card className="p-4">
          <h2 className="font-bold text-navy">1. Exporte o quadro no Trello</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-tinta">
            <li>Abra o quadro no Trello (no computador).</li>
            <li>Clique em <b>⋯ Menu</b> (canto superior direito).</li>
            <li>Vá em <b>Imprimir, exportar e compartilhar</b> → <b>Exportar como JSON</b>.</li>
            <li>Vai abrir uma página cheia de texto: salve com <b>Ctrl+S</b> (ou ⌘+S) como arquivo <b>.json</b>.</li>
          </ol>
          <p className="mt-3 text-xs text-tinta-suave">Não precisa de senha nem de chave do Trello. Funciona no plano gratuito.</p>
        </Card>
        <Card className="p-4">
          <h2 className="font-bold text-navy">2. Envie o arquivo aqui</h2>
          <div role="button" tabIndex={0} onClick={() => input.current?.click()} onKeyDown={(e) => e.key === 'Enter' && input.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); load(e.dataTransfer.files[0]); }}
            className={cn('mt-2 grid cursor-pointer place-items-center rounded-xl border-2 border-dashed p-8 text-center text-sm', drag ? 'border-nacao bg-nacao/5' : 'border-borda hover:border-nacao/50')}>
            {pending ? <p className="text-tinta-suave">Lendo o quadro…</p> : (
              <>
                <FileJson className="size-8 text-nacao" />
                <p className="mt-2 font-semibold text-tinta">Arraste o .json ou clique para escolher</p>
                <p className="text-xs text-tinta-suave">Nada é gravado nesta etapa.</p>
              </>
            )}
          </div>
          <input ref={input} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { load(e.target.files?.[0]); e.target.value = ''; }} />
          <div className="mt-2"><FormMessage error={error} /></div>
        </Card>
      </div>
    );
  }

  const byColumn = TASK_COLUMNS.map((c) => ({ ...c, n: plan.tasks.filter((t) => t.column === c.id).length })).filter((c) => c.n);
  const unassigned = plan.tasks.filter((t) => !t.assigneeId).length;
  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <FileJson className="size-6 text-nacao" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold text-navy">{board.name}</p>
          <p className="text-xs text-tinta-suave">{board.cards.length} cards · {board.lists.length} listas · {board.labels.length} etiquetas · {board.members.length} membros{existing.size > 0 && ` · ${existing.size} já importado(s) antes`}</p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => { setBoard(null); setMapping(null); }}>Trocar arquivo</Button>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <Card className="p-4">
          <h2 className="font-bold text-navy">Listas → colunas</h2>
          <p className="text-xs text-tinta-suave">Sugestão pelo nome da lista. “Ignorar” deixa a lista de fora.</p>
          <ul className="mt-2 space-y-2">
            {board.lists.map((l) => (
              <li key={l.id}>
                <p className="truncate text-sm font-semibold">{l.name} <span className="font-normal text-tinta-fraca">({l.cards}){l.closed && ' · arquivada'}</span></p>
                <Select aria-label={`Coluna para ${l.name}`} className="mt-0.5 h-8 text-xs" value={mapping.lists[l.id] ?? 'IGNORAR'} onChange={(e) => setIn('lists', l.id, e.target.value)}>
                  <option value="IGNORAR">Ignorar</option>
                  {TASK_COLUMNS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </Select>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-4">
          <h2 className="font-bold text-navy">Etiquetas → áreas</h2>
          <p className="text-xs text-tinta-suave">A etiqueta define a área do card. Todas viram #tags também.</p>
          <ul className="mt-2 space-y-2">
            {board.labels.filter((l) => l.cards).map((l) => (
              <li key={l.id}>
                <p className="flex items-center gap-1.5 truncate text-sm font-semibold"><span className="size-2.5 shrink-0 rounded-full" style={{ background: (l.color && TRELLO_COLORS[l.color]) || '#b3bac5' }} />{l.name || <i className="font-normal text-tinta-suave">sem nome ({l.color ?? 'sem cor'})</i>} <span className="font-normal text-tinta-fraca">({l.cards})</span></p>
                <Select aria-label={`Área para ${l.name || l.color}`} className="mt-0.5 h-8 text-xs" value={mapping.labels[l.id] ?? ''} onChange={(e) => setIn('labels', l.id, e.target.value)}>
                  <option value="">Sem área</option>
                  {AREAS.map((a) => <option key={a.key} value={a.key}>{a.name}</option>)}
                </Select>
              </li>
            ))}
            {board.labels.every((l) => !l.cards) && <li className="text-sm text-tinta-suave">O quadro não usa etiquetas.</li>}
          </ul>
          <label className="mt-3 flex items-start gap-2 text-xs"><input type="checkbox" className="mt-0.5" checked={mapping.guessAreaFromTitle} onChange={(e) => set('guessAreaFromTitle', e.target.checked)} /> Sem etiqueta, deduzir a área pelo título (ex.: “reels” → Conteúdo)</label>
        </Card>

        <Card className="p-4">
          <h2 className="font-bold text-navy">Membros → responsáveis</h2>
          <p className="text-xs text-tinta-suave">Escolha quem é quem. Sem pessoa, o card fica com o responsável padrão da área.</p>
          <ul className="mt-2 space-y-2">
            {board.members.filter((m) => m.cards).map((m) => (
              <li key={m.id}>
                <p className="truncate text-sm font-semibold">{m.name} <span className="font-normal text-tinta-fraca">{m.username && `@${m.username} `}({m.cards})</span></p>
                <Select aria-label={`Pessoa para ${m.name}`} className="mt-0.5 h-8 text-xs" value={mapping.members[m.id] ?? ''} onChange={(e) => setIn('members', m.id, e.target.value)}>
                  <option value="">Não vincular</option>
                  {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </li>
            ))}
            {board.members.every((m) => !m.cards) && <li className="text-sm text-tinta-suave">Nenhum card tem membros.</li>}
          </ul>
        </Card>
      </div>

      <Card className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4 [&>*]:min-w-0">
        <div>
          <p className="text-xs font-semibold text-tinta-suave">Vincular todos a uma campanha</p>
          <Select className="mt-1 h-9 text-sm" value={mapping.campaignId ?? ''} onChange={(e) => set('campaignId', e.target.value || null)}>
            <option value="">Nenhuma (tarefas avulsas)</option>
            {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={mapping.importComments} onChange={(e) => set('importComments', e.target.checked)} /> Importar comentários</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={mapping.includeArchived} onChange={(e) => set('includeArchived', e.target.checked)} /> Incluir cards arquivados</label>
      </Card>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="flex-1 font-bold text-navy">Prévia: {plan.tasks.length} tarefa(s) serão criadas</h2>
          <span className="text-xs text-tinta-suave">
            {plan.skipped.ignoredList > 0 && `${plan.skipped.ignoredList} em listas ignoradas · `}{plan.skipped.archived > 0 && `${plan.skipped.archived} arquivado(s) · `}{plan.skipped.duplicates > 0 && `${plan.skipped.duplicates} já importado(s) · `}{unassigned} sem responsável do Trello
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">{byColumn.map((c) => <span key={c.id} className="rounded-full bg-fundo px-2.5 py-0.5 text-xs font-semibold text-navy ring-1 ring-borda">{c.label}: {c.n}</span>)}</div>
        <div className="mt-3 max-h-[28rem] overflow-y-auto rounded-lg ring-1 ring-borda">
          <ul className="divide-y divide-borda text-sm">
            {plan.tasks.slice(0, 300).map((t) => (
              <li key={t.ref} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <span className="min-w-0 flex-1 basis-56 truncate font-semibold" title={t.title}>{t.title}</span>
                <span className="text-xs text-tinta-suave">{labelOf(TASK_COLUMNS, t.column)}</span>
                {t.areaKey ? <span className="inline-flex items-center gap-1"><AreaChip area={areaOf(t.areaKey)} />{t.areaGuessed && <span className="text-[10px] text-tinta-fraca" title="Deduzida pelo título">~</span>}</span> : <span className="text-[11px] text-tinta-fraca">sem área</span>}
                <span className="w-28 truncate text-xs text-tinta-suave">{personName(t.assigneeId)}</span>
                <span className="w-12 text-xs text-tinta-suave">{fmtDate(t.dueDate)}</span>
                <span className="text-[11px] text-tinta-fraca">{[t.checklist.length && `☑ ${t.checklist.length}`, t.links.length && `🔗 ${t.links.length}`, t.comments.length && `💬 ${t.comments.length}`].filter(Boolean).join(' ')}</span>
              </li>
            ))}
          </ul>
          {plan.tasks.length > 300 && <p className="px-3 py-2 text-xs text-tinta-suave">… e mais {plan.tasks.length - 300}.</p>}
        </div>
        <FormMessage error={error} />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button disabled={pending || !plan.tasks.length} onClick={confirm}><Upload /> {pending ? 'Importando…' : `Importar ${plan.tasks.length} tarefa(s)`}</Button>
          <p className="text-xs text-tinta-suave">Fica registrado no Histórico. Importar o mesmo quadro de novo só traz os cards novos.</p>
        </div>
      </Card>
    </div>
  );
}
