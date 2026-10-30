'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, ExternalLink, Link2, ListChecks, MessageCircle, MessageSquare, Plus, Save, Trash2, X } from 'lucide-react';
import { Sheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/alert';
import { Input, Label, Select } from '@/components/ui/input';
import { PRIORITIES, TASK_COLUMNS, labelOf } from '@/domain/marketing/constants';
import { sortColumns } from '@/domain/marketing/board';
import { cn } from '@/lib/cn';
import type { MktOptions } from '@/server/services/marketing-service';
import type { TaskDetail } from '@/server/services/mkt-task-service';
import {
  addCheckItemAction, addTaskCommentAction, addTaskLinkAction, deleteTaskAction, getTaskAction, removeCheckItemAction, removeTaskLinkAction,
  saveTaskAction, setDependenciesAction, toggleCheckItemAction,
} from '../actions';
import { TaskImages } from './TaskImages';

/** Link direto do cartão (abre o Kanban com a tarefa aberta) e compartilhamento no WhatsApp. */
function ShareTask({ detail, people }: { detail: TaskDetail; people: { id: string; name: string }[] }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window === 'undefined' ? '' : `${window.location.origin}/marketing/kanban?tarefa=${detail.id}`;
  const who = people.find((p) => p.id === detail.assigneeId)?.name;
  const text = [
    `📌 *${detail.title}*`,
    [detail.columnName ?? labelOf(TASK_COLUMNS, detail.column), detail.dueDate ? `prazo ${detail.dueDate.split('-').reverse().join('/')}` : null, who ? `resp. ${who}` : null].filter(Boolean).join(' · '),
    detail.campaign ? `Campanha: ${detail.campaign.name}` : null,
    url,
  ].filter(Boolean).join('\n');
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { prompt('Copie o link:', url); }
  };
  return (
    <div className="flex flex-wrap gap-2">
      <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-borda bg-white px-3 py-1.5 text-xs font-semibold text-[#128C7E] hover:bg-fundo"><MessageCircle className="size-4" /> Enviar no WhatsApp</a>
      <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 rounded-lg border border-borda bg-white px-3 py-1.5 text-xs font-semibold text-navy hover:bg-fundo">{copied ? <Check className="size-4 text-sucesso" /> : <Copy className="size-4" />} {copied ? 'Link copiado' : 'Copiar link'}</button>
    </div>
  );
}

export interface TaskDefaults { campaignId?: string | null; column?: string; columnId?: string; areaKey?: string | null; dueDate?: string | null; title?: string; milestone?: string | null; origin?: 'MANUAL' | 'ANTECEDENCIA' }

/** Painel de tarefa (criar/editar). Dependências escolhidas entre as tarefas da mesma campanha. */
export function TaskSheet({ taskId, defaults, options, siblings, canEdit, onClose }: {
  taskId: string | null; defaults?: TaskDefaults; options: MktOptions; siblings?: { id: string; title: string; campaignId: string | null }[]; canEdit: boolean; onClose: () => void;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const cols = sortColumns(options.columns);
  const firstOf = (stage: string) => cols.find((c) => c.stage === stage)?.id ?? cols[0]?.id ?? '';
  const [f, setF] = useState({
    title: defaults?.title ?? '', description: '', campaignId: defaults?.campaignId ?? '', areaKey: defaults?.areaKey ?? '', assigneeId: '', collaboratorIds: [] as string[],
    dueDate: defaults?.dueDate ?? '', priority: 'MEDIA', columnId: defaults?.columnId ?? firstOf(defaults?.column ?? 'BACKLOG'), tags: '',
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
    setF({ title: t.title, description: t.description ?? '', campaignId: t.campaignId ?? '', areaKey: t.areaKey ?? '', assigneeId: t.assigneeId ?? '', collaboratorIds: t.collaboratorIds, dueDate: t.dueDate ?? '', priority: t.priority, columnId: '', tags: t.tags.join(', ') });
  };
  useEffect(() => { if (taskId) void load(taskId); }, [taskId]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: Exclude<keyof typeof f, 'collaboratorIds'>, v: string) => setF((cur) => {
    const next = { ...cur, [k]: v };
    // Área escolhida e responsável vazio: sugere os responsáveis padrão da área.
    if (k === 'areaKey' && !cur.assigneeId) {
      const area = options.areas.find((a) => a.key === v);
      next.assigneeId = area?.defaultUserId ?? '';
      if (!cur.collaboratorIds.length) next.collaboratorIds = area?.coOwnerIds ?? [];
    }
    if (k === 'assigneeId') next.collaboratorIds = cur.collaboratorIds.filter((u) => u !== v);
    return next;
  });
  const toggleCo = (id: string) => setF((cur) => ({ ...cur, collaboratorIds: cur.collaboratorIds.includes(id) ? cur.collaboratorIds.filter((u) => u !== id) : [...cur.collaboratorIds, id] }));
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
      const { columnId, ...rest } = f;
      const values = { ...rest, ...(detail ? {} : { columnId }), tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean) };
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
        {detail && <ShareTask detail={detail} people={options.people} />}
        <div><Label>Título</Label><Input value={f.title} disabled={ro} onChange={(e) => set('title', e.target.value)} required /></div>
        <div>
          <Label>Descrição</Label>
          <textarea className="min-h-40 w-full resize-y rounded-lg border border-borda p-2 text-sm" value={f.description} disabled={ro} maxLength={20000} onChange={(e) => set('description', e.target.value)} />
          <p className="text-right text-[11px] text-tinta-fraca">{f.description.length.toLocaleString('pt-BR')}/20.000</p>
        </div>
        {detail
          ? <TaskImages taskId={detail.id} images={detail.attachments} canEdit={canEdit} onChange={async () => { await load(detail.id); router.refresh(); }} onError={(e) => setMsg({ error: e })} />
          : canEdit && <p className="rounded-xl bg-fundo p-3 text-xs text-tinta-suave">Salve a tarefa para anexar imagens.</p>}
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
          <div><Label>Responsável principal</Label>
            <Select value={f.assigneeId} disabled={ro} onChange={(e) => set('assigneeId', e.target.value)}>
              <option value="">—</option>{options.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </div>
          <div><Label>Prazo</Label><Input type="date" value={f.dueDate} disabled={ro} onChange={(e) => set('dueDate', e.target.value)} /></div>
          <div><Label>Prioridade</Label>
            <Select value={f.priority} disabled={ro} onChange={(e) => set('priority', e.target.value)}>{PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</Select>
          </div>
          <div className="col-span-2"><Label>Corresponsáveis</Label>
            <div className="flex flex-wrap gap-1.5">
              {options.people.filter((p) => p.id !== f.assigneeId).map((p) => {
                const on = f.collaboratorIds.includes(p.id);
                return <button key={p.id} type="button" disabled={ro} onClick={() => toggleCo(p.id)} aria-pressed={on}
                  className={cn('rounded-full border px-2.5 py-0.5 text-xs font-semibold', on ? 'border-nacao bg-nacao text-white' : 'border-borda text-tinta-suave hover:border-nacao', ro && 'cursor-default')}>{p.name.split(' ').slice(0, 2).join(' ')}</button>;
              })}
            </div>
          </div>
          {!detail && <div className="col-span-2"><Label>Coluna</Label><Select value={f.columnId} onChange={(e) => set('columnId', e.target.value)}>{cols.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>}
          <div className="col-span-2"><Label>Tags (separadas por vírgula)</Label><Input value={f.tags} disabled={ro} onChange={(e) => set('tags', e.target.value)} placeholder="reels, kids, urgente" /></div>
        </div>
        {detail && (
          <p className="text-xs text-tinta-suave">Coluna: <b>{detail.columnName ?? labelOf(TASK_COLUMNS, detail.column)}</b>{detail.origin !== 'MANUAL' ? ` · origem: ${detail.origin === 'IA' ? 'IA' : detail.origin === 'REUNIAO' ? 'reunião' : detail.origin === 'IMPORTACAO' ? 'Trello' : 'antecedência'}` : ''}{detail.milestone ? ` · ${detail.milestone}` : ''}</p>
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
