'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, FileSpreadsheet, Gauge, Pencil, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Input, Label, Select } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { formatDateBR } from '@/domain/dates';
import { FLAGS, type Flag } from '@/domain/condominio/energy';
import { formatBRL } from '@/domain/condominio/money';
import { monthLabel, type Month } from '@/domain/condominio/months';
import { commonArea } from '@/domain/condominio/iptu';
import { cn } from '@/lib/cn';
import type { CondoCenterView, CondoSettingsView } from '@/server/services/condo-service';
import type { CondoImportAnalysis } from '@/server/services/condo-import-service';
import { MoneyInput } from '../_components/MoneyInput';
import {
  analyzeImportAction, commitImportAction, deleteItemAction, saveCenterAction, saveIptuAction, saveItemAction, saveMeterAction, saveSettingsAction,
} from '../actions';

type Iptu = { year: number; totalCents: number; totalAreaM2: number; firstMonth: number; parcels: number };
const TABS = [
  { id: 'centros', label: 'Parceiros e operações' },
  { id: 'relogios', label: 'Relógios de energia' },
  { id: 'itens', label: 'Itens fixos' },
  { id: 'iptu', label: 'IPTU' },
  { id: 'recebimento', label: 'Recebimento' },
  { id: 'importar', label: 'Importar planilha' },
] as const;
type Tab = (typeof TABS)[number]['id'];
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const m2 = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

export function CadastrosClient({ centers, iptu, settings, today, empty }: { centers: CondoCenterView[]; iptu: Iptu[]; settings: CondoSettingsView; today: string; empty: boolean }) {
  const params = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>((params.get('aba') as Tab) || (empty ? 'importar' : 'centros'));
  const go = (t: Tab) => { setTab(t); router.replace(`/condominio/cadastros?aba=${t}`, { scroll: false }); };
  return (
    <>
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => go(t.id)}
            className={cn('shrink-0 rounded-full border px-4 py-2 text-sm font-bold', tab === t.id ? 'border-navy bg-navy text-white' : 'border-borda text-tinta hover:bg-fundo')}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'centros' && <Centers centers={centers} today={today} />}
      {tab === 'relogios' && <Meters centers={centers} today={today} />}
      {tab === 'itens' && <Items centers={centers} today={today} />}
      {tab === 'iptu' && <IptuTab rows={iptu} centers={centers} today={today} />}
      {tab === 'recebimento' && <Settings s={settings} />}
      {tab === 'importar' && <ImportTab empty={empty} />}
    </>
  );
}

const isActive = (c: { activeTo: string | null }, today: string) => !c.activeTo || c.activeTo >= today;

// ── Parceiros e operações ──────────────────────────────────

type CenterForm = {
  name: string; displayName: string; kind: 'INTERNAL' | 'PARTNER'; isSnackBar: boolean; chargesCondo: boolean; areaM2: string; iptuSharePct: string;
  legalName: string; document: string; contactName: string; contactPhone: string; contactEmail: string; activeFrom: string; activeTo: string;
};
const blankCenter = (today: string): CenterForm => ({
  name: '', displayName: '', kind: 'PARTNER', isSnackBar: false, chargesCondo: true, areaM2: '0', iptuSharePct: '100',
  legalName: '', document: '', contactName: '', contactPhone: '', contactEmail: '', activeFrom: today, activeTo: '',
});
const formOf = (c: CondoCenterView): CenterForm => ({
  name: c.name, displayName: c.displayName ?? '', kind: c.kind, isSnackBar: c.isSnackBar, chargesCondo: c.chargesCondo, areaM2: String(c.areaM2), iptuSharePct: String(c.iptuSharePct),
  legalName: c.legalName ?? '', document: c.document ?? '', contactName: c.contactName ?? '', contactPhone: c.contactPhone ?? '', contactEmail: c.contactEmail ?? '',
  activeFrom: c.activeFrom, activeTo: c.activeTo ?? '',
});

function Centers({ centers, today }: { centers: CondoCenterView[]; today: string }) {
  const router = useRouter();
  const [edit, setEdit] = useState<{ id: string | null; f: CenterForm } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const activeRows = centers.filter((c) => isActive(c, today));
  const former = centers.filter((c) => !isActive(c, today));
  const save = () => start(async () => {
    setError(null);
    const r = await saveCenterAction(edit!.id, edit!.f);
    if (!r.ok) return setError(r.error);
    setEdit(null);
    router.refresh();
  });
  const set = (p: Partial<CenterForm>) => setEdit((e) => (e ? { ...e, f: { ...e.f, ...p } } : e));
  const row = (c: CondoCenterView) => (
    <button key={c.id} onClick={() => { setError(null); setEdit({ id: c.id, f: formOf(c) }); }} className="grid w-full grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 p-3 text-left text-sm hover:bg-fundo sm:grid-cols-[minmax(0,1.6fr)_6rem_6rem_minmax(0,1fr)_auto]">
      <span className="min-w-0">
        <span className="font-bold text-navy">{c.displayName || c.name}</span>
        {c.displayName && <span className="ml-1 text-xs text-tinta-suave">({c.name})</span>}
        <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
          <Badge tone={c.kind === 'PARTNER' ? 'blue' : 'neutral'}>{c.kind === 'PARTNER' ? 'Parceiro' : 'Operação interna'}</Badge>
          {c.isSnackBar && <Badge tone="amber">Lanchonete · % fixo</Badge>}
          {!c.chargesCondo && <Badge tone="neutral">fora do rateio</Badge>}
        </span>
      </span>
      <span className="hidden text-right tabular-nums text-tinta sm:block">{m2(c.areaM2)} m²</span>
      <span className="hidden text-right tabular-nums text-tinta-suave sm:block">IPTU {m2(c.iptuSharePct)}%</span>
      <span className="hidden truncate text-xs text-tinta-suave sm:block">
        desde {formatDateBR(c.activeFrom)}{c.activeTo ? ` · saída ${formatDateBR(c.activeTo)}` : ''}
        {c.meters.length > 0 && ` · ${c.meters.length} relógio(s)`}
      </span>
      <Pencil className="size-4 text-tinta-fraca" />
    </button>
  );
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="flex-1 text-sm text-tinta-suave">Quem ocupa o espaço. <b>Parceiros</b> recebem a cobrança mensal; <b>operações internas</b> só entram no rateio. Para registrar a saída, informe a data de saída: o histórico fica.</p>
        <Button onClick={() => { setError(null); setEdit({ id: null, f: blankCenter(today) }); }}><Plus /> Novo parceiro ou operação</Button>
      </div>
      <Card className="divide-y divide-borda">{activeRows.length ? activeRows.map(row) : <p className="p-4 text-sm text-tinta-suave">Nenhum centro de custo ativo. Importe a planilha ou cadastre o primeiro.</p>}</Card>
      {former.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-bold text-tinta-suave">Saíram ({former.length})</summary>
          <Card className="mt-2 divide-y divide-borda opacity-80">{former.map(row)}</Card>
        </details>
      )}
      {edit && (
        <Sheet title={edit.id ? 'Editar centro de custo' : 'Novo centro de custo'} onClose={() => setEdit(null)} onSubmit={(e) => { e.preventDefault(); save(); }}
          footer={<><Button type="submit" disabled={pending}>{pending ? 'Salvando…' : 'Salvar'}</Button><Button type="button" variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button></>}>
          <FormMessage error={error} />
          <div className="grid grid-cols-2 gap-2">
            {(['PARTNER', 'INTERNAL'] as const).map((k) => (
              <button key={k} type="button" onClick={() => set({ kind: k })} className={cn('rounded-lg border p-3 text-left text-sm', edit.f.kind === k ? 'border-nacao bg-nacao/5 ring-1 ring-nacao' : 'border-borda')}>
                <b className="block text-navy">{k === 'PARTNER' ? 'Parceiro' : 'Operação interna'}</b>
                <span className="text-xs text-tinta-suave">{k === 'PARTNER' ? 'Recebe a cobrança mensal' : 'Só entra no rateio'}</span>
              </button>
            ))}
          </div>
          <div><Label htmlFor="c-name">Nome (como aparece no rateio)</Label><Input id="c-name" required maxLength={60} value={edit.f.name} onChange={(e) => set({ name: e.target.value })} /></div>
          {edit.f.kind === 'PARTNER' && <div><Label htmlFor="c-display">Nome no documento de cobrança (opcional)</Label><Input id="c-display" maxLength={80} placeholder="Ex.: Futebol Society" value={edit.f.displayName} onChange={(e) => set({ displayName: e.target.value })} /></div>}
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="c-area">Área ocupada (m²)</Label><Input id="c-area" inputMode="decimal" value={edit.f.areaM2} onChange={(e) => set({ areaM2: e.target.value.replace(',', '.') })} /></div>
            <div><Label htmlFor="c-iptu">Paga do IPTU da área (%)</Label><Input id="c-iptu" inputMode="decimal" value={edit.f.iptuSharePct} onChange={(e) => set({ iptuSharePct: e.target.value.replace(',', '.') })} /></div>
          </div>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 accent-[#0169E9]" checked={edit.f.chargesCondo} onChange={(e) => set({ chargesCondo: e.target.checked })} /> <span>Participa do rateio do condomínio <span className="block text-xs text-tinta-suave">Desmarque para quem só paga energia/IPTU.</span></span></label>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 accent-[#0169E9]" checked={edit.f.isSnackBar} onChange={(e) => set({ isSnackBar: e.target.checked })} /> <span>É a Lanchonete <span className="block text-xs text-tinta-suave">Assume o percentual fixo do total (30%), fora da divisão por alunos.</span></span></label>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="c-from">Entrada</Label><Input id="c-from" type="date" required value={edit.f.activeFrom} onChange={(e) => set({ activeFrom: e.target.value })} /></div>
            <div><Label htmlFor="c-to">Saída (opcional)</Label><Input id="c-to" type="date" value={edit.f.activeTo} onChange={(e) => set({ activeTo: e.target.value })} /></div>
          </div>
          {edit.f.kind === 'PARTNER' && (
            <fieldset className="space-y-3 rounded-lg border border-borda p-3">
              <legend className="px-1 text-xs font-bold uppercase tracking-wide text-tinta-suave">Responsável pelo pagamento</legend>
              <div><Label htmlFor="c-legal">Razão social</Label><Input id="c-legal" maxLength={120} value={edit.f.legalName} onChange={(e) => set({ legalName: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label htmlFor="c-doc">CNPJ/CPF</Label><Input id="c-doc" maxLength={30} value={edit.f.document} onChange={(e) => set({ document: e.target.value })} /></div>
                <div><Label htmlFor="c-cname">Contato</Label><Input id="c-cname" maxLength={80} value={edit.f.contactName} onChange={(e) => set({ contactName: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label htmlFor="c-phone">WhatsApp</Label><Input id="c-phone" inputMode="tel" maxLength={30} placeholder="(61) 9…" value={edit.f.contactPhone} onChange={(e) => set({ contactPhone: e.target.value })} /></div>
                <div><Label htmlFor="c-mail">E-mail</Label><Input id="c-mail" type="email" maxLength={120} value={edit.f.contactEmail} onChange={(e) => set({ contactEmail: e.target.value })} /></div>
              </div>
            </fieldset>
          )}
        </Sheet>
      )}
    </>
  );
}

// ── Relógios ───────────────────────────────────────────────

function Meters({ centers, today }: { centers: CondoCenterView[]; today: string }) {
  const router = useRouter();
  const [edit, setEdit] = useState<{ id: string | null; centerId: string; name: string; installReading: string; activeFrom: string; activeTo: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const partners = centers.filter((c) => isActive(c, today));
  const save = () => start(async () => {
    setError(null);
    const r = await saveMeterAction(edit!.id, edit!);
    if (!r.ok) return setError(r.error);
    setEdit(null);
    router.refresh();
  });
  const meters = partners.flatMap((c) => c.meters.map((m) => ({ ...m, center: c })));
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="flex-1 text-sm text-tinta-suave">Um relógio (submedidor) por espaço. Todo mês você lança a leitura acumulada; o sistema cobra a diferença × tarifa × bandeira. O relógio novo começa da <b>leitura de instalação</b> (ela não é cobrada).</p>
        <Button onClick={() => { setError(null); setEdit({ id: null, centerId: partners[0]?.id ?? '', name: '', installReading: '0', activeFrom: today, activeTo: '' }); }} disabled={!partners.length}><Plus /> Novo relógio</Button>
      </div>
      <Card className="divide-y divide-borda">
        {meters.length ? meters.map((m) => (
          <button key={m.id} onClick={() => { setError(null); setEdit({ id: m.id, centerId: m.center.id, name: m.name, installReading: String(m.installReading), activeFrom: m.activeFrom, activeTo: m.activeTo ?? '' }); }}
            className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 p-3 text-left text-sm hover:bg-fundo">
            <Gauge className="size-4 text-nacao" />
            <span className="font-bold text-navy">{m.name}</span>
            <span className="text-tinta-suave">{m.center.displayName || m.center.name}</span>
            <span className="flex-1" />
            <span className="text-xs tabular-nums text-tinta-suave">{m.last ? `última leitura ${m.last.reading.toLocaleString('pt-BR')} kWh em ${monthLabel(m.last.month as Month)}` : `instalação ${m.installReading.toLocaleString('pt-BR')} kWh`}</span>
            {m.activeTo && <Badge tone="neutral">desligado em {formatDateBR(m.activeTo)}</Badge>}
            <Pencil className="size-4 text-tinta-fraca" />
          </button>
        )) : <p className="p-4 text-sm text-tinta-suave">Nenhum relógio cadastrado.</p>}
      </Card>
      {edit && (
        <Sheet title={edit.id ? 'Editar relógio' : 'Novo relógio'} onClose={() => setEdit(null)} onSubmit={(e) => { e.preventDefault(); save(); }}
          footer={<><Button type="submit" disabled={pending}>{pending ? 'Salvando…' : 'Salvar'}</Button><Button type="button" variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button></>}>
          <FormMessage error={error} />
          <div><Label htmlFor="m-center">Centro de custo</Label>
            <Select id="m-center" value={edit.centerId} onChange={(e) => setEdit({ ...edit, centerId: e.target.value })}>{partners.map((c) => <option key={c.id} value={c.id}>{c.displayName || c.name}</option>)}</Select></div>
          <div><Label htmlFor="m-name">Nome do relógio</Label><Input id="m-name" required maxLength={60} placeholder="Ex.: Sala do Pilates" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
          <div><Label htmlFor="m-install">Leitura de instalação (kWh)</Label><Input id="m-install" inputMode="decimal" value={edit.installReading} onChange={(e) => setEdit({ ...edit, installReading: e.target.value.replace(',', '.') })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="m-from">Instalado em</Label><Input id="m-from" type="date" required value={edit.activeFrom} onChange={(e) => setEdit({ ...edit, activeFrom: e.target.value })} /></div>
            <div><Label htmlFor="m-to">Desligado em (opcional)</Label><Input id="m-to" type="date" value={edit.activeTo} onChange={(e) => setEdit({ ...edit, activeTo: e.target.value })} /></div>
          </div>
        </Sheet>
      )}
    </>
  );
}

// ── Itens fixos ────────────────────────────────────────────

type ItemForm = { id: string | null; centerId: string; description: string; mode: 'FIXO' | 'QTD'; amountCents: number | null; unitCents: number | null; defaultQty: string; activeFrom: string; activeTo: string };
function Items({ centers, today }: { centers: CondoCenterView[]; today: string }) {
  const router = useRouter();
  const [edit, setEdit] = useState<ItemForm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const partners = centers.filter((c) => c.kind === 'PARTNER' && isActive(c, today));
  const save = () => start(async () => {
    setError(null);
    const f = edit!;
    const r = await saveItemAction(f.id, {
      centerId: f.centerId, description: f.description, activeFrom: f.activeFrom, activeTo: f.activeTo,
      amountCents: f.mode === 'FIXO' ? f.amountCents ?? 0 : 0, unitCents: f.mode === 'QTD' ? f.unitCents ?? 0 : null, defaultQty: f.mode === 'QTD' ? Number(f.defaultQty.replace(',', '.')) || 0 : null,
    });
    if (!r.ok) return setError(r.error);
    setEdit(null);
    router.refresh();
  });
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="flex-1 text-sm text-tinta-suave">Valores que entram todo mês na cobrança do parceiro, além de energia, condomínio e IPTU. Ex.: aluguel da sala (valor fixo) ou check-in no Funcional (quantidade × valor; a quantidade se ajusta no mês).</p>
        <Button disabled={!partners.length} onClick={() => { setError(null); setEdit({ id: null, centerId: partners[0]?.id ?? '', description: '', mode: 'FIXO', amountCents: 0, unitCents: null, defaultQty: '0', activeFrom: today, activeTo: '' }); }}><Plus /> Novo item</Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {partners.map((c) => (
          <Card key={c.id} className="p-4">
            <h3 className="mb-2 font-extrabold text-navy">{c.displayName || c.name}</h3>
            {c.items.length === 0 ? <p className="text-sm text-tinta-suave">Só energia, condomínio e IPTU.</p> : (
              <ul className="divide-y divide-borda text-sm">
                {c.items.map((i) => (
                  <li key={i.id} className="flex items-center gap-2 py-2">
                    <span className="flex-1">{i.description}{i.activeTo && <span className="ml-1 text-xs text-tinta-suave">(até {formatDateBR(i.activeTo)})</span>}</span>
                    <span className="tabular-nums text-tinta">{i.unitCents !== null ? `${i.defaultQty ?? 0} × ${formatBRL(i.unitCents)}` : formatBRL(i.amountCents)}</span>
                    <Button variant="ghost" size="sm" aria-label="Editar" onClick={() => { setError(null); setEdit({ id: i.id, centerId: c.id, description: i.description, mode: i.unitCents !== null ? 'QTD' : 'FIXO', amountCents: i.amountCents, unitCents: i.unitCents, defaultQty: String(i.defaultQty ?? 0), activeFrom: i.activeFrom, activeTo: i.activeTo ?? '' }); }}><Pencil /></Button>
                    <Button variant="ghost" size="sm" aria-label="Excluir" className="text-critico" onClick={() => { if (confirm(`Excluir "${i.description}"? As competências já fechadas não mudam.`)) start(async () => { await deleteItemAction(i.id); router.refresh(); }); }}><Trash2 /></Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>
      {edit && (
        <Sheet title={edit.id ? 'Editar item fixo' : 'Novo item fixo'} onClose={() => setEdit(null)} onSubmit={(e) => { e.preventDefault(); save(); }}
          footer={<><Button type="submit" disabled={pending}>{pending ? 'Salvando…' : 'Salvar'}</Button><Button type="button" variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button></>}>
          <FormMessage error={error} />
          <div><Label htmlFor="i-center">Parceiro</Label><Select id="i-center" value={edit.centerId} onChange={(e) => setEdit({ ...edit, centerId: e.target.value })}>{partners.map((c) => <option key={c.id} value={c.id}>{c.displayName || c.name}</option>)}</Select></div>
          <div><Label htmlFor="i-desc">Descrição</Label><Input id="i-desc" required maxLength={80} placeholder="Ex.: Aluguel da Sala" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-2">
            {(['FIXO', 'QTD'] as const).map((k) => (
              <button key={k} type="button" onClick={() => setEdit({ ...edit, mode: k })} className={cn('rounded-lg border p-2 text-sm font-semibold', edit.mode === k ? 'border-nacao bg-nacao/5 text-navy ring-1 ring-nacao' : 'border-borda text-tinta-suave')}>
                {k === 'FIXO' ? 'Valor fixo' : 'Quantidade × valor'}
              </button>
            ))}
          </div>
          {edit.mode === 'FIXO'
            ? <div><Label htmlFor="i-amount">Valor (R$)</Label><MoneyInput id="i-amount" value={edit.amountCents} onChange={(v) => setEdit({ ...edit, amountCents: v })} /></div>
            : <div className="grid grid-cols-2 gap-3">
                <div><Label htmlFor="i-unit">Valor unitário (R$)</Label><MoneyInput id="i-unit" value={edit.unitCents} onChange={(v) => setEdit({ ...edit, unitCents: v })} /></div>
                <div><Label htmlFor="i-qty">Quantidade inicial</Label><Input id="i-qty" inputMode="decimal" value={edit.defaultQty} onChange={(e) => setEdit({ ...edit, defaultQty: e.target.value })} /></div>
              </div>}
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="i-from">A partir de</Label><Input id="i-from" type="date" required value={edit.activeFrom} onChange={(e) => setEdit({ ...edit, activeFrom: e.target.value })} /></div>
            <div><Label htmlFor="i-to">Até (opcional)</Label><Input id="i-to" type="date" value={edit.activeTo} onChange={(e) => setEdit({ ...edit, activeTo: e.target.value })} /></div>
          </div>
        </Sheet>
      )}
    </>
  );
}

// ── IPTU ───────────────────────────────────────────────────

function IptuTab({ rows, centers, today }: { rows: Iptu[]; centers: CondoCenterView[]; today: string }) {
  const router = useRouter();
  const year = Number(today.slice(0, 4));
  const cur = rows.find((r) => r.year === year) ?? rows[0];
  const [f, setF] = useState({ year: cur?.year ?? year, totalCents: cur?.totalCents ?? 0 as number | null, totalAreaM2: String(cur?.totalAreaM2 ?? 10000), firstMonth: cur?.firstMonth ?? 5, parcels: cur?.parcels ?? 6 });
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [pending, start] = useTransition();
  const active = centers.filter((c) => isActive(c, today) && c.areaM2 > 0);
  const area = Number(f.totalAreaM2.replace(',', '.')) || 0;
  const common = commonArea({ totalAreaM2: area }, active.map((c) => c.areaM2));
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
      <Card className="p-4">
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await saveIptuAction({ ...f, totalAreaM2: area, totalCents: f.totalCents ?? 0 }); setMsg(r.ok ? { ok: r.message } : { error: r.error }); if (r.ok) router.refresh(); }); }}>
          <h3 className="font-extrabold text-navy">IPTU do ano</h3>
          <FormMessage error={msg.error} success={msg.ok} />
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="ip-year">Ano</Label><Input id="ip-year" type="number" value={f.year} onChange={(e) => setF({ ...f, year: Number(e.target.value) })} /></div>
            <div><Label htmlFor="ip-total">Valor total (R$)</Label><MoneyInput id="ip-total" value={f.totalCents} onChange={(v) => setF({ ...f, totalCents: v })} /></div>
          </div>
          <div><Label htmlFor="ip-area">Área total do lote (m²)</Label><Input id="ip-area" inputMode="decimal" value={f.totalAreaM2} onChange={(e) => setF({ ...f, totalAreaM2: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="ip-first">1ª parcela em</Label><Select id="ip-first" value={f.firstMonth} onChange={(e) => setF({ ...f, firstMonth: Number(e.target.value) })}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</Select></div>
            <div><Label htmlFor="ip-parcels">Nº de parcelas</Label><Input id="ip-parcels" type="number" min={1} max={12} value={f.parcels} onChange={(e) => setF({ ...f, parcels: Number(e.target.value) })} /></div>
          </div>
          <p className="text-xs text-tinta-suave">Cobra de {MONTHS[f.firstMonth - 1]} a {MONTHS[Math.min(11, f.firstMonth + f.parcels - 2)]} (competência), com a linha “IPTU n de {f.parcels}”.</p>
          <Button type="submit" disabled={pending}>{pending ? 'Salvando…' : 'Salvar IPTU'}</Button>
        </form>
        {rows.length > 1 && <p className="mt-3 text-xs text-tinta-suave">Anos lançados: {rows.map((r) => r.year).join(', ')}.</p>}
      </Card>
      <Card className="overflow-x-auto p-4">
        <h3 className="mb-2 font-extrabold text-navy">Cota de cada um ({f.year})</h3>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-tinta-suave"><tr><th className="py-1">Centro de custo</th><th className="text-right">Área</th><th className="text-right">Cota</th><th className="text-right">Parcela</th></tr></thead>
          <tbody className="divide-y divide-borda tabular-nums">
            {active.map((c) => {
              const parcel = area && f.parcels ? Math.round(((f.totalCents ?? 0) * c.areaM2 * c.iptuSharePct) / (area * f.parcels * 100)) : 0;
              return (
                <tr key={c.id}>
                  <td className="py-1.5">{c.displayName || c.name}{c.iptuSharePct !== 100 && <span className="ml-1 text-xs text-tinta-suave">(paga {m2(c.iptuSharePct)}%)</span>}{c.kind === 'INTERNAL' && <span className="ml-1 text-xs text-tinta-suave">· interna</span>}</td>
                  <td className="text-right">{m2(c.areaM2)} m²</td>
                  <td className="text-right">{area ? ((c.areaM2 / area) * 100).toFixed(2).replace('.', ',') : '0'}%</td>
                  <td className="text-right font-semibold">{formatBRL(parcel)}</td>
                </tr>
              );
            })}
            <tr className="text-tinta-suave"><td className="py-1.5">Área comum (a Nação absorve)</td><td className="text-right">{m2(common)} m²</td><td className="text-right">{area ? ((common / area) * 100).toFixed(2).replace('.', ',') : '0'}%</td><td /></tr>
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// ── Recebimento ────────────────────────────────────────────

function Settings({ s }: { s: CondoSettingsView }) {
  const router = useRouter();
  const [f, setF] = useState({ ...s, pixKey: s.pixKey ?? '', bankInfo: s.bankInfo ?? '', instructions: s.instructions ?? '', flagFactors: Object.fromEntries(Object.entries(s.flagFactors).map(([k, v]) => [k, String(v).replace('.', ',')])) as Record<Flag, string> });
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [pending, start] = useTransition();
  return (
    <Card className="max-w-3xl p-4">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); start(async () => {
        const r = await saveSettingsAction({ ...f, flagFactors: Object.fromEntries(Object.entries(f.flagFactors).map(([k, v]) => [k, Number(String(v).replace(',', '.'))])) });
        setMsg(r.ok ? { ok: r.message } : { error: r.error }); if (r.ok) router.refresh();
      }); }}>
        <FormMessage error={msg.error} success={msg.ok} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label htmlFor="s-name">Recebedor (razão social)</Label><Input id="s-name" required value={f.payeeName} onChange={(e) => setF({ ...f, payeeName: e.target.value })} /></div>
          <div><Label htmlFor="s-doc">CNPJ</Label><Input id="s-doc" required value={f.payeeDocument} onChange={(e) => setF({ ...f, payeeDocument: e.target.value })} /></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
          <div><Label htmlFor="s-pix">Chave PIX</Label><Input id="s-pix" placeholder="CNPJ, e-mail, telefone ou chave aleatória" value={f.pixKey} onChange={(e) => setF({ ...f, pixKey: e.target.value })} />
            <p className="mt-1 text-xs text-tinta-suave">Com a chave, o documento de cobrança sai com o QR Code PIX “copia e cola” já com o valor.</p></div>
          <div><Label htmlFor="s-city">Cidade (PIX)</Label><Input id="s-city" value={f.pixCity} onChange={(e) => setF({ ...f, pixCity: e.target.value })} /></div>
        </div>
        <div><Label htmlFor="s-bank">Dados bancários (opcional)</Label><textarea id="s-bank" rows={2} maxLength={300} className="w-full rounded-lg border border-borda p-2 text-sm" placeholder="Banco · agência · conta" value={f.bankInfo} onChange={(e) => setF({ ...f, bankInfo: e.target.value })} /></div>
        <div><Label htmlFor="s-inst">Instruções no documento (opcional)</Label><textarea id="s-inst" rows={2} maxLength={300} className="w-full rounded-lg border border-borda p-2 text-sm" placeholder="Ex.: envie o comprovante para financeiro@…" value={f.instructions} onChange={(e) => setF({ ...f, instructions: e.target.value })} /></div>
        <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
          <div><Label htmlFor="s-due">Vencimento (dia do mês seguinte)</Label><Input id="s-due" type="number" min={1} max={28} value={f.dueDay} onChange={(e) => setF({ ...f, dueDay: Number(e.target.value) })} /></div>
          <div>
            <Label>Fator de cada bandeira tarifária</Label>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {FLAGS.map((fl) => (
                <label key={fl.id} className="text-xs text-tinta-suave">{fl.label}
                  <Input inputMode="decimal" className="mt-1" value={f.flagFactors[fl.id]} onChange={(e) => setF({ ...f, flagFactors: { ...f.flagFactors, [fl.id]: e.target.value } })} />
                </label>
              ))}
            </div>
          </div>
        </div>
        <Button type="submit" disabled={pending}>{pending ? 'Salvando…' : 'Salvar'}</Button>
      </form>
    </Card>
  );
}

// ── Importar planilha ──────────────────────────────────────

function ImportTab({ empty }: { empty: boolean }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [a, setA] = useState<CondoImportAnalysis | null>(null);
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [pending, start] = useTransition();
  const form = () => { const fd = new FormData(); fd.set('file', file!); return fd; };
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h3 className="font-extrabold text-navy">Importar a planilha “Condomínio Nação Club” (uma vez)</h3>
        <p className="mt-1 text-sm text-tinta-suave">
          No Google Sheets: <b>Arquivo → Fazer download → Microsoft Excel (.xlsx)</b>. O sistema lê as abas <b>ENERGIA</b>, <b>IPTU</b> e as abas mensais
          (“Agosto 26”, “Julho 26”…): cadastra parceiros, áreas, relógios com todas as leituras, IPTU e itens fixos, e traz cada mês como competência fechada,
          com as cobranças como foram feitas. Os dados ficam só no sistema.
        </p>
        {!empty && <p className="mt-2 flex items-center gap-1 text-sm font-semibold text-atencao"><TriangleAlert className="size-4" /> O Condomínio já tem dados: a importação só funciona com tudo vazio.</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Input type="file" accept=".xlsx" className="max-w-sm" aria-label="Planilha .xlsx" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setA(null); setMsg({}); }} />
          <Button disabled={!file || pending} onClick={() => start(async () => { setMsg({}); const r = await analyzeImportAction(form()); if (!r.ok) return setMsg({ error: r.error }); setA(r.data); })}>
            <FileSpreadsheet /> {pending && !a ? 'Lendo…' : 'Ler planilha'}
          </Button>
        </div>
        <FormMessage error={msg.error} success={msg.ok} />
      </Card>
      {a && (
        <Card className="space-y-4 p-4 text-sm">
          <div>
            <h3 className="font-extrabold text-navy">Conferência de {monthLabel(a.check.month as Month)}</h3>
            <p className="text-tinta-suave">O sistema recalculou o último mês com as regras dele e comparou com o que a planilha cobrou:</p>
            <ul className="mt-2 grid gap-1 sm:grid-cols-2">
              {a.check.rows.map((r) => (
                <li key={r.name} className="flex items-center gap-2">
                  {r.ok ? <CheckCircle2 className="size-4 text-sucesso" /> : <TriangleAlert className="size-4 text-atencao" />}
                  <span className="flex-1">{r.name}</span>
                  <span className="tabular-nums">{formatBRL(r.billedCents)}</span>
                  {!r.ok && <span className="text-xs text-atencao">sistema: {r.computedCents === null ? '—' : formatBRL(r.computedCents)}</span>}
                </li>
              ))}
            </ul>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div><b className="text-navy">Parceiros ({a.partners.length})</b><p className="text-tinta-suave">{a.partners.join(', ')}</p></div>
            <div><b className="text-navy">Operações internas ({a.internal.length})</b><p className="text-tinta-suave">{a.internal.join(', ')}</p></div>
            {a.former.length > 0 && <div><b className="text-navy">Já saíram ({a.former.length})</b><p className="text-tinta-suave">{a.former.join(', ')}</p></div>}
          </div>
          <div><b className="text-navy">Relógios</b><p className="text-tinta-suave">{a.meters.map((m) => `${m.name} (${m.readings} leituras${m.estimated.length ? `; estimadas: ${m.estimated.map((x) => monthLabel(x as Month)).join(', ')}` : ''})`).join(' · ')}</p></div>
          {a.iptu && <div><b className="text-navy">IPTU {a.iptu.year}</b><p className="text-tinta-suave">{formatBRL(a.iptu.totalCents)} sobre {m2(a.iptu.totalAreaM2)} m², {a.iptu.parcels} parcelas a partir de {MONTHS[a.iptu.firstMonth - 1]}.</p></div>}
          <div><b className="text-navy">Competências ({a.months.length})</b>
            <div className="mt-1 flex flex-wrap gap-1">{a.months.map((m) => <Badge key={m.month} tone="neutral" title={`${m.tab}: despesas ${formatBRL(m.expensesCents)}, ${m.charges} cobrança(s) ${formatBRL(m.chargesCents)}`}>{monthLabel(m.month as Month)}</Badge>)}</div>
          </div>
          {a.warnings.length > 0 && <div><b className="text-atencao">Avisos</b><ul className="list-disc pl-5 text-tinta-suave">{a.warnings.map((w) => <li key={w}>{w}</li>)}</ul></div>}
          <Button disabled={pending || a.alreadyImported} onClick={() => start(async () => {
            const r = await commitImportAction(form());
            if (!r.ok) return setMsg({ error: r.error });
            setMsg({ ok: `Importado: ${r.data.periods} competências até ${monthLabel(r.data.latest as Month)}.` });
            router.push('/condominio/competencias');
          })}>{pending ? 'Importando…' : 'Confirmar importação'}</Button>
        </Card>
      )}
    </div>
  );
}
