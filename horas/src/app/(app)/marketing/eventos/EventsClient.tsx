'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CopyPlus, MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Input, Label, Select } from '@/components/ui/input';
import { EVENT_STATUSES, labelOf } from '@/domain/marketing/constants';
import { cn } from '@/lib/cn';
import type { EventRow, MktOptions } from '@/server/services/marketing-service';
import { deleteEventAction, repeatEventAction, saveEventAction } from '../actions';
import { CampaignStatusBadge, daysLabel, fmtDate } from '../_components/ui';
import { useRun } from '../_components/useRun';

type Form = { name: string; startDate: string; endDate: string; location: string; audience: string; registrationUrl: string; modalityId: string; ownerId: string; notes: string; status: string };
const EMPTY: Form = { name: '', startDate: '', endDate: '', location: '', audience: '', registrationUrl: '', modalityId: '', ownerId: '', notes: '', status: 'PLANEJADO' };
const toForm = (e: EventRow): Form => ({ name: e.name, startDate: e.startDate, endDate: e.endDate ?? '', location: e.location ?? '', audience: e.audience ?? '', registrationUrl: e.registrationUrl ?? '', modalityId: e.modalityId ?? '', ownerId: e.ownerId ?? '', notes: e.notes ?? '', status: e.status });

export function EventsClient({ events, options, openNew, perms, today }: { today: string; events: EventRow[]; options: MktOptions; openNew: boolean; perms: { edit: boolean; del: boolean } }) {
  const { msg, setMsg, pending, run } = useRun();
  const [edit, setEdit] = useState<{ id: string | null; f: Form } | null>(openNew && perms.edit ? { id: null, f: EMPTY } : null);
  const [past, setPast] = useState(false);
  const upcoming = events.filter((e) => e.daysTo >= 0 || (e.endDate && e.endDate >= today));
  const done = events.filter((e) => !upcoming.includes(e)).reverse();
  const list = past ? done : upcoming;
  const set = (k: keyof Form, v: string) => setEdit((cur) => cur && { ...cur, f: { ...cur.f, [k]: v } });
  const save = () => edit && run(() => saveEventAction(edit.id, { ...edit.f, endDate: edit.f.endDate || null, modalityId: edit.f.modalityId || null, ownerId: edit.f.ownerId || null }), () => setEdit(null));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {[false, true].map((p) => (
          <button key={String(p)} type="button" onClick={() => setPast(p)} className={cn('rounded-full px-3 py-1 text-sm font-semibold', past === p ? 'bg-nacao text-white' : 'bg-white text-tinta-suave ring-1 ring-borda')}>
            {p ? `Realizados (${done.length})` : `Próximos (${upcoming.length})`}
          </button>
        ))}
        <span className="flex-1" />
        {perms.edit && !edit && <Button size="sm" onClick={() => { setMsg({}); setEdit({ id: null, f: EMPTY }); }}><Plus /> Evento</Button>}
      </div>
      <FormMessage error={msg.error} success={msg.ok} />

      {edit && (
        <Card className="p-4">
          <h2 className="font-bold text-navy">{edit.id ? 'Editar evento' : 'Novo evento'}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 [&>*]:min-w-0">
            <div className="sm:col-span-2"><Label>Nome</Label><Input value={edit.f.name} onChange={(e) => set('name', e.target.value)} placeholder="ex.: Nação Celebration" /></div>
            <div><Label>Data</Label><Input type="date" value={edit.f.startDate} onChange={(e) => set('startDate', e.target.value)} /></div>
            <div><Label>Até (opcional)</Label><Input type="date" value={edit.f.endDate} onChange={(e) => set('endDate', e.target.value)} /></div>
            <div><Label>Local</Label><Input value={edit.f.location} onChange={(e) => set('location', e.target.value)} /></div>
            <div><Label>Público</Label><Input value={edit.f.audience} onChange={(e) => set('audience', e.target.value)} /></div>
            <div><Label>Link de inscrição</Label><Input value={edit.f.registrationUrl} onChange={(e) => set('registrationUrl', e.target.value)} placeholder="https://…" /></div>
            <div><Label>Status</Label><Select value={edit.f.status} onChange={(e) => set('status', e.target.value)}>{EVENT_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Select></div>
            <div><Label>Modalidade</Label><Select value={edit.f.modalityId} onChange={(e) => set('modalityId', e.target.value)}><option value="">Nação (geral)</option>{options.modalities.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select></div>
            <div><Label>Responsável</Label><Select value={edit.f.ownerId} onChange={(e) => set('ownerId', e.target.value)}><option value="">—</option>{options.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></div>
            <div className="sm:col-span-2"><Label>Observações</Label><Input value={edit.f.notes} onChange={(e) => set('notes', e.target.value)} /></div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button disabled={pending} onClick={save}>{pending ? 'Salvando…' : 'Salvar evento'}</Button>
            <Button variant="secondary" onClick={() => setEdit(null)}>Cancelar</Button>
          </div>
        </Card>
      )}

      {list.length === 0 && <Card className="p-6 text-center text-sm text-tinta-suave">{past ? 'Nenhum evento realizado.' : 'Nenhum evento à vista. Cadastre o próximo e crie a campanha que vai prepará-lo.'}</Card>}
      <div className="grid gap-3 md:grid-cols-2">
        {list.map((e) => (
          <Card key={e.id} className="p-4">
            <div className="flex items-start gap-3">
              <div className="grid w-14 shrink-0 place-items-center rounded-xl bg-navy py-2 text-white">
                <span className="font-titulo text-lg font-extrabold leading-none">{e.startDate.slice(8, 10)}</span>
                <span className="text-[10px] uppercase">{new Date(`${e.startDate}T12:00:00Z`).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-navy">{e.name}</p>
                <p className="text-xs text-tinta-suave">
                  {daysLabel(e.daysTo)}{e.endDate && ` · até ${fmtDate(e.endDate)}`} · {labelOf(EVENT_STATUSES, e.status)}{e.owner && ` · ${e.owner}`}
                </p>
                {e.location && <p className="mt-0.5 flex items-center gap-1 text-xs text-tinta-suave"><MapPin className="size-3" />{e.location}</p>}
              </div>
              {perms.edit && <button type="button" aria-label="Editar evento" className="text-tinta-fraca hover:text-nacao" onClick={() => { setMsg({}); setEdit({ id: e.id, f: toForm(e) }); }}><Pencil className="size-4" /></button>}
              {perms.del && <button type="button" aria-label="Excluir evento" className="text-tinta-fraca hover:text-critico" disabled={pending} onClick={() => confirm(`Excluir o evento ${e.name}?`) && run(() => deleteEventAction(e.id))}><Trash2 className="size-4" /></button>}
            </div>
            <div className="mt-3 space-y-1">
              {e.campaigns.map((c) => (
                <Link key={c.id} href={`/marketing/campanhas/${c.id}`} className="flex items-center gap-2 rounded-lg bg-fundo px-2 py-1.5 text-sm hover:text-nacao">
                  <span className="min-w-0 flex-1 truncate">{c.name}</span><CampaignStatusBadge status={c.status} />
                </Link>
              ))}
              {e.campaigns.length === 0 && e.daysTo >= 0 && (
                <p className="rounded-lg bg-atencao/10 px-2 py-1.5 text-xs text-atencao">Sem campanha vinculada — este evento ainda não tem plano de divulgação.</p>
              )}
              {perms.edit && e.daysTo < 0 && (
                <button type="button" disabled={pending} onClick={() => run(() => repeatEventAction(e.id), (r) => { if (r.ok) setMsg({ ok: `Criado para ${r.data.date.split('-').reverse().join('/')} (mesmo dia da semana) como planejado.` }); })}
                  className="inline-flex items-center gap-1 pt-1 text-xs font-semibold text-nacao"><CopyPlus className="size-3" /> Repetir em {Number(e.startDate.slice(0, 4)) + 1}</button>
              )}
              {perms.edit && e.daysTo >= 0 && (
                <Link href={`/marketing/campanhas/nova?evento=${e.id}`} className="inline-flex items-center gap-1 pt-1 text-xs font-semibold text-nacao"><Plus className="size-3" /> Criar campanha do evento</Link>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
