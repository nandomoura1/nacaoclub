'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Check, CheckCircle2, CircleAlert, FileDown, Lock, LockOpen, MessageCircle, Plus, Save, Trash2, TriangleAlert, Undo2,
} from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Input, Label, Select } from '@/components/ui/input';
import { formatDateBR } from '@/domain/dates';
import { FLAGS, type Flag } from '@/domain/condominio/energy';
import { formatBRL, formatPct } from '@/domain/condominio/money';
import { monthLabel, monthLong } from '@/domain/condominio/months';
import { computePeriod, type Billing, type PeriodInput } from '@/domain/condominio/period';
import { chargeWhatsapp, waPhone } from '@/domain/condominio/whatsapp';
import { cn } from '@/lib/cn';
import type { CondoPeriodView } from '@/server/services/condo-period-service';
import type { CondoSettingsView } from '@/server/services/condo-service';
import { MoneyInput } from '../../_components/MoneyInput';
import { closePeriodAction, markChargeAction, reopenPeriodAction, savePeriodAction } from '../../actions';

type Expense = { key: string; group: string; description: string; amountCents: number; kind: 'FIXED' | 'VARIABLE'; confirmed: boolean; memo: string | null };
type Reading = { reading: number | null; estimated: boolean; isReset: boolean; oldFinal: number | null; baseline: number | null };
type Item = { key: string; centerId: string; recurringItemId: string | null; description: string; qty: number | null; unitCents: number | null; amountCents: number; adhoc: boolean };
const STEPS = [
  { id: 'despesas', label: '1 · Despesas' },
  { id: 'energia', label: '2 · Energia' },
  { id: 'rateio', label: '3 · Rateio' },
  { id: 'cobrancas', label: '4 · Cobranças' },
] as const;
type Step = (typeof STEPS)[number]['id'];
let seq = 0;
const key = () => `k${++seq}`;
const num = (s: string) => { const n = Number(s.replace(/\./g, '').replace(',', '.')); return s.trim() === '' || !Number.isFinite(n) ? null : n; };
const kwh = (n: number | null) => (n === null ? '—' : n.toLocaleString('pt-BR', { maximumFractionDigits: 1 }));

export function PeriodClient({ p, settings, canEdit, canClose, canPay }: { p: CondoPeriodView; settings: CondoSettingsView; canEdit: boolean; canClose: boolean; canPay: boolean }) {
  const router = useRouter();
  const closed = p.status === 'CLOSED';
  const readOnly = closed || !canEdit;
  const [step, setStep] = useState<Step>(closed ? 'cobrancas' : 'despesas');
  const [head, setHead] = useState({ dueDate: p.dueDate, tariff: String(p.tariff).replace('.', ','), flag: p.flag, flagFactor: String(p.flagFactor).replace('.', ','), snackBarPct: String(p.snackBarPct).replace('.', ','), notes: p.notes ?? '' });
  const [expenses, setExpenses] = useState<Expense[]>(p.expenses.map((e) => ({ ...e, key: key() })));
  const [heads, setHeads] = useState<Record<string, { headcount: number; billing: Billing }>>(Object.fromEntries(p.centers.map((c) => [c.id, { headcount: c.headcount, billing: c.billing }])));
  const [readings, setReadings] = useState<Record<string, Reading>>(Object.fromEntries(p.meters.map((m) => [m.id, { reading: m.current, estimated: m.estimated, isReset: !!m.reset, oldFinal: m.reset?.oldFinal ?? null, baseline: m.reset?.baseline ?? null }])));
  const [items, setItems] = useState<Item[]>(p.items.map((i) => ({ ...i, key: key() })));
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [pending, start] = useTransition();
  const touch = () => { setDirty(true); setMsg({}); };

  // Motor ao vivo (o mesmo do servidor). Fechada: o resultado congelado.
  const input: PeriodInput = useMemo(() => ({
    month: p.month, tariff: num(head.tariff) ?? 0, flagFactor: num(head.flagFactor) ?? 1, snackBarPct: num(head.snackBarPct) ?? 30,
    expenses: expenses.map((e) => ({ amountCents: e.amountCents, confirmed: e.confirmed, description: e.description })),
    centers: p.centers.map((c) => ({ ...c, headcount: heads[c.id]?.headcount ?? 0, billing: heads[c.id]?.billing ?? 'FULL' })),
    meters: p.meters.map((m) => {
      const r = readings[m.id]!;
      return { ...m, current: r.reading, estimated: r.estimated, reset: r.isReset ? { oldFinal: r.oldFinal, baseline: r.baseline ?? 0 } : null };
    }),
    iptu: p.iptu,
    items: items.map((i) => ({ id: i.key, centerId: i.centerId, description: i.description, qty: i.qty, unitCents: i.unitCents, amountCents: i.amountCents, adhoc: i.adhoc })),
  }), [p, head, expenses, heads, readings, items]);
  const live = useMemo(() => computePeriod(input), [input]);
  const r = closed ? p.result : live;

  const payload = () => ({
    dueDate: head.dueDate, tariff: num(head.tariff), flag: head.flag, flagFactor: num(head.flagFactor), snackBarPct: num(head.snackBarPct), notes: head.notes,
    expenses: expenses.map(({ key: _k, ...e }) => e),
    centers: Object.entries(heads).map(([centerId, v]) => ({ centerId, ...v })),
    readings: Object.entries(readings).map(([meterId, v]) => ({ meterId, ...v })),
    items: items.map(({ key: _k, ...i }) => i),
  });
  const save = (then?: () => void) => start(async () => {
    const res = await savePeriodAction(p.month, payload());
    if (!res.ok) return setMsg({ error: res.error });
    setDirty(false);
    if (then) return then();
    setMsg({ ok: 'Competência salva.' });
    router.refresh();
  });
  const close = () => {
    if (live.issues.length) return setMsg({ error: `Ainda não dá para fechar: ${live.issues.join(' ')}` });
    const total = live.charges.reduce((s, c) => s + c.totalCents, 0);
    if (!confirm(`Fechar ${monthLabel(p.month)}? Gera ${live.charges.length} cobrança(s), total ${formatBRL(total)}, com vencimento em ${formatDateBR(head.dueDate)}. Depois de fechada, a competência fica congelada.`)) return;
    save(async () => {
      const res = await closePeriodAction(p.month);
      if (!res.ok) return setMsg({ error: res.error });
      setMsg({ ok: `Competência fechada: ${res.data.charges} cobrança(s), ${formatBRL(res.data.totalCents)}.` });
      setStep('cobrancas');
      router.refresh();
    });
  };
  const reopen = () => {
    if (!confirm(`Reabrir ${monthLabel(p.month)}? As cobranças voltam a ser recalculadas até fechar de novo (o nº e o status de pagamento ficam).`)) return;
    start(async () => { const res = await reopenPeriodAction(p.month); if (!res.ok) return setMsg({ error: res.error }); setMsg({ ok: 'Competência reaberta.' }); router.refresh(); });
  };

  const groups = [...new Set(expenses.map((e) => e.group))];
  const setExp = (k: string, patch: Partial<Expense>) => { setExpenses((all) => all.map((e) => (e.key === k ? { ...e, ...patch } : e))); touch(); };
  const toConfirm = expenses.filter((e) => !e.confirmed).length;
  const centerName = (id: string) => p.centers.find((c) => c.id === id)?.displayName ?? '';
  const partners = p.centers.filter((c) => c.kind === 'PARTNER');

  return (
    <>
      <Link href="/condominio/competencias" className="mb-3 inline-flex items-center gap-1 text-sm text-tinta-suave hover:text-nacao"><ArrowLeft className="size-4" /> Competências</Link>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <h1 className="text-2xl font-extrabold text-navy">Condomínio · {monthLabel(p.month)}</h1>
          <p className="text-sm text-tinta-suave">
            Gastos de {monthLong(p.month)}, cobrados com vencimento em <b>{formatDateBR(head.dueDate)}</b>.
            {p.imported && ' Importada da planilha: as cobranças estão como foram feitas na época.'}
          </p>
        </div>
        {closed ? <Badge tone="green"><Lock className="size-3" /> Fechada{p.closedAt ? ` em ${formatDateBR(p.closedAt.slice(0, 10))}` : ''}</Badge> : <Badge tone="amber">Em lançamento</Badge>}
      </div>

      {(p.changes.entered.length > 0 || p.changes.left.length > 0) && (
        <Card className="mb-3 border-nacao/30 bg-nacao/5 p-3 text-sm">
          {p.changes.entered.length > 0 && <p><b className="text-navy">Entraram</b> desde {p.changes.previous ? monthLabel(p.changes.previous) : 'o mês anterior'}: {p.changes.entered.join(', ')}.</p>}
          {p.changes.left.length > 0 && <p><b className="text-navy">Saíram</b>: {p.changes.left.join(', ')} (não aparecem nesta competência).</p>}
        </Card>
      )}

      {/* Barra de ações */}
      <Card className="z-20 mb-3 flex flex-wrap items-center gap-2 p-3 lg:sticky lg:top-2">
        {!readOnly && <Button onClick={() => save()} disabled={pending || !dirty}><Save /> {pending ? 'Salvando…' : dirty ? 'Salvar' : 'Salvo'}</Button>}
        {!closed && canClose && <Button variant="secondary" onClick={close} disabled={pending || !canEdit}><Lock /> Fechar competência</Button>}
        {closed && canClose && !p.imported && <Button variant="ghost" onClick={reopen} disabled={pending}><LockOpen /> Reabrir</Button>}
        {closed && (
          <a href={`/condominio/competencias/${p.month}/pdf`} target="_blank" rel="noopener" className={buttonVariants({ variant: 'secondary' })}><FileDown /> Todos os PDFs</a>
        )}
        <div className="flex-1" />
        <span className="text-sm text-tinta-suave">Despesas <b className="tabular-nums text-navy">{formatBRL(r.totalCents)}</b> · Cobranças <b className="tabular-nums text-navy">{formatBRL(r.charges.reduce((s, c) => s + c.totalCents, 0))}</b></span>
      </Card>
      <FormMessage error={msg.error} success={msg.ok} />

      {!closed && (live.issues.length > 0 || live.warnings.length > 0) && (
        <Card className="mb-3 space-y-1 p-3 text-sm">
          {live.issues.map((i) => <p key={i} className="flex gap-2 text-critico"><TriangleAlert className="mt-0.5 size-4 shrink-0" /> {i}</p>)}
          {live.warnings.map((w) => <p key={w} className="flex gap-2 text-atencao"><CircleAlert className="mt-0.5 size-4 shrink-0" /> {w}</p>)}
        </Card>
      )}

      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        {STEPS.map((s) => (
          <button key={s.id} onClick={() => setStep(s.id)} className={cn('shrink-0 rounded-full border px-4 py-2 text-sm font-bold', step === s.id ? 'border-navy bg-navy text-white' : 'border-borda text-tinta hover:bg-fundo')}>
            {s.label}{s.id === 'despesas' && toConfirm > 0 && !closed ? <span className="ml-1 rounded-full bg-atencao px-1.5 text-[10px] text-white">{toConfirm}</span> : null}
          </button>
        ))}
      </div>

      {step === 'despesas' && (
        <Card className="p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <p className="flex-1 text-tinta-suave">Despesas comuns do mês. <b>Fixas</b> vêm do mês anterior já confirmadas; <b>variáveis</b> vêm com o valor anterior e precisam ser confirmadas (ou corrigidas) antes de fechar.</p>
            {!readOnly && toConfirm > 0 && <Button variant="ghost" size="sm" onClick={() => { if (confirm(`Confirmar as ${toConfirm} despesas variáveis com os valores atuais?`)) { setExpenses((all) => all.map((e) => ({ ...e, confirmed: true }))); touch(); } }}><Check /> Confirmar as {toConfirm}</Button>}
          </div>
          <div className="space-y-4">
            {groups.map((g) => {
              const rows = expenses.filter((e) => e.group === g);
              return (
                <div key={g}>
                  <div className="mb-1 flex items-center gap-2">
                    <h3 className="flex-1 text-sm font-extrabold uppercase tracking-wide text-navy">{g}</h3>
                    <span className="text-sm font-semibold tabular-nums text-tinta">{formatBRL(rows.reduce((s, e) => s + e.amountCents, 0))}</span>
                  </div>
                  <div className="divide-y divide-borda rounded-lg border border-borda">
                    {rows.map((e) => (
                      <div key={e.key} className={cn('grid grid-cols-[1fr_8.5rem] items-center gap-2 p-2 sm:grid-cols-[1fr_auto_8.5rem_auto]', !e.confirmed && 'bg-atencao/5')}>
                        <div className="min-w-0">
                          {readOnly ? <span className="text-sm">{e.description}</span> : <Input className="h-8 text-sm" value={e.description} maxLength={80} onChange={(ev) => setExp(e.key, { description: ev.target.value })} aria-label="Descrição" />}
                          {(e.memo || !readOnly) && (
                            readOnly ? <p className="mt-0.5 text-xs text-tinta-suave">{e.memo}</p>
                              : <input className="mt-0.5 w-full bg-transparent text-xs text-tinta-suave outline-none placeholder:text-tinta-fraca" placeholder="memória de cálculo (opcional): 1.200 + 800…" value={e.memo ?? ''} maxLength={300} onChange={(ev) => setExp(e.key, { memo: ev.target.value || null })} aria-label="Memória de cálculo" />
                          )}
                        </div>
                        <div className="hidden items-center gap-1 sm:flex">
                          {readOnly ? <Badge tone="neutral">{e.kind === 'FIXED' ? 'fixa' : 'variável'}</Badge> : (
                            <Select className="h-8 w-28 text-xs" value={e.kind} onChange={(ev) => setExp(e.key, { kind: ev.target.value as Expense['kind'] })} aria-label="Tipo"><option value="FIXED">Fixa</option><option value="VARIABLE">Variável</option></Select>
                          )}
                        </div>
                        {readOnly ? <span className="text-right text-sm tabular-nums">{formatBRL(e.amountCents)}</span>
                          : <MoneyInput className="h-8" value={e.amountCents} aria-label="Valor" onChange={(v) => setExp(e.key, { amountCents: v ?? 0, confirmed: true })} />}
                        {!readOnly && (
                          <div className="col-span-2 flex items-center justify-end gap-1 sm:col-span-1">
                            {!e.confirmed
                              ? <Button size="sm" variant="secondary" onClick={() => setExp(e.key, { confirmed: true })} title="Confirmar o valor do mês"><Check /> Confirmar</Button>
                              : <CheckCircle2 className="size-4 text-sucesso" aria-label="Confirmada" />}
                            <Button size="sm" variant="ghost" className="text-critico" aria-label="Excluir" onClick={() => { setExpenses((all) => all.filter((x) => x.key !== e.key)); touch(); }}><Trash2 /></Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {!readOnly && <button className="mt-1 text-xs font-semibold text-nacao hover:underline" onClick={() => { setExpenses((all) => { const i = all.map((x) => x.group).lastIndexOf(g); const n = [...all]; n.splice(i + 1, 0, { key: key(), group: g, description: '', amountCents: 0, kind: 'VARIABLE', confirmed: true, memo: null }); return n; }); touch(); }}>+ despesa em {g}</button>}
                </div>
              );
            })}
          </div>
          {!readOnly && <Button variant="ghost" size="sm" className="mt-3" onClick={() => { const g = prompt('Nome do novo grupo (ex.: INVESTIMENTO):')?.trim().toUpperCase(); if (g) { setExpenses((all) => [...all, { key: key(), group: g, description: '', amountCents: 0, kind: 'VARIABLE', confirmed: true, memo: null }]); touch(); } }}><Plus /> Novo grupo</Button>}
          <div className="mt-4 flex items-center justify-between border-t-2 border-navy pt-2 text-base font-extrabold text-navy"><span>TOTAL (base do rateio)</span><span className="tabular-nums">{formatBRL(r.totalCents)}</span></div>
        </Card>
      )}

      {step === 'energia' && (
        <Card className="p-4">
          <div className="mb-3 grid gap-3 sm:grid-cols-4">
            <div><Label htmlFor="p-tariff">Tarifa (R$/kWh)</Label><Input id="p-tariff" inputMode="decimal" disabled={readOnly} value={head.tariff} onChange={(e) => { setHead({ ...head, tariff: e.target.value }); touch(); }} /></div>
            <div><Label htmlFor="p-flag">Bandeira</Label>
              <Select id="p-flag" disabled={readOnly} value={head.flag} onChange={(e) => { const f = e.target.value as Flag; setHead({ ...head, flag: f, flagFactor: String(settings.flagFactors[f]).replace('.', ',') }); touch(); }}>
                {FLAGS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </Select></div>
            <div><Label htmlFor="p-factor">Fator da bandeira</Label><Input id="p-factor" inputMode="decimal" disabled={readOnly} value={head.flagFactor} onChange={(e) => { setHead({ ...head, flagFactor: e.target.value }); touch(); }} /></div>
            <p className="self-end pb-2 text-xs text-tinta-suave">Valor = consumo × tarifa × fator.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs text-tinta-suave"><tr><th className="py-1">Relógio</th><th className="text-right">Anterior</th><th className="text-right">Leitura do mês</th><th className="text-right">Consumo</th><th className="text-right">Valor</th><th /></tr></thead>
              <tbody className="divide-y divide-borda align-top tabular-nums">
                {p.meters.map((m) => {
                  const rd = readings[m.id]!;
                  const e = r.energy.find((x) => x.meterId === m.id);
                  const set = (patch: Partial<Reading>) => { setReadings((all) => ({ ...all, [m.id]: { ...all[m.id]!, ...patch } })); touch(); };
                  return (
                    <tr key={m.id}>
                      <td className="py-2"><b className="text-navy">{m.name}</b><span className="block text-xs text-tinta-suave">{centerName(m.centerId)}</span></td>
                      <td className="py-2 text-right">{kwh(m.previous)}</td>
                      <td className="py-2 text-right">
                        {readOnly ? kwh(rd.reading) : <Input className="ml-auto h-8 w-32 text-right" inputMode="decimal" placeholder="kWh" value={rd.reading === null ? '' : String(rd.reading).replace('.', ',')} onChange={(ev) => set({ reading: num(ev.target.value) })} aria-label={`Leitura ${m.name}`} />}
                        {!readOnly && (
                          <div className="mt-1 flex flex-col items-end gap-0.5 text-xs text-tinta-suave">
                            <label className="flex items-center gap-1"><input type="checkbox" className="accent-[#0169E9]" checked={rd.estimated} onChange={(ev) => set({ estimated: ev.target.checked })} /> leitura estimada</label>
                            <label className="flex items-center gap-1"><input type="checkbox" className="accent-[#0169E9]" checked={rd.isReset} onChange={(ev) => set({ isReset: ev.target.checked })} /> troca/zeramento do relógio</label>
                          </div>
                        )}
                        {rd.isReset && !readOnly && (
                          <div className="mt-1 flex justify-end gap-2">
                            <Input className="h-8 w-28 text-right text-xs" inputMode="decimal" placeholder="última do antigo" value={rd.oldFinal ?? ''} onChange={(ev) => set({ oldFinal: num(ev.target.value) })} aria-label="Última leitura do relógio antigo" />
                            <Input className="h-8 w-28 text-right text-xs" inputMode="decimal" placeholder="inicial do novo" value={rd.baseline ?? ''} onChange={(ev) => set({ baseline: num(ev.target.value) })} aria-label="Leitura inicial do relógio novo" />
                          </div>
                        )}
                      </td>
                      <td className="py-2 text-right">{e ? `${kwh(e.kwh)} kWh` : '—'}</td>
                      <td className="py-2 text-right font-semibold text-navy">{e ? formatBRL(e.cents) : '—'}</td>
                      <td className="py-2 pl-2 text-xs">
                        {rd.estimated && <Badge tone="amber">estimada</Badge>}
                        {e?.error && <span className="block text-critico">{e.error}</span>}
                        {e?.alert && <span className="block text-atencao">{e.alert}</span>}
                      </td>
                    </tr>
                  );
                })}
                {!p.meters.length && <tr><td colSpan={6} className="py-3 text-tinta-suave">Nenhum relógio ativo nesta competência. Cadastre em Cadastros → Relógios de energia.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {step === 'rateio' && (
        <Card className="p-4">
          <div className="mb-3 flex flex-wrap items-end gap-3 text-sm">
            <p className="flex-1 text-tinta-suave">A Lanchonete assume o percentual fixo; o resto é dividido pelo nº de <b>alunos e colaboradores ativos</b> (vem do mês anterior — atualize o que mudou). O percentual é a fatia real do dinheiro.</p>
            <div className="w-36"><Label htmlFor="p-snack">Lanchonete (%)</Label><Input id="p-snack" inputMode="decimal" disabled={readOnly} value={head.snackBarPct} onChange={(e) => { setHead({ ...head, snackBarPct: e.target.value }); touch(); }} /></div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="text-left text-xs text-tinta-suave"><tr><th className="py-1">Centro de custo</th><th className="text-right"># alunos</th><th className="text-right">Valor</th><th className="text-right">Percentual</th></tr></thead>
              <tbody className="divide-y divide-borda tabular-nums">
                {r.allocation.map((a) => {
                  const c = p.centers.find((x) => x.id === a.id);
                  return (
                    <tr key={a.id}>
                      <td className="py-1.5">{a.name} {a.kind === 'PARTNER' && <Badge tone="blue">parceiro</Badge>} {c?.isSnackBar && <Badge tone="amber">% fixo</Badge>}</td>
                      <td className="py-1.5 text-right">
                        {readOnly || c?.isSnackBar ? (c?.isSnackBar ? '—' : a.headcount)
                          : <Input className="ml-auto h-8 w-24 text-right" inputMode="numeric" value={heads[a.id]?.headcount ?? 0} onChange={(e) => { setHeads((h) => ({ ...h, [a.id]: { ...h[a.id]!, headcount: Math.max(0, Math.round(Number(e.target.value) || 0)) } })); touch(); }} aria-label={`Alunos ${a.name}`} />}
                      </td>
                      <td className="py-1.5 text-right font-semibold text-navy">{formatBRL(a.cents)}</td>
                      <td className="py-1.5 text-right">{formatPct(a.ratio)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 border-navy font-extrabold text-navy tabular-nums">
                <tr><td className="py-2">Total · {formatBRL(Math.round(r.perHead * 100))} por aluno</td><td className="text-right">{r.headcount}</td><td className="text-right">{formatBRL(r.allocation.reduce((s, a) => s + a.cents, 0))}</td><td className="text-right">100%</td></tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      {step === 'cobrancas' && (
        <div className="space-y-3">
          {!readOnly && (
            <Card className="flex flex-wrap items-end gap-3 p-3 text-sm">
              <div><Label htmlFor="p-due">Vencimento</Label><Input id="p-due" type="date" value={head.dueDate} onChange={(e) => { setHead({ ...head, dueDate: e.target.value }); touch(); }} /></div>
              <div className="min-w-48 flex-1"><Label htmlFor="p-notes">Observação interna (opcional)</Label><Input id="p-notes" maxLength={500} value={head.notes} onChange={(e) => { setHead({ ...head, notes: e.target.value }); touch(); }} /></div>
            </Card>
          )}
          <div className="grid gap-3 lg:grid-cols-2">
            {(closed ? r.charges : partners.map((c) => r.charges.find((x) => x.centerId === c.id) ?? { centerId: c.id, name: c.displayName, lines: [], totalCents: 0, prorata: null })).map((ch) => {
              const c = p.centers.find((x) => x.id === ch.centerId);
              const mine = items.filter((i) => i.centerId === ch.centerId);
              const billing = heads[ch.centerId]?.billing ?? 'FULL';
              const charge = p.charges.find((x) => x.centerId === ch.centerId);
              const setItem = (k: string, patch: Partial<Item>) => { setItems((all) => all.map((i) => (i.key === k ? { ...i, ...patch } : i))); touch(); };
              return (
                <Card key={ch.centerId} className={cn('p-4', billing === 'NONE' && !closed && 'opacity-60')}>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <h3 className="flex-1 font-extrabold text-navy">{ch.name}</h3>
                    {charge && <Badge tone="neutral">nº {charge.number}</Badge>}
                    {ch.prorata && <Badge tone="amber">{ch.prorata.days}/{ch.prorata.of} dias</Badge>}
                    {!readOnly && c && (
                      <Select className="h-8 w-40 text-xs" value={billing} aria-label="Como cobrar" onChange={(e) => { setHeads((h) => ({ ...h, [ch.centerId]: { ...h[ch.centerId]!, billing: e.target.value as Billing } })); touch(); }}>
                        <option value="FULL">Mês cheio</option><option value="PRORATA">Proporcional aos dias</option><option value="NONE">Não cobrar este mês</option>
                      </Select>
                    )}
                  </div>
                  {billing === 'NONE' && !closed ? <p className="text-sm text-tinta-suave">Sem cobrança nesta competência.</p> : (
                    <table className="w-full text-sm">
                      <tbody className="divide-y divide-borda tabular-nums">
                        {ch.lines.filter((l) => l.kind !== 'ITEM' && l.kind !== 'AVULSO').map((l) => (
                          <tr key={l.description}><td className="py-1.5">{l.description}{l.detail && <span className="block text-xs text-tinta-suave">{l.detail}</span>}</td><td className="py-1.5 text-right">{formatBRL(l.cents)}</td></tr>
                        ))}
                        {readOnly
                          ? ch.lines.filter((l) => l.kind === 'ITEM' || l.kind === 'AVULSO').map((l, i) => <tr key={`i${i}`}><td className="py-1.5">{l.description}</td><td className="py-1.5 text-right">{formatBRL(l.cents)}</td></tr>)
                          : mine.map((i) => (
                            <tr key={i.key}>
                              <td className="py-1.5">
                                <div className="flex items-center gap-2">
                                  {i.adhoc ? <Input className="h-8 text-sm" placeholder="Ajuste, desconto…" value={i.description} maxLength={80} onChange={(e) => setItem(i.key, { description: e.target.value })} aria-label="Descrição do avulso" /> : <span>{i.description}</span>}
                                  {i.unitCents !== null && (
                                    <span className="flex items-center gap-1 text-xs text-tinta-suave">
                                      <Input className="h-8 w-16 text-right" inputMode="decimal" value={i.qty ?? 0} onChange={(e) => setItem(i.key, { qty: num(e.target.value) ?? 0 })} aria-label={`Quantidade ${i.description}`} /> × {formatBRL(i.unitCents)}
                                    </span>
                                  )}
                                  {i.adhoc && <Button size="sm" variant="ghost" className="text-critico" aria-label="Remover" onClick={() => { setItems((all) => all.filter((x) => x.key !== i.key)); touch(); }}><Trash2 /></Button>}
                                </div>
                              </td>
                              <td className="py-1.5 text-right">
                                {i.unitCents !== null ? formatBRL(Math.round((i.qty ?? 0) * i.unitCents))
                                  : <MoneyInput className="ml-auto h-8 w-32" value={i.amountCents} onChange={(v) => setItem(i.key, { amountCents: v ?? 0 })} aria-label={`Valor ${i.description}`} />}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                      <tfoot><tr className="border-t-2 border-navy text-base font-extrabold text-navy"><td className="py-2">Total</td><td className="py-2 text-right tabular-nums">{formatBRL(ch.totalCents)}</td></tr></tfoot>
                    </table>
                  )}
                  {!readOnly && billing !== 'NONE' && <button className="mt-2 text-xs font-semibold text-nacao hover:underline" onClick={() => { setItems((all) => [...all, { key: key(), centerId: ch.centerId, recurringItemId: null, description: '', qty: null, unitCents: null, amountCents: 0, adhoc: true }]); touch(); }}>+ item avulso (ajuste, desconto, acerto)</button>}
                  {closed && charge && <ChargeActions charge={charge} month={p.month} name={ch.name} dueDate={head.dueDate} totalCents={ch.totalCents} settings={settings} phone={c?.contactPhone ?? null} canPay={canPay} />}
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

function ChargeActions({ charge, month, name, dueDate, totalCents, settings, canPay, phone }: {
  charge: CondoPeriodView['charges'][number]; month: string; name: string; dueDate: string; totalCents: number; settings: CondoSettingsView; canPay: boolean; phone: string | null;
}) {
  const router = useRouter();
  const [paying, setPaying] = useState(false);
  const [paidAt, setPaidAt] = useState(charge.paidAt ?? new Date().toISOString().slice(0, 10));
  const [paidCents, setPaidCents] = useState<number | null>(charge.paidCents ?? totalCents);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const mark = (status: 'PENDING' | 'SENT' | 'PAID') => start(async () => {
    setError(null);
    const r = await markChargeAction(charge.id, month, { status, paidAt: status === 'PAID' ? paidAt : null, paidCents: status === 'PAID' ? paidCents : null });
    if (!r.ok) return setError(r.error);
    setPaying(false);
    router.refresh();
  });
  const text = chargeWhatsapp({ name, month, totalCents, dueDate, pixKey: settings.pixKey, payee: settings.payeeName, number: charge.number });
  return (
    <div className="mt-3 border-t border-borda pt-3">
      <div className="flex flex-wrap items-center gap-2">
        {charge.status === 'PAID' ? <Badge tone="green"><CheckCircle2 className="size-3" /> Pago em {formatDateBR(charge.paidAt!)} · {formatBRL(charge.paidCents ?? 0)}</Badge>
          : charge.status === 'SENT' ? <Badge tone="blue">Enviada</Badge> : <Badge tone="amber">Pendente</Badge>}
        <div className="flex-1" />
        <a href={`/condominio/competencias/${month}/pdf?cobranca=${charge.id}`} target="_blank" rel="noopener" className={buttonVariants({ variant: 'secondary', size: 'sm' })}><FileDown /> PDF</a>
        <a href={`https://wa.me/${waPhone(phone) ?? ''}?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener" className={buttonVariants({ variant: 'ghost', size: 'sm' })}
          onClick={() => { if (canPay && charge.status === 'PENDING') mark('SENT'); }}><MessageCircle /> WhatsApp</a>
        {canPay && charge.status !== 'PAID' && <Button size="sm" variant="ghost" onClick={() => setPaying((v) => !v)}><Check /> Registrar pagamento</Button>}
        {canPay && charge.status === 'PAID' && <Button size="sm" variant="ghost" onClick={() => { if (confirm('Desfazer o pagamento registrado?')) mark('PENDING'); }}><Undo2 /> Desfazer</Button>}
      </div>
      {paying && (
        <div className="mt-2 flex flex-wrap items-end gap-2 text-sm">
          <div><Label htmlFor={`pd-${charge.id}`}>Pago em</Label><Input id={`pd-${charge.id}`} type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} /></div>
          <div className="w-36"><Label htmlFor={`pv-${charge.id}`}>Valor pago</Label><MoneyInput id={`pv-${charge.id}`} value={paidCents} onChange={setPaidCents} /></div>
          <Button size="sm" disabled={pending} onClick={() => mark('PAID')}>Confirmar</Button>
        </div>
      )}
      <FormMessage error={error} />
    </div>
  );
}
