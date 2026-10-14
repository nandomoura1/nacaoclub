'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DndContext, DragOverlay, PointerSensor, closestCorners, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { CalendarDays, Columns3, List, Mail, Phone, Plus, Search, Trash2, UserRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Input, Label, Select } from '@/components/ui/input';
import { SendWhatsApp } from '@/components/whatsapp/SendWhatsApp';
import { labelOf, LEAD_SOURCES, LEAD_STAGES } from '@/domain/marketing/leads';
import { cn } from '@/lib/cn';
import type { LeadRow } from '@/server/services/mkt-leads-service';
import { deleteLeadAction, saveLeadAction, setLeadStageAction } from '../conversao-actions';

type Opt = { id: string; name: string };
type Funnel = { total: number; won: number; conversion: number | null; winRate: number | null; avgDaysToWin: number | null; by: Record<string, number>; bySource: { id: string; label: string; total: number; won: number; rate: number | null }[] };
type Form = { name: string; phone: string; email: string; interest: string; source: string; stage: string; ownerId: string; campaignId: string; notes: string; nextActionAt: string };
const EMPTY: Form = { name: '', phone: '', email: '', interest: '', source: 'PRESENCIAL', stage: 'NOVO', ownerId: '', campaignId: '', notes: '', nextActionAt: '' };
const toForm = (l: LeadRow): Form => ({ name: l.name, phone: l.phone ?? '', email: l.email ?? '', interest: l.interest ?? '', source: l.source, stage: l.stage, ownerId: l.ownerId ?? '', campaignId: l.campaignId ?? '', notes: l.notes ?? '', nextActionAt: l.nextActionAt ?? '' });
const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
const HEAD: Record<string, string> = { NOVO: 'border-t-tinta-fraca/50', CONTATO: 'border-t-nacao', EXPERIMENTAL: 'border-t-ciano', NEGOCIACAO: 'border-t-atencao', MATRICULADO: 'border-t-sucesso', PERDIDO: 'border-t-critico' };

export function LeadsClient({ data, people, campaigns, filter, openNew, perms }: {
  data: { leads: LeadRow[]; funnel: Funnel }; people: Opt[]; campaigns: Opt[];
  filter: { days: number; stage: string; source: string; q: string; board: boolean }; openNew: boolean; perms: { edit: boolean; del: boolean };
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string | null; error?: string | null }>({});
  const [edit, setEdit] = useState<{ id: string | null; f: Form } | null>(openNew && perms.edit ? { id: null, f: EMPTY } : null);
  const [q, setQ] = useState(filter.q);
  const f = data.funnel;
  const go = (patch: Record<string, string | null>) => {
    const u = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v) u.set(k, v); else u.delete(k); }
    u.delete('novo');
    router.push(`?${u.toString()}`);
  };
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, after?: () => void) => start(async () => {
    setMsg({});
    const r = await fn();
    if (!r.ok) setMsg({ error: r.error });
    else { setMsg({ ok: r.message ?? null }); after?.(); }
    router.refresh();
  });
  const moveTo = (l: LeadRow, stage: string) => {
    if (stage === l.stage) return;
    let reason: string | null = null;
    if (stage === 'PERDIDO') { reason = prompt(`Por que ${l.name} foi perdido? (ex.: preço, horário, distância, sem resposta)`); if (!reason?.trim()) return; }
    run(() => setLeadStageAction(l.id, stage, reason));
  };
  const open = (l: LeadRow) => { setMsg({}); setEdit({ id: l.id, f: toForm(l) }); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Leads no período', String(f.total)],
          ['Matrículas', String(f.won)],
          ['Conversão (lead → matrícula)', pct(f.conversion)],
          ['Tempo médio até matrícula', f.avgDaysToWin === null ? '—' : `${f.avgDaysToWin} dias`],
        ].map(([l, v]) => (
          <Card key={l} className="p-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-tinta-suave">{l}</p><p className="mt-1 font-titulo text-2xl font-extrabold tabular-nums text-navy">{v}</p></Card>
        ))}
      </div>
      {f.bySource.length > 0 && (
        <Card className="p-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-tinta-suave">De onde vêm (e quanto convertem)</p>
          <div className="flex flex-wrap gap-2">
            {f.bySource.map((s) => (
              <button key={s.id} type="button" onClick={() => go({ origem: filter.source === s.id ? null : s.id })} className={cn('rounded-lg px-3 py-1.5 text-left text-sm ring-1', filter.source === s.id ? 'bg-nacao text-white ring-nacao' : 'bg-white ring-borda')}>
                <b>{s.label}</b> · {s.total} lead{s.total > 1 ? 's' : ''} · {s.won} matr. ({pct(s.rate)})
              </button>
            ))}
          </div>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-borda bg-white p-0.5">
          <button type="button" onClick={() => go({ modo: null })} className={cn('inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-sm font-semibold', filter.board ? 'bg-navy text-white' : 'text-tinta-suave')}><Columns3 className="size-4" /> Funil</button>
          <button type="button" onClick={() => go({ modo: 'lista' })} className={cn('inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-sm font-semibold', !filter.board ? 'bg-navy text-white' : 'text-tinta-suave')}><List className="size-4" /> Lista</button>
        </div>
        <Select className="h-8 w-auto text-sm" value={String(filter.days)} onChange={(e) => go({ dias: e.target.value === '90' ? null : e.target.value })}>
          <option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option><option value="365">Últimos 12 meses</option>
        </Select>
        {!filter.board && <Select className="h-8 w-auto text-sm" value={filter.stage} onChange={(e) => go({ etapa: e.target.value || null })}><option value="">Todas as etapas</option>{LEAD_STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Select>}
        <form onSubmit={(e) => { e.preventDefault(); go({ q: q.trim() || null }); }} className="flex items-center gap-1">
          <Input className="h-8 w-48 text-sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, telefone, e-mail…" />
          <Button size="sm" variant="ghost" type="submit"><Search /></Button>
        </form>
        <span className="flex-1" />
        {perms.edit && !edit && <Button size="sm" onClick={() => { setMsg({}); setEdit({ id: null, f: EMPTY }); }}><Plus /> Novo lead</Button>}
      </div>
      <FormMessage error={msg.error} success={msg.ok} />

      {edit && <LeadForm edit={edit} setEdit={setEdit} people={people} campaigns={campaigns} pending={pending} canDelete={perms.del}
        onSave={(x) => run(() => saveLeadAction(edit.id, { ...x, phone: x.phone || null, email: x.email || null, interest: x.interest || null, ownerId: x.ownerId || null, campaignId: x.campaignId || null, notes: x.notes || null, nextActionAt: x.nextActionAt || null }), () => setEdit(null))}
        onDelete={() => { if (edit.id && confirm('Excluir este lead?')) run(() => deleteLeadAction(edit.id!), () => setEdit(null)); }} />}

      {data.leads.length === 0 ? (
        <Card className="p-8 text-center text-sm text-tinta-suave">Nenhum lead no período. Conecte o formulário do site em <b>Marketing → Integrações</b> ou cadastre pelo botão “Novo lead”.</Card>
      ) : filter.board ? (
        <Board leads={data.leads} canMove={perms.edit} onMove={moveTo} onOpen={open} />
      ) : (
        <Card className="divide-y divide-borda">
          {data.leads.map((l) => (
            <button key={l.id} type="button" onClick={() => open(l)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 p-3 text-left text-sm hover:bg-fundo">
              <Badge tone={(LEAD_STAGES.find((s) => s.id === l.stage)?.tone ?? 'neutral') as 'neutral'}>{labelOf(LEAD_STAGES, l.stage)}</Badge>
              <span className="font-semibold text-navy">{l.name}</span>
              {l.interest && <span className="text-xs text-tinta-suave">{l.interest}</span>}
              <span className="flex-1" />
              <span className="text-xs text-tinta-suave">{labelOf(LEAD_SOURCES, l.source)}</span>
              {l.owner && <span className="inline-flex items-center gap-1 text-xs text-tinta-suave"><UserRound className="size-3" />{l.owner.split(' ')[0]}</span>}
              <span className="text-xs tabular-nums text-tinta-fraca">{fmtDay(l.createdAt)}</span>
            </button>
          ))}
        </Card>
      )}
    </div>
  );
}

function Board({ leads, canMove, onMove, onOpen }: { leads: LeadRow[]; canMove: boolean; onMove: (l: LeadRow, stage: string) => void; onOpen: (l: LeadRow) => void }) {
  const [items, setItems] = useState(leads);
  const [active, setActive] = useState<LeadRow | null>(null);
  useEffect(() => setItems(leads), [leads]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const onEnd = (e: DragEndEvent) => {
    setActive(null);
    const over = e.over ? String(e.over.id) : '';
    const l = items.find((x) => x.id === e.active.id);
    if (l && over.startsWith('col:')) onMove(l, over.slice(4));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={(e) => setActive(items.find((x) => x.id === e.active.id) ?? null)} onDragEnd={onEnd}>
      <div className="grid auto-cols-[minmax(13rem,1fr)] grid-flow-col gap-3 overflow-x-auto pb-2">
        {LEAD_STAGES.map((s) => {
          const list = items.filter((l) => l.stage === s.id);
          return <Col key={s.id} id={s.id} label={s.label} count={list.length}>{list.map((l) => <LeadCard key={l.id} l={l} canMove={canMove} onOpen={onOpen} />)}</Col>;
        })}
      </div>
      <DragOverlay>{active ? <LeadBody l={active} /> : null}</DragOverlay>
      <p className="mt-1 text-xs text-tinta-suave">Arraste o cartão para mudar a etapa. Clique para ver, editar ou chamar no WhatsApp.</p>
    </DndContext>
  );
}

function Col({ id, label, count, children }: { id: string; label: string; count: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${id}` });
  return (
    <div ref={setNodeRef} className={cn('flex min-w-0 flex-col rounded-xl border-t-4 bg-fundo p-2', HEAD[id], isOver && 'ring-2 ring-nacao/40')}>
      <p className="mb-2 flex items-center gap-2 px-1 text-sm font-bold text-navy">{label}<span className="rounded-full bg-white px-2 text-xs text-tinta-suave ring-1 ring-borda">{count}</span></p>
      <div className="flex min-h-24 flex-col gap-2">{children}</div>
    </div>
  );
}

function LeadCard({ l, canMove, onOpen }: { l: LeadRow; canMove: boolean; onOpen: (l: LeadRow) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: l.id, disabled: !canMove });
  return <div ref={setNodeRef} {...attributes} {...listeners} onClick={() => onOpen(l)} className={cn(isDragging && 'opacity-40', canMove ? 'cursor-grab' : 'cursor-pointer')}><LeadBody l={l} /></div>;
}

function LeadBody({ l }: { l: LeadRow }) {
  return (
    <div className="rounded-lg bg-white p-2.5 text-sm shadow-sm ring-1 ring-borda">
      <p className="font-semibold leading-snug text-navy">{l.name}</p>
      {l.interest && <p className="text-xs text-tinta-suave">{l.interest}</p>}
      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-tinta-suave">
        <span>{labelOf(LEAD_SOURCES, l.source)}</span>
        <span className="tabular-nums">{fmtDay(l.createdAt)}</span>
        {l.owner && <span className="inline-flex items-center gap-0.5"><UserRound className="size-3" />{l.owner.split(' ')[0]}</span>}
        {l.nextActionAt && <span className="inline-flex items-center gap-0.5 text-nacao"><CalendarDays className="size-3" />{l.nextActionAt.slice(8, 10)}/{l.nextActionAt.slice(5, 7)}</span>}
      </div>
    </div>
  );
}

function LeadForm({ edit, setEdit, people, campaigns, pending, canDelete, onSave, onDelete }: {
  edit: { id: string | null; f: Form }; setEdit: (e: { id: string | null; f: Form } | null) => void; people: Opt[]; campaigns: Opt[]; pending: boolean; canDelete: boolean;
  onSave: (f: Form) => void; onDelete: () => void;
}) {
  const f = edit.f;
  const set = (k: keyof Form, v: string) => setEdit({ ...edit, f: { ...f, [k]: v } });
  const hello = `Oi, ${f.name.split(' ')[0] || 'tudo bem'}! Aqui é da Nação Club 💙 Vi seu interesse${f.interest ? ` em ${f.interest}` : ''}. Quer agendar uma aula experimental? Me diz o melhor dia e horário pra você!`;
  return (
    <Card className="border-nacao/30 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex-1 font-bold text-navy">{edit.id ? f.name : 'Novo lead'}</h2>
        {f.phone && <SendWhatsApp kind="LIVRE" label="Chamar no WhatsApp" defaultTo={f.phone} text={hello} />}
        {f.phone && <a href={`tel:${f.phone.replace(/\D/g, '')}`} className="inline-flex items-center gap-1 text-sm font-semibold text-nacao"><Phone className="size-4" /> Ligar</a>}
        {f.email && <a href={`mailto:${f.email}`} className="inline-flex items-center gap-1 text-sm font-semibold text-nacao"><Mail className="size-4" /> E-mail</a>}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 [&>*]:min-w-0">
        <div><Label>Nome</Label><Input value={f.name} onChange={(e) => set('name', e.target.value)} /></div>
        <div><Label>WhatsApp / telefone</Label><Input value={f.phone} inputMode="tel" onChange={(e) => set('phone', e.target.value)} placeholder="61 99999-8888" /></div>
        <div><Label>E-mail</Label><Input value={f.email} onChange={(e) => set('email', e.target.value)} /></div>
        <div><Label>Interesse</Label><Input value={f.interest} onChange={(e) => set('interest', e.target.value)} placeholder="ex.: Beach Tennis, CrossFit" /></div>
        <div><Label>Etapa</Label><Select value={f.stage} onChange={(e) => set('stage', e.target.value)}>{LEAD_STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Select></div>
        <div><Label>Origem</Label><Select value={f.source} onChange={(e) => set('source', e.target.value)}>{LEAD_SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Select></div>
        <div><Label>Responsável</Label><Select value={f.ownerId} onChange={(e) => set('ownerId', e.target.value)}><option value="">—</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></div>
        <div><Label>Próximo contato</Label><Input type="date" value={f.nextActionAt} onChange={(e) => set('nextActionAt', e.target.value)} /></div>
        <div className="sm:col-span-2"><Label>Campanha</Label><Select value={f.campaignId} onChange={(e) => set('campaignId', e.target.value)}><option value="">—</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>
        <div className="sm:col-span-2"><Label>Anotações</Label><textarea className="min-h-20 w-full rounded-lg border border-borda p-2 text-sm" value={f.notes} onChange={(e) => set('notes', e.target.value)} /></div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button disabled={pending} onClick={() => onSave(f)}>{pending ? 'Salvando…' : 'Salvar lead'}</Button>
        <Button variant="ghost" onClick={() => setEdit(null)}>Fechar</Button>
        <span className="flex-1" />
        {edit.id && canDelete && <Button variant="ghost" onClick={onDelete}><Trash2 /> Excluir</Button>}
      </div>
    </Card>
  );
}
