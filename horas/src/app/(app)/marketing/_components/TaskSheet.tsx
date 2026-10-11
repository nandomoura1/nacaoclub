'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ExternalLink, Link2, ListChecks, MessageSquare, Plus, Save, Trash2, X } from 'lucide-react';
import { Sheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/alert';
import { Input, Label, Select } from '@/components/ui/input';
import { PRIORITIES, TASK_COLUMNS, labelOf } from '@/domain/marketing/constants';
import { cn } from '@/lib/cn';
import type { MktOptions } from '@/server/services/marketing-service';
import type { TaskDetail } from '@/server/services/mkt-task-service';
import {
  addCheckItemAction, addTaskCommentAction, addTaskLinkAction, deleteTaskAction, getTaskAction, removeCheckItemAction, removeTaskLinkAction,
  saveTaskAction, setDependenciesAction, toggleCheckItemAction,
} from '../actions';

export interface TaskDefaults { campaignId?: string | null; column?: string; areaKey?: string | null; dueDate?: string | null; title?: string; milestone?: string | null; origin?: 'MANUAL' | 'ANTECEDENCIA' }

/** Painel de tarefa (criar/editar). Dependências escolhidas entre as tarefas da mesma campanha. */
export function TaskSheet({ taskId, defaults, options, siblings, canEdit, onClose }: {
  taskId: string | null; defaults?: TaskDefaults; options: MktOptions; siblings?: { id: string; title: string; campaignId: string | null }[]; canEdit: boolean; onClose: () => void;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [f, setF] = useState({
    title: defaults?.title ?? '', description: '', campaignId: defaults?.campaignId ?? '', areaKey: defaults?.areaKey ?? '', assigneeId: '',
    dueDate: defaults?.dueDate ?? '', priority: 'MEDIA', column: defaults?.column ?? 'BACKLOG', tags: '',
  });
  const [msg, setMsg] = useState<{ error?: string | null; ok?: string | null }>({});
  const [pending, start] = useTransition();
  const [newCheck, setNewCheck] = useState('');
  const [newLink, setNewLink] = useState({ url: '', label: '' });
  const [comment, setComment] = useState('');

  const load = async (id: string) => {
    const r = await getTaskAction(id);
    if (!r.ok) return setMsg({ error: r.error });
    const t = r.data;
    setDetail(t);
    setF({ title: t.title, description: t.description ?? '', campaignId: t.campaignId ?? '', areaKey: t.areaKey ?? '', assigneeId: t.assigneeId ?? '', dueDate: t.dueDate ?? '', priority: t.priority, column: t.column, tags: t.tags.join(', ') });
  };
  useEffect(() => { if (taskId) void load(taskId); }, [taskId]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: keyof typeof f, v: string) => setF((cur) => {
    const next = { ...cur, [k]: v };
    // Área escolhida e responsável vazio: sugere o responsável padrão da área.
    if (k === 'areaKey' && !cur.assigneeId) next.assigneeId = options.areas.find((a) => a.key === v)?.defaultUserId ?? '';
    return next;
  });
  const after = async (p: Promise<{ ok: boolean; error?: string }>) => {
    const r = await p;
    if (!r.ok) return setMsg({ error: r.error });
    if (detail) await load(detail.id);
    router.refresh();
  };
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      setMsg({});
      const values = { ...f, tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean) };
      const r = await saveTaskAction(detail?.id ?? null, values, detail ? undefined : { origin: defaults?.origin, milestone: defaults?.milestone });
      if (!r.ok) return setMsg({ error: r.error });
      router.refresh();
      if (!detail) await load(r.data);
      setMsg({ ok: r.message });
    });
  };
  const deps = (siblings ?? []).filter((s) => s.id !== detail?.id && (!f.campaignId || s.campaignId === f.campaignId));
  const ro = !canEdit;

  return (
    <Sheet title={detail ? 'Tarefa' : 'Nova tarefa'} onClose={onClose} onSubmit={save}
      footer={
        <div className="flex w-full items-center gap-2">
          {canEdit && <Button type="submit" disabled={pending}><Save /> {pending ? 'Salvando…' : 'Salvar'}</Button>}
          {canEdit && detail && <Button type="button" variant="ghost" disabled={pending} onClick={() => { if (confirm(`Excluir "${detail.title}"?`)) start(async () => { const r = await deleteTaskAction(detail.id); if (!r.ok) return setMsg({ error: r.error }); router.refresh(); onClose(); }); }}><Trash2 /> Excluir</Button>}
          <span className="flex-1" />
          <Button type="button" variant="ghost" onClick={onClose}>Fechar</Button>
        </div>
      }>
      <div className="space-y-3">
        <FormMessage error={msg.error} success={msg.ok} />
        <div><Label>Título</Label><Input value={f.title} disabled={ro} onChange={(e) => set('title', e.target.value)} required /></div>
        <div><Label>Descrição</Label><textarea className="min-h-20 w-full rounded-lg border border-borda p-2 text-sm" value={f.description} disabled={ro} onChange={(e) => set('description', e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-2 [&>*]:min-w-0">
          <div className="col-span-2"><Label>Campanha</Label>
            <Select value={f.campaignId} disabled={ro} onChange={(e) => set('campaignId', e.target.value)}>
              <option value="">— sem campanha —</option>
              {options.campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              {detail?.campaign && !options.campaigns.some((c) => c.id === detail.campaign!.id) && <option value={detail.campaign.id}>{detail.campaign.name}</option>}
            </Select>
          </div>
          <div><Label>Área</Label>
            <Select value={f.areaKey} disabled={ro} onChange={(e) => set('areaKey', e.target.value)}>
              <option value="">—</option>{options.areas.map((a) => <option key={a.key} value={a.key}>{a.name}</option>)}
            </Select>
          </div>
          <div><Label>Responsável</Label>
            <Select value={f.assigneeId} disabled={ro} onChange={(e) => set('assigneeId', e.target.value)}>
              <option value="">—</option>{options.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </div>
          <div><Label>Prazo</Label><Input type="date" value={f.dueDate} disabled={ro} onChange={(e) => set('dueDate', e.target.value)} /></div>
          <div><Label>Prioridade</Label>
            <Select value={f.priority} disabled={ro} onChange={(e) => set('priority', e.target.value)}>{PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</Select>
          </div>
          {!detail && <div className="col-span-2"><Label>Coluna</Label><Select value={f.column} onChange={(e) => set('column', e.target.value)}>{TASK_COLUMNS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select></div>}
          <div className="col-span-2"><Label>Tags (separadas por vírgula)</Label><Input value={f.tags} disabled={ro} onChange={(e) => set('tags', e.target.value)} placeholder="reels, kids, urgente" /></div>
        </div>
        {detail && (
          <p className="text-xs text-tinta-suave">Coluna: <b>{labelOf(TASK_COLUMNS, detail.column)}</b>{detail.origin !== 'MANUAL' ? ` · origem: ${detail.origin === 'IA' ? 'IA' : detail.origin === 'REUNIAO' ? 'reunião' : detail.origin === 'IMPORTACAO' ? 'Trello' : 'antecedência'}` : ''}{detail.milestone ? ` · ${detail.milestone}` : ''}</p>
        )}

        {detail && (
          <>
            <section className="rounded-xl bg-fundo p-3">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-navy"><ListChecks className="size-4" /> Checklist ({detail.checklist.filter((c) => c.done).length}/{detail.checklist.length})</p>
              <ul className="space-y-1">
                {detail.checklist.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={c.done} disabled={ro} onChange={(e) => start(() => after(toggleCheckItemAction(c.id, e.target.checked)))} />
                    <span className={cn('min-w-0 flex-1', c.done && 'text-tinta-fraca line-through')}>{c.text}</span>
                    {canEdit && <button type="button" aria-label="Remover item" onClick={() => start(() => after(removeCheckItemAction(c.id)))} className="text-tinta-fraca hover:text-critico"><X className="size-3.5" /></button>}
                  </li>
                ))}
              </ul>
              {canEdit && (
                <div className="mt-2 flex gap-1">
                  <Input className="h-8 text-xs" value={newCheck} onChange={(e) => setNewCheck(e.target.value)} placeholder="Novo item" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (newCheck.trim()) start(async () => { await after(addCheckItemAction(detail.id, newCheck)); setNewCheck(''); }); } }} />
                  <Button type="button" size="sm" variant="secondary" disabled={!newCheck.trim()} onClick={() => start(async () => { await after(addCheckItemAction(detail.id, newCheck)); setNewCheck(''); })}><Plus /></Button>
                </div>
              )}
            </section>

            <section className="rounded-xl bg-fundo p-3">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-navy"><Link2 className="size-4" /> Links e arquivos</p>
              <ul className="space-y-1">
                {detail.links.map((l) => (
                  <li key={l.id} className="flex items-center gap-2 text-sm">
                    <a href={l.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-nacao hover:underline"><ExternalLink className="mr-1 inline size-3" />{l.label || l.url}</a>
                    {canEdit && <button type="button" aria-label="Remover link" onClick={() => start(() => after(removeTaskLinkAction(l.id)))} className="text-tinta-fraca hover:text-critico"><X className="size-3.5" /></button>}
                  </li>
                ))}
              </ul>
              {canEdit && (
                <div className="mt-2 grid grid-cols-[1fr_7rem_auto] gap-1">
                  <Input className="h-8 text-xs" value={newLink.url} onChange={(e) => setNewLink({ ...newLink, url: e.target.value })} placeholder="https://drive… / canva… / figma…" />
                  <Input className="h-8 text-xs" value={newLink.label} onChange={(e) => setNewLink({ ...newLink, label: e.target.value })} placeholder="Nome" />
                  <Button type="button" size="sm" variant="secondary" disabled={!newLink.url.trim()} onClick={() => start(async () => { await after(addTaskLinkAction(detail.id, newLink.url, newLink.label || null)); setNewLink({ url: '', label: '' }); })}><Plus /></Button>
                </div>
              )}
            </section>

            {deps.length > 0 && (
              <section className="rounded-xl bg-fundo p-3">
                <p className="mb-2 text-sm font-bold text-navy">Depende de</p>
                <div className="max-h-36 space-y-1 overflow-y-auto">
                  {deps.map((s) => {
                    const on = detail.dependsOn.some((d) => d.id === s.id);
                    return (
                      <label key={s.id} className="flex items-center gap-2 text-xs">
                        <input type="checkbox" checked={on} disabled={ro} onChange={() => start(() => after(setDependenciesAction(detail.id, on ? detail.dependsOn.filter((d) => d.id !== s.id).map((d) => d.id) : [...detail.dependsOn.map((d) => d.id), s.id])))} />
                        <span className="truncate">{s.title}</span>
                        {on && detail.dependsOn.find((d) => d.id === s.id)?.done && <Check className="size-3 text-sucesso" />}
                      </label>
                    );
                  })}
                </div>
                <p className="mt-1 text-[11px] text-tinta-fraca">Só dá para concluir depois que as dependências estiverem concluídas.</p>
              </section>
            )}

            <section className="rounded-xl bg-fundo p-3">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-navy"><MessageSquare className="size-4" /> Comentários</p>
              <ul className="space-y-2">
                {detail.comments.map((c) => <li key={c.id} className="text-sm"><p className="text-[11px] text-tinta-fraca">{c.author ?? '—'} · {new Date(c.at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</p><p className="whitespace-pre-line">{c.body}</p></li>)}
              </ul>
              <div className="mt-2 flex gap-1">
                <Input className="h-8 text-xs" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Escreva um comentário" />
                <Button type="button" size="sm" variant="secondary" disabled={!comment.trim()} onClick={() => start(async () => { await after(addTaskCommentAction(detail.id, comment)); setComment(''); })}><Plus /></Button>
              </div>
            </section>

            {detail.history.length > 0 && (
              <details className="text-xs text-tinta-suave">
                <summary className="cursor-pointer font-semibold">Histórico</summary>
                <ul className="mt-1 space-y-0.5">{detail.history.map((h, i) => <li key={i}>{new Date(h.at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} — {h.summary}</li>)}</ul>
              </details>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}
