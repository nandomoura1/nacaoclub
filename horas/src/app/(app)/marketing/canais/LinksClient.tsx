'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Pencil, Plus, QrCode, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Input, Label, Select } from '@/components/ui/input';
import { labelOf, LINK_CHANNELS, slugify, withUtm } from '@/domain/marketing/leads';
import { cn } from '@/lib/cn';
import type { LinkRow } from '@/server/services/mkt-leads-service';
import { deleteLinkAction, linkQrAction, saveLinkAction } from '../conversao-actions';

type Opt = { id: string; name: string };
type Form = { title: string; slug: string; destination: string; channel: string; utmSource: string; utmMedium: string; utmCampaign: string; utmContent: string; campaignId: string; active: boolean };
const EMPTY: Form = { title: '', slug: '', destination: 'https://', channel: 'INSTAGRAM', utmSource: '', utmMedium: '', utmCampaign: '', utmContent: '', campaignId: '', active: true };

export function LinksClient({ links, days, campaigns, base, perms }: { links: LinkRow[]; days: { day: string; clicks: number }[]; campaigns: Opt[]; base: string; perms: { edit: boolean; del: boolean } }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string | null; error?: string | null }>({});
  const [edit, setEdit] = useState<{ id: string | null; f: Form } | null>(null);
  const [qr, setQr] = useState<{ title: string; url: string; png: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, after?: () => void) => start(async () => {
    setMsg({}); const r = await fn();
    if (!r.ok) setMsg({ error: r.error }); else { setMsg({ ok: r.message ?? null }); after?.(); }
    router.refresh();
  });
  const copy = (url: string) => { void navigator.clipboard.writeText(url); setCopied(url); setTimeout(() => setCopied(null), 1500); };
  const total = days.reduce((s, d) => s + d.clicks, 0);
  const max = Math.max(1, ...days.map((d) => d.clicks));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
        <Card className="p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-tinta-suave">Cliques nos últimos 30 dias · {total}</p>
          <div className="mt-2 flex h-16 items-end gap-0.5" role="img" aria-label={`${total} cliques em 30 dias`}>
            {days.length === 0 ? <p className="text-sm text-tinta-suave">Ainda sem cliques.</p> : days.map((d) => (
              <div key={d.day} title={`${d.day.slice(8, 10)}/${d.day.slice(5, 7)}: ${d.clicks}`} className="max-w-6 flex-1 rounded-t bg-nacao/70 hover:bg-nacao" style={{ height: `${Math.max(6, (d.clicks / max) * 100)}%` }} />
            ))}
          </div>
        </Card>
        {perms.edit && !edit && <div className="flex items-start"><Button onClick={() => { setMsg({}); setEdit({ id: null, f: EMPTY }); }}><Plus /> Novo link</Button></div>}
      </div>
      <FormMessage error={msg.error} success={msg.ok} />

      {edit && <LinkForm edit={edit} setEdit={setEdit} campaigns={campaigns} base={base} pending={pending}
        onSave={(f) => run(() => saveLinkAction(edit.id, { ...f, slug: f.slug || null, utmSource: f.utmSource || null, utmMedium: f.utmMedium || null, utmCampaign: f.utmCampaign || null, utmContent: f.utmContent || null, campaignId: f.campaignId || null }), () => setEdit(null))} />}

      {qr && (
        <Card className="flex flex-wrap items-center gap-4 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr.png} alt={`QR Code de ${qr.title}`} className="size-40 rounded-lg ring-1 ring-borda" />
          <div className="min-w-0 flex-1">
            <p className="font-bold text-navy">{qr.title}</p>
            <p className="break-all text-sm text-tinta-suave">{qr.url}</p>
            <div className="mt-2 flex gap-2">
              <a href={qr.png} download={`qrcode-${slugify(qr.title)}.png`} className="text-sm font-semibold text-nacao">Baixar PNG</a>
              <button type="button" className="text-sm text-tinta-suave" onClick={() => setQr(null)}>fechar</button>
            </div>
          </div>
        </Card>
      )}

      {links.length === 0 ? (
        <Card className="p-8 text-center text-sm text-tinta-suave">Nenhum link ainda. Crie o primeiro (ex.: “Bio do Instagram → aula experimental”).</Card>
      ) : (
        <Card className="divide-y divide-borda">
          {links.map((l) => {
            const short = `${base}/l/${l.slug}`;
            return (
              <div key={l.id} className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 p-3 text-sm', !l.active && 'opacity-60')}>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-navy">{l.title} {!l.active && <Badge>inativo</Badge>}</p>
                  <p className="truncate text-xs text-tinta-suave" title={l.finalUrl}>{labelOf(LINK_CHANNELS, l.channel)} → {l.destination}</p>
                </div>
                <button type="button" onClick={() => copy(short)} className="inline-flex items-center gap-1 rounded-md bg-fundo px-2 py-1 font-mono text-xs text-navy ring-1 ring-borda" title="Copiar link curto"><Copy className="size-3" />{copied === short ? 'copiado!' : `/l/${l.slug}`}</button>
                <span className="w-20 text-right text-xs tabular-nums"><b className="text-navy">{l.clicks}</b> cliques</span>
                <span className="w-24 text-right text-xs tabular-nums"><b className="text-navy">{l.leads}</b> leads · <b className="text-sucesso">{l.won}</b> matr.</span>
                <Button size="sm" variant="ghost" onClick={() => start(async () => { const r = await linkQrAction(short); if (r.ok) setQr({ title: l.title, url: short, png: r.data }); })}><QrCode /></Button>
                {perms.edit && <Button size="sm" variant="ghost" onClick={() => { setMsg({}); setEdit({ id: l.id, f: { title: l.title, slug: l.slug, destination: l.destination, channel: l.channel, utmSource: l.utmSource ?? '', utmMedium: l.utmMedium ?? '', utmCampaign: l.utmCampaign ?? '', utmContent: l.utmContent ?? '', campaignId: l.campaignId ?? '', active: l.active } }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><Pencil /></Button>}
                {perms.del && <Button size="sm" variant="ghost" onClick={() => { if (confirm(`Excluir o link /l/${l.slug}? Quem tiver o link antigo cai na página inicial.`)) run(() => deleteLinkAction(l.id)); }}><Trash2 /></Button>}
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}

function LinkForm({ edit, setEdit, campaigns, base, pending, onSave }: { edit: { id: string | null; f: Form }; setEdit: (e: { id: string | null; f: Form } | null) => void; campaigns: Opt[]; base: string; pending: boolean; onSave: (f: Form) => void }) {
  const f = edit.f;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setEdit({ ...edit, f: { ...f, [k]: v } });
  const ch = LINK_CHANNELS.find((c) => c.id === f.channel)!;
  const slug = slugify(f.slug || f.title);
  const final = useMemo(() => withUtm(f.destination, { source: f.utmSource || ch.source, medium: f.utmMedium || ch.medium, campaign: f.utmCampaign || slug, content: f.utmContent || null }), [f, ch, slug]);
  return (
    <Card className="border-nacao/30 p-4">
      <h2 className="font-bold text-navy">{edit.id ? 'Editar link' : 'Novo link'}</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 [&>*]:min-w-0">
        <div className="sm:col-span-2"><Label>Nome</Label><Input value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="ex.: Bio do Instagram — aula experimental" /></div>
        <div><Label>Canal</Label><Select value={f.channel} onChange={(e) => set('channel', e.target.value)}>{LINK_CHANNELS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select></div>
        <div><Label>Endereço curto</Label><div className="flex items-center gap-1 text-sm"><span className="text-tinta-suave">/l/</span><Input value={f.slug} onChange={(e) => set('slug', e.target.value)} placeholder={slug} /></div></div>
        <div className="sm:col-span-2"><Label>Destino (página do site, WhatsApp, formulário…)</Label><Input value={f.destination} onChange={(e) => set('destination', e.target.value)} placeholder="https://www.nacaoclub.com.br/aula-experimental" /></div>
        <div className="sm:col-span-2"><Label>Campanha</Label><Select value={f.campaignId} onChange={(e) => set('campaignId', e.target.value)}><option value="">—</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>
        <div><Label>utm_source</Label><Input value={f.utmSource} onChange={(e) => set('utmSource', e.target.value)} placeholder={ch.source} /></div>
        <div><Label>utm_medium</Label><Input value={f.utmMedium} onChange={(e) => set('utmMedium', e.target.value)} placeholder={ch.medium} /></div>
        <div><Label>utm_campaign</Label><Input value={f.utmCampaign} onChange={(e) => set('utmCampaign', e.target.value)} placeholder={slug} /></div>
        <div><Label>utm_content (opcional)</Label><Input value={f.utmContent} onChange={(e) => set('utmContent', e.target.value)} placeholder="ex.: stories-1" /></div>
      </div>
      <div className="mt-3 rounded-lg bg-fundo p-2 text-xs">
        <p><b>Link para divulgar:</b> <span className="font-mono">{base}/l/{slug}</span></p>
        <p className="mt-0.5 break-all text-tinta-suave"><b>Abre:</b> {final}</p>
      </div>
      <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} /> Ativo</label>
      <div className="mt-3 flex gap-2">
        <Button disabled={pending} onClick={() => onSave(f)}>{pending ? 'Salvando…' : 'Salvar link'}</Button>
        <Button variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button>
      </div>
    </Card>
  );
}
