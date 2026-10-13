'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock, CopyPlus, Eye, MessageCircleQuestion, Pencil, Play, Plus, Trash2, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Input, Label, Select } from '@/components/ui/input';
import { WEEKDAYS } from '@/domain/dates';
import { todayIso } from '@/lib/today';
import { AUDIENCES, audienceOf, describeWhen, FREQUENCIES, renderTemplate, sampleVars, unknownVariables, VARIABLES, type VariableKey } from '@/domain/wa-automations';
import { cn } from '@/lib/cn';
import type { AutomationView } from '@/server/whatsapp/automations';
import { deleteAutomationAction, previewAutomationAction, runAutomationAction, saveAutomationAction, toggleAutomationAction } from '../../../whatsapp/actions';

type Opt = { id: string; name: string };
type Form = { name: string; active: boolean; frequency: string; weekdays: number[]; monthDay: number; audience: string; modalityId: string; roleKey: string; numbers: string; template: string; askConfirmation: boolean };
type Preview = { total: number; semTelefone: string[]; amostras: { para: string; nome: string; texto: string }[] };
type Msg = { ok?: string | null; error?: string | null };

const EMPTY: Form = { name: '', active: true, frequency: 'SEMANAL', weekdays: [1], monthDay: 1, audience: 'PROFESSORES', modalityId: '', roleKey: '', numbers: '', template: 'Olá, {primeiro_nome}! ', askConfirmation: false };
const toForm = (a: AutomationView): Form => ({
  name: a.name, active: a.active, frequency: a.frequency, weekdays: a.weekdays, monthDay: a.monthDay ?? 1, audience: a.audience,
  modalityId: a.filter?.modalityId ?? '', roleKey: a.filter?.roleKey ?? '', numbers: (a.filter?.numbers ?? []).join('\n'), template: a.template, askConfirmation: a.askConfirmation,
});
const payload = (f: Form) => ({
  name: f.name, active: f.active, frequency: f.frequency, weekdays: f.weekdays, monthDay: f.frequency === 'MENSAL' ? f.monthDay : null, audience: f.audience,
  filter: { modalityId: f.modalityId || null, roleKey: f.roleKey || null, numbers: f.numbers.split('\n').map((n) => n.trim()).filter(Boolean) },
  template: f.template, askConfirmation: f.askConfirmation,
});

export function AutomationsClient({ automations, modalities, roles, configured, testMode, cronReady }: {
  automations: AutomationView[]; modalities: Opt[]; roles: { key: string; name: string }[]; configured: boolean; testMode: boolean; cronReady: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>({});
  const [edit, setEdit] = useState<{ id: string | null; f: Form } | null>(null);
  const [preview, setPreview] = useState<{ title: string; p: Preview } | null>(null);
  const top = useRef<HTMLDivElement>(null);
  const run = <T,>(fn: () => Promise<{ ok: boolean; error?: string; message?: string; data?: T }>, after?: (r: { ok: boolean; data?: T }) => void) => start(async () => {
    setMsg({});
    const r = await fn();
    if (!r.ok) setMsg({ error: r.error });
    else { setMsg({ ok: r.message ?? null }); after?.(r); }
    router.refresh();
  });
  const open = (id: string | null, f: Form) => { setMsg({}); setPreview(null); setEdit({ id, f }); setTimeout(() => top.current?.scrollIntoView({ behavior: 'smooth' }), 50); };
  const fmt = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

  return (
    <div className="space-y-4" ref={top}>
      {!cronReady && <p className="rounded-lg border border-atencao/40 bg-atencao/5 p-3 text-sm text-atencao"><b>Falta 1 passo para rodarem sozinhas:</b> crie a variável <code>CRON_SECRET</code> na Vercel (qualquer senha longa) e faça Redeploy. “Enviar agora” já funciona.</p>}
      {testMode && <p className="rounded-lg border border-nacao/30 bg-nacao/5 p-3 text-sm text-navy">🧪 <b>Modo teste ligado</b> (ZAPI_TEST_PHONE): cada automação manda no máximo 3 mensagens, todas para o número de teste.</p>}
      <div className="flex flex-wrap items-center gap-2">
        <FormMessage error={msg.error} success={msg.ok} />
        <span className="flex-1" />
        {!edit && <Button onClick={() => open(null, EMPTY)}><Plus /> Nova automação</Button>}
      </div>

      {edit && <Editor key={edit.id ?? 'nova'} edit={edit} setEdit={setEdit} modalities={modalities} roles={roles} pending={pending}
        onSave={(f) => run(() => saveAutomationAction(edit.id, payload(f)), () => setEdit(null))}
        onPreview={(f) => run(() => previewAutomationAction({ audience: f.audience, filter: payload(f).filter, template: f.template }), (r) => r.data && setPreview({ title: f.name || 'Nova automação', p: r.data as Preview }))} />}

      {preview && <PreviewBox title={preview.title} p={preview.p} onClose={() => setPreview(null)} />}

      <div className="grid gap-3 lg:grid-cols-2 [&>*]:min-w-0">
        {automations.map((a) => {
          const r = a.lastResult;
          return (
            <Card key={a.id} className={cn('flex flex-col gap-2 p-4', !a.active && 'opacity-75')}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-navy">{a.name}</p>
                  <p className="flex flex-wrap items-center gap-x-3 text-xs font-semibold text-nacao">
                    <span className="inline-flex items-center gap-1"><CalendarClock className="size-3.5" /> {a.when}</span>
                    <span className="inline-flex items-center gap-1 text-tinta-suave"><Users className="size-3.5" /> {a.audienceLabel}</span>
                  </p>
                </div>
                {a.askConfirmation && <Badge tone="cyan"><MessageCircleQuestion className="size-3" /> pede confirmação</Badge>}
                <label className="flex items-center gap-1.5 text-xs font-semibold">
                  <input type="checkbox" checked={a.active} disabled={pending} onChange={(e) => run(() => toggleAutomationAction(a.id, e.target.checked))} />
                  {a.active ? 'ligada' : 'desligada'}
                </label>
              </div>
              <pre className="max-h-28 overflow-hidden whitespace-pre-wrap rounded-lg bg-fundo p-2 font-corpo text-xs text-tinta-suave">{a.template}</pre>
              <p className="text-xs text-tinta-fraca">
                {a.lastRunAt ? <>Último envio: {fmt(a.lastRunAt)}{r ? ` · ${r.enviados} enviada(s)${r.falhas ? `, ${r.falhas} falha(s)` : ''}${r.semTelefone?.length ? `, ${r.semTelefone.length} sem WhatsApp` : ''}${r.limitadoTeste ? `, ${r.limitadoTeste} não enviadas (modo teste)` : ''}${r.erro ? ` · ${r.erro}` : ''}` : ''}</> : 'Ainda não enviou.'}
              </p>
              <div className="mt-auto flex flex-wrap gap-1">
                <Button size="sm" variant="secondary" onClick={() => open(a.id, toForm(a))}><Pencil /> Editar</Button>
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => previewAutomationAction({ audience: a.audience, filter: a.filter, template: a.template }), (x) => x.data && setPreview({ title: a.name, p: x.data as Preview }))}><Eye /> Prévia</Button>
                <Button size="sm" variant="ghost" disabled={pending || !configured} onClick={() => { if (confirm(`Enviar agora "${a.name}"?${testMode ? ' (modo teste: até 3 mensagens para o número de teste)' : ''}`)) run(() => runAutomationAction(a.id), (x) => { const d = x.data as { enviados: number; falhas: number; semTelefone: string[]; erro?: string } | undefined; if (d) setMsg({ ok: `${a.name}: ${d.enviados} enviada(s)${d.falhas ? `, ${d.falhas} falha(s)` : ''}${d.semTelefone.length ? ` · sem WhatsApp: ${d.semTelefone.join(', ')}` : ''}${d.erro ? ` · ${d.erro}` : ''}` }); }); }}><Play /> Enviar agora</Button>
                <Button size="sm" variant="ghost" onClick={() => open(null, { ...toForm(a), name: `${a.name} (cópia)`, active: false })}><CopyPlus /> Duplicar</Button>
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => { if (confirm(`Excluir a automação "${a.name}"?`)) run(() => deleteAutomationAction(a.id)); }}><Trash2 /> Excluir</Button>
              </div>
            </Card>
          );
        })}
      </div>
      {automations.length === 0 && !edit && <Card className="p-8 text-center text-sm text-tinta-suave">Nenhuma automação. Clique em “Nova automação”.</Card>}
    </div>
  );
}

function Editor({ edit, setEdit, modalities, roles, pending, onSave, onPreview }: {
  edit: { id: string | null; f: Form }; setEdit: (e: { id: string | null; f: Form } | null) => void; modalities: Opt[]; roles: { key: string; name: string }[];
  pending: boolean; onSave: (f: Form) => void; onPreview: (f: Form) => void;
}) {
  const f = edit.f;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setEdit({ ...edit, f: { ...f, [k]: v } });
  const area = useRef<HTMLTextAreaElement>(null);
  const aud = audienceOf(f.audience);
  const bad = unknownVariables(f.template, f.audience);
  const sample = useMemo(() => {
    const vars = sampleVars(todayIso());
    const allowed = Object.fromEntries((aud?.vars ?? []).map((k) => [k, vars[k as VariableKey]]));
    return renderTemplate(f.template, allowed);
  }, [f.template, aud]);
  /** Insere a variável onde está o cursor. */
  const insert = (k: string) => {
    const el = area.current;
    const tag = `{${k}}`;
    if (!el) return set('template', f.template + tag);
    const s = el.selectionStart ?? f.template.length;
    const e = el.selectionEnd ?? s;
    set('template', f.template.slice(0, s) + tag + f.template.slice(e));
    setTimeout(() => { el.focus(); el.setSelectionRange(s + tag.length, s + tag.length); }, 0);
  };
  return (
    <Card className="border-nacao/30 p-4">
      <h2 className="font-bold text-navy">{edit.id ? 'Editar automação' : 'Nova automação'}</h2>
      <div className="mt-3 grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <div className="space-y-3">
          <div><Label>Nome</Label><Input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="ex.: Aviso de reunião geral" /></div>

          <div>
            <Label>Quando (às 8h)</Label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {FREQUENCIES.map((x) => (
                <button key={x.id} type="button" onClick={() => set('frequency', x.id)} className={cn('rounded-full px-3 py-1 text-sm font-semibold', f.frequency === x.id ? 'bg-nacao text-white' : 'bg-white text-tinta-suave ring-1 ring-borda')}>{x.label}</button>
              ))}
            </div>
            {f.frequency === 'SEMANAL' && (
              <div className="mt-2 flex flex-wrap gap-1">
                {WEEKDAYS.map((w) => {
                  const on = f.weekdays.includes(w.n);
                  return <button key={w.n} type="button" onClick={() => set('weekdays', on ? f.weekdays.filter((d) => d !== w.n) : [...f.weekdays, w.n])} className={cn('rounded-md px-2.5 py-1 text-xs font-bold', on ? 'bg-navy text-white' : 'bg-fundo text-tinta-suave ring-1 ring-borda')}>{w.short}</button>;
                })}
              </div>
            )}
            {f.frequency === 'MENSAL' && (
              <div className="mt-2 flex items-center gap-2 text-sm">Dia <Input type="number" min={1} max={28} className="h-8 w-20" value={f.monthDay} onChange={(e) => set('monthDay', Math.min(28, Math.max(1, Number(e.target.value) || 1)))} /> de cada mês</div>
            )}
            <p className="mt-1 text-xs text-tinta-suave">{describeWhen({ frequency: f.frequency, weekdays: f.weekdays, monthDay: f.monthDay })}</p>
          </div>

          <div>
            <Label>Para quem</Label>
            <Select value={f.audience} onChange={(e) => set('audience', e.target.value)}>{AUDIENCES.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</Select>
            <p className="mt-1 text-xs text-tinta-suave">{aud?.detail}</p>
            {aud?.filter === 'modality' && <Select className="mt-2" value={f.modalityId} onChange={(e) => set('modalityId', e.target.value)}><option value="">Todas as modalidades</option>{modalities.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select>}
            {aud?.filter === 'role' && <Select className="mt-2" value={f.roleKey} onChange={(e) => set('roleKey', e.target.value)}><option value="">Escolha o perfil…</option>{roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}</Select>}
            {aud?.filter === 'numbers' && <textarea className="mt-2 min-h-20 w-full rounded-lg border border-borda p-2 text-sm" value={f.numbers} onChange={(e) => set('numbers', e.target.value)} placeholder={'61 99999-8888\n61 98888-7777'} />}
          </div>

          <label className="flex items-start gap-2 rounded-lg border border-borda p-2 text-sm">
            <input type="checkbox" className="mt-0.5" checked={f.askConfirmation} onChange={(e) => set('askConfirmation', e.target.checked)} />
            <span><b>Pedir confirmação</b><span className="block text-xs text-tinta-suave">“ok”, “sim”, 👍 confirma; outro texto vira pedido de ajuste. As respostas aparecem em WhatsApp → Respostas recebidas (precisa do webhook cadastrado). Peça a resposta no texto.</span></span>
          </label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} /> Ligada</label>
        </div>

        <div className="space-y-2">
          <Label>Mensagem</Label>
          <div className="flex flex-wrap gap-1">
            {(aud?.vars ?? []).map((k) => <button key={k} type="button" title={VARIABLES[k as VariableKey]} onClick={() => insert(k)} className="rounded-full bg-nacao/10 px-2 py-0.5 text-[11px] font-semibold text-nacao hover:bg-nacao/20">{`{${k}}`}</button>)}
          </div>
          <textarea ref={area} className="min-h-48 w-full rounded-lg border border-borda p-2 font-mono text-sm" value={f.template} onChange={(e) => set('template', e.target.value)} />
          <p className="text-xs text-tinta-suave">Clique numa variável para inserir. *negrito*, _itálico_ e emojis funcionam como no WhatsApp.</p>
          {bad.length > 0 && <p className="text-xs font-semibold text-critico">Este público não preenche: {bad.map((b) => `{${b}}`).join(', ')}</p>}
          <div>
            <p className="text-xs font-semibold text-tinta-suave">Como fica (exemplo)</p>
            <pre className="mt-1 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg bg-[#e7f8e1] p-3 font-corpo text-sm text-tinta">{sample || '—'}</pre>
          </div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button disabled={pending} onClick={() => onSave(f)}>{pending ? 'Salvando…' : 'Salvar automação'}</Button>
        <Button variant="secondary" disabled={pending} onClick={() => onPreview(f)}><Eye /> Prévia com dados reais</Button>
        <Button variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button>
      </div>
    </Card>
  );
}

function PreviewBox({ title, p, onClose }: { title: string; p: Preview; onClose: () => void }) {
  return (
    <Card className="bg-fundo p-3">
      <div className="flex items-center gap-2">
        <p className="flex-1 text-sm font-bold text-navy">Prévia · {title} — {p.total} destinatário(s) hoje</p>
        <button type="button" className="text-xs font-semibold text-nacao" onClick={onClose}>fechar</button>
      </div>
      {p.semTelefone.length > 0 && <p className="mt-1 text-xs text-atencao">Sem WhatsApp cadastrado (não recebem): {p.semTelefone.join(', ')}</p>}
      {p.amostras.length === 0 && <p className="mt-2 text-sm text-tinta-suave">Ninguém receberia hoje.</p>}
      <div className="mt-2 grid gap-2 md:grid-cols-3 [&>*]:min-w-0">
        {p.amostras.map((a, i) => (
          <div key={i} className="rounded-lg bg-white p-2 text-xs ring-1 ring-borda">
            <p className="mb-1 font-semibold text-tinta-suave">{a.nome} · {a.para}</p>
            <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap font-corpo text-tinta">{a.texto}</pre>
          </div>
        ))}
      </div>
    </Card>
  );
}
