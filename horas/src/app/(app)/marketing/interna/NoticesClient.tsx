'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Eye, MessageCircle, Pencil, Pin, Plus, Send, Trash2, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Input, Label, Select } from '@/components/ui/input';
import { kindOf, NOTICE_AUDIENCES, NOTICE_KINDS } from '@/domain/marketing/notices';
import { cn } from '@/lib/cn';
import type { NoticeRow } from '@/server/services/mkt-notice-service';
import { deleteNoticeAction, noticeReadersAction, previewNoticeAction, publishNoticeAction, saveNoticeAction } from '../interna-actions';

type Opt = { id: string; name: string };
type Form = { kind: string; title: string; body: string; audience: string; modalityId: string; roleKey: string; numbers: string; campaignId: string; sendWhatsApp: boolean; askConfirmation: boolean; pinned: boolean; showUntil: string };
type Preview = { total: number; comTelefone: number; semTelefone: string[]; texto: string; teste: number | null };
const EMPTY: Form = { kind: 'AVISO', title: '', body: 'Oi, {primeiro_nome}! ', audience: 'TODOS', modalityId: '', roleKey: '', numbers: '', campaignId: '', sendWhatsApp: true, askConfirmation: true, pinned: false, showUntil: '' };
const fmt = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });

const toPayload = (f: Form) => ({
  kind: f.kind, title: f.title, body: f.body, audience: f.audience, campaignId: f.campaignId || null, sendWhatsApp: f.sendWhatsApp, askConfirmation: f.sendWhatsApp && f.askConfirmation,
  pinned: f.pinned, showUntil: f.showUntil || null,
  filter: f.audience === 'PROFESSORES' ? { modalityId: f.modalityId || null } : f.audience === 'PERFIL' ? { roleKey: f.roleKey || null } : f.audience === 'NUMEROS' ? { numbers: f.numbers.split(/\n|,|;/).map((x) => x.trim()).filter(Boolean) } : null,
});

export function NoticesClient({ notices, modalities, roles, campaigns, draft, whatsapp, perms }: {
  notices: NoticeRow[]; modalities: Opt[]; roles: { key: string; name: string }[]; campaigns: Opt[];
  draft: { title: string; body: string; campaignId: string } | null; whatsapp: { configured: boolean; testMode: boolean }; perms: { edit: boolean; del: boolean };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string | null; error?: string | null }>({});
  const [edit, setEdit] = useState<{ id: string | null; f: Form } | null>(draft ? { id: null, f: { ...EMPTY, kind: 'CAMPANHA', ...draft } } : null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [readers, setReaders] = useState<Record<string, { name: string; at: string }[]>>({});

  const run = <T,>(fn: () => Promise<{ ok: true; data: T; message?: string } | { ok: false; error: string }>, after?: (d: T) => void) => start(async () => {
    setMsg({}); const r = await fn();
    if (!r.ok) setMsg({ error: r.error }); else { setMsg({ ok: r.message ?? null }); after?.(r.data); }
    router.refresh();
  });

  const doPreview = (f: Form) => run(() => previewNoticeAction({ ...toPayload(f), kind: f.kind, title: f.title, body: f.body, askConfirmation: f.sendWhatsApp && f.askConfirmation }), (d) => setPreview(d));
  const publish = (n: NoticeRow) => {
    const how = n.sendWhatsApp ? ` e enviar por WhatsApp para “${NOTICE_AUDIENCES.find((a) => a.id === n.audience)?.label}”` : '';
    if (!confirm(`Publicar “${n.title}” no mural${how}? O WhatsApp sai uma vez só.`)) return;
    run(() => publishNoticeAction(n.id), (r) => setMsg({ ok: r ? (r.erro ? `Publicado no mural. WhatsApp: ${r.erro}` : `Publicado. WhatsApp: ${r.enviados} enviado(s)${r.falhas ? `, ${r.falhas} falha(s)` : ''}${r.semTelefone.length ? `, ${r.semTelefone.length} sem número` : ''}${r.limitadoTeste ? ` (modo teste: ${r.limitadoTeste} não enviados)` : ''}.`) : 'Publicado no mural.' }));
  };
  const openEdit = (n: NoticeRow) => {
    setMsg({}); setPreview(null);
    setEdit({ id: n.id, f: { kind: n.kind, title: n.title, body: n.body, audience: n.audience, modalityId: n.filter?.modalityId ?? '', roleKey: n.filter?.roleKey ?? '', numbers: (n.filter?.numbers ?? []).join('\n'), campaignId: n.campaignId ?? '', sendWhatsApp: n.sendWhatsApp, askConfirmation: n.askConfirmation, pinned: n.pinned, showUntil: n.showUntil ?? '' } });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="space-y-4">
      {!whatsapp.configured && <Card className="border-atencao/40 p-3 text-sm text-tinta-suave">WhatsApp não configurado: os comunicados vão só para o mural do app.</Card>}
      {whatsapp.testMode && <Card className="border-atencao/40 p-3 text-sm text-tinta-suave">Modo teste do WhatsApp ligado (ZAPI_TEST_PHONE): cada comunicado envia no máximo 3 mensagens, todas para o número de teste.</Card>}
      {perms.edit && !edit && <Button onClick={() => { setMsg({}); setPreview(null); setEdit({ id: null, f: EMPTY }); }}><Plus /> Novo comunicado</Button>}
      <FormMessage error={msg.error} success={msg.ok} />

      {edit && (
        <NoticeForm edit={edit} setEdit={(e) => { setEdit(e); setPreview(null); }} modalities={modalities} roles={roles} campaigns={campaigns} pending={pending} preview={preview}
          published={!!edit.id && notices.find((n) => n.id === edit.id)?.status === 'PUBLICADO'}
          onPreview={doPreview}
          onSave={(f) => run(() => saveNoticeAction(edit.id, toPayload(f)), () => { setEdit(null); setPreview(null); })} />
      )}

      {notices.length === 0 ? (
        <Card className="p-8 text-center text-sm text-tinta-suave">Nenhum comunicado ainda. Ex.: “Horário especial no feriado”, “Nova campanha de verão — o que falar com os alunos”.</Card>
      ) : (
        <div className="space-y-3">
          {notices.map((n) => {
            const k = kindOf(n.kind);
            const aud = NOTICE_AUDIENCES.find((a) => a.id === n.audience)?.label;
            return (
              <Card key={n.id} className={cn('p-4', n.status === 'RASCUNHO' && 'border-dashed')}>
                <div className="flex flex-wrap items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-navy">{k.emoji} {n.title} {n.pinned && <Pin className="inline size-3.5 text-nacao" aria-label="fixado" />}</p>
                    <p className="text-xs text-tinta-suave">
                      {k.label} · {aud}{n.campaign && ` · ${n.campaign}`} · {n.status === 'PUBLICADO' ? `publicado ${fmt(n.publishedAt!)}${n.publishedBy ? ` por ${n.publishedBy}` : ''}` : 'rascunho'}
                    </p>
                  </div>
                  <Badge tone={n.status === 'PUBLICADO' ? 'green' : 'neutral'}>{n.status === 'PUBLICADO' ? 'Publicado' : 'Rascunho'}</Badge>
                </div>
                <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm text-tinta">{n.body}</p>

                {n.status === 'PUBLICADO' && (
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-tinta-suave">
                    {n.sendResult && <span className="inline-flex items-center gap-1"><MessageCircle className="size-3.5" /> {n.sendResult.erro ? n.sendResult.erro : `${n.sendResult.enviados} WhatsApp enviados${n.sendResult.semTelefone.length ? ` · ${n.sendResult.semTelefone.length} sem número` : ''}${n.sendResult.falhas ? ` · ${n.sendResult.falhas} falhas` : ''}`}</span>}
                    {n.confirmations && <span className="inline-flex items-center gap-1" title={n.confirmations.pending.length ? `Faltam: ${n.confirmations.pending.join(', ')}` : undefined}><CheckCircle2 className="size-3.5 text-sucesso" /> <b className="text-navy">{n.confirmations.ok}</b>/{n.confirmations.total} responderam OK{n.confirmations.ajuste ? ` · ${n.confirmations.ajuste} com dúvida` : ''}</span>}
                    <button type="button" className="inline-flex items-center gap-1 hover:text-nacao" onClick={() => start(async () => { const r = await noticeReadersAction(n.id); if (r.ok) setReaders((x) => ({ ...x, [n.id]: r.data })); })}>
                      <Eye className="size-3.5" /> <b className="text-navy">{n.reads}</b> leram no app
                    </button>
                  </div>
                )}
                {readers[n.id] && <p className="mt-1 text-xs text-tinta-suave">{readers[n.id]!.length ? readers[n.id]!.map((r) => r.name).join(', ') : 'Ninguém marcou “Li” ainda.'}</p>}
                {n.confirmations && n.confirmations.pending.length > 0 && <p className="mt-1 text-xs text-tinta-suave"><Users className="mr-1 inline size-3.5" />Sem resposta: {n.confirmations.pending.slice(0, 12).join(', ')}{n.confirmations.pending.length > 12 ? ` e mais ${n.confirmations.pending.length - 12}` : ''}</p>}

                <div className="mt-3 flex flex-wrap gap-2">
                  {perms.edit && n.status === 'RASCUNHO' && <Button size="sm" disabled={pending} onClick={() => publish(n)}><Send /> Publicar{n.sendWhatsApp ? ' e enviar' : ''}</Button>}
                  {perms.edit && <Button size="sm" variant="ghost" onClick={() => openEdit(n)}><Pencil /> {n.status === 'PUBLICADO' ? 'Ajustar mural' : 'Editar'}</Button>}
                  {perms.del && <Button size="sm" variant="ghost" className="ml-auto" onClick={() => { if (confirm(`Excluir “${n.title}”? Sai do mural.`)) run(() => deleteNoticeAction(n.id)); }}><Trash2 /></Button>}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NoticeForm({ edit, setEdit, modalities, roles, campaigns, pending, preview, published, onPreview, onSave }: {
  edit: { id: string | null; f: Form }; setEdit: (e: { id: string | null; f: Form } | null) => void; modalities: Opt[]; roles: { key: string; name: string }[]; campaigns: Opt[];
  pending: boolean; preview: Preview | null; published: boolean; onPreview: (f: Form) => void; onSave: (f: Form) => void;
}) {
  const f = edit.f;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setEdit({ ...edit, f: { ...f, [k]: v } });
  const aud = NOTICE_AUDIENCES.find((a) => a.id === f.audience)!;
  return (
    <Card className="border-nacao/30 p-4">
      <h2 className="font-bold text-navy">{edit.id ? (published ? 'Ajustar comunicado (o WhatsApp já foi enviado)' : 'Editar comunicado') : 'Novo comunicado'}</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 [&>*]:min-w-0">
        <div><Label>Tipo</Label><Select value={f.kind} onChange={(e) => set('kind', e.target.value)}>{NOTICE_KINDS.map((k) => <option key={k.id} value={k.id}>{k.emoji} {k.label}</option>)}</Select></div>
        <div className="sm:col-span-1 lg:col-span-3"><Label>Título</Label><Input value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="ex.: Horário especial no feriado de 15/11" /></div>
        <div className="sm:col-span-2 lg:col-span-4">
          <Label>Texto</Label>
          <textarea value={f.body} onChange={(e) => set('body', e.target.value)} rows={6} className="w-full rounded-lg border border-borda p-2 text-sm" />
          <p className="text-xs text-tinta-suave">Use <code>{'{primeiro_nome}'}</code> para chamar cada pessoa pelo nome. *negrito* e _itálico_ funcionam no WhatsApp.</p>
        </div>
        {!published && <>
          <div><Label>Para quem</Label><Select value={f.audience} onChange={(e) => set('audience', e.target.value)}>{NOTICE_AUDIENCES.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</Select></div>
          <div className="sm:col-span-1 lg:col-span-3">
            {aud.filter === 'modality' && <><Label>Modalidade</Label><Select value={f.modalityId} onChange={(e) => set('modalityId', e.target.value)}><option value="">Todas</option>{modalities.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select></>}
            {aud.filter === 'role' && <><Label>Perfil</Label><Select value={f.roleKey} onChange={(e) => set('roleKey', e.target.value)}><option value="">Escolha…</option>{roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}</Select></>}
            {aud.filter === 'numbers' && <><Label>Grupos ou números (um por linha)</Label><textarea value={f.numbers} onChange={(e) => set('numbers', e.target.value)} rows={2} className="w-full rounded-lg border border-borda p-2 text-sm" placeholder="120363000000000000-group" /></>}
            {!aud.filter && <p className="pt-6 text-xs text-tinta-suave">{aud.detail}</p>}
          </div>
        </>}
        <div className="sm:col-span-2"><Label>Campanha (opcional)</Label><Select value={f.campaignId} onChange={(e) => set('campaignId', e.target.value)}><option value="">—</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>
        <div><Label>Mostrar no mural até</Label><Input type="date" value={f.showUntil} onChange={(e) => set('showUntil', e.target.value)} /></div>
        <div className="flex flex-col justify-end gap-1 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.pinned} onChange={(e) => set('pinned', e.target.checked)} /> Fixar no mural</label>
        </div>
        {!published && <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm sm:col-span-2 lg:col-span-4">
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.sendWhatsApp} onChange={(e) => set('sendWhatsApp', e.target.checked)} /> Enviar por WhatsApp ao publicar</label>
          <label className={cn('flex items-center gap-2', !f.sendWhatsApp && 'opacity-50')}><input type="checkbox" disabled={!f.sendWhatsApp} checked={f.askConfirmation} onChange={(e) => set('askConfirmation', e.target.checked)} /> Pedir “OK” de leitura (as respostas aparecem aqui)</label>
        </div>}
      </div>

      {preview && (
        <div className="mt-3 grid gap-3 rounded-lg bg-fundo p-3 text-sm md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <p><b className="text-navy">{preview.comTelefone}</b> de {preview.total} pessoa(s) recebem no WhatsApp{preview.teste ? ` (modo teste: só ${preview.teste})` : ''}.</p>
            {preview.semTelefone.length > 0 && <p className="mt-1 text-xs text-tinta-suave">Sem WhatsApp no cadastro ({preview.semTelefone.length}): {preview.semTelefone.slice(0, 15).join(', ')}{preview.semTelefone.length > 15 ? '…' : ''}. Elas veem no mural do app.</p>}
          </div>
          <div className="whitespace-pre-line rounded-lg bg-[#DCF8C6] p-3 text-[13px] text-[#111] shadow-sm">{preview.texto}</div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button disabled={pending} onClick={() => onSave(f)}>{pending ? 'Salvando…' : edit.id ? 'Salvar' : 'Salvar rascunho'}</Button>
        {!published && <Button variant="secondary" disabled={pending} onClick={() => onPreview(f)}><Eye /> Ver prévia e público</Button>}
        <Button variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button>
      </div>
      {!edit.id && <p className="mt-2 text-xs text-tinta-suave">Depois de salvar, confira e clique em “Publicar” no cartão — é aí que o WhatsApp sai.</p>}
    </Card>
  );
}
