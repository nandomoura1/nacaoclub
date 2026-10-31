'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Download, ImagePlus, Plus, Share2, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Input, Label } from '@/components/ui/input';
import { MAX_ROWS, MAX_TEXT, NOTICE_ART_CONTENTS, NOTICE_ART_DEFAULTS, NOTICE_ART_FORMATS, NOTICE_ART_BACKDROPS, NOTICE_ART_THEMES, noticeBackdrop, subtitleFrom, type NoticeArtBackdrop, type NoticeArtContent, type NoticeArtFormat, type NoticeArtRow, type NoticeArtTheme } from '@/domain/marketing/notice-art';
import { prepareUpload } from '@/lib/upload';
import { cn } from '@/lib/cn';

type Form = { format: NoticeArtFormat; titleTop: string; titleBottom: string; date: string; reason: string; content: NoticeArtContent; rows: NoticeArtRow[]; text: string; closing: string; background: 'nacao' | 'propria' | 'nenhuma'; photoOpacity: number; backdrop: NoticeArtBackdrop; theme: NoticeArtTheme };
const KEY = 'nacao.criativo-comunicado';

export function NoticeArtClient({ places, today }: { places: string[]; today: string }) {
  const [f, setF] = useState<Form>({ ...NOTICE_ART_DEFAULTS, date: today, reason: '' });
  const [photo, setPhoto] = useState<File | null>(null);
  const [img, setImg] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);
  const reqId = useRef(0);

  // Lembra o último comunicado neste aparelho (só conveniência).
  useEffect(() => { try { const s = localStorage.getItem(KEY); if (s) setF((cur) => ({ ...cur, ...JSON.parse(s), date: today })); } catch { /* sem armazenamento */ } }, [today]);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify({ ...f, date: undefined })); } catch { /* idem */ } }, [f]);

  const subtitle = useMemo(() => subtitleFrom(f.date, f.reason), [f.date, f.reason]);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((cur) => ({ ...cur, [k]: v }));
  const setRow = (i: number, patch: Partial<NoticeArtRow>) => set('rows', f.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const moveRow = (i: number, d: -1 | 1) => { const rows = [...f.rows]; const j = i + d; if (j < 0 || j >= rows.length) return; [rows[i], rows[j]] = [rows[j]!, rows[i]!]; set('rows', rows); };

  // Prévia: gera de novo 600 ms depois da última mudança.
  useEffect(() => {
    const id = ++reqId.current;
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const fd = new FormData();
        const background = f.background === 'propria' && !photo ? 'nacao' : f.background;
        fd.set('data', JSON.stringify({ format: f.format, titleTop: f.titleTop, titleBottom: f.titleBottom, subtitle, content: f.content, rows: f.rows, text: f.text, closing: f.closing, background, photoOpacity: f.photoOpacity, backdrop: f.backdrop, theme: f.theme }));
        if (photo && background === 'propria') fd.set('photo', photo);
        const res = await fetch('/marketing/criativos/gerar', { method: 'POST', body: fd });
        if (id !== reqId.current) return;
        if (!res.ok) { setError(await res.text()); return; }
        const b = await res.blob();
        setError(null); setBlob(b);
        setImg((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(b); });
      } catch {
        if (id === reqId.current) setError('Não foi possível gerar a prévia. Confira a internet.');
      } finally {
        if (id === reqId.current) setBusy(false);
      }
    }, 600);
    return () => clearTimeout(t);
  }, [f, subtitle, photo]);

  const fileName = `comunicado-${f.date || 'nacao'}-${f.format}.png`;
  const share = async () => {
    if (!blob) return;
    const file = new File([blob], fileName, { type: 'image/png' });
    try {
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'Comunicado Nação' });
      else setError('Este aparelho não compartilha direto: use “Baixar PNG”.');
    } catch { /* usuário cancelou */ }
  };
  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    const p = await prepareUpload(file);
    if ('error' in p) return setError(p.error);
    setPhoto(p.file);
    set('background', 'propria');
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
      <div className="min-w-0 space-y-4">
        <Card className="space-y-3 p-4">
          <div className="flex flex-wrap gap-2">
            {NOTICE_ART_FORMATS.map((x) => (
              <button key={x.id} type="button" onClick={() => set('format', x.id)}
                className={cn('rounded-full border px-3 py-1 text-xs font-semibold', f.format === x.id ? 'border-nacao bg-nacao text-white' : 'border-borda text-tinta-suave hover:border-nacao')}>{x.label}</button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Cor de fundo</Label>
              <div className="flex flex-wrap gap-2">
                {NOTICE_ART_BACKDROPS.map((t) => (
                  <button key={t.id} type="button" onClick={() => set('backdrop', t.id)} aria-pressed={f.backdrop === t.id}
                    className={cn('inline-flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-xs font-semibold', f.backdrop === t.id ? 'border-nacao ring-2 ring-nacao/30 text-navy' : 'border-borda text-tinta-suave hover:border-nacao')}>
                    <span className="size-5 rounded-full ring-1 ring-black/10" style={{ background: t.color }} />
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label>Cor dos elementos (manual da marca)</Label>
              <div className="flex flex-wrap gap-2">
                {NOTICE_ART_THEMES.map((t) => (
                  <button key={t.id} type="button" onClick={() => set('theme', t.id)} aria-pressed={f.theme === t.id}
                    className={cn('inline-flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-xs font-semibold', f.theme === t.id ? 'border-nacao ring-2 ring-nacao/30 text-navy' : 'border-borda text-tinta-suave hover:border-nacao')}>
                    <span className="size-5 rounded-full ring-1 ring-black/10" style={{ background: t.accent }} />
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Título — linha 1</Label><Input value={f.titleTop} maxLength={30} onChange={(e) => set('titleTop', e.target.value)} placeholder="Horário de" /></div>
            <div><Label>Título — linha 2 (destaque)</Label><Input value={f.titleBottom} maxLength={22} onChange={(e) => set('titleBottom', e.target.value)} placeholder="Funcionamento" /></div>
            <div><Label>Data</Label><Input type="date" value={f.date} onChange={(e) => set('date', e.target.value)} /></div>
            <div><Label>Motivo (opcional)</Label><Input value={f.reason} maxLength={24} onChange={(e) => set('reason', e.target.value)} placeholder="Eleições, Feriado, Natal…" /></div>
          </div>
          <p className="text-xs text-tinta-suave">Faixa: <b className="tracking-[0.3em] text-navy">{subtitle || '—'}</b></p>
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-tinta-suave">Conteúdo:</span>
            {NOTICE_ART_CONTENTS.map((x) => (
              <button key={x.id} type="button" onClick={() => set('content', x.id)} aria-pressed={f.content === x.id}
                className={cn('rounded-full border px-3 py-1 text-xs font-semibold', f.content === x.id ? 'border-nacao bg-nacao text-white' : 'border-borda text-tinta-suave hover:border-nacao')}>{x.label}</button>
            ))}
          </div>
          {f.content === 'texto' ? (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <h2 className="font-bold text-navy">Texto do comunicado</h2>
                <span className="text-xs text-tinta-suave">{f.text.length}/{MAX_TEXT}</span>
              </div>
              <textarea value={f.text} maxLength={MAX_TEXT} rows={6} onChange={(e) => set('text', e.target.value)}
                placeholder={'Ao longo do dia teremos uma obra de manutenção na área da piscina.\nO acesso fica pelo *portão lateral*.\nAgradecemos a compreensão!'}
                className="w-full resize-y rounded-lg border border-borda p-3 text-sm focus:border-nacao focus:outline-none" />
              <p className="mt-1 text-xs text-tinta-suave">Cada linha vira um parágrafo. Use <b>*asteriscos*</b> para deixar uma palavra em <b>negrito</b>. A letra se ajusta para caber no criativo.</p>
            </div>
          ) : (<>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-bold text-navy">Horários</h2>
            <span className="text-xs text-tinta-suave">{f.rows.length}/{MAX_ROWS}</span>
          </div>
          <datalist id="places">{places.map((p) => <option key={p} value={p} />)}</datalist>
          <div className="space-y-2">
            {f.rows.map((r, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-2 rounded-lg bg-fundo p-2 sm:grid-cols-[7rem_minmax(0,1fr)_8rem_auto]">
                <Input aria-label="Horário" value={r.time} maxLength={18} onChange={(e) => setRow(i, { time: e.target.value })} placeholder="8h - 12h" />
                <Input aria-label="Local ou modalidade" list="places" value={r.place} maxLength={32} onChange={(e) => setRow(i, { place: e.target.value })} placeholder="Academia" />
                <Input aria-label="Selo (opcional)" value={r.badge ?? ''} maxLength={14} onChange={(e) => setRow(i, { badge: e.target.value })} placeholder="Selo: R$25,00" />
                <div className="flex items-center gap-1">
                  <button type="button" aria-label="Subir" disabled={i === 0} onClick={() => moveRow(i, -1)} className="text-tinta-fraca hover:text-nacao disabled:opacity-30"><ArrowUp className="size-4" /></button>
                  <button type="button" aria-label="Descer" disabled={i === f.rows.length - 1} onClick={() => moveRow(i, 1)} className="text-tinta-fraca hover:text-nacao disabled:opacity-30"><ArrowDown className="size-4" /></button>
                  <button type="button" aria-label="Remover linha" disabled={f.rows.length === 1} onClick={() => set('rows', f.rows.filter((_, j) => j !== i))} className="text-tinta-fraca hover:text-critico disabled:opacity-30"><Trash2 className="size-4" /></button>
                </div>
              </div>
            ))}
          </div>
          {f.rows.length < MAX_ROWS && (
            <Button className="mt-2" size="sm" variant="secondary" onClick={() => set('rows', [...f.rows, { time: f.rows.at(-1)?.time ?? '', place: '', badge: '' }])}><Plus /> Adicionar horário</Button>
          )}
          <p className="mt-2 text-xs text-tinta-suave">Dica: use “Fechado” no horário para avisar o que não abre. O selo aparece no canto da linha (preço, “grátis”, “com reserva”…).</p>
          </>)}
        </Card>

        <Card className="grid gap-3 p-4 sm:grid-cols-2">
          <div><Label>Frase final</Label><Input value={f.closing} maxLength={30} onChange={(e) => set('closing', e.target.value)} placeholder="Te esperamos!" /></div>
          <div>
            <Label>Fundo</Label>
            <div className="flex flex-wrap gap-1.5">
              {([['nacao', 'Foto da Nação'], ['propria', photo ? 'Minha foto' : 'Enviar foto…'], ['nenhuma', 'Sem foto']] as const).map(([id, label]) => (
                <button key={id} type="button"
                  onClick={() => (id === 'propria' && !photo ? photoRef.current?.click() : set('background', id))}
                  className={cn('rounded-full border px-3 py-1 text-xs font-semibold', f.background === id && (id !== 'propria' || photo) ? 'border-nacao bg-nacao text-white' : 'border-borda text-tinta-suave hover:border-nacao')}>{label}</button>
              ))}
              <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickPhoto(e.target.files?.[0])} />
              {photo && <button type="button" onClick={() => photoRef.current?.click()} className="inline-flex items-center gap-1 text-xs text-tinta-suave hover:text-nacao"><ImagePlus className="size-3" /> trocar</button>}
              {photo && <button type="button" onClick={() => { setPhoto(null); set('background', 'nacao'); if (photoRef.current) photoRef.current.value = ''; }} className="inline-flex items-center gap-1 text-xs text-tinta-suave hover:text-critico"><X className="size-3" /> tirar</button>}
            </div>
            {f.background !== 'nenhuma' && (
              <label className="mt-2 flex items-center gap-2 text-xs text-tinta-suave">
                Intensidade da foto
                <input type="range" min={0} max={30} step={1} value={Math.round(f.photoOpacity * 100)} onChange={(e) => set('photoOpacity', Number(e.target.value) / 100)} className="flex-1 accent-[#0169E9]" />
                <b className="w-9 text-right text-navy">{Math.round(f.photoOpacity * 100)}%</b>
              </label>
            )}
          </div>
        </Card>
      </div>

      <div className="min-w-0">
        <div className="sticky top-4 space-y-3">
          <FormMessage error={error} />
          <div style={{ background: noticeBackdrop(f.backdrop).color }} className={cn('overflow-hidden rounded-xl shadow-sm ring-1 ring-borda', f.format === 'story' ? 'aspect-[9/16]' : 'aspect-[4/5]')}>
            {img ? <img src={img} alt="Prévia do comunicado" className={cn('h-full w-full object-contain transition-opacity', busy && 'opacity-60')} /> : <div className="grid h-full place-items-center text-sm text-white/60">Gerando prévia…</div>}
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={img ?? undefined} download={fileName} aria-disabled={!img}
              className={cn('inline-flex items-center gap-2 rounded-lg bg-nacao px-4 py-2 text-sm font-semibold text-white hover:opacity-90', !img && 'pointer-events-none opacity-50')}><Download className="size-4" /> Baixar PNG</a>
            <Button variant="secondary" disabled={!blob} onClick={share}><Share2 /> Compartilhar</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
