'use client';

import { useEffect, useState, useTransition } from 'react';
import { MessageCircle, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { sendWhatsAppAction, whatsAppAvailableAction } from '@/app/(app)/whatsapp/actions';

type Avail = { canSend: boolean; configured: boolean; testMode: boolean };
let cached: Promise<Avail> | null = null;
const availability = () => (cached ??= whatsAppAvailableAction().catch(() => ({ canSend: false, configured: false, testMode: false })));

/**
 * "Enviar pelo WhatsApp" (Z-API): abre um painel com o destino e o texto
 * (editável, salvo em mensagem com senha). Só aparece para quem pode enviar e
 * quando a Z-API está configurada.
 */
export function SendWhatsApp({ kind, text, defaultTo, hasSecret = false, label = 'Enviar pelo WhatsApp', size = 'sm', variant = 'secondary', send, onSent }: {
  kind: string; text: string; defaultTo?: string | null; hasSecret?: boolean; label?: string; size?: 'sm' | 'md'; variant?: 'primary' | 'secondary' | 'ghost';
  /** Envio próprio (ex.: com PDF). Padrão: só texto. */
  send?: (to: string, text: string) => Promise<{ ok: boolean; error?: string; data?: { testMode: boolean; to: string; status: string } }>;
  onSent?: () => void;
}) {
  const [avail, setAvail] = useState<Avail | null>(null);
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(defaultTo ?? '');
  const [body, setBody] = useState(text);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => { let alive = true; availability().then((a) => alive && setAvail(a)); return () => { alive = false; }; }, []);
  useEffect(() => { setBody(text); }, [text]);
  if (!avail?.canSend || !avail.configured) return null;

  const go = () => start(async () => {
    setMsg(null);
    const r = send ? await send(to, body) : await sendWhatsAppAction({ kind, to, text: body, hasSecret });
    if (!r.ok) return setMsg({ error: r.error ?? 'Falha no envio.' });
    const d = r.data!;
    setMsg({ ok: d.status === 'SIMULATED' ? `Simulado (modo desenvolvimento) para ${d.to}.` : d.testMode ? `Enviado ao número de TESTE (destino real: ${d.to}).` : `Enviado para ${d.to}. ✅` });
    onSent?.();
  });

  return (
    <>
      <Button type="button" size={size} variant={variant} onClick={() => { setOpen(true); setMsg(null); }}><MessageCircle /> {label}</Button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-navy/40 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <h3 className="flex-1 font-extrabold text-navy">Enviar pelo WhatsApp</h3>
              {avail.testMode && <span className="rounded-full bg-atencao/15 px-2 py-0.5 text-[11px] font-semibold text-atencao">modo teste</span>}
              <button type="button" aria-label="Fechar" onClick={() => setOpen(false)} className="text-tinta-fraca hover:text-tinta"><X className="size-4" /></button>
            </div>
            <div className="mt-3 space-y-3">
              <div>
                <Label>Para (DDD + número, ou ID do grupo)</Label>
                <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="61 98466-2806" inputMode="tel" />
              </div>
              <div>
                <Label>Mensagem{hasSecret ? ' (contém senha — não fica guardada no registro)' : ''}</Label>
                <textarea className="min-h-48 w-full rounded-lg border border-borda p-2 font-mono text-xs" value={body} readOnly={hasSecret} onChange={(e) => setBody(e.target.value)} />
              </div>
              {msg?.error && <p className="text-sm font-semibold text-critico">{msg.error}</p>}
              {msg?.ok && <p className="text-sm font-semibold text-sucesso">{msg.ok}</p>}
              <div className="flex gap-2">
                <Button disabled={pending || to.replace(/\D/g, '').length < 10} onClick={go}><Send /> {pending ? 'Enviando…' : 'Enviar'}</Button>
                <Button variant="ghost" onClick={() => setOpen(false)}>Fechar</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
