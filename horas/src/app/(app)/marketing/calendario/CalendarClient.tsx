'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Input, Label, Select } from '@/components/ui/input';
import { addDays } from '@/domain/dates';
import { type CalEntry, mondayOf, monthGrid, onDay, overlaps, shiftMonth } from '@/domain/marketing/calendar';
import { CALENDAR_KINDS, CAMPAIGN_STATUSES, TASK_COLUMNS } from '@/domain/marketing/constants';
import { cn } from '@/lib/cn';
import type { MktOptions } from '@/server/services/marketing-service';
import { deleteCalendarItemAction, rescheduleAction, saveCalendarItemAction } from '../actions';
import { TaskSheet } from '../_components/TaskSheet';
import { fmtDate } from '../_components/ui';
import { useRun } from '../_components/useRun';

export type CalView = 'mes' | 'semana' | 'ano';
const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const KINDS = [
  { id: 'campanha', label: 'Campanhas', cls: 'bg-nacao text-white' },
  { id: 'evento', label: 'Eventos', cls: 'bg-navy text-white' },
  { id: 'tarefa', label: 'Tarefas', cls: 'bg-white text-tinta ring-1 ring-borda' },
  { id: 'item', label: 'Datas e avisos', cls: 'bg-ciano/20 text-navy' },
  { id: 'feriado', label: 'Feriados', cls: 'bg-atencao/15 text-atencao' },
] as const;
const kindCls = (k: CalEntry['kind']) => KINDS.find((x) => x.id === k)!.cls;
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const monthName = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

function Chip({ e, day, draggable, onOpen }: { e: CalEntry; day: string; draggable: boolean; onOpen: (e: CalEntry) => void }) {
  return (
    <button type="button" draggable={draggable}
      onDragStart={(ev) => { ev.dataTransfer.setData('text/plain', JSON.stringify({ kind: e.kind, id: e.id, start: e.start, from: day, title: e.title, status: e.status })); ev.dataTransfer.effectAllowed = 'move'; }}
      onClick={() => onOpen(e)} title={`${e.title}${e.tag ? ` · ${e.tag}` : ''}`}
      className={cn('flex w-full min-w-0 items-center gap-1 truncate rounded px-1.5 py-0.5 text-left text-[11px] font-semibold', kindCls(e.kind), draggable && 'cursor-grab active:cursor-grabbing')}>
      {e.kind === 'tarefa' && <span className="size-1.5 shrink-0 rounded-full" style={{ background: e.color ?? '#7d8ea0' }} />}
      <span className="truncate">{e.title}</span>
    </button>
  );
}

export function CalendarClient({ view, anchor, today, entries, options, filters, canEdit }: {
  view: CalView; anchor: string; today: string; entries: CalEntry[]; options: MktOptions; filters: Record<string, string | undefined>; canEdit: boolean;
}) {
  const router = useRouter();
  const { msg, pending, run } = useRun();
  const [task, setTask] = useState<string | null>(null);
  const [item, setItem] = useState<{ startDate: string } | null>(null);
  const [form, setForm] = useState({ title: '', kind: 'DATA_COMEMORATIVA', startDate: '', endDate: '', description: '', audience: '' });
  const [over, setOver] = useState<string | null>(null);
  const [selected, setSelected] = useState<CalEntry | null>(null);

  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...filters, ...patch })) if (v) p.set(k, v);
    return `?${p.toString()}`;
  };
  const step = (n: number) => qs({ d: view === 'semana' ? addDays(anchor, 7 * n) : view === 'ano' ? `${Number(anchor.slice(0, 4)) + n}-01-01` : `${shiftMonth(anchor.slice(0, 7), n)}-01` });
  const title = view === 'semana' ? `Semana de ${fmtDate(mondayOf(anchor))} a ${fmtDate(addDays(mondayOf(anchor), 6))}` : view === 'ano' ? anchor.slice(0, 4) : monthName(anchor.slice(0, 7));
  const movable = (e: CalEntry) => canEdit && e.kind !== 'feriado';

  const open = (e: CalEntry) => {
    if (e.kind === 'tarefa') return setTask(e.id);
    if (e.href) return router.push(e.href);
    setSelected(e);
  };
  const drop = (day: string, raw: string) => {
    setOver(null);
    let d: { kind: string; id: string; start: string; from: string; title: string; status?: string };
    try { d = JSON.parse(raw); } catch { return; }
    if (!d?.id) return;
    // Item de vários dias: desloca pela diferença entre o dia arrastado e o dia solto.
    const target = addDays(d.start, Math.round((Date.parse(day) - Date.parse(d.from ?? d.start)) / 86_400_000));
    if (target === d.start) return;
    if (d.kind === 'campanha' && d.status === 'ATIVA' && !confirm(`“${d.title}” já está ATIVA. Remarcar mesmo assim?`)) return;
    run(() => rescheduleAction(d.kind, d.id, target));
  };
  const dayProps = (day: string) => canEdit ? {
    onDragOver: (ev: React.DragEvent) => { ev.preventDefault(); setOver(day); },
    onDragLeave: () => setOver((o) => (o === day ? null : o)),
    onDrop: (ev: React.DragEvent) => { ev.preventDefault(); drop(day, ev.dataTransfer.getData('text/plain')); },
  } : {};
  const saveItem = () => run(() => saveCalendarItemAction(null, { ...form, startDate: form.startDate || item?.startDate || today, endDate: form.endDate || null, description: form.description || null, audience: form.audience || null }), () => { setItem(null); setForm({ ...form, title: '', description: '' }); });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Link href={step(-1)} aria-label="Anterior" className="grid size-8 place-items-center rounded-lg ring-1 ring-borda hover:bg-fundo"><ChevronLeft className="size-4" /></Link>
          <Link href={qs({ d: undefined })} className="rounded-lg px-2 py-1 text-xs font-semibold ring-1 ring-borda hover:bg-fundo">Hoje</Link>
          <Link href={step(1)} aria-label="Próximo" className="grid size-8 place-items-center rounded-lg ring-1 ring-borda hover:bg-fundo"><ChevronRight className="size-4" /></Link>
        </div>
        <h2 className="min-w-0 flex-1 font-titulo text-lg font-extrabold capitalize text-navy">{title}</h2>
        <div className="flex rounded-lg bg-fundo p-0.5 ring-1 ring-borda">
          {(['mes', 'semana', 'ano'] as const).map((v) => (
            <Link key={v} href={qs({ v: v === 'mes' ? undefined : v })} className={cn('rounded-md px-3 py-1 text-xs font-semibold', view === v ? 'bg-white text-navy shadow-sm' : 'text-tinta-suave')}>{v === 'mes' ? 'Mês' : v === 'semana' ? 'Semana' : 'Ano'}</Link>
          ))}
        </div>
        {canEdit && <Button size="sm" variant="secondary" onClick={() => setItem({ startDate: today })}><Plus /> Data / aviso</Button>}
      </div>

      <form className="flex flex-wrap items-center gap-2 text-sm">
        {view !== 'mes' && <input type="hidden" name="v" value={view} />}
        {filters.d && <input type="hidden" name="d" value={filters.d} />}
        <Select name="tipo" defaultValue={filters.tipo ?? ''} className="h-9 w-auto"><option value="">Tudo</option>{KINDS.filter((k) => k.id !== 'feriado').map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</Select>
        <Select name="area" defaultValue={filters.area ?? ''} className="h-9 w-auto"><option value="">Todas as áreas</option>{options.areas.map((a) => <option key={a.key} value={a.key}>{a.name}</option>)}</Select>
        <Select name="responsavel" defaultValue={filters.responsavel ?? ''} className="h-9 w-auto"><option value="">Todos</option>{options.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
        <Select name="modalidade" defaultValue={filters.modalidade ?? ''} className="h-9 w-auto"><option value="">Todas as modalidades</option>{options.modalities.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select>
        <Select name="status" defaultValue={filters.status ?? ''} className="h-9 w-auto"><option value="">Qualquer status</option><optgroup label="Campanha">{CAMPAIGN_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</optgroup><optgroup label="Tarefa">{TASK_COLUMNS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</optgroup></Select>
        <Select name="campanha" defaultValue={filters.campanha ?? ''} className="h-9 w-auto min-w-36"><option value="">Todas as campanhas</option>{options.campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <Button type="submit" size="sm" variant="secondary">Filtrar</Button>
        {['tipo', 'area', 'responsavel', 'modalidade', 'status', 'campanha'].some((k) => filters[k]) && <Link href={qs({ tipo: undefined, area: undefined, responsavel: undefined, modalidade: undefined, status: undefined, campanha: undefined })} className="text-xs font-semibold text-nacao">limpar</Link>}
      </form>

      <div className="flex flex-wrap gap-2 text-[11px]">{KINDS.map((k) => <span key={k.id} className={cn('rounded px-1.5 py-0.5 font-semibold', k.cls)}>{k.label}</span>)}</div>
      <FormMessage error={msg.error} success={msg.ok} />
      {pending && <p className="text-xs text-tinta-suave">Salvando…</p>}

      {item && (
        <Card className="p-4">
          <h3 className="font-bold text-navy">Nova data no calendário</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 [&>*]:min-w-0">
            <div className="sm:col-span-2"><Label>Título</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="ex.: Dia das Mães" /></div>
            <div><Label>Tipo</Label><Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>{CALENDAR_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</Select></div>
            <div><Label>Público</Label><Input value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} /></div>
            <div><Label>Data</Label><Input type="date" value={form.startDate || item.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></div>
            <div><Label>Até (opcional)</Label><Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></div>
            <div className="sm:col-span-2"><Label>Descrição</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          </div>
          <div className="mt-3 flex gap-2">
            <Button size="sm" disabled={pending} onClick={saveItem}>Salvar</Button>
            <Button size="sm" variant="secondary" onClick={() => setItem(null)}>Cancelar</Button>
          </div>
        </Card>
      )}

      {selected && (
        <Card className="flex flex-wrap items-center gap-2 p-3 text-sm">
          <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-semibold', kindCls(selected.kind))}>{selected.tag}</span>
          <span className="min-w-0 flex-1 font-semibold">{selected.title} <span className="font-normal text-tinta-suave">· {fmtDate(selected.start)}{selected.end !== selected.start && ` a ${fmtDate(selected.end)}`}</span></span>
          {selected.kind === 'item' && canEdit && <Button size="sm" variant="secondary" disabled={pending} onClick={() => confirm('Remover esta data do calendário?') && run(() => deleteCalendarItemAction(selected.id), () => setSelected(null))}><Trash2 /> Remover</Button>}
          <Button size="sm" variant="secondary" onClick={() => setSelected(null)}>Fechar</Button>
        </Card>
      )}

      {view === 'mes' && (
        <div className="overflow-x-auto">
          <div className="grid min-w-[44rem] grid-cols-7 overflow-hidden rounded-2xl border border-borda bg-borda [gap:1px]">
            {WEEKDAYS.map((w) => <div key={w} className="bg-fundo px-2 py-1 text-center text-[11px] font-bold uppercase text-tinta-suave">{w}</div>)}
            {monthGrid(anchor.slice(0, 7)).flat().map((day) => {
              const list = onDay(entries, day);
              const out = day.slice(0, 7) !== anchor.slice(0, 7);
              return (
                <div key={day} {...dayProps(day)} className={cn('group min-h-28 bg-white p-1', out && 'bg-fundo/60', over === day && 'bg-nacao/10 ring-2 ring-inset ring-nacao')}>
                  <div className="mb-0.5 flex items-center justify-between">
                    <span className={cn('grid size-6 place-items-center rounded-full text-xs font-semibold', day === today ? 'bg-nacao text-white' : out ? 'text-tinta-fraca' : 'text-tinta')}>{Number(day.slice(8))}</span>
                    {canEdit && <button type="button" aria-label="Adicionar data" className="text-tinta-fraca opacity-0 hover:text-nacao group-hover:opacity-100 focus:opacity-100" onClick={() => { setForm({ ...form, startDate: day }); setItem({ startDate: day }); }}><Plus className="size-3" /></button>}
                  </div>
                  <div className="space-y-0.5">
                    {list.slice(0, 4).map((e) => <Chip key={`${e.kind}${e.id}`} e={e} day={day} draggable={movable(e)} onOpen={open} />)}
                    {list.length > 4 && <Link href={qs({ v: 'semana', d: day })} className="block px-1 text-[10px] font-semibold text-nacao">+{list.length - 4} mais</Link>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view === 'semana' && (
        <div className="grid gap-2 md:grid-cols-7">
          {Array.from({ length: 7 }, (_, i) => addDays(mondayOf(anchor), i)).map((day, i) => (
            <div key={day} {...dayProps(day)} className={cn('min-h-40 rounded-xl border border-borda bg-white p-2', over === day && 'bg-nacao/10 ring-2 ring-nacao', day === today && 'border-nacao')}>
              <p className="mb-1 text-xs font-bold text-navy">{WEEKDAYS[i]} <span className="font-normal text-tinta-suave">{fmtDate(day)}</span></p>
              <div className="space-y-1">{onDay(entries, day).map((e) => <Chip key={`${e.kind}${e.id}`} e={e} day={day} draggable={movable(e)} onOpen={open} />)}</div>
            </div>
          ))}
        </div>
      )}

      {view === 'ano' && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 12 }, (_, i) => `${anchor.slice(0, 4)}-${String(i + 1).padStart(2, '0')}`).map((ym) => {
            const list = entries.filter((e) => e.kind !== 'tarefa' && overlaps(e, `${ym}-01`, `${ym}-31`)).sort((a, b) => a.start.localeCompare(b.start));
            const tasks = entries.filter((e) => e.kind === 'tarefa' && e.start.startsWith(ym)).length;
            return (
              <Card key={ym} className="p-3">
                <Link href={qs({ v: undefined, d: `${ym}-01` })} className="font-bold capitalize text-navy hover:text-nacao">{MONTHS[Number(ym.slice(5)) - 1]}</Link>
                <span className="ml-2 text-xs text-tinta-suave">{tasks} tarefa(s)</span>
                <ul className="mt-2 space-y-0.5">
                  {list.slice(0, 8).map((e) => (
                    <li key={`${e.kind}${e.id}`} className="flex items-center gap-1.5 text-xs">
                      <span className="w-9 shrink-0 text-tinta-suave">{fmtDate(e.start < `${ym}-01` ? `${ym}-01` : e.start)}</span>
                      <span className={cn('min-w-0 truncate rounded px-1', kindCls(e.kind))}>{e.title}</span>
                    </li>
                  ))}
                  {list.length > 8 && <li className="text-[11px] text-tinta-suave">+{list.length - 8}</li>}
                  {list.length === 0 && <li className="text-xs text-tinta-fraca">—</li>}
                </ul>
              </Card>
            );
          })}
        </div>
      )}

      {task && <TaskSheet taskId={task} options={options} canEdit={canEdit} onClose={() => setTask(null)} />}
    </div>
  );
}
