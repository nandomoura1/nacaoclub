'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, ExternalLink, Pin, PinOff, Plus, RefreshCw, Trash2, Tv } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Input, Label, Select } from '@/components/ui/input';
import { formatDateBR } from '@/domain/dates';
import type { ScreenRow } from '@/server/services/tv-service';
import { deleteScreenAction, pinScreenAction, rotateScreenTokenAction, saveScreenAction } from '../tv-actions';

type Result = { ok: true; message?: string } | { ok: false; error: string };
const seen = (iso: string | null) => {
  if (!iso) return 'nunca abriu';
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  return min < 10 ? 'ligada agora' : `vista ${new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}`;
};

export function ScreensClient({ screens, modalities, base, today }: { screens: ScreenRow[]; modalities: { id: string; name: string }[]; base: string; today: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string | null; error?: string | null }>({});
  const [form, setForm] = useState<{ name: string; modalityId: string } | null>(screens.length ? null : { name: 'TV do box', modalityId: modalities[0]?.id ?? '' });
  const [pin, setPin] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const run = (fn: () => Promise<Result>, after?: () => void) => start(async () => {
    setMsg({}); const r = await fn();
    if (!r.ok) setMsg({ error: r.error }); else { setMsg({ ok: r.message ?? null }); after?.(); }
    router.refresh();
  });
  const copy = async (url: string, id: string) => { try { await navigator.clipboard.writeText(url); setCopied(id); setTimeout(() => setCopied(null), 1800); } catch { /* sem permissão: o link está visível para copiar */ } };

  return (
    <div className="space-y-4">
      <FormMessage error={msg.error} success={msg.ok} />
      {form ? (
        <Card className="grid gap-3 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div><Label>Nome da tela</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ex.: TV do box CrossFit" maxLength={60} /></div>
          <div><Label>Modalidade</Label><Select value={form.modalityId} onChange={(e) => setForm({ ...form, modalityId: e.target.value })}>{modalities.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select></div>
          <div className="flex gap-2">
            <Button disabled={pending} onClick={() => run(() => saveScreenAction(null, form), () => setForm(null))}><Plus /> Criar tela</Button>
            {screens.length > 0 && <Button variant="ghost" onClick={() => setForm(null)}>Cancelar</Button>}
          </div>
        </Card>
      ) : (
        <Button variant="secondary" onClick={() => setForm({ name: '', modalityId: modalities[0]?.id ?? '' })}><Plus /> Nova tela de TV</Button>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {screens.map((s) => {
          const url = `${base}/tv/${s.token}`;
          const pinned = s.pinnedDate && s.pinnedDate >= today ? s.pinnedDate : null;
          return (
            <Card key={s.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Tv className="size-5 text-nacao" />
                <h2 className="flex-1 font-bold text-navy">{s.name}</h2>
                <Badge tone="blue">{s.modality}</Badge>
                <Badge tone={s.lastSeenAt && Date.now() - Date.parse(s.lastSeenAt) < 10 * 60_000 ? 'green' : 'neutral'}>{seen(s.lastSeenAt)}</Badge>
              </div>
              <p className="mt-3 text-xs font-semibold text-tinta-suave">Link da TV (digite no navegador da TV uma vez e deixe aberto)</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 break-all rounded-lg bg-fundo px-2 py-1.5 text-sm font-bold text-navy">{url}</code>
                <Button size="sm" variant="secondary" onClick={() => copy(url, s.id)}>{copied === s.id ? <><Check /> Copiado</> : <><Copy /> Copiar</>}</Button>
                <a href={url} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-sm font-semibold text-nacao hover:underline"><ExternalLink className="size-4" /> Ver</a>
              </div>

              <div className="mt-3 rounded-lg bg-fundo p-3 text-sm">
                {pinned ? (
                  <p className="flex flex-wrap items-center gap-2"><Pin className="size-4 text-nacao" /> Mostrando o treino fixado de <b>{formatDateBR(pinned)}</b> (volta sozinha para o “hoje” depois desse dia).
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => pinScreenAction(s.id, null))}><PinOff /> Voltar para hoje</Button></p>
                ) : (
                  <p className="text-tinta-suave">Mostrando sempre o <b className="text-navy">treino de hoje</b>.</p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-tinta-suave">Fixar outro dia:</span>
                  <Input type="date" min={today} value={pin[s.id] ?? ''} onChange={(e) => setPin({ ...pin, [s.id]: e.target.value })} className="h-8 w-auto" />
                  <Button size="sm" variant="secondary" disabled={pending || !pin[s.id]} onClick={() => run(() => pinScreenAction(s.id, pin[s.id]!))}><Pin /> Fixar</Button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => { if (confirm('Gerar um link novo? O link atual para de funcionar na TV.')) run(() => rotateScreenTokenAction(s.id)); }}><RefreshCw /> Trocar link</Button>
                <Button size="sm" variant="ghost" className="ml-auto" disabled={pending} onClick={() => { if (confirm(`Excluir a tela “${s.name}”?`)) run(() => deleteScreenAction(s.id)); }}><Trash2 /></Button>
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="p-4 text-sm text-tinta">
        <h2 className="font-bold text-navy">Como colocar na TV</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li><b>Smart TV:</b> abra o navegador da TV (Samsung “Internet”, LG “Navegador Web”, Android TV “Chrome”/“TV Bro”), digite o link acima e deixe aberto. Dica: salve nos favoritos ou como página inicial.</li>
          <li><b>TV comum:</b> um Chromecast/Fire TV Stick ou um notebook/mini PC no HDMI com o link aberto em tela cheia (tecla F11).</li>
          <li>A tela troca sozinha à meia-noite e atualiza a cada minuto — se o coach editar o treino, a TV mostra a versão nova.</li>
          <li>Na TV só aparece a versão do aluno: as orientações ao professor nunca saem.</li>
        </ol>
      </Card>
    </div>
  );
}
