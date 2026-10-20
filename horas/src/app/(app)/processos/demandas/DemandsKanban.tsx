'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { DndContext, DragOverlay, MouseSensor, TouchSensor, closestCorners, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { CalendarDays, MessageSquare, UserRound } from 'lucide-react';
import { FormMessage } from '@/components/ui/alert';
import { DEMAND_STATUSES, PRIORITIES } from '@/domain/processos';
import { cn } from '@/lib/cn';
import type { DemandRow } from '@/server/services/proc-service';
import { setDemandStatusAction } from '../actions';

/** Colunas do quadro: os status em aberto + concluídas (canceladas ficam só na lista). */
const COLUMNS = DEMAND_STATUSES.filter((s) => s.id !== 'CANCELADA');
const PRIO_TONE: Record<string, string> = { URGENTE: 'bg-critico text-white', ALTA: 'bg-atencao/15 text-atencao', MEDIA: 'bg-fundo text-tinta-suave', BAIXA: 'bg-fundo text-tinta-fraca' };
const HEAD: Record<string, string> = { ABERTA: 'border-t-tinta-fraca/50', EM_ANDAMENTO: 'border-t-nacao', AGUARDANDO: 'border-t-atencao', CONCLUIDA: 'border-t-sucesso' };
const fmt = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** Quadro das demandas: arrastar o cartão muda o status (quem pode trabalhar a demanda). */
export function DemandsKanban({ demands, week, onOpen }: { demands: DemandRow[]; week: string; onOpen: (id: string) => void }) {
  const router = useRouter();
  const [items, setItems] = useState(demands);
  const [active, setActive] = useState<DemandRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  useEffect(() => setItems(demands), [demands]);
  // Mouse arrasta na hora; no toque (tablet) segura 250 ms para arrastar — senão a tela rola normalmente.
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }));
  const [col, setCol] = useState<string>('ABERTA');

  const move = (id: string, status: string) => {
    const snapshot = items;
    setItems((cur) => cur.map((d) => (d.id === id ? { ...d, status, late: status === 'CONCLUIDA' ? false : d.late } : d)));
    setError(null);
    start(async () => {
      const r = await setDemandStatusAction(id, status);
      if (!r.ok) { setItems(snapshot); setError(r.error ?? 'Não foi possível mover.'); return; }
      router.refresh();
    });
  };
  const onDragStart = (e: DragStartEvent) => setActive(items.find((d) => d.id === e.active.id) ?? null);
  const onDragEnd = (e: DragEndEvent) => {
    setActive(null);
    const over = e.over ? String(e.over.id) : null;
    if (!over?.startsWith('col:')) return;
    const status = over.slice(4);
    const d = items.find((x) => x.id === e.active.id);
    if (d && d.status !== status) move(d.id, status);
  };

  return (
    <>
      <FormMessage error={error} />
      {/* Celular: uma coluna por vez (abas) e "Mover para…" em cada cartão. */}
      <div className="md:hidden">
        <div className="sticky top-0 z-10 -mx-4 flex gap-1 overflow-x-auto bg-fundo px-4 py-2">
          {COLUMNS.map((c) => {
            const n = items.filter((d) => d.status === c.id).length;
            return (
              <button key={c.id} type="button" onClick={() => setCol(c.id)} className={cn('shrink-0 rounded-full border-t-4 px-3 py-1.5 text-sm font-semibold', HEAD[c.id], col === c.id ? 'bg-navy text-white' : 'bg-white text-tinta-suave ring-1 ring-borda')}>
                {c.label} <span className="tabular-nums opacity-70">{n}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-2 space-y-2">
          {items.filter((d) => d.status === col).length === 0 && <p className="rounded-xl bg-white p-4 text-center text-sm text-tinta-suave ring-1 ring-borda">Nada em “{COLUMNS.find((c) => c.id === col)?.label}”.</p>}
          {items.filter((d) => d.status === col).map((d) => (
            <div key={d.id}>
              <button type="button" className="block w-full text-left" onClick={() => onOpen(d.id)}><CardBody d={d} week={week} /></button>
              {d.canWork && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {COLUMNS.filter((c) => c.id !== d.status).map((c) => (
                    <button key={c.id} type="button" onClick={() => move(d.id, c.id)} className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-navy ring-1 ring-borda active:bg-fundo">→ {c.label}</button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="hidden auto-cols-[minmax(15rem,1fr)] grid-flow-col gap-3 overflow-x-auto pb-2 md:grid">
          {COLUMNS.map((c) => {
            const list = items.filter((d) => d.status === c.id);
            return <Column key={c.id} id={c.id} label={c.label} count={list.length}>{list.map((d) => <DemandCard key={d.id} d={d} week={week} onOpen={onOpen} />)}</Column>;
          })}
        </div>
        <DragOverlay>{active ? <CardBody d={active} week={week} dragging /> : null}</DragOverlay>
      </DndContext>
      <p className="text-xs text-tinta-suave"><span className="md:hidden">No celular: toque na aba da coluna e use “→ …” para mover. </span>Arraste o cartão para mudar o status. 🎯 = foco da semana (combinado na reunião de líderes) · ⛔ = travada. Concluídas mostram as dos últimos 30 dias; canceladas ficam na lista.</p>
    </>
  );
}

function Column({ id, label, count, children }: { id: string; label: string; count: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${id}` });
  return (
    <div ref={setNodeRef} className={cn('flex min-w-0 flex-col rounded-xl border-t-4 bg-fundo p-2', HEAD[id], isOver && 'ring-2 ring-nacao/40')}>
      <p className="mb-2 flex items-center gap-2 px-1 text-sm font-bold text-navy">{label}<span className="rounded-full bg-white px-2 text-xs text-tinta-suave ring-1 ring-borda">{count}</span></p>
      <div className="flex min-h-24 flex-col gap-2">{children}</div>
    </div>
  );
}

function DemandCard({ d, week, onOpen }: { d: DemandRow; week: string; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: d.id, disabled: !d.canWork });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} onClick={() => onOpen(d.id)} className={cn(isDragging && 'opacity-40', d.canWork ? 'cursor-grab' : 'cursor-pointer')}>
      <CardBody d={d} week={week} />
    </div>
  );
}

function CardBody({ d, week, dragging }: { d: DemandRow; week: string; dragging?: boolean }) {
  return (
    <div className={cn('rounded-lg bg-white p-2.5 text-sm shadow-sm ring-1', d.late ? 'ring-critico/40' : 'ring-borda', dragging && 'rotate-1 shadow-lg')}>
      <div className="flex items-start gap-1.5">
        <span className={cn('mt-0.5 shrink-0 rounded px-1 text-[9px] font-bold uppercase', PRIO_TONE[d.priority])}>{PRIORITIES.find((p) => p.id === d.priority)?.label}</span>
        <p className={cn('min-w-0 flex-1 font-semibold leading-snug text-navy', d.status === 'CONCLUIDA' && 'text-tinta-suave line-through')}>{d.title}</p>
        {d.focusWeek === week && <span className="shrink-0" title="Foco da semana" aria-label="Foco da semana">🎯</span>}
      </div>
      <p className="mt-1 text-xs text-tinta-suave">{d.sector}</p>
      {d.blocker && d.status !== 'CONCLUIDA' && <p className="mt-1 rounded bg-critico/10 px-1.5 py-0.5 text-[11px] font-semibold text-critico">⛔ {d.blocker}</p>}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-tinta-suave">
        {d.owner && <span className="inline-flex items-center gap-0.5"><UserRound className="size-3" />{d.owner.split(' ')[0]}</span>}
        {d.dueDate && <span className={cn('inline-flex items-center gap-0.5 tabular-nums', d.late && 'font-semibold text-critico')}><CalendarDays className="size-3" />{fmt(d.dueDate)}{d.late ? ' · atrasada' : ''}</span>}
        {d.comments > 0 && <span className="inline-flex items-center gap-0.5"><MessageSquare className="size-3" />{d.comments}</span>}
      </div>
    </div>
  );
}
