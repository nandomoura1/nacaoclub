'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCorners, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AlertTriangle, CalendarDays, CheckSquare, Lock, Plus } from 'lucide-react';
import { FormMessage } from '@/components/ui/alert';
import { Select } from '@/components/ui/input';
import type { BoardColumn } from '@/domain/marketing/board';
import { cn } from '@/lib/cn';
import type { MktOptions } from '@/server/services/marketing-service';
import type { BoardTask } from '@/server/services/mkt-task-service';
import { moveTaskAction } from '../actions';
import { TaskSheet, type TaskDefaults } from '../_components/TaskSheet';
import { AreaChip, PriorityTag, fmtDate } from '../_components/ui';

const initials = (n: string | null) => (n ? n.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase() : '');

function Card({ t, onOpen, dragging }: { t: BoardTask; onOpen?: () => void; dragging?: boolean }) {
  return (
    <div onClick={onOpen} className={cn('cursor-pointer rounded-xl border bg-white p-2.5 text-left text-sm shadow-[0_1px_2px_rgba(2,43,87,0.06)] transition-shadow hover:shadow-md', t.overdue ? 'border-critico/40' : 'border-borda', dragging && 'rotate-2 shadow-lg')}>
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

function Column({ id, label, color, tasks, onOpen, onAdd, canEdit }: { id: string; label: string; color: string | null; tasks: BoardTask[]; onOpen: (id: string) => void; onAdd: () => void; canEdit: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${id}`, data: { column: id } });
  return (
    <div className={cn('flex w-72 shrink-0 flex-col rounded-2xl bg-fundo/80 p-2 ring-1 ring-borda', isOver && 'ring-2 ring-nacao')}>
      <div className="mb-2 flex items-center gap-2 px-1">
        {color && <span className="size-2.5 shrink-0 rounded-full" style={{ background: color }} />}
        <p className="flex-1 text-xs font-bold uppercase tracking-wide text-navy">{label}</p>
        <span className="rounded-full bg-white px-2 text-[11px] font-semibold text-tinta-suave">{tasks.length}</span>
        {canEdit && <button type="button" onClick={onAdd} aria-label={`Nova tarefa em ${label}`} className="text-tinta-fraca hover:text-nacao"><Plus className="size-4" /></button>}
      </div>
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="flex min-h-24 flex-1 flex-col gap-2">
          {tasks.map((t) => <SortableCard key={t.id} t={t} onOpen={() => onOpen(t.id)} disabled={!canEdit} />)}
        </div>
      </SortableContext>
    </div>
  );
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
      const r = await moveTaskAction(id, column, before, after);
      if (!r.ok) { setTasks(snapshot); setError(r.error); return; }
      router.refresh();
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
  return (
    <>
      <FormMessage error={error} />
      {/* Desktop: quadro com arrastar */}
      <div className="hidden md:block">
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-4">
            {columns.map((c) => <Column key={c.id} id={c.id} label={c.name} color={c.color} tasks={byCol[c.id]!} canEdit={canEdit} onOpen={(id) => setOpen({ id })} onAdd={() => setOpen({ id: null, defaults: { columnId: c.id } })} />)}
          </div>
          <DragOverlay>{active ? <div className="w-68"><Card t={active} dragging /></div> : null}</DragOverlay>
        </DndContext>
      </div>
      {/* Celular: lista por coluna com "Mover para…" */}
      <div className="space-y-4 md:hidden">
        {columns.filter((c) => byCol[c.id]!.length).map((c) => (
          <section key={c.id}>
            <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-navy">{c.name} <span className="text-tinta-fraca">({byCol[c.id]!.length})</span></p>
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
            </div>
          </section>
        ))}
        {tasks.length === 0 && <p className="text-sm text-tinta-suave">Nenhuma tarefa com esses filtros.</p>}
      </div>
      {open && <TaskSheet taskId={open.id} defaults={open.defaults} options={options} siblings={siblings} canEdit={canEdit} onClose={() => setOpen(null)} />}
    </>
  );
}
