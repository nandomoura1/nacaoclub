'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { kanbanCollision } from '@/lib/kanban-collision';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AlertTriangle, CalendarDays, CheckSquare, ChevronLeft, ChevronRight, Image as ImageIcon, Lock, Plus, X } from 'lucide-react';
import { FormMessage } from '@/components/ui/alert';
import { Select } from '@/components/ui/input';
import type { BoardColumn } from '@/domain/marketing/board';
import { cn } from '@/lib/cn';
import type { MktOptions } from '@/server/services/marketing-service';
import type { BoardTask } from '@/server/services/mkt-task-service';
import { moveTaskAction, saveTaskAction } from '../actions';
import { TaskSheet, type TaskDefaults } from '../_components/TaskSheet';
import { AreaChip, PriorityTag, fmtDate } from '../_components/ui';

const initials = (n: string | null) => (n ? n.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase() : '');

function Card({ t, onOpen, dragging }: { t: BoardTask; onOpen?: () => void; dragging?: boolean }) {
  return (
    <div onClick={onOpen} className={cn('cursor-pointer overflow-hidden rounded-xl border bg-white text-left text-sm shadow-[0_1px_2px_rgba(2,43,87,0.06)] transition-shadow hover:shadow-md', t.overdue ? 'border-critico/40' : 'border-borda', dragging && 'rotate-2 shadow-lg')}>
      {t.cover && <img src={t.cover} alt="" loading="lazy" draggable={false} className="max-h-40 w-full bg-fundo object-cover" />}
      <div className="p-2.5">
      <div className="flex items-start gap-1.5">
        <p className="min-w-0 flex-1 font-semibold leading-snug text-tinta">{t.title}</p>
        {t.blocked && <Lock className="size-3.5 shrink-0 text-atencao" aria-label="Bloqueada por dependência" />}
      </div>
      {t.campaign && <p className="mt-0.5 truncate text-[11px] text-nacao">{t.campaign.name}</p>}
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <AreaChip area={t.area} />
        <PriorityTag p={t.priority} />
        {t.tags.slice(0, 2).map((g) => <span key={g} className="rounded bg-nacao/10 px-1.5 py-0.5 text-[10px] text-nacao">#{g}</span>)}
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-[11px] text-tinta-suave">
        {t.dueDate && <span className={cn('inline-flex items-center gap-0.5', t.overdue && 'font-bold text-critico')}>{t.overdue ? <AlertTriangle className="size-3" /> : <CalendarDays className="size-3" />}{fmtDate(t.dueDate)}</span>}
        {t.checklist.total > 0 && <span className="inline-flex items-center gap-0.5"><CheckSquare className="size-3" />{t.checklist.done}/{t.checklist.total}</span>}
        {t.images > 0 && <span className="inline-flex items-center gap-0.5" title={`${t.images} imagem(ns)`}><ImageIcon className="size-3" />{t.images}</span>}
        <span className="flex-1" />
        {(t.assignee || t.collaborators.length > 0) && (
          <span className="flex -space-x-1.5" title={[t.assignee, ...t.collaborators].filter(Boolean).join(', ')}>
            {[t.assignee, ...t.collaborators].filter((n): n is string => !!n).slice(0, 3).map((n, i) => (
              <span key={n} className={cn('grid size-6 place-items-center rounded-full text-[10px] font-bold text-white ring-2 ring-white', i === 0 && t.assignee ? 'bg-navy' : 'bg-nacao')}>{initials(n)}</span>
            ))}
            {[t.assignee, ...t.collaborators].filter(Boolean).length > 3 && <span className="grid size-6 place-items-center rounded-full bg-fundo text-[10px] font-bold text-navy ring-2 ring-white">+{[t.assignee, ...t.collaborators].filter(Boolean).length - 3}</span>}
          </span>
        )}
      </div>
      </div>
    </div>
  );
}

function SortableCard({ t, onOpen, disabled }: { t: BoardTask; onOpen: () => void; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: t.id, data: { column: t.columnId }, disabled });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn(isDragging && 'opacity-40')} {...attributes} {...listeners}>
      <Card t={t} onOpen={onOpen} />
    </div>
  );
}

function QuickAdd({ onAdd }: { onAdd: (title: string) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (title.trim().length < 2 || busy) return;
    setBusy(true);
    if (await onAdd(title.trim())) setTitle('');
    setBusy(false);
  };
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="mt-1 flex w-full items-center gap-1 rounded-lg px-2 py-1.5 text-left text-sm font-semibold text-tinta-suave hover:bg-white/70 hover:text-navy"><Plus className="size-4" /> Adicionar um cartão</button>;
  return (
    <div className="mt-1 space-y-1">
      <textarea autoFocus rows={2} value={title} maxLength={200} disabled={busy} placeholder="Título do cartão (Enter para salvar)"
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit(); } if (e.key === 'Escape') { setOpen(false); setTitle(''); } }}
        className="w-full resize-none rounded-lg border border-borda bg-white p-2 text-sm shadow-sm focus:border-nacao focus:outline-none" />
      <div className="flex items-center gap-1">
        <button type="button" disabled={busy || title.trim().length < 2} onClick={() => void submit()} className="rounded-lg bg-nacao px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">{busy ? 'Salvando…' : 'Adicionar cartão'}</button>
        <button type="button" aria-label="Cancelar" onClick={() => { setOpen(false); setTitle(''); }} className="p-1 text-tinta-fraca hover:text-navy"><X className="size-4" /></button>
      </div>
    </div>
  );
}

function Column({ id, label, color, tasks, onOpen, onAdd, onQuickAdd, canEdit }: { id: string; label: string; color: string | null; tasks: BoardTask[]; onOpen: (id: string) => void; onAdd: () => void; onQuickAdd: (title: string) => Promise<boolean>; canEdit: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${id}`, data: { column: id } });
  return (
    <div id={`kcol-${id}`} ref={setNodeRef} data-pan className={cn('flex max-h-full w-72 shrink-0 snap-start flex-col rounded-2xl bg-fundo/80 p-2 ring-1 ring-borda', isOver && 'ring-2 ring-nacao')}>
      <div data-pan className="mb-2 flex items-center gap-2 px-1">
        {color && <span className="size-2.5 shrink-0 rounded-full" style={{ background: color }} />}
        <p className="flex-1 text-xs font-bold uppercase tracking-wide text-navy">{label}</p>
        <span className="rounded-full bg-white px-2 text-[11px] font-semibold text-tinta-suave">{tasks.length}</span>
        {canEdit && <button type="button" onClick={onAdd} aria-label={`Nova tarefa em ${label}`} className="text-tinta-fraca hover:text-nacao"><Plus className="size-4" /></button>}
      </div>
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div data-pan className="-mx-1 flex min-h-16 flex-1 flex-col gap-2 overflow-y-auto px-1 pb-1">
          {tasks.map((t) => <SortableCard key={t.id} t={t} onOpen={() => onOpen(t.id)} disabled={!canEdit} />)}
        </div>
      </SortableContext>
      {canEdit && <QuickAdd onAdd={onQuickAdd} />}
    </div>
  );
}

/** Quadro com navegação lateral: setas, barra de colunas e arrastar o fundo para os lados (como no Trello). */
function useBoardNav(columns: BoardColumn[]) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState<Set<string>>(new Set());
  const [edges, setEdges] = useState({ left: false, right: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const upd = () => setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
    upd();
    el.addEventListener('scroll', upd, { passive: true });
    const ro = new ResizeObserver(upd); ro.observe(el);
    const io = new IntersectionObserver((entries) => setVisible((cur) => {
      const next = new Set(cur);
      for (const e of entries) { const id = e.target.id.slice(5); if (e.isIntersecting) next.add(id); else next.delete(id); }
      return next;
    }), { root: el, threshold: 0.6 });
    columns.forEach((c) => { const n = document.getElementById(`kcol-${c.id}`); if (n) io.observe(n); });
    return () => { el.removeEventListener('scroll', upd); ro.disconnect(); io.disconnect(); };
  }, [columns]);
  const by = (dir: number) => ref.current?.scrollBy({ left: dir * 296, behavior: 'smooth' });
  const go = (id: string) => document.getElementById(`kcol-${id}`)?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
  // Arrastar o fundo do quadro (não o cartão) rola para os lados.
  const pan = useRef<{ x: number; left: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || !(e.target as HTMLElement).hasAttribute('data-pan')) return;
    pan.current = { x: e.clientX, left: ref.current!.scrollLeft };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => { if (pan.current && ref.current) ref.current.scrollLeft = pan.current.left - (e.clientX - pan.current.x); };
  const onPointerUp = () => { pan.current = null; };
  return { ref, visible, edges, by, go, panHandlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp } };
}

export function KanbanClient({ tasks: initial, columns, options, canEdit }: { tasks: BoardTask[]; columns: BoardColumn[]; options: MktOptions; canEdit: boolean }) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initial);
  const [syncKey, setSyncKey] = useState(initial);
  if (syncKey !== initial) { setSyncKey(initial); setTasks(initial); }
  const [open, setOpen] = useState<{ id: string | null; defaults?: TaskDefaults } | null>(null);
  const [active, setActive] = useState<BoardTask | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const byCol = useMemo(() => Object.fromEntries(columns.map((c) => [c.id, tasks.filter((t) => t.columnId === c.id).sort((a, b) => a.position - b.position)])) as Record<string, BoardTask[]>, [tasks, columns]);

  const move = (id: string, column: string, index: number) => {
    const stage = columns.find((c) => c.id === column)?.stage;
    const list = (byCol[column] ?? []).filter((t) => t.id !== id);
    const before = list[index - 1]?.id ?? null;
    const after = list[index]?.id ?? null;
    const prevPos = list[index - 1]?.position ?? null;
    const nextPos = list[index]?.position ?? null;
    const pos = prevPos === null && nextPos === null ? 1000 : prevPos === null ? nextPos! - 1000 : nextPos === null ? prevPos + 1000 : (prevPos + nextPos) / 2;
    const snapshot = tasks;
    setTasks((cur) => cur.map((t) => (t.id === id ? { ...t, columnId: column, column: stage ?? t.column, position: pos } : t)));
    setError(null);
    start(async () => {
      try {
        const r = await moveTaskAction(id, column, before, after);
        if (!r.ok) { setTasks(snapshot); setError(r.error); return; }
        router.refresh();
      } catch {
        // Página aberta antes de uma atualização do sistema (ou sem internet): avisa e recarrega.
        setTasks(snapshot);
        setError('Não deu para salvar: a página estava desatualizada. Recarregando…');
        setTimeout(() => window.location.reload(), 1500);
      }
    });
  };

  const onDragStart = (e: DragStartEvent) => setActive(tasks.find((t) => t.id === e.active.id) ?? null);
  const onDragEnd = (e: DragEndEvent) => {
    setActive(null);
    const { active: a, over } = e;
    if (!over) return;
    const id = String(a.id);
    const overId = String(over.id);
    let column: string;
    let index: number;
    if (overId.startsWith('col:')) {
      column = overId.slice(4);
      index = (byCol[column] ?? []).filter((t) => t.id !== id).length;
    } else {
      const target = tasks.find((t) => t.id === overId);
      if (!target) return;
      column = target.columnId;
      const list = (byCol[column] ?? []).filter((t) => t.id !== id);
      index = list.findIndex((t) => t.id === overId);
      const from = (byCol[column] ?? []).findIndex((t) => t.id === id);
      const to = (byCol[column] ?? []).findIndex((t) => t.id === overId);
      if (from >= 0 && from < to) index += 1; // descendo na mesma coluna: entra depois do alvo
    }
    const cur = tasks.find((t) => t.id === id);
    if (cur && cur.columnId === column && (byCol[column] ?? []).indexOf(cur) === index) return; // soltou no mesmo lugar
    move(id, column, index);
  };

  const siblings = tasks.map((t) => ({ id: t.id, title: t.title, campaignId: t.campaign?.id ?? null }));
  const quickAdd = async (columnId: string, title: string) => {
    const r = await saveTaskAction(null, { title, columnId });
    if (!r.ok) { setError(r.error); return false; }
    setError(null);
    router.refresh();
    return true;
  };
  const nav = useBoardNav(columns);
  return (
    <>
      <FormMessage error={error} />
      {/* Desktop: quadro com arrastar, navegação lateral pelas colunas */}
      <div className="hidden md:block">
        <div className="mb-2 flex items-center gap-1 overflow-x-auto pb-1">
          {columns.map((c) => (
            <button key={c.id} type="button" onClick={() => nav.go(c.id)}
              className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors', nav.visible.has(c.id) ? 'border-nacao bg-nacao/10 text-navy' : 'border-borda text-tinta-suave hover:border-nacao hover:text-navy')}>
              {c.color && <span className="size-2 rounded-full" style={{ background: c.color }} />}{c.name}<span className="text-tinta-fraca">{byCol[c.id]!.length}</span>
            </button>
          ))}
        </div>
        <DndContext sensors={sensors} collisionDetection={kanbanCollision} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div className="relative">
            {nav.edges.left && <button type="button" aria-label="Colunas anteriores" onClick={() => nav.by(-1)} className="absolute left-0 top-1/2 z-10 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white text-navy shadow-lg ring-1 ring-borda hover:bg-fundo"><ChevronLeft className="size-5" /></button>}
            {nav.edges.right && <button type="button" aria-label="Próximas colunas" onClick={() => nav.by(1)} className="absolute right-0 top-1/2 z-10 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white text-navy shadow-lg ring-1 ring-borda hover:bg-fundo"><ChevronRight className="size-5" /></button>}
            <div ref={nav.ref} data-pan {...nav.panHandlers} className="flex h-[calc(100vh-15rem)] min-h-[28rem] snap-x gap-3 overflow-x-auto overflow-y-hidden pb-3 [scrollbar-width:thin]">
              {columns.map((c) => <Column key={c.id} id={c.id} label={c.name} color={c.color} tasks={byCol[c.id]!} canEdit={canEdit} onOpen={(id) => setOpen({ id })} onAdd={() => setOpen({ id: null, defaults: { columnId: c.id } })} onQuickAdd={(title) => quickAdd(c.id, title)} />)}
            </div>
          </div>
          <DragOverlay>{active ? <div className="w-68"><Card t={active} dragging /></div> : null}</DragOverlay>
        </DndContext>
      </div>
      {/* Celular: colunas lado a lado, deslizando com o dedo (uma por tela), com "Mover para…" */}
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 md:hidden">
        {columns.map((c) => (
          <section key={c.id} className="w-[85vw] max-w-sm shrink-0 snap-center rounded-2xl bg-fundo/80 p-2 ring-1 ring-borda">
            <p className="mb-1.5 px-1 text-xs font-bold uppercase tracking-wide text-navy">{c.name} <span className="text-tinta-fraca">({byCol[c.id]!.length})</span></p>
            <div className="space-y-2">
              {byCol[c.id]!.map((t) => (
                <div key={t.id}>
                  <Card t={t} onOpen={() => setOpen({ id: t.id })} />
                  {canEdit && (
                    <Select aria-label="Mover para" className="mt-1 h-8 text-xs" value={t.columnId} onChange={(e) => move(t.id, e.target.value, byCol[e.target.value]?.length ?? 0)}>
                      {columns.map((x) => <option key={x.id} value={x.id}>Mover para: {x.name}</option>)}
                    </Select>
                  )}
                </div>
              ))}
              {canEdit && <QuickAdd onAdd={(title) => quickAdd(c.id, title)} />}
            </div>
          </section>
        ))}
      </div>
      {open && <TaskSheet taskId={open.id} defaults={open.defaults} options={options} siblings={siblings} canEdit={canEdit} onClose={() => setOpen(null)} />}
    </>
  );
}
