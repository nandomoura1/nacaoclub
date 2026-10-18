'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, CheckCircle2, Circle, ExternalLink, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Input, Label, Select } from '@/components/ui/input';
import { SendWhatsApp } from '@/components/whatsapp/SendWhatsApp';
import { EDU_AREAS, EDU_AUDIENCES, EDU_FORMATS, labelOf } from '@/domain/universidade';
import { cn } from '@/lib/cn';
import type { EduLibrary } from '@/server/services/edu-service';
import { deleteTrackAction, saveTrackAction, setCompletedAction } from '../actions';

type Track = EduLibrary['tracks'][number];
type Form = { name: string; description: string; audience: string; roleKey: string; active: boolean; items: string[] };

export function TracksClient({ lib, roles, base, perms }: { lib: EduLibrary; roles: { key: string; name: string }[]; base: string; perms: { edit: boolean; admin: boolean; whatsapp: boolean } }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string | null; error?: string | null }>({});
  const [edit, setEdit] = useState<{ id: string | null; f: Form } | null>(null);
  const byId = new Map(lib.materials.map((m) => [m.id, m]));
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, after?: () => void) => start(async () => {
    setMsg({}); const r = await fn();
    if (!r.ok) setMsg({ error: r.error }); else { setMsg({ ok: r.message ?? null }); after?.(); }
    router.refresh();
  });
  const msgFor = (t: Track) => [
    `🎓 *Universidade Nação — ${t.name}*`,
    t.description ?? null,
    `São ${t.items.length} materiais, em ordem:\n${t.items.map((id, i) => `${i + 1}. ${byId.get(id)?.title ?? ''}`).join('\n')}`,
    `Acesse pelo sistema e marque “Concluí” em cada um:\n${base}/universidade/trilhas#${t.id}`,
    'Bons estudos! 💙',
  ].filter(Boolean).join('\n\n');

  return (
    <div className="space-y-4">
      {perms.edit && !edit && <Button onClick={() => { setMsg({}); setEdit({ id: null, f: { name: '', description: '', audience: 'TODOS', roleKey: '', active: true, items: [] } }); }}><Plus /> Nova trilha</Button>}
      <FormMessage error={msg.error} success={msg.ok} />
      {edit && <TrackForm edit={edit} setEdit={setEdit} lib={lib} roles={roles} pending={pending} onSave={(f) => run(() => saveTrackAction(edit.id, { ...f, description: f.description || null, roleKey: f.roleKey || null }), () => setEdit(null))} />}

      {lib.tracks.length === 0 && <Card className="p-8 text-center text-sm text-tinta-suave">Nenhuma trilha ainda.</Card>}
      {lib.tracks.map((t) => (
        <Card key={t.id} id={t.id} className={cn('scroll-mt-20 overflow-hidden', !t.active && 'opacity-60')}>
          <div className="flex flex-wrap items-start gap-3 border-b border-borda p-4">
            <div className="min-w-0 flex-1">
              <p className="text-lg font-extrabold text-navy">{t.name} {!t.active && <Badge tone="red">oculta</Badge>} {t.audience !== 'TODOS' && <Badge tone="cyan">{t.audience === 'PERFIL' ? t.roleKey : labelOf(EDU_AUDIENCES, t.audience)}</Badge>}</p>
              {t.description && <p className="text-sm text-tinta-suave">{t.description}</p>}
              <div className="mt-2 flex items-center gap-2">
                <div className="h-2 w-48 overflow-hidden rounded-full bg-fundo"><div className={cn('h-full rounded-full', t.progress.finished ? 'bg-sucesso' : 'bg-nacao')} style={{ width: `${t.progress.pct}%` }} /></div>
                <span className="text-xs font-semibold text-tinta-suave">{t.progress.finished ? '✓ Trilha concluída' : `${t.progress.completed} de ${t.progress.total}`}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {perms.whatsapp && t.items.length > 0 && <SendWhatsApp kind="LIVRE" text={msgFor(t)} label="Enviar no WhatsApp" />}
              {perms.edit && <Button size="sm" variant="ghost" onClick={() => { setMsg({}); setEdit({ id: t.id, f: { name: t.name, description: t.description ?? '', audience: t.audience, roleKey: t.roleKey ?? '', active: t.active, items: t.items } }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><Pencil /> Editar</Button>}
              {perms.admin && <Button size="sm" variant="ghost" onClick={() => { if (confirm(`Excluir a trilha “${t.name}”? Os materiais continuam na biblioteca.`)) run(() => deleteTrackAction(t.id)); }}><Trash2 /></Button>}
            </div>
          </div>
          {t.items.length === 0 ? (
            <p className="p-4 text-sm text-tinta-suave">{perms.edit ? 'Trilha vazia: clique em “Editar” e escolha os materiais na ordem (ex.: apresentação de onboarding → Manual → Check List do setor → audiobook).' : 'Em preparação.'}</p>
          ) : (
            <ol className="divide-y divide-borda">
              {t.items.map((id, i) => {
                const m = byId.get(id);
                if (!m) return null;
                const next = t.progress.next === id;
                return (
                  <li key={id} className={cn('flex flex-wrap items-center gap-3 px-4 py-3', next && 'bg-nacao/5')}>
                    <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-bold', m.done ? 'bg-sucesso text-white' : next ? 'bg-nacao text-white' : 'bg-fundo text-tinta-suave')}>{m.done ? '✓' : i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-navy">{m.title} {m.required && <Badge tone="amber">Obrigatório</Badge>}</p>
                      <p className="text-xs text-tinta-suave">{labelOf(EDU_FORMATS, m.format)} · {labelOf(EDU_AREAS, m.area)}{m.category ? ` · ${m.category}` : ''}{next ? ' · próximo passo' : ''}</p>
                    </div>
                    {(m.url ?? m.fileUrl) && <a href={(m.url ?? m.fileUrl)!} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1 rounded-lg border border-borda px-3 text-xs font-semibold text-navy hover:bg-fundo"><ExternalLink className="size-3.5" /> Abrir</a>}
                    <button type="button" disabled={pending} onClick={() => run(() => setCompletedAction(m.id, !m.done))} className={cn('inline-flex h-8 items-center gap-1 rounded-lg px-3 text-xs font-semibold', m.done ? 'bg-sucesso/10 text-sucesso' : 'bg-nacao text-white')}>
                      {m.done ? <CheckCircle2 className="size-4" /> : <Circle className="size-4" />} {m.done ? 'Concluído' : 'Concluí'}
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>
      ))}
      <p className="text-xs text-tinta-suave">Os materiais ficam na <Link href="/universidade" className="font-semibold text-nacao">Biblioteca</Link>; a trilha só define a ordem.</p>
    </div>
  );
}

function TrackForm({ edit, setEdit, lib, roles, pending, onSave }: { edit: { id: string | null; f: Form }; setEdit: (e: { id: string | null; f: Form } | null) => void; lib: EduLibrary; roles: { key: string; name: string }[]; pending: boolean; onSave: (f: Form) => void }) {
  const f = edit.f;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setEdit({ ...edit, f: { ...f, [k]: v } });
  const [add, setAdd] = useState('');
  const byId = new Map(lib.materials.map((m) => [m.id, m]));
  const move = (i: number, d: number) => { const a = [...f.items]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j]!, a[i]!]; set('items', a); };
  const available = lib.materials.filter((m) => !f.items.includes(m.id));
  return (
    <Card className="border-nacao/30 p-4">
      <h2 className="font-bold text-navy">{edit.id ? 'Editar trilha' : 'Nova trilha'}</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 [&>*]:min-w-0">
        <div className="sm:col-span-2"><Label>Nome</Label><Input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="ex.: Onboarding da Recepção" /></div>
        <div><Label>Para quem</Label><Select value={f.audience} onChange={(e) => set('audience', e.target.value)}>{EDU_AUDIENCES.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</Select></div>
        {f.audience === 'PERFIL' ? <div><Label>Perfil</Label><Select value={f.roleKey} onChange={(e) => set('roleKey', e.target.value)}><option value="">Escolha…</option>{roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}</Select></div> : <div />}
        <div className="sm:col-span-2 lg:col-span-4"><Label>Descrição</Label><Input value={f.description} onChange={(e) => set('description', e.target.value)} placeholder="O que a pessoa vai aprender nesta trilha" /></div>
      </div>
      <p className="mt-4 text-sm font-semibold text-navy">Materiais, na ordem</p>
      <ol className="mt-1 space-y-1">
        {f.items.map((id, i) => (
          <li key={id} className="flex items-center gap-2 rounded-lg bg-fundo px-2 py-1.5 text-sm">
            <span className="w-5 text-center font-bold text-tinta-suave">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate">{byId.get(id)?.title ?? '(removido)'}</span>
            <button type="button" onClick={() => move(i, -1)} aria-label="Subir"><ArrowUp className="size-4 text-tinta-suave" /></button>
            <button type="button" onClick={() => move(i, 1)} aria-label="Descer"><ArrowDown className="size-4 text-tinta-suave" /></button>
            <button type="button" onClick={() => set('items', f.items.filter((x) => x !== id))} aria-label="Tirar"><X className="size-4 text-critico" /></button>
          </li>
        ))}
      </ol>
      <div className="mt-2 flex gap-2">
        <Select value={add} onChange={(e) => setAdd(e.target.value)} className="min-w-0 flex-1">
          <option value="">{available.length ? 'Adicionar material…' : 'Todos os materiais já estão na trilha'}</option>
          {EDU_AREAS.map((a) => {
            const opts = available.filter((m) => m.area === a.id);
            return opts.length ? <optgroup key={a.id} label={a.label}>{opts.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}</optgroup> : null;
          })}
        </Select>
        <Button variant="secondary" disabled={!add} onClick={() => { set('items', [...f.items, add]); setAdd(''); }}><Plus /> Adicionar</Button>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} /> Visível para os colaboradores</label>
      <div className="mt-3 flex gap-2">
        <Button disabled={pending} onClick={() => onSave(f)}>{pending ? 'Salvando…' : 'Salvar trilha'}</Button>
        <Button variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button>
      </div>
    </Card>
  );
}
