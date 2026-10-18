'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BookOpen, CheckCircle2, Circle, Download, ExternalLink, FileText, Headphones, Link2, Pencil, Play, Plus, Presentation, Search, Sheet, Trash2, Upload, Video, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Input, Label, Select } from '@/components/ui/input';
import { EDU_ACCEPT, EDU_AREAS, EDU_AUDIENCES, EDU_FORMATS, EDU_MAX_BYTES, formatBytes, guessFormat, labelOf, youtubeEmbed } from '@/domain/universidade';
import { cn } from '@/lib/cn';
import type { EduLibrary, MaterialRow } from '@/server/services/edu-service';
import { deleteMaterialAction, saveMaterialAction, setCompletedAction, startEduUploadAction } from './actions';

const ICON: Record<string, typeof FileText> = { APRESENTACAO: Presentation, PDF: FileText, EBOOK: BookOpen, AUDIO: Headphones, VIDEO: Video, DOCUMENTO: Sheet, LINK: Link2, OUTRO: FileText };
type Form = { title: string; description: string; area: string; category: string; format: string; url: string; audience: string; roleKey: string; required: boolean; version: string; durationMin: string; active: boolean; sortOrder: string };
const empty = (area: string): Form => ({ title: '', description: '', area: area === 'TUDO' ? 'ESSENCIAL' : area, category: '', format: 'LINK', url: '', audience: area === 'GESTAO' ? 'LIDERES' : 'TODOS', roleKey: '', required: area === 'ESSENCIAL' || area === 'TUDO', version: '', durationMin: '', active: true, sortOrder: '0' });

function put(url: string, file: File, mime: string, onProgress: (p: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('PUT', url); x.setRequestHeader('Content-Type', mime); x.setRequestHeader('x-upsert', 'false');
    x.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    x.onload = () => (x.status >= 200 && x.status < 300 ? resolve() : reject(new Error(`Falha no envio (${x.status}).`)));
    x.onerror = () => reject(new Error('Sem conexão com o armazenamento.'));
    x.send(file);
  });
}

export function EduLibraryClient({ lib, roles, initialArea, openNew, perms }: { lib: EduLibrary; roles: { key: string; name: string }[]; initialArea: string; openNew: boolean; perms: { edit: boolean; admin: boolean } }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [area, setArea] = useState(initialArea);
  const [q, setQ] = useState('');
  const [format, setFormat] = useState('');
  const [msg, setMsg] = useState<{ ok?: string | null; error?: string | null }>({});
  const [edit, setEdit] = useState<{ id: string | null; f: Form; current?: MaterialRow } | null>(openNew && perms.edit ? { id: null, f: empty(initialArea) } : null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, after?: () => void) => start(async () => {
    setMsg({}); const r = await fn();
    if (!r.ok) setMsg({ error: r.error }); else { setMsg({ ok: r.message ?? null }); after?.(); }
    router.refresh();
  });

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return lib.materials.filter((m) => (area === 'TUDO' || m.area === area) && (!format || m.format === format)
      && (!t || `${m.title} ${m.description ?? ''} ${m.category ?? ''}`.toLowerCase().includes(t)));
  }, [lib.materials, area, q, format]);
  const groups = useMemo(() => {
    const g = new Map<string, MaterialRow[]>();
    for (const m of list) { const k = area === 'TUDO' ? labelOf(EDU_AREAS, m.area) : m.category || 'Geral'; g.set(k, [...(g.get(k) ?? []), m]); }
    return [...g.entries()].sort((a, b) => (a[0] === 'Geral' ? -1 : b[0] === 'Geral' ? 1 : a[0].localeCompare(b[0])));
  }, [list, area]);
  const count = (a: string) => lib.materials.filter((m) => a === 'TUDO' || m.area === a).length;

  return (
    <div className="space-y-4">
      {lib.pendingRequired > 0 && (
        <Card className="border-atencao/40 bg-atencao/5 p-3 text-sm">
          <b className="text-navy">Você tem {lib.pendingRequired} material(is) obrigatório(s) para concluir.</b> <span className="text-tinta-suave">Eles estão marcados com “Obrigatório”.</span>
        </Card>
      )}

      {lib.tracks.filter((t) => t.items.length).length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lib.tracks.filter((t) => t.items.length).map((t) => (
            <Link key={t.id} href={`/universidade/trilhas#${t.id}`}>
              <Card className="h-full p-3 transition hover:border-nacao">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-nacao">Trilha</p>
                <p className="font-bold text-navy">{t.name}</p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-fundo"><div className={cn('h-full rounded-full', t.progress.finished ? 'bg-sucesso' : 'bg-nacao')} style={{ width: `${t.progress.pct}%` }} /></div>
                <p className="mt-1 text-xs text-tinta-suave">{t.progress.finished ? '✓ Concluída' : `${t.progress.completed} de ${t.progress.total} · continuar →`}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <nav className="flex flex-wrap gap-1 rounded-xl bg-white p-1 ring-1 ring-borda">
          {[...EDU_AREAS.map((a) => ({ id: a.id as string, label: a.label })), { id: 'TUDO', label: 'Tudo' }].map((a) => (
            <button key={a.id} type="button" onClick={() => setArea(a.id)} className={cn('rounded-lg px-3 py-1.5 text-sm font-semibold', area === a.id ? 'bg-navy text-white' : 'text-tinta-suave hover:bg-fundo')}>
              {a.id === 'ESSENCIAL' ? '⭐ ' : ''}{a.label} <span className="text-xs opacity-70">{count(a.id)}</span>
            </button>
          ))}
        </nav>
        <div className="relative"><Search className="absolute left-2 top-2.5 size-4 text-tinta-fraca" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" className="w-48 pl-7" /></div>
        <Select value={format} onChange={(e) => setFormat(e.target.value)} className="w-auto" aria-label="Formato"><option value="">Todos os formatos</option>{EDU_FORMATS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</Select>
        {perms.edit && !edit && <Button className="ml-auto" onClick={() => { setMsg({}); setEdit({ id: null, f: empty(area) }); }}><Plus /> Publicar material</Button>}
      </div>
      {area !== 'TUDO' && <p className="text-sm text-tinta-suave">{EDU_AREAS.find((a) => a.id === area)?.hint}</p>}
      <FormMessage error={msg.error} success={msg.ok} />

      {edit && <MaterialForm edit={edit} setEdit={setEdit} roles={roles} storage={lib.storage} pending={pending}
        onSave={(values) => run(() => saveMaterialAction(edit.id, values), () => setEdit(null))} setMsg={setMsg} />}

      {groups.length === 0 ? (
        <Card className="p-8 text-center text-sm text-tinta-suave">{lib.materials.length ? 'Nada com esses filtros.' : perms.edit ? 'Nenhum material ainda. Comece pelos Essenciais: apresentação de onboarding, Manual do Colaborador e Check List de Processos.' : 'Os materiais de capacitação vão aparecer aqui.'}</Card>
      ) : groups.map(([g, items]) => (
        <section key={g}>
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-tinta-suave">{g}</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {items.map((m) => <MaterialCard key={m.id} m={m} pending={pending}
              onDone={(d) => run(() => setCompletedAction(m.id, d))}
              onEdit={() => { setMsg({}); setEdit({ id: m.id, current: m, f: { title: m.title, description: m.description ?? '', area: m.area, category: m.category ?? '', format: m.format, url: m.url ?? '', audience: m.audience, roleKey: m.roleKey ?? '', required: m.required, version: m.version ?? '', durationMin: m.durationMin?.toString() ?? '', active: m.active, sortOrder: String(m.sortOrder) } }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              onDelete={() => { if (confirm(`Excluir “${m.title}”? Sai das trilhas também.`)) run(() => deleteMaterialAction(m.id)); }} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

function MaterialCard({ m, pending, onDone, onEdit, onDelete }: { m: MaterialRow; pending: boolean; onDone: (d: boolean) => void; onEdit: () => void; onDelete: () => void }) {
  const [play, setPlay] = useState(false);
  const Icon = ICON[m.format] ?? FileText;
  const yt = youtubeEmbed(m.url);
  const audioSrc = m.format === 'AUDIO' && m.fileUrl ? m.fileUrl : null;
  const videoSrc = m.format === 'VIDEO' && m.fileUrl && m.mime?.startsWith('video/') ? m.fileUrl : null;
  const open = m.url ?? m.fileUrl;
  return (
    <Card className={cn('flex flex-col p-3', !m.active && 'opacity-60', m.done && 'border-sucesso/30')}>
      <div className="flex items-start gap-2.5">
        <span className={cn('rounded-lg p-2', m.done ? 'bg-sucesso/10 text-sucesso' : 'bg-nacao/10 text-nacao')}><Icon className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="font-bold leading-snug text-navy">{m.title}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            <Badge>{labelOf(EDU_FORMATS, m.format)}</Badge>
            {m.required && <Badge tone="amber">Obrigatório</Badge>}
            {m.version && <Badge tone="navy">{m.version}</Badge>}
            {m.durationMin && <Badge>{m.durationMin >= 60 ? `${Math.floor(m.durationMin / 60)}h${m.durationMin % 60 ? String(m.durationMin % 60).padStart(2, '0') : ''}` : `${m.durationMin} min`}</Badge>}
            {m.audience !== 'TODOS' && <Badge tone="cyan">{m.audience === 'PERFIL' ? m.roleKey : labelOf(EDU_AUDIENCES, m.audience)}</Badge>}
            {!m.active && <Badge tone="red">oculto</Badge>}
          </div>
        </div>
        {m.canEdit && (
          <div className="-mr-1 -mt-1 flex shrink-0">
            <button type="button" onClick={onEdit} aria-label="Editar" className="rounded p-1.5 text-tinta-fraca hover:bg-fundo hover:text-navy"><Pencil className="size-4" /></button>
            <button type="button" onClick={onDelete} aria-label="Excluir" className="rounded p-1.5 text-tinta-fraca hover:bg-fundo hover:text-critico"><Trash2 className="size-4" /></button>
          </div>
        )}
      </div>
      {m.description && <p className="mt-2 line-clamp-3 text-sm text-tinta-suave">{m.description}</p>}
      {play && (audioSrc ? <audio controls autoPlay src={audioSrc} className="mt-2 w-full" />
        : videoSrc ? <video controls autoPlay src={videoSrc} className="mt-2 w-full rounded-lg" />
          : yt ? <iframe src={yt} title={m.title} className="mt-2 aspect-video w-full rounded-lg" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen /> : null)}
      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
        {(audioSrc || videoSrc || yt) && <Button size="sm" variant="secondary" onClick={() => setPlay(!play)}>{play ? <X /> : <Play />} {play ? 'Fechar' : m.format === 'AUDIO' ? 'Ouvir' : 'Assistir'}</Button>}
        {open && <a href={open} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1 rounded-lg border border-borda px-3 text-xs font-semibold text-navy hover:bg-fundo"><ExternalLink className="size-3.5" /> Abrir</a>}
        {m.downloadUrl && <a href={m.downloadUrl} className="inline-flex h-8 items-center gap-1 rounded-lg border border-borda px-3 text-xs font-semibold text-navy hover:bg-fundo" title={m.sizeBytes ? formatBytes(m.sizeBytes) : undefined}><Download className="size-3.5" /> Baixar</a>}
        <button type="button" disabled={pending} onClick={() => onDone(!m.done)} className={cn('ml-auto inline-flex h-8 items-center gap-1 rounded-lg px-3 text-xs font-semibold', m.done ? 'bg-sucesso/10 text-sucesso' : 'bg-nacao text-white')}>
          {m.done ? <CheckCircle2 className="size-4" /> : <Circle className="size-4" />} {m.done ? 'Concluído' : 'Concluí'}
        </button>
      </div>
      <p className="mt-1 text-[11px] text-tinta-fraca">Atualizado em {new Date(m.updatedAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}{m.createdBy ? ` · ${m.createdBy}` : ''}</p>
    </Card>
  );
}

function MaterialForm({ edit, setEdit, roles, storage, pending, onSave, setMsg }: {
  edit: { id: string | null; f: Form; current?: MaterialRow }; setEdit: (e: { id: string | null; f: Form; current?: MaterialRow } | null) => void; roles: { key: string; name: string }[];
  storage: boolean; pending: boolean; onSave: (v: Record<string, unknown>) => void; setMsg: (m: { error?: string | null }) => void;
}) {
  const f = edit.f;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setEdit({ ...edit, f: { ...f, [k]: v } });
  const [file, setFile] = useState<{ path: string; fileName: string } | null>(null);
  const [removeFile, setRemoveFile] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const hadFile = !!edit.current?.fileName && !removeFile;

  const upload = async (fl: File) => {
    setMsg({});
    if (fl.size > EDU_MAX_BYTES) { setMsg({ error: 'Arquivo acima de 50 MB. Para áudio/vídeo longos, use um link (Drive, YouTube não listado, Spotify).' }); return; }
    setProgress(0);
    try {
      const s = await startEduUploadAction({ name: fl.name, size: fl.size });
      if (!s.ok) throw new Error(s.error);
      await put(s.data.uploadUrl, fl, s.data.mime, setProgress);
      setFile({ path: s.data.path, fileName: fl.name });
      setEdit({ ...edit, f: { ...f, format: guessFormat(fl.name), title: f.title || fl.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ') } });
    } catch (e) { setMsg({ error: e instanceof Error ? e.message : 'Falha no envio.' }); }
    setProgress(null);
  };

  return (
    <Card className="border-nacao/30 p-4">
      <h2 className="font-bold text-navy">{edit.id ? 'Editar material' : 'Publicar material'}</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 [&>*]:min-w-0">
        <div className="sm:col-span-2"><Label>Título</Label><Input value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="ex.: Manual do Colaborador Nação" /></div>
        <div><Label>Área</Label><Select value={f.area} onChange={(e) => {
          const a = e.target.value;
          // Novo material: Essenciais nascem obrigatórios; Gestão nasce para líderes.
          setEdit({ ...edit, f: edit.id ? { ...f, area: a } : { ...f, area: a, required: a === 'ESSENCIAL', audience: a === 'GESTAO' ? 'LIDERES' : f.audience === 'LIDERES' ? 'TODOS' : f.audience } });
        }}>{EDU_AREAS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</Select></div>
        <div><Label>Setor / modalidade</Label><Input value={f.category} onChange={(e) => set('category', e.target.value)} placeholder="ex.: Recepção, CrossFit, Liderança" /></div>

        <div className="sm:col-span-2">
          <Label>Link (Drive, YouTube, Canva, Spotify…)</Label>
          <Input value={f.url} onChange={(e) => { const v = e.target.value; setEdit({ ...edit, f: { ...f, url: v, format: v && !file && !hadFile ? guessFormat(v) : f.format } }); }} placeholder="https://" />
        </div>
        <div className="sm:col-span-2">
          <Label>ou arquivo (até 50 MB)</Label>
          {storage ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-borda px-3 py-2 font-semibold text-navy hover:bg-fundo">
                <Upload className="size-4" /> {file || hadFile ? 'Trocar arquivo' : 'Escolher arquivo'}
                <input type="file" accept={EDU_ACCEPT} className="hidden" onChange={(e) => { const x = e.target.files?.[0]; e.target.value = ''; if (x) void upload(x); }} />
              </label>
              {progress !== null && <span className="text-xs text-tinta-suave">enviando… {progress}%</span>}
              {file && <span className="text-xs font-semibold text-sucesso">✓ {file.fileName}</span>}
              {!file && hadFile && <span className="text-xs text-tinta-suave">{edit.current!.fileName} <button type="button" className="ml-1 text-critico" onClick={() => setRemoveFile(true)}>remover</button></span>}
            </div>
          ) : <p className="pt-2 text-xs text-tinta-suave">Envio de arquivos ainda não ligado (variáveis do Supabase na Vercel). Por enquanto, use link.</p>}
        </div>

        <div><Label>Formato</Label><Select value={f.format} onChange={(e) => set('format', e.target.value)}>{EDU_FORMATS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</Select></div>
        <div><Label>Para quem</Label><Select value={f.audience} onChange={(e) => set('audience', e.target.value)}>{EDU_AUDIENCES.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</Select></div>
        {f.audience === 'PERFIL' ? <div><Label>Perfil</Label><Select value={f.roleKey} onChange={(e) => set('roleKey', e.target.value)}><option value="">Escolha…</option>{roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}</Select></div> : <div />}
        <div className="grid grid-cols-2 gap-2"><div><Label>Versão</Label><Input value={f.version} onChange={(e) => set('version', e.target.value)} placeholder="v1 · out/26" /></div><div><Label>Duração (min)</Label><Input inputMode="numeric" value={f.durationMin} onChange={(e) => set('durationMin', e.target.value.replace(/\D/g, ''))} placeholder="opcional" /></div></div>
        <div className="sm:col-span-2 lg:col-span-4"><Label>Descrição (opcional)</Label><Input value={f.description} onChange={(e) => set('description', e.target.value)} placeholder="Para que serve, quando usar, o que o colaborador deve aprender" /></div>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.required} onChange={(e) => set('required', e.target.checked)} /> Obrigatório (cobra o “Concluí”)</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} /> Visível para os colaboradores</label>
      </div>
      <div className="mt-3 flex gap-2">
        <Button disabled={pending || progress !== null} onClick={() => onSave({
          title: f.title, description: f.description || null, area: f.area, category: f.category || null, format: f.format, url: f.url.trim() || null,
          audience: f.audience, roleKey: f.roleKey || null, required: f.required, version: f.version || null, durationMin: f.durationMin ? Number(f.durationMin) : null,
          active: f.active, sortOrder: Number(f.sortOrder) || 0, file, removeFile: removeFile && !file,
        })}>{pending ? 'Salvando…' : 'Salvar'}</Button>
        <Button variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button>
      </div>
    </Card>
  );
}
