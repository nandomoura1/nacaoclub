'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Download, FileText, Film, MessageSquareWarning, Pencil, Search, Send, Trash2, Upload, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Input, Label, Select } from '@/components/ui/input';
import { ACCEPT, ASSET_KINDS, ASSET_STATUSES, canMove, formatBytes, guessKind, MAX_ASSET_BYTES, titleFromFile } from '@/domain/marketing/assets';
import { cn } from '@/lib/cn';
import type { AssetRow } from '@/server/services/mkt-asset-service';
import { deleteAssetAction, registerAssetAction, setAssetStatusAction, startAssetUploadAction, updateAssetAction } from '../biblioteca-actions';

type Opt = { id: string; name: string };
type Meta = { title: string; kind: string; campaignId: string; tags: string; notes: string };
type Pending = { file: File; meta: Meta; progress: number; state: 'fila' | 'enviando' | 'ok' | 'erro'; error?: string };
const labelOf = (list: readonly { id: string; label: string }[], id: string) => list.find((x) => x.id === id)?.label ?? id;
const toneOf = (id: string) => (ASSET_STATUSES.find((s) => s.id === id)?.tone ?? 'neutral') as 'neutral' | 'amber' | 'red' | 'green';
const tagsOf = (s: string) => s.split(/[,;#]/).map((t) => t.trim().toLowerCase()).filter(Boolean);

/** PUT com progresso (fetch não informa progresso de envio). */
function putWithProgress(url: string, file: File, mime: string, onProgress: (p: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('PUT', url);
    x.setRequestHeader('Content-Type', mime);
    x.setRequestHeader('x-upsert', 'false');
    x.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    x.onload = () => (x.status >= 200 && x.status < 300 ? resolve() : reject(new Error(`Falha no envio (${x.status}).`)));
    x.onerror = () => reject(new Error('Sem conexão com o armazenamento.'));
    x.send(file);
  });
}

export function LibraryClient({ assets, counts, campaigns, configured, filters, perms }: {
  assets: AssetRow[]; counts: Record<string, number>; campaigns: Opt[]; configured: boolean;
  filters: { status: string; kind: string; campaignId: string; q: string }; perms: { edit: boolean; approve: boolean; del: boolean };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string | null; error?: string | null }>({});
  const [queue, setQueue] = useState<Pending[]>([]);
  const [shared, setShared] = useState({ campaignId: filters.campaignId, review: true });
  const [open, setOpen] = useState<AssetRow | null>(null);
  const [q, setQ] = useState(filters.q);
  const input = useRef<HTMLInputElement>(null);

  const go = (patch: Partial<typeof filters>) => {
    const f = { ...filters, ...patch };
    const p = new URLSearchParams();
    if (f.status) p.set('status', f.status); if (f.kind) p.set('tipo', f.kind); if (f.campaignId) p.set('campanha', f.campaignId); if (f.q) p.set('q', f.q);
    router.push(`/marketing/biblioteca${p.size ? `?${p}` : ''}`);
  };

  const pick = (files: FileList | null) => {
    if (!files?.length) return;
    const list = Array.from(files); // FileList é "viva": o input é limpo logo depois.
    setMsg({});
    setQueue((q0) => [...q0.filter((x) => x.state !== 'ok'), ...list.map((file) => ({
      file, progress: 0, state: 'fila' as const,
      ...(file.size > MAX_ASSET_BYTES ? { state: 'erro' as const, error: 'Acima de 50 MB' } : {}),
      meta: { title: titleFromFile(file.name), kind: guessKind(file.name), campaignId: shared.campaignId, tags: '', notes: '' },
    }))]);
  };
  const patch = (i: number, p: Partial<Pending>) => setQueue((q0) => q0.map((x, j) => (j === i ? { ...x, ...p } : x)));

  const sendAll = async () => {
    for (let i = 0; i < queue.length; i++) {
      const it = queue[i];
      if (!it || it.state !== 'fila') continue;
      patch(i, { state: 'enviando', progress: 0 });
      try {
        const s = await startAssetUploadAction({ name: it.file.name, size: it.file.size });
        if (!s.ok) throw new Error(s.error);
        await putWithProgress(s.data.uploadUrl, it.file, s.data.mime, (p) => patch(i, { progress: p }));
        const r = await registerAssetAction({ path: s.data.path, fileName: it.file.name, title: it.meta.title, kind: it.meta.kind, campaignId: (it.meta.campaignId || shared.campaignId) || null, tags: tagsOf(it.meta.tags), notes: it.meta.notes || null, sendToReview: shared.review });
        if (!r.ok) throw new Error(r.error);
        patch(i, { state: 'ok', progress: 100 });
      } catch (e) {
        patch(i, { state: 'erro', error: e instanceof Error ? e.message : 'Falha no envio.' });
      }
    }
    // Enviados saem da fila; os com erro ficam para tentar de novo.
    setQueue((q0) => q0.filter((x) => x.state !== 'ok'));
    router.refresh();
  };

  const act = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, after?: () => void) => start(async () => {
    setMsg({}); const r = await fn();
    if (!r.ok) setMsg({ error: r.error }); else { setMsg({ ok: r.message ?? null }); after?.(); }
    router.refresh();
  });

  const waiting = queue.filter((x) => x.state === 'fila').length;
  const busy = queue.some((x) => x.state === 'enviando');

  return (
    <div className="space-y-4">
      {/* Resumo por status = filtros rápidos */}
      <div className="flex flex-wrap gap-2">
        {[{ id: '', label: 'Ativos', n: Object.entries(counts).filter(([k]) => k !== 'ARQUIVADO').reduce((s, [, v]) => s + v, 0) }, ...ASSET_STATUSES.map((s) => ({ id: s.id, label: s.label, n: counts[s.id] ?? 0 }))].map((s) => (
          <button key={s.id || 'all'} type="button" onClick={() => go({ status: s.id })}
            className={cn('rounded-full px-3 py-1 text-sm ring-1 ring-borda', filters.status === s.id ? 'bg-navy text-white ring-navy' : 'bg-white text-navy hover:bg-fundo')}>
            {s.label} <b className="tabular-nums">{s.n}</b>
          </button>
        ))}
      </div>

      {perms.edit && configured && (
        <Card className="p-4"
          onDragOver={(e) => { e.preventDefault(); }} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files); }}>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => input.current?.click()} disabled={busy}><Upload /> Enviar arquivos</Button>
            <p className="text-sm text-tinta-suave">ou arraste aqui · imagem, vídeo, PDF, AI/PSD, ZIP · até 50 MB cada</p>
            <input ref={input} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => { pick(e.target.files); e.target.value = ''; }} />
          </div>
          {queue.length > 0 && (
            <div className="mt-3 space-y-2">
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <div><Label>Campanha (para todos)</Label>
                  <Select value={shared.campaignId} onChange={(e) => { const v = e.target.value; setShared((s) => ({ ...s, campaignId: v })); setQueue((q0) => q0.map((x) => (x.state === 'fila' ? { ...x, meta: { ...x.meta, campaignId: v } } : x))); }}>
                    <option value="">Sem campanha</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select></div>
                <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={shared.review} onChange={(e) => setShared((s) => ({ ...s, review: e.target.checked }))} /> Já mandar para aprovação</label>
              </div>
              {queue.map((it, i) => (
                <div key={i} className="grid gap-2 rounded-lg bg-fundo p-2 text-sm sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center">
                  <Input value={it.meta.title} disabled={it.state !== 'fila'} onChange={(e) => patch(i, { meta: { ...it.meta, title: e.target.value } })} aria-label="Título" />
                  <Select value={it.meta.kind} disabled={it.state !== 'fila'} onChange={(e) => patch(i, { meta: { ...it.meta, kind: e.target.value } })} aria-label="Tipo">
                    {ASSET_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
                  </Select>
                  <Input value={it.meta.tags} disabled={it.state !== 'fila'} placeholder="tags: stories, kids…" onChange={(e) => patch(i, { meta: { ...it.meta, tags: e.target.value } })} aria-label="Tags" />
                  <div className="flex min-w-32 items-center gap-2 text-xs">
                    {it.state === 'fila' && <><span className="text-tinta-suave">{formatBytes(it.file.size)}</span><button type="button" onClick={() => setQueue((q0) => q0.filter((_, j) => j !== i))} aria-label="Tirar da fila"><X className="size-4 text-tinta-suave" /></button></>}
                    {it.state === 'enviando' && <div className="h-2 w-28 overflow-hidden rounded bg-white ring-1 ring-borda"><div className="h-full bg-nacao transition-all" style={{ width: `${it.progress}%` }} /></div>}
                    {it.state === 'ok' && <span className="inline-flex items-center gap-1 font-semibold text-sucesso"><CheckCircle2 className="size-4" /> enviado</span>}
                    {it.state === 'erro' && <span className="text-critico">{it.error}</span>}
                  </div>
                </div>
              ))}
              <div className="flex gap-2">
                <Button onClick={sendAll} disabled={!waiting || busy}>{busy ? 'Enviando…' : `Enviar ${waiting} arquivo(s)`}</Button>
                <Button variant="ghost" onClick={() => setQueue([])} disabled={busy}>Limpar</Button>
              </div>
            </div>
          )}
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Select className="w-auto" value={filters.kind} onChange={(e) => go({ kind: e.target.value })} aria-label="Tipo">
          <option value="">Todos os tipos</option>{ASSET_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
        </Select>
        <Select className="w-auto max-w-64" value={filters.campaignId} onChange={(e) => go({ campaignId: e.target.value })} aria-label="Campanha">
          <option value="">Todas as campanhas</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); go({ q }); }}>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Título ou tag…" className="w-48" />
          <Button size="sm" variant="ghost" type="submit" aria-label="Buscar"><Search /></Button>
        </form>
      </div>
      <FormMessage error={msg.error} success={msg.ok} />

      {assets.length === 0 ? (
        <Card className="p-8 text-center text-sm text-tinta-suave">Nada por aqui{filters.status || filters.kind || filters.campaignId || filters.q ? ' com esses filtros' : ' ainda. Envie as artes da próxima campanha'}.</Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {assets.map((a) => (
            <button key={a.id} type="button" onClick={() => { setMsg({}); setOpen(a); }} className="group overflow-hidden rounded-xl bg-white text-left ring-1 ring-borda transition hover:ring-nacao">
              <Thumb a={a} className="aspect-square" />
              <div className="space-y-1 p-2">
                <p className="truncate text-sm font-semibold text-navy" title={a.title}>{a.title}</p>
                <div className="flex flex-wrap items-center gap-1">
                  <Badge tone={toneOf(a.status)}>{labelOf(ASSET_STATUSES, a.status)}</Badge>
                  <span className="truncate text-[11px] text-tinta-suave">{a.campaign ?? labelOf(ASSET_KINDS, a.kind)}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {open && <AssetSheet a={open} campaigns={campaigns} perms={perms} pending={pending} onClose={() => setOpen(null)}
        onStatus={(s, note) => act(() => setAssetStatusAction(open.id, s, note), () => setOpen(null))}
        onSave={(v) => act(() => updateAssetAction(open.id, v), () => setOpen(null))}
        onDelete={() => { if (confirm(`Excluir “${open.title}”? O arquivo some do armazenamento.`)) act(() => deleteAssetAction(open.id), () => setOpen(null)); }} />}
    </div>
  );
}

function Thumb({ a, className }: { a: AssetRow; className?: string }) {
  const box = cn('flex w-full items-center justify-center bg-fundo', className);
  if (a.previewUrl && a.mime.startsWith('image/')) {
    // eslint-disable-next-line @next/next/no-img-element
    return <div className={box}><img src={a.previewUrl} alt={a.title} loading="lazy" className="size-full object-cover" /></div>;
  }
  if (a.previewUrl && a.mime.startsWith('video/')) return <div className={box}><video src={`${a.previewUrl}#t=0.5`} muted preload="metadata" className="size-full object-cover" /></div>;
  const Icon = a.mime.startsWith('video/') ? Film : FileText;
  return <div className={box}><Icon className="size-10 text-tinta-fraca" /><span className="sr-only">{a.fileName}</span></div>;
}

function AssetSheet({ a, campaigns, perms, pending, onClose, onStatus, onSave, onDelete }: {
  a: AssetRow; campaigns: Opt[]; perms: { edit: boolean; approve: boolean; del: boolean }; pending: boolean;
  onClose: () => void; onStatus: (s: string, note: string | null) => void; onSave: (v: Record<string, unknown>) => void; onDelete: () => void;
}) {
  const [edit, setEdit] = useState<Meta | null>(null);
  const [note, setNote] = useState('');
  const who = { edit: perms.edit, approve: perms.approve };
  const fmt = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-navy/40" onClick={onClose}>
      <div className="h-full w-full max-w-xl overflow-y-auto bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={a.title}>
        <div className="flex items-start gap-2">
          <h2 className="min-w-0 flex-1 break-words text-lg font-bold text-navy">{a.title}</h2>
          <button type="button" onClick={onClose} aria-label="Fechar"><X className="size-5 text-tinta-suave" /></button>
        </div>
        <div className="mt-3 overflow-hidden rounded-xl ring-1 ring-borda">
          {a.previewUrl && a.mime.startsWith('video/') ? <video src={a.previewUrl} controls className="max-h-[60vh] w-full bg-black" />
            // eslint-disable-next-line @next/next/no-img-element
            : a.previewUrl ? <img src={a.previewUrl} alt={a.title} className="max-h-[60vh] w-full bg-fundo object-contain" /> : <Thumb a={a} className="h-40" />}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <Badge tone={toneOf(a.status)}>{labelOf(ASSET_STATUSES, a.status)}</Badge>
          <span className="text-tinta-suave">{labelOf(ASSET_KINDS, a.kind)} · {formatBytes(a.sizeBytes)} · {a.fileName}</span>
          {a.downloadUrl && <a href={a.downloadUrl} className="ml-auto inline-flex items-center gap-1 font-semibold text-nacao"><Download className="size-4" /> Baixar</a>}
        </div>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-tinta-suave">Campanha</dt><dd>{a.campaign ?? '—'}</dd>
          <dt className="text-tinta-suave">Enviado</dt><dd>{a.uploadedBy ?? '—'} · {fmt(a.createdAt)}</dd>
          {a.tags.length > 0 && <><dt className="text-tinta-suave">Tags</dt><dd className="flex flex-wrap gap-1">{a.tags.map((t) => <Badge key={t}>#{t}</Badge>)}</dd></>}
          {a.notes && <><dt className="text-tinta-suave">Observações</dt><dd className="whitespace-pre-line">{a.notes}</dd></>}
          {a.reviewedBy && <><dt className="text-tinta-suave">Revisão</dt><dd>{a.reviewedBy} · {fmt(a.reviewedAt!)}{a.reviewNote && <span className="block whitespace-pre-line text-tinta-suave">“{a.reviewNote}”</span>}</dd></>}
        </dl>

        {/* Aprovação */}
        {(canMove(a.status, 'APROVADO', who) || canMove(a.status, 'EM_APROVACAO', who)) && (
          <div className="mt-4 space-y-2 rounded-xl bg-fundo p-3">
            {canMove(a.status, 'APROVADO', who) && <>
              <Label>Comentário da aprovação</Label>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="w-full rounded-lg border border-borda p-2 text-sm" placeholder="Obrigatório para pedir ajustes" />
            </>}
            <div className="flex flex-wrap gap-2">
              {canMove(a.status, 'APROVADO', who) && <Button disabled={pending} onClick={() => onStatus('APROVADO', note || null)}><CheckCircle2 /> Aprovar</Button>}
              {canMove(a.status, 'AJUSTES', who) && <Button variant="secondary" disabled={pending} onClick={() => onStatus('AJUSTES', note || null)}><MessageSquareWarning /> Pedir ajustes</Button>}
              {canMove(a.status, 'EM_APROVACAO', who) && <Button disabled={pending} onClick={() => onStatus('EM_APROVACAO', null)}><Send /> Mandar para aprovação</Button>}
            </div>
          </div>
        )}

        {edit ? (
          <div className="mt-4 grid gap-2 [&>*]:min-w-0">
            <div><Label>Título</Label><Input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div><Label>Tipo</Label><Select value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value })}>{ASSET_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</Select></div>
              <div><Label>Campanha</Label><Select value={edit.campaignId} onChange={(e) => setEdit({ ...edit, campaignId: e.target.value })}><option value="">Sem campanha</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>
            </div>
            <div><Label>Tags (separe por vírgula)</Label><Input value={edit.tags} onChange={(e) => setEdit({ ...edit, tags: e.target.value })} /></div>
            <div><Label>Observações</Label><textarea value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} rows={3} className="w-full rounded-lg border border-borda p-2 text-sm" /></div>
            <div className="flex gap-2">
              <Button disabled={pending} onClick={() => onSave({ title: edit.title, kind: edit.kind, campaignId: edit.campaignId || null, tags: tagsOf(edit.tags), notes: edit.notes || null })}>Salvar</Button>
              <Button variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-borda pt-3">
            {perms.edit && <Button size="sm" variant="ghost" onClick={() => setEdit({ title: a.title, kind: a.kind, campaignId: a.campaignId ?? '', tags: a.tags.join(', '), notes: a.notes ?? '' })}><Pencil /> Editar</Button>}
            {perms.edit && a.status !== 'ARQUIVADO' && <Button size="sm" variant="ghost" disabled={pending} onClick={() => onStatus('ARQUIVADO', null)}>Arquivar</Button>}
            {perms.edit && a.status === 'ARQUIVADO' && <Button size="sm" variant="ghost" disabled={pending} onClick={() => onStatus('RASCUNHO', null)}>Desarquivar</Button>}
            {perms.del && <Button size="sm" variant="ghost" className="ml-auto text-critico" onClick={onDelete}><Trash2 /> Excluir</Button>}
          </div>
        )}
      </div>
    </div>
  );
}
