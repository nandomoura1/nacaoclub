'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CalendarDays, ChevronDown, Columns3, List, MessageSquare, Pencil, Plus, Send, Trash2, UserRound } from 'lucide-react';
import { DemandsKanban } from './DemandsKanban';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Input, Label, Select } from '@/components/ui/input';
import { DEMAND_STATUSES, ORIGINS, PRIORITIES } from '@/domain/processos';
import { cn } from '@/lib/cn';
import type { DemandRow } from '@/server/services/proc-service';
import { addDemandCommentAction, deleteDemandAction, demandCommentsAction, saveDemandAction, setDemandStatusAction } from '../actions';
import { useRun } from '../../marketing/_components/useRun';

type Opt = { id: string; name: string };
type Form = { sectorId: string; title: string; description: string; ownerId: string; dueDate: string; priority: string };
const label = <T extends { id: string; label: string }>(l: readonly T[], id: string) => l.find((x) => x.id === id)?.label ?? id;
const fmt = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const STATUS_TONE: Record<string, 'neutral' | 'blue' | 'amber' | 'green'> = { ABERTA: 'neutral', EM_ANDAMENTO: 'blue', AGUARDANDO: 'amber', CONCLUIDA: 'green', CANCELADA: 'neutral' };
const PRIO_TONE: Record<string, string> = { URGENTE: 'bg-critico text-white', ALTA: 'bg-atencao/15 text-atencao', MEDIA: 'bg-fundo text-tinta-suave', BAIXA: 'bg-fundo text-tinta-fraca' };

export function DemandsClient({ today, demands, sectors, openable, people, filter, openNew, admin, week }: {
  week: string; today: string; demands: DemandRow[]; sectors: (Opt & { leaderId: string | null })[]; openable: string[]; people: Opt[];
  filter: { sector: string; view: string; mine: boolean; kanban: boolean; focus: boolean }; openNew: boolean; admin: boolean;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const { msg, setMsg, pending, run } = useRun();
  const empty = (): Form => ({ sectorId: filter.sector && openable.includes(filter.sector) ? filter.sector : openable[0] ?? '', title: '', description: '', ownerId: '', dueDate: '', priority: 'MEDIA' });
  const [edit, setEdit] = useState<{ id: string | null; f: Form } | null>(openNew && openable.length ? { id: null, f: empty() } : null);
  const [open, setOpen] = useState<string | null>(null);
  const go = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v) q.set(k, v); else q.delete(k); }
    q.delete('nova');
    router.push(`?${q.toString()}`);
  };
  const set = (k: keyof Form, v: string) => setEdit((cur) => cur && { ...cur, f: { ...cur.f, [k]: v } });
  const save = () => edit && run(() => saveDemandAction(edit.id, { ...edit.f, description: edit.f.description || null, ownerId: edit.f.ownerId || null, dueDate: edit.f.dueDate || null }), () => setEdit(null));
  const late = demands.filter((d) => d.late).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-borda bg-white p-0.5">
          <button type="button" onClick={() => go({ modo: null })} className={cn('inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-sm font-semibold', !filter.kanban ? 'bg-navy text-white' : 'text-tinta-suave')}><List className="size-4" /> Lista</button>
          <button type="button" onClick={() => go({ modo: 'kanban', ver: null })} className={cn('inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-sm font-semibold', filter.kanban ? 'bg-navy text-white' : 'text-tinta-suave')}><Columns3 className="size-4" /> Kanban</button>
        </div>
        {!filter.kanban && (['abertas', 'concluidas', 'todas'] as const).map((v) => (
          <button key={v} type="button" onClick={() => go({ ver: v === 'abertas' ? null : v })} className={cn('rounded-full px-3 py-1 text-sm font-semibold', filter.view === v ? 'bg-nacao text-white' : 'bg-white text-tinta-suave ring-1 ring-borda')}>
            {v === 'abertas' ? 'Em aberto' : v === 'concluidas' ? 'Encerradas' : 'Todas'}
          </button>
        ))}
        <Select className="h-8 w-auto text-sm" value={filter.sector} onChange={(e) => go({ setor: e.target.value || null })}>
          <option value="">Todos os setores</option>
          {sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <label className="flex items-center gap-1.5 text-sm text-tinta-suave"><input type="checkbox" checked={filter.mine} onChange={(e) => go({ minhas: e.target.checked ? '1' : null })} /> Só as minhas</label>
        <label className="flex items-center gap-1.5 text-sm text-tinta-suave"><input type="checkbox" checked={filter.focus} onChange={(e) => go({ foco: e.target.checked ? '1' : null })} /> 🎯 Foco da semana</label>
        <span className="flex-1" />
        {late > 0 && <Badge tone="red">{late} atrasada{late > 1 ? 's' : ''}</Badge>}
        {openable.length > 0 && !edit && <Button size="sm" onClick={() => { setMsg({}); setEdit({ id: null, f: empty() }); }}><Plus /> Nova demanda</Button>}
      </div>
      <FormMessage error={msg.error} success={msg.ok} />

      {edit && (
        <Card className="p-4">
          <h2 className="font-bold text-navy">{edit.id ? 'Editar demanda' : 'Nova demanda'}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 [&>*]:min-w-0">
            <div className="sm:col-span-2"><Label>O que precisa ser feito</Label><Input value={edit.f.title} onChange={(e) => set('title', e.target.value)} placeholder="ex.: Orçamento da troca do piso da quadra 2" /></div>
            <div><Label>Setor</Label><Select value={edit.f.sectorId} onChange={(e) => set('sectorId', e.target.value)}>{sectors.filter((s) => openable.includes(s.id) || s.id === edit.f.sectorId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></div>
            <div><Label>Responsável</Label><Select value={edit.f.ownerId} onChange={(e) => set('ownerId', e.target.value)}><option value="">Líder do setor</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></div>
            <div><Label>Prazo</Label><Input type="date" value={edit.f.dueDate} onChange={(e) => set('dueDate', e.target.value)} /></div>
            <div><Label>Prioridade</Label><Select value={edit.f.priority} onChange={(e) => set('priority', e.target.value)}>{PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</Select></div>
            <div className="sm:col-span-2"><Label>Detalhes (opcional)</Label><Input value={edit.f.description} onChange={(e) => set('description', e.target.value)} placeholder="Contexto, critério de pronto, links…" /></div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button disabled={pending} onClick={save}>{pending ? 'Salvando…' : 'Salvar demanda'}</Button>
            <Button variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button>
          </div>
        </Card>
      )}

      {filter.kanban ? (
        <>
          {(() => {
            const d = demands.find((x) => x.id === open);
            return d ? (
              <Card className="border-nacao/30">
                <DemandItem d={d} today={today} week={week} admin={admin} expanded onToggle={() => setOpen(null)}
                  onEdit={() => { setMsg({}); setEdit({ id: d.id, f: { sectorId: d.sectorId, title: d.title, description: d.description ?? '', ownerId: d.ownerId ?? '', dueDate: d.dueDate ?? '', priority: d.priority } }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  onStatus={(st) => run(() => setDemandStatusAction(d.id, st))}
                  onDelete={() => { if (confirm(`Excluir a demanda "${d.title}"?`)) run(() => deleteDemandAction(d.id), () => setOpen(null)); }} pending={pending} />
              </Card>
            ) : null;
          })()}
          <DemandsKanban demands={demands} week={week} onOpen={(id) => setOpen(open === id ? null : id)} />
        </>
      ) : demands.length === 0 ? (
        <Card className="p-8 text-center text-sm text-tinta-suave">{filter.view === 'abertas' ? 'Nenhuma demanda em aberto aqui. 👏' : 'Nada por aqui.'}</Card>
      ) : (
        <Card className="divide-y divide-borda">
          {demands.map((d) => (
            <DemandItem key={d.id} d={d} today={today} week={week} admin={admin} expanded={open === d.id} onToggle={() => setOpen(open === d.id ? null : d.id)}
              onEdit={() => { setMsg({}); setEdit({ id: d.id, f: { sectorId: d.sectorId, title: d.title, description: d.description ?? '', ownerId: d.ownerId ?? '', dueDate: d.dueDate ?? '', priority: d.priority } }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              onStatus={(s) => run(() => setDemandStatusAction(d.id, s))}
              onDelete={() => { if (confirm(`Excluir a demanda "${d.title}"?`)) run(() => deleteDemandAction(d.id)); }} pending={pending} />
          ))}
        </Card>
      )}
    </div>
  );
}

function DemandItem({ d, today, week, admin, expanded, onToggle, onEdit, onStatus, onDelete, pending }: {
  d: DemandRow; today: string; week: string; admin: boolean; expanded: boolean; onToggle: () => void; onEdit: () => void; onStatus: (s: string) => void; onDelete: () => void; pending: boolean;
}) {
  const days = d.dueDate ? Math.round((Date.parse(d.dueDate) - Date.parse(today)) / 86_400_000) : null;
  return (
    <div className={cn('p-3', d.late && 'bg-critico/[0.03]')}>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onToggle} aria-expanded={expanded} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <ChevronDown className={cn('size-4 shrink-0 text-tinta-fraca transition-transform', expanded && 'rotate-180')} />
          {d.focusWeek === week && <span title="Foco da semana" aria-label="Foco da semana">🎯</span>}
          <span className={cn('rounded px-1.5 text-[10px] font-bold uppercase', PRIO_TONE[d.priority])}>{label(PRIORITIES, d.priority)}</span>
          <span className={cn('min-w-0 truncate font-semibold text-navy', d.status === 'CONCLUIDA' && 'text-tinta-suave line-through', d.status === 'CANCELADA' && 'text-tinta-fraca line-through')}>{d.title}</span>
        </button>
        {d.blocker && <span className="text-xs font-semibold text-critico" title={d.blocker}>⛔ travada</span>}
        <span className="text-xs text-tinta-suave">{d.sector}</span>
        {d.owner && <span className="flex items-center gap-1 text-xs text-tinta-suave"><UserRound className="size-3" />{d.owner}</span>}
        {d.dueDate && (
          <span className={cn('flex items-center gap-1 text-xs tabular-nums', d.late ? 'font-semibold text-critico' : days !== null && days <= 2 && d.status !== 'CONCLUIDA' ? 'text-atencao' : 'text-tinta-suave')}>
            <CalendarDays className="size-3" />{fmt(d.dueDate)}{d.late ? ` · ${-days!} dia${-days! > 1 ? 's' : ''} de atraso` : ''}
          </span>
        )}
        {d.comments > 0 && <span className="flex items-center gap-0.5 text-xs text-tinta-suave"><MessageSquare className="size-3" />{d.comments}</span>}
        {d.canWork ? (
          <select aria-label="Status" disabled={pending} value={d.status} onChange={(e) => onStatus(e.target.value)} className="h-7 rounded-md border border-borda bg-white px-1.5 text-xs font-semibold">
            {DEMAND_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        ) : <Badge tone={STATUS_TONE[d.status]}>{label(DEMAND_STATUSES, d.status)}</Badge>}
      </div>
      {expanded && <DemandDetail d={d} admin={admin} onEdit={onEdit} onDelete={onDelete} />}
    </div>
  );
}

function DemandDetail({ d, admin, onEdit, onDelete }: { d: DemandRow; admin: boolean; onEdit: () => void; onDelete: () => void }) {
  const { msg, pending, run } = useRun();
  const [comments, setComments] = useState<{ id: string; body: string; author: string | null; at: string }[] | null>(null);
  const [text, setText] = useState('');
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    void demandCommentsAction(d.id).then((r) => { if (alive && r.ok) setComments(r.data); });
    return () => { alive = false; };
  }, [d.id, tick]);
  const send = () => run(() => addDemandCommentAction(d.id, text), () => { setText(''); setTick((t) => t + 1); });
  return (
    <div className="ml-6 mt-2 space-y-2 border-l-2 border-borda pl-3 text-sm">
      {d.description && <p className="whitespace-pre-line text-tinta">{d.description}</p>}
      <p className="text-xs text-tinta-suave">
        Origem: {label(ORIGINS, d.origin)}{d.requester ? ` · aberta por ${d.requester}` : ''} · em {new Date(d.createdAt).toLocaleDateString('pt-BR')}
        {d.doneAt ? ` · concluída em ${new Date(d.doneAt).toLocaleDateString('pt-BR')}` : ''}
      </p>
      <div className="space-y-1.5">
        {(comments ?? []).map((c) => (
          <div key={c.id} className="rounded-lg bg-fundo px-2.5 py-1.5">
            <p className="text-[11px] font-semibold text-tinta-suave">{c.author ?? '—'} · {new Date(c.at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</p>
            <p className="whitespace-pre-line">{c.body}</p>
          </div>
        ))}
        {comments === null && <p className="text-xs text-tinta-fraca">Carregando…</p>}
      </div>
      <div className="flex gap-2">
        <Input className="h-8 text-sm" value={text} onChange={(e) => setText(e.target.value)} placeholder="Atualização, combinado, bloqueio…" onKeyDown={(e) => { if (e.key === 'Enter' && text.trim() && !pending) send(); }} />
        <Button size="sm" variant="secondary" disabled={pending || !text.trim()} onClick={send}><Send /> Comentar</Button>
      </div>
      <FormMessage error={msg.error} />
      {(d.canWork || admin) && (
        <div className="flex flex-wrap gap-1">
          {d.canWork && <Button size="sm" variant="ghost" onClick={onEdit}><Pencil /> Editar</Button>}
          {admin && <Button size="sm" variant="ghost" onClick={onDelete}><Trash2 /> Excluir</Button>}
        </div>
      )}
    </div>
  );
}
