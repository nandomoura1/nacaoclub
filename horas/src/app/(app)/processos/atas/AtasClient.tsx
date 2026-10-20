'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, ExternalLink, Pencil, Plus, Search, Trash2, Users, Video } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Input, Label, Select } from '@/components/ui/input';
import { DEMAND_STATUSES } from '@/domain/processos';
import { cn } from '@/lib/cn';
import type { AtaRow } from '@/server/services/proc-meeting-service';
import { deleteAtaAction, saveAtaAction, saveDemandAction } from '../actions';

type Opt = { id: string; name: string };
type Form = { date: string; title: string; mode: string; participantIds: string[]; guests: string; agenda: string; decisions: string; link: string };
const br = (iso: string) => iso.split('-').reverse().join('/');
const TONE: Record<string, 'neutral' | 'blue' | 'amber' | 'green'> = { ABERTA: 'neutral', EM_ANDAMENTO: 'blue', AGUARDANDO: 'amber', CONCLUIDA: 'green', CANCELADA: 'neutral' };

export function AtasClient({ atas, people, sectors, today, perms }: { atas: AtaRow[]; people: Opt[]; sectors: Opt[]; today: string; perms: { create: boolean; del: boolean } }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string | null; error?: string | null }>({});
  const [edit, setEdit] = useState<{ id: string | null; f: Form } | null>(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(atas[0]?.id ?? null);
  const run = <T,>(fn: () => Promise<{ ok: boolean; error?: string; message?: string; data?: T }>, after?: (data?: T) => void) => start(async () => {
    setMsg({}); const r = await fn();
    if (!r.ok) setMsg({ error: r.error }); else { setMsg({ ok: r.message ?? null }); after?.(r.data); }
    router.refresh();
  });
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? atas.filter((a) => `${a.title} ${a.agenda ?? ''} ${a.decisions ?? ''} ${a.participants.map((p) => p.name).join(' ')} ${a.guests ?? ''}`.toLowerCase().includes(t)) : atas;
  }, [atas, q]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative"><Search className="absolute left-2 top-2.5 size-4 text-tinta-fraca" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar assunto, pessoa, decisão…" className="w-64 pl-7" /></div>
        {perms.create && !edit && <Button className="ml-auto" onClick={() => { setMsg({}); setEdit({ id: null, f: { date: today, title: '', mode: 'ONLINE', participantIds: [], guests: '', agenda: '', decisions: '', link: '' } }); }}><Plus /> Registrar ata</Button>}
      </div>
      <FormMessage error={msg.error} success={msg.ok} />
      {edit && <AtaForm edit={edit} setEdit={setEdit} people={people} pending={pending}
        onSave={(f) => run(() => saveAtaAction(edit.id, { ...f, guests: f.guests || null, decisions: f.decisions || null, link: f.link.trim() || null }), (id) => { setEdit(null); if (id) setOpen(id); })} />}

      {list.length === 0 ? (
        <Card className="p-8 text-center text-sm text-tinta-suave">{atas.length ? 'Nada encontrado.' : 'Nenhuma ata ainda. Depois de cada reunião online, registre aqui: participantes, resumo da pauta e decisões — e já abra as demandas que saíram dela.'}</Card>
      ) : list.map((a) => {
        const isOpen = open === a.id;
        const done = a.demands.filter((d) => d.status === 'CONCLUIDA').length;
        return (
          <Card key={a.id} className="overflow-hidden">
            <button type="button" onClick={() => setOpen(isOpen ? null : a.id)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 p-4 text-left" aria-expanded={isOpen}>
              <span className="w-24 font-bold tabular-nums text-navy">{br(a.date)}</span>
              <span className="min-w-0 flex-1 font-semibold text-navy">{a.title}</span>
              {a.mode && <Badge tone={a.mode === 'ONLINE' ? 'cyan' : 'neutral'}>{a.mode === 'ONLINE' ? 'online' : 'presencial'}</Badge>}
              <span className="inline-flex items-center gap-1 text-xs text-tinta-suave"><Users className="size-3.5" />{a.participants.length + (a.guests ? 1 : 0)}</span>
              {a.demands.length > 0 && <span className="text-xs text-tinta-suave">{done}/{a.demands.length} demandas entregues</span>}
              <ChevronDown className={cn('size-4 text-tinta-fraca transition-transform', isOpen && 'rotate-180')} />
            </button>
            {isOpen && (
              <div className="space-y-4 border-t border-borda p-4 text-sm">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-tinta-suave">Participantes</p>
                  <p className="mt-1 flex flex-wrap gap-1">{a.participants.map((p) => <Badge key={p.id}>{p.name}</Badge>)}{a.guests && <span className="text-tinta-suave">+ {a.guests}</span>}{!a.participants.length && !a.guests && <span className="text-tinta-fraca">—</span>}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-tinta-suave">Resumo da pauta</p>
                  <p className="mt-1 whitespace-pre-line">{a.agenda}</p>
                </div>
                {a.decisions && <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-tinta-suave">Decisões e combinados</p>
                  <p className="mt-1 whitespace-pre-line">{a.decisions}</p>
                </div>}
                {a.link && <a href={a.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-nacao"><Video className="size-4" /> Gravação / documento <ExternalLink className="size-3.5" /></a>}

                <div className="rounded-xl bg-fundo p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-tinta-suave">Demandas desta reunião</p>
                  {a.demands.length === 0 ? <p className="mt-1 text-tinta-suave">Nenhuma ainda.</p> : (
                    <ul className="mt-1 divide-y divide-borda">
                      {a.demands.map((d) => (
                        <li key={d.id} className="flex flex-wrap items-center gap-2 py-1.5">
                          <span className={cn('min-w-0 flex-1 font-semibold text-navy', d.status === 'CONCLUIDA' && 'text-tinta-suave line-through')}>{d.title}</span>
                          <span className="text-xs text-tinta-suave">{d.sector}{d.owner ? ` · ${d.owner}` : ''}{d.dueDate ? ` · ${br(d.dueDate).slice(0, 5)}` : ''}</span>
                          <Badge tone={TONE[d.status] ?? 'neutral'}>{DEMAND_STATUSES.find((s) => s.id === d.status)?.label ?? d.status}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                  {sectors.length > 0 && <QuickDemand ataId={a.id} sectors={sectors} people={people} run={run} />}
                  <Link href="/processos/demandas?modo=kanban" className="mt-2 inline-block text-xs font-semibold text-nacao">Ver no Kanban →</Link>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs text-tinta-suave">
                  <span>Registrada por {a.createdBy ?? '—'}</span>
                  <span className="flex-1" />
                  {a.canEdit && <Button size="sm" variant="ghost" onClick={() => { setMsg({}); setEdit({ id: a.id, f: { date: a.date, title: a.title, mode: a.mode ?? 'ONLINE', participantIds: a.participants.map((p) => p.id), guests: a.guests ?? '', agenda: a.agenda ?? '', decisions: a.decisions ?? '', link: a.link ?? '' } }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><Pencil /> Editar</Button>}
                  {perms.del && <Button size="sm" variant="ghost" onClick={() => { if (confirm(`Excluir a ata “${a.title}”? As demandas continuam no Kanban.`)) run(() => deleteAtaAction(a.id)); }}><Trash2 /></Button>}
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function QuickDemand({ ataId, sectors, people, run }: { ataId: string; sectors: Opt[]; people: Opt[]; run: (fn: () => Promise<{ ok: boolean; error?: string; message?: string; data?: string }>) => void }) {
  const [f, setF] = useState({ title: '', sectorId: sectors[0]!.id, ownerId: '', dueDate: '' });
  return (
    <form className="mt-2 grid gap-1.5 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto_auto]" onSubmit={(e) => {
      e.preventDefault();
      if (f.title.trim().length < 3) return;
      run(() => saveDemandAction(null, { sectorId: f.sectorId, title: f.title, description: null, ownerId: f.ownerId || null, dueDate: f.dueDate || null, priority: 'MEDIA', meetingId: ataId }));
      setF({ ...f, title: '', dueDate: '' });
    }}>
      <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Nova demanda que saiu da reunião…" className="h-9" />
      <Select value={f.sectorId} onChange={(e) => setF({ ...f, sectorId: e.target.value })} className="h-9" aria-label="Setor">{sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
      <Select value={f.ownerId} onChange={(e) => setF({ ...f, ownerId: e.target.value })} className="h-9" aria-label="Responsável"><option value="">Líder do setor</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
      <Input type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} className="h-9" aria-label="Prazo" />
      <Button size="sm" type="submit" className="h-9"><Plus /> Abrir</Button>
    </form>
  );
}

function AtaForm({ edit, setEdit, people, pending, onSave }: { edit: { id: string | null; f: Form }; setEdit: (e: { id: string | null; f: Form } | null) => void; people: Opt[]; pending: boolean; onSave: (f: Form) => void }) {
  const f = edit.f;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setEdit({ ...edit, f: { ...f, [k]: v } });
  const toggle = (id: string) => set('participantIds', f.participantIds.includes(id) ? f.participantIds.filter((x) => x !== id) : [...f.participantIds, id]);
  return (
    <Card className="border-nacao/30 p-4">
      <h2 className="font-bold text-navy">{edit.id ? 'Editar ata' : 'Registrar ata'}</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 [&>*]:min-w-0">
        <div><Label>Data</Label><Input type="date" value={f.date} onChange={(e) => set('date', e.target.value)} /></div>
        <div><Label>Formato</Label><Select value={f.mode} onChange={(e) => set('mode', e.target.value)}><option value="ONLINE">Online</option><option value="PRESENCIAL">Presencial</option></Select></div>
        <div className="sm:col-span-2"><Label>Assunto</Label><Input value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="ex.: Alinhamento da colônia de férias" /></div>
      </div>
      <p className="mt-3 text-sm font-semibold text-navy">Quem participou <span className="font-normal text-tinta-suave">({f.participantIds.length})</span></p>
      <div className="mt-1 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-lg bg-fundo p-2">
        {people.map((p) => (
          <button key={p.id} type="button" onClick={() => toggle(p.id)} className={cn('rounded-full px-2.5 py-1 text-xs font-semibold ring-1', f.participantIds.includes(p.id) ? 'bg-navy text-white ring-navy' : 'bg-white text-tinta-suave ring-borda')}>{p.name}</button>
        ))}
      </div>
      <div className="mt-3 grid gap-3 [&>*]:min-w-0">
        <div><Label>Convidados de fora (opcional)</Label><Input value={f.guests} onChange={(e) => set('guests', e.target.value)} placeholder="ex.: Contador, fornecedor X" /></div>
        <div><Label>Resumo da pauta</Label><textarea value={f.agenda} onChange={(e) => set('agenda', e.target.value)} rows={6} className="w-full rounded-lg border border-borda p-2 text-sm" placeholder={'1. Situação da piscina\n2. Escala do feriado\n3. Campanha de verão'} /></div>
        <div><Label>Decisões e combinados (opcional)</Label><textarea value={f.decisions} onChange={(e) => set('decisions', e.target.value)} rows={4} className="w-full rounded-lg border border-borda p-2 text-sm" placeholder="• Comprar cloro em lote — Manutenção até 25/10" /></div>
        <div><Label>Link da gravação ou documento (opcional)</Label><Input value={f.link} onChange={(e) => set('link', e.target.value)} placeholder="https://meet / drive / zoom…" /></div>
      </div>
      <div className="mt-3 flex gap-2">
        <Button disabled={pending} onClick={() => onSave(f)}>{pending ? 'Salvando…' : 'Salvar ata'}</Button>
        <Button variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button>
      </div>
      {!edit.id && <p className="mt-2 text-xs text-tinta-suave">Depois de salvar, abra a ata para registrar as demandas que saíram dela — elas vão para o Kanban do setor.</p>}
    </Card>
  );
}
