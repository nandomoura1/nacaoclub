'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Input, Label, Select } from '@/components/ui/input';
import { MoneyInput } from '@/app/(app)/condominio/_components/MoneyInput';
import { formatBRL } from '@/domain/condominio/money';
import { AD_PLATFORMS } from '@/domain/marketing/traffic';
import { cn } from '@/lib/cn';
import type { SpendRow, trafficPanel } from '@/server/services/mkt-traffic-service';
import { deleteSpendAction, saveSpendAction } from '../trafego-actions';

type Panel = Awaited<ReturnType<typeof trafficPanel>>;
type K = Panel['report']['total'];
type Opt = { id: string; name: string };
type Form = { platform: string; campaignId: string; adName: string; start: string; end: string; spendCents: number | null; impressions: string; clicks: string; platformLeads: string; notes: string };

const money = (c: number | null) => (c === null ? '—' : formatBRL(c));
const int = (n: number | null) => (n === null ? '—' : n.toLocaleString('pt-BR'));
const pct = (r: number | null) => (r === null ? '—' : `${(r * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`);
const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const num = (s: string) => (s.trim() === '' ? null : Math.max(0, Math.round(Number(s.replace(/\./g, '').replace(',', '.')))) || 0);
const PRESETS = [{ id: 'mes', label: 'Este mês' }, { id: 'mes-passado', label: 'Mês passado' }, { id: '90d', label: '90 dias' }, { id: 'ano', label: 'No ano' }];

export function TrafficClient({ panel, campaigns, range, preset, today, apis, perms }: {
  panel: Panel; campaigns: Opt[]; range: { from: string; to: string }; preset: string; today: string;
  apis: { meta: boolean; google: boolean }; perms: { edit: boolean; del: boolean; admin: boolean };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string | null; error?: string | null }>({});
  const [edit, setEdit] = useState<{ id: string | null; f: Form } | null>(null);
  const [custom, setCustom] = useState(range);
  const { total, byPlatform, byCampaign } = panel.report;
  const monthStart = `${today.slice(0, 8)}01`;

  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, after?: () => void) => start(async () => {
    setMsg({}); const r = await fn();
    if (!r.ok) setMsg({ error: r.error }); else { setMsg({ ok: r.message ?? null }); after?.(); }
    router.refresh();
  });
  const openNew = () => { setMsg({}); setEdit({ id: null, f: { platform: 'META', campaignId: '', adName: '', start: monthStart, end: today, spendCents: null, impressions: '', clicks: '', platformLeads: '', notes: '' } }); };
  const openEdit = (s: SpendRow) => { setMsg({}); setEdit({ id: s.id, f: { platform: s.platform, campaignId: s.campaignId ?? '', adName: s.adName ?? '', start: s.start, end: s.end, spendCents: s.spendCents, impressions: s.impressions?.toString() ?? '', clicks: s.clicks?.toString() ?? '', platformLeads: s.platformLeads?.toString() ?? '', notes: s.notes ?? '' } }); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  return (
    <div className="space-y-4">
      {/* Período */}
      <div className="flex flex-wrap items-end gap-2">
        {PRESETS.map((p) => (
          <Link key={p.id} href={`/marketing/trafego?periodo=${p.id}`} className={cn('rounded-full px-3 py-1 text-sm ring-1 ring-borda', preset === p.id ? 'bg-navy text-white ring-navy' : 'bg-white text-navy hover:bg-fundo')}>{p.label}</Link>
        ))}
        <form className="flex items-end gap-1" onSubmit={(e) => { e.preventDefault(); router.push(`/marketing/trafego?de=${custom.from}&ate=${custom.to}`); }}>
          <Input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} className="w-36" aria-label="De" />
          <Input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} className="w-36" aria-label="Até" />
          <Button size="sm" variant="secondary" type="submit">Ver</Button>
        </form>
        {perms.edit && !edit && <Button className="ml-auto" onClick={openNew}><Plus /> Lançar gasto</Button>}
      </div>


      {edit && <SpendForm edit={edit} setEdit={setEdit} campaigns={campaigns} pending={pending}
        onSave={(f) => run(() => saveSpendAction(edit.id, { platform: f.platform, campaignId: f.campaignId || null, adName: f.adName || null, start: f.start, end: f.end, spendCents: f.spendCents ?? -1, impressions: num(f.impressions), clicks: num(f.clicks), platformLeads: num(f.platformLeads), notes: f.notes || null }), () => setEdit(null))} />}
      <FormMessage error={msg.error} success={msg.ok} />

      {/* Indicadores */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Tile label="Investimento" value={money(total.spendCents)} hint={`${br(range.from)} a ${br(range.to)}`} />
        <Tile label="Leads de anúncio" value={int(total.leads)} hint={total.platformLeads !== null ? `plataformas dizem ${int(total.platformLeads)}` : 'no funil'} />
        <Tile label="Matrículas" value={int(total.won)} />
        <Tile label="Custo por lead" value={money(total.cpl)} strong />
        <Tile label="Custo por matrícula" value={money(total.cac)} strong />
        <Tile label="CTR · CPC" value={`${pct(total.ctr)} · ${money(total.cpc)}`} hint="cliques ÷ impressões · custo do clique" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Breakdown title="Por plataforma" rows={byPlatform.map((p) => ({ key: p.id, name: p.label, k: p }))} max={total.spendCents} />
        <Breakdown title="Por campanha" rows={byCampaign.map((c) => ({ key: c.id, name: c.name, k: c, href: `/marketing/campanhas/${c.id}` }))} max={total.spendCents} empty="Ligue o gasto a uma campanha para ver o retorno de cada uma." />
      </div>

      {/* Lançamentos */}
      <Card className="overflow-hidden">
        <p className="border-b border-borda px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-tinta-suave">Lançamentos no período · {panel.rows.length}</p>
        {panel.rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-tinta-suave">Nenhum gasto lançado nesse período.{perms.edit && ' Use “Lançar gasto” com o valor do Gerenciador de Anúncios (pode ser por semana ou por mês).'}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-fundo text-left text-xs text-tinta-suave">
                <tr><th className="px-3 py-2">Período</th><th className="px-3 py-2">Plataforma</th><th className="px-3 py-2">Campanha</th><th className="px-3 py-2 text-right">Valor</th><th className="px-3 py-2 text-right">Impr.</th><th className="px-3 py-2 text-right">Cliques</th><th className="px-3 py-2 text-right">Leads (plat.)</th><th /></tr>
              </thead>
              <tbody className="divide-y divide-borda">
                {panel.rows.map((s) => (
                  <tr key={s.id}>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">{br(s.start)} – {br(s.end)}</td>
                    <td className="px-3 py-2">{AD_PLATFORMS.find((p) => p.id === s.platform)?.label.split(' (')[0]} {s.origin === 'API' && <Badge tone="cyan">auto</Badge>}</td>
                    <td className="max-w-56 truncate px-3 py-2" title={s.adName ?? undefined}>{s.campaign ?? '—'}{s.adName && <span className="block truncate text-xs text-tinta-suave">{s.adName}</span>}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-navy">{money(s.spendCents)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{int(s.impressions)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{int(s.clicks)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{int(s.platformLeads)}</td>
                    <td className="whitespace-nowrap px-1 py-1 text-right">
                      {perms.edit && s.origin !== 'API' && <Button size="sm" variant="ghost" onClick={() => openEdit(s)} aria-label="Editar"><Pencil /></Button>}
                      {perms.del && <Button size="sm" variant="ghost" aria-label="Excluir" onClick={() => { if (confirm('Excluir este lançamento?')) run(() => deleteSpendAction(s.id)); }}><Trash2 /></Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="text-xs text-tinta-suave">
        Como conta: um gasto lançado de 1 a 31/out olhado de 16 a 31/out entra pela metade (rateio por dia). Lead de anúncio = origem Anúncio Meta / Google no funil, ou ligado a uma campanha que teve gasto no período. Custo por matrícula = investimento ÷ leads do período que viraram matrícula.
      </p>
    </div>
  );
}

function Tile({ label, value, hint, strong }: { label: string; value: string; hint?: string; strong?: boolean }) {
  return (
    <Card className={cn('p-3', strong && 'border-nacao/30')}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-tinta-suave">{label}</p>
      <p className={cn('mt-1 font-extrabold tabular-nums', value.length > 12 ? 'text-base' : 'text-xl', strong ? 'text-nacao' : 'text-navy')}>{value}</p>
      {hint && <p className="text-[11px] text-tinta-suave">{hint}</p>}
    </Card>
  );
}

function Breakdown({ title, rows, max, empty }: { title: string; rows: { key: string; name: string; k: K; href?: string }[]; max: number; empty?: string }) {
  return (
    <Card className="p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-tinta-suave">{title}</p>
      {rows.length === 0 ? <p className="mt-2 text-sm text-tinta-suave">{empty ?? 'Sem dados no período.'}</p> : (
        <div className="mt-2 space-y-3">
          {rows.map((r) => (
            <div key={r.key} className="text-sm">
              <div className="flex items-baseline gap-2">
                {r.href ? <Link href={r.href} className="min-w-0 flex-1 truncate font-semibold text-navy hover:text-nacao">{r.name}</Link> : <span className="min-w-0 flex-1 truncate font-semibold text-navy">{r.name}</span>}
                <span className="font-semibold tabular-nums text-navy">{money(r.k.spendCents)}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-fundo" title={`${money(r.k.spendCents)} de ${money(max)}`}>
                <div className="h-full rounded-full bg-nacao" style={{ width: `${max ? Math.max(2, (r.k.spendCents / max) * 100) : 0}%` }} />
              </div>
              <p className="mt-1 text-xs text-tinta-suave tabular-nums">
                {r.k.leads} leads · {r.k.won} matr. · CPL <b className="text-navy">{money(r.k.cpl)}</b> · por matrícula <b className="text-navy">{money(r.k.cac)}</b>
              </p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function SpendForm({ edit, setEdit, campaigns, pending, onSave }: { edit: { id: string | null; f: Form }; setEdit: (e: { id: string | null; f: Form } | null) => void; campaigns: Opt[]; pending: boolean; onSave: (f: Form) => void }) {
  const f = edit.f;
  const set = <X extends keyof Form>(k: X, v: Form[X]) => setEdit({ ...edit, f: { ...f, [k]: v } });
  return (
    <Card className="border-nacao/30 p-4">
      <h2 className="font-bold text-navy">{edit.id ? 'Editar gasto' : 'Lançar gasto em anúncio'}</h2>
      <p className="text-xs text-tinta-suave">Copie do Gerenciador de Anúncios (Meta) ou do Google Ads: valor gasto no período e, se quiser, impressões, cliques e leads.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 [&>*]:min-w-0">
        <div><Label>Plataforma</Label><Select value={f.platform} onChange={(e) => set('platform', e.target.value)}>{AD_PLATFORMS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</Select></div>
        <div><Label>De</Label><Input type="date" value={f.start} onChange={(e) => set('start', e.target.value)} /></div>
        <div><Label>Até</Label><Input type="date" value={f.end} onChange={(e) => set('end', e.target.value)} /></div>
        <div><Label>Valor gasto (R$)</Label><MoneyInput value={f.spendCents} onChange={(v) => set('spendCents', v)} placeholder="0,00" /></div>
        <div className="sm:col-span-2"><Label>Campanha da Nação</Label><Select value={f.campaignId} onChange={(e) => set('campaignId', e.target.value)}><option value="">— (gasto geral)</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>
        <div className="sm:col-span-2"><Label>Nome no Gerenciador (opcional)</Label><Input value={f.adName} onChange={(e) => set('adName', e.target.value)} placeholder="ex.: [LEADS] Aula experimental — Brasília" /></div>
        <div><Label>Impressões</Label><Input inputMode="numeric" value={f.impressions} onChange={(e) => set('impressions', e.target.value)} placeholder="opcional" /></div>
        <div><Label>Cliques</Label><Input inputMode="numeric" value={f.clicks} onChange={(e) => set('clicks', e.target.value)} placeholder="opcional" /></div>
        <div><Label>Leads (segundo a plataforma)</Label><Input inputMode="numeric" value={f.platformLeads} onChange={(e) => set('platformLeads', e.target.value)} placeholder="opcional" /></div>
        <div><Label>Observação</Label><Input value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder="opcional" /></div>
      </div>
      <div className="mt-3 flex gap-2">
        <Button disabled={pending} onClick={() => onSave(f)}>{pending ? 'Salvando…' : 'Salvar'}</Button>
        <Button variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button>
      </div>
    </Card>
  );
}
