'use client';

import { useState } from 'react';
import { ExternalLink, Pencil, Plus, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Input, Label, Select } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import type { ProcPerson } from '@/server/services/proc-service';
import { saveSectorAction } from '../actions';
import { useRun } from '../../marketing/_components/useRun';

type Sector = { id: string; name: string; description: string | null; leaderId: string | null; taskUrl: string | null; sortOrder: number; active: boolean; demands: number };
type Form = { name: string; description: string; leaderId: string; taskUrl: string; sortOrder: string; active: boolean };

export function SectorsClient({ sectors, people }: { sectors: Sector[]; people: ProcPerson[] }) {
  const { msg, setMsg, pending, run } = useRun();
  const [edit, setEdit] = useState<{ id: string | null; f: Form } | null>(null);
  const person = new Map(people.map((p) => [p.id, p]));
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setEdit((cur) => cur && { ...cur, f: { ...cur.f, [k]: v } });
  const save = () => edit && run(() => saveSectorAction(edit.id, {
    name: edit.f.name, description: edit.f.description || null, leaderId: edit.f.leaderId || null, taskUrl: edit.f.taskUrl || null,
    sortOrder: Number(edit.f.sortOrder) || 0, active: edit.f.active,
  }), () => setEdit(null));
  const leaderWarn = edit?.f.leaderId && !person.get(edit.f.leaderId)?.canProc;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        {!edit && <Button size="sm" onClick={() => { setMsg({}); setEdit({ id: null, f: { name: '', description: '', leaderId: '', taskUrl: '', sortOrder: String(sectors.length + 1), active: true } }); }}><Plus /> Setor</Button>}
      </div>
      <FormMessage error={msg.error} success={msg.ok} />
      {edit && (
        <Card className="p-4">
          <h2 className="font-bold text-navy">{edit.id ? 'Editar setor' : 'Novo setor'}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 [&>*]:min-w-0">
            <div><Label>Nome</Label><Input value={edit.f.name} onChange={(e) => set('name', e.target.value)} /></div>
            <div><Label>Líder</Label><Select value={edit.f.leaderId} onChange={(e) => set('leaderId', e.target.value)}><option value="">— sem líder —</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}{p.canProc ? '' : ' (sem perfil Líder)'}</option>)}</Select></div>
            <div className="sm:col-span-2"><Label>Link das rotinas no Nação Task (opcional)</Label><Input value={edit.f.taskUrl} onChange={(e) => set('taskUrl', e.target.value)} placeholder="https://nacao-task-7f33b.web.app/…" /></div>
            <div className="sm:col-span-2"><Label>Descrição (opcional)</Label><Input value={edit.f.description} onChange={(e) => set('description', e.target.value)} /></div>
            <div><Label>Ordem</Label><Input type="number" value={edit.f.sortOrder} onChange={(e) => set('sortOrder', e.target.value)} /></div>
            <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={edit.f.active} onChange={(e) => set('active', e.target.checked)} /> Ativo</label>
          </div>
          {leaderWarn && <p className="mt-2 flex items-center gap-1.5 text-xs text-atencao"><TriangleAlert className="size-3.5" /> Esta pessoa ainda não tem o perfil “Líder de setor”: ela não verá as demandas até receber o perfil em Administração → Usuários.</p>}
          <div className="mt-3 flex gap-2">
            <Button disabled={pending} onClick={save}>{pending ? 'Salvando…' : 'Salvar setor'}</Button>
            <Button variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button>
          </div>
        </Card>
      )}
      <Card className="divide-y divide-borda">
        {sectors.map((s) => {
          const leader = s.leaderId ? person.get(s.leaderId) : null;
          return (
            <div key={s.id} className={cn('flex flex-wrap items-center gap-2 p-3 text-sm', !s.active && 'opacity-60')}>
              <span className="w-6 text-xs tabular-nums text-tinta-fraca">{s.sortOrder}</span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-navy">{s.name} {!s.active && <Badge>inativo</Badge>}</p>
                {s.description && <p className="text-xs text-tinta-suave">{s.description}</p>}
              </div>
              <span className={cn('text-sm', leader ? 'text-tinta' : 'italic text-tinta-fraca')}>{leader?.name ?? 'sem líder'}</span>
              {leader && !leader.canProc && <Badge tone="amber">sem perfil Líder</Badge>}
              <span className="text-xs text-tinta-suave">{s.demands} demanda(s)</span>
              {s.taskUrl && <a href={s.taskUrl} target="_blank" rel="noreferrer" className="text-nacao" title="Rotinas no Nação Task"><ExternalLink className="size-4" /></a>}
              <Button size="sm" variant="ghost" onClick={() => { setMsg({}); setEdit({ id: s.id, f: { name: s.name, description: s.description ?? '', leaderId: s.leaderId ?? '', taskUrl: s.taskUrl ?? '', sortOrder: String(s.sortOrder), active: s.active } }); }}><Pencil /> Editar</Button>
            </div>
          );
        })}
      </Card>
    </div>
  );
}
