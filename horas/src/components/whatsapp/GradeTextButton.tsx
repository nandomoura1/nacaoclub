'use client';

import { useState } from 'react';
import { Copy, MessageCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SendWhatsApp } from '@/components/whatsapp/SendWhatsApp';

/** "Texto para WhatsApp" da grade: prévia editável, copiar, abrir no WhatsApp ou enviar pela Z-API.
 *  `plain` = formato detalhado (padrão); `withModalities` = formato curto, uma linha por pessoa. */
export function GradeTextButton({ plain, withModalities, autoOpen = false }: { plain: string; withModalities: string; autoOpen?: boolean }) {
  const [open, setOpen] = useState(autoOpen);
  const [mods, setMods] = useState(false);
  const [edited, setEdited] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const body = edited ?? (mods ? withModalities : plain);

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}><MessageCircle /> Texto para WhatsApp</Button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-navy/40 p-4 print:hidden" onClick={() => setOpen(false)}>
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-2xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <h3 className="flex-1 font-extrabold text-navy">Grade em texto para WhatsApp</h3>
              <button type="button" aria-label="Fechar" onClick={() => setOpen(false)} className="text-tinta-fraca hover:text-tinta"><X className="size-4" /></button>
            </div>
            <p className="mt-1 text-xs text-tinta-suave">Por pessoa, com a modalidade ao lado do nome e os mesmos filtros da grade (área, modalidade, professor, data). Aulas seguidas viram um período só. Dá para editar antes de mandar.</p>
            <label className="mt-3 inline-flex items-center gap-1.5 text-sm">
              <input type="checkbox" className="size-4" checked={mods} onChange={() => { setMods(!mods); setEdited(null); }} /> Formato curto (uma linha por pessoa, sem modalidade)
            </label>
            <textarea value={body} onChange={(e) => setEdited(e.target.value)} rows={16}
              className="mt-2 min-h-48 w-full flex-1 resize-y rounded-lg border border-borda bg-fundo p-3 font-mono text-[13px] leading-relaxed text-tinta" />
            {edited !== null && <button type="button" onClick={() => setEdited(null)} className="mt-1 self-start text-xs font-semibold text-nacao">desfazer edições</button>}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" onClick={async () => {
                try { await navigator.clipboard.writeText(body); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { prompt('Copie o texto:', body); }
              }}><Copy /> {copied ? 'Copiado!' : 'Copiar'}</Button>
              <a href={`https://wa.me/?text=${encodeURIComponent(body)}`} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-borda bg-white px-3 py-1.5 text-sm font-semibold text-[#128C7E] hover:bg-fundo"><MessageCircle className="size-4" /> Abrir no WhatsApp</a>
              <SendWhatsApp kind="GRADE" text={body} label="Enviar pela Z-API" variant="ghost" />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
