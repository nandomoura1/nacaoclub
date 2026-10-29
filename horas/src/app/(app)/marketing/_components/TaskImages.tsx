'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ImagePlus, Star, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MAX_TASK_IMAGE_BYTES, TASK_IMAGE_ACCEPT } from '@/domain/marketing/tasks';
import { cn } from '@/lib/cn';
import type { TaskDetail } from '@/server/services/mkt-task-service';
import { addTaskImageAction, removeTaskImageAction, setTaskCoverAction, startTaskImageAction } from '../actions';

type Img = TaskDetail['attachments'][number];

function put(url: string, file: File, mime: string, onProgress: (p: number) => void): Promise<void> {
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

/** Imagem colada (Ctrl+V) vem sem nome útil: dá um nome com a extensão certa. */
const named = (f: File) => (/\.(png|jpe?g|webp|gif)$/i.test(f.name) ? f : new File([f], `imagem-colada.${f.type.split('/')[1] === 'jpeg' ? 'jpg' : f.type.split('/')[1] || 'png'}`, { type: f.type }));

/** Imagens do cartão, estilo Trello: enviar, arrastar, colar (Ctrl+V), capa e visualização. */
export function TaskImages({ taskId, images, canEdit, onChange, onError }: {
  taskId: string; images: Img[]; canEdit: boolean; onChange: () => Promise<void>; onError: (e: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<{ name: string; progress: number }[]>([]);
  const [over, setOver] = useState(false);
  const [view, setView] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (files: File[]) => {
    const list = files.filter((f) => f.type.startsWith('image/')).map(named);
    if (!list.length) return onError('Escolha imagens PNG, JPG, WEBP ou GIF.');
    const big = list.find((f) => f.size > MAX_TASK_IMAGE_BYTES);
    if (big) return onError(`"${big.name}" passa de 10 MB.`);
    setUploading(list.map((f) => ({ name: f.name, progress: 0 })));
    try {
      for (const [i, f] of list.entries()) {
        const s = await startTaskImageAction(taskId, { name: f.name, size: f.size });
        if (!s.ok) throw new Error(s.error);
        await put(s.data.uploadUrl, f, s.data.mime, (p) => setUploading((u) => u.map((x, j) => (j === i ? { ...x, progress: p } : x))));
        const r = await addTaskImageAction(taskId, { path: s.data.path, fileName: f.name });
        if (!r.ok) throw new Error(r.error);
      }
      await onChange();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Não deu para enviar a imagem.');
      await onChange();
    } finally {
      setUploading([]);
    }
  };

  // Colar imagem com o cartão aberto (como no Trello).
  useEffect(() => {
    if (!canEdit) return;
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
      if (files.length) { e.preventDefault(); void upload(files); }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (p: Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true);
    const r = await p;
    if (!r.ok) onError(r.error ?? 'Erro.');
    await onChange();
    setBusy(false);
  };
  const cur = view !== null ? images[view] : null;

  return (
    <section
      className={cn('rounded-xl bg-fundo p-3', over && 'ring-2 ring-nacao')}
      onDragOver={(e) => { if (canEdit && e.dataTransfer.types.includes('Files')) { e.preventDefault(); setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { if (!canEdit) return; e.preventDefault(); setOver(false); void upload([...e.dataTransfer.files]); }}
    >
      <div className="mb-2 flex items-center gap-1.5">
        <p className="flex flex-1 items-center gap-1.5 text-sm font-bold text-navy"><ImagePlus className="size-4" /> Imagens ({images.length})</p>
        {canEdit && <Button type="button" size="sm" variant="secondary" disabled={uploading.length > 0} onClick={() => input.current?.click()}><ImagePlus /> Anexar</Button>}
        <input ref={input} type="file" accept={TASK_IMAGE_ACCEPT} multiple hidden onChange={(e) => { void upload([...(e.target.files ?? [])]); e.target.value = ''; }} />
      </div>
      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {images.map((img, i) => (
            <div key={img.id} className="group relative overflow-hidden rounded-lg bg-white ring-1 ring-borda">
              <button type="button" onClick={() => setView(i)} className="block aspect-video w-full" aria-label={`Ver ${img.fileName}`}>
                {img.url ? <img src={img.url} alt={img.fileName} className="size-full object-cover" loading="lazy" /> : <span className="grid size-full place-items-center text-[10px] text-tinta-fraca">sem visualização</span>}
              </button>
              {img.isCover && <span className="absolute left-1 top-1 rounded bg-navy/80 px-1.5 py-0.5 text-[10px] font-bold text-white">Capa</span>}
              {canEdit && (
                <div className="absolute right-1 top-1 flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                  <button type="button" disabled={busy} onClick={() => act(setTaskCoverAction(img.id, !img.isCover))} title={img.isCover ? 'Tirar da capa' : 'Usar como capa'} className="grid size-6 place-items-center rounded bg-white/90 text-navy shadow"><Star className={cn('size-3.5', img.isCover && 'fill-current')} /></button>
                  <button type="button" disabled={busy} onClick={() => confirm(`Excluir a imagem "${img.fileName}"?`) && act(removeTaskImageAction(img.id))} title="Excluir" className="grid size-6 place-items-center rounded bg-white/90 text-critico shadow"><Trash2 className="size-3.5" /></button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {uploading.map((u) => (
        <div key={u.name} className="mt-2 text-xs text-tinta-suave">
          <p className="truncate">Enviando {u.name}… {u.progress}%</p>
          <div className="mt-0.5 h-1 rounded bg-borda"><div className="h-1 rounded bg-nacao" style={{ width: `${u.progress}%` }} /></div>
        </div>
      ))}
      {canEdit && images.length === 0 && !uploading.length && <p className="text-xs text-tinta-suave">Arraste imagens para cá, cole com Ctrl+V ou clique em Anexar. A primeira vira a capa do cartão.</p>}

      {cur && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4" onClick={() => setView(null)} role="dialog" aria-label={cur.fileName}>
          <button type="button" className="absolute right-4 top-4 text-white" aria-label="Fechar"><X className="size-6" /></button>
          {images.length > 1 && <button type="button" className="absolute left-3 text-white" aria-label="Anterior" onClick={(e) => { e.stopPropagation(); setView((view! - 1 + images.length) % images.length); }}><ChevronLeft className="size-8" /></button>}
          {cur.url && <img src={cur.url} alt={cur.fileName} className="max-h-full max-w-full rounded object-contain" onClick={(e) => e.stopPropagation()} />}
          {images.length > 1 && <button type="button" className="absolute right-3 text-white" aria-label="Próxima" onClick={(e) => { e.stopPropagation(); setView((view! + 1) % images.length); }}><ChevronRight className="size-8" /></button>}
          <p className="absolute bottom-4 text-xs text-white/80">{cur.fileName} · {view! + 1}/{images.length}</p>
        </div>
      )}
    </section>
  );
}
