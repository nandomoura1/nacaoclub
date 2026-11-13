'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Copy, FileUp, Percent, Plus, Search, Send, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Input, Label, Select } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { OPTION_PRESETS, PLAN_STATUS, ROUNDINGS, adjustPrice, parseMoney, totalOf, type PlanStatus, type Rounding } from '@/domain/planos';
import type { PlanTableView } from '@/server/services/planos-service';
import { adjustPricesAction, createDraftAction, deletePlanAction, importFromSheetAction, publishTableAction, savePlanAction, setOptionPriceAction, setPlanStatusAction, tableTsvAction } from './actions';

type Plan = PlanTableView['plans'][number];
type Msg = { ok?: string; error?: string } | null;

const brl = (v: number | null) => (v === null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const brNum = (v: number | null) => (v === null ? '' : v.toFixed(2).replace('.', ','));
const statusTone = (s: PlanStatus) => ({ MANTEM: 'neutral', NOVO: 'green', SIMPLIFICADO: 'blue', A_DECIDIR: 'amber', EXCLUIR: 'red' } as const)[s];
const statusLabel = (s: PlanStatus) => PLAN_STATUS.find((x) => x.id === s)?.label ?? s;

function Change({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-tinta-fraca">—</span>;
  const cls = pct > 0 ? 'text-sucesso' : pct < 0 ? 'text-critico' : 'text-tinta-suave';
  return <span className={`font-semibold ${cls}`}>{pct > 0 ? '+' : ''}{pct.toLocaleString('pt-BR')}%</span>;
}

export function ImportButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  return (
    <div className="space-y-2">
      <p>Comece pela planilha de planos (abas &quot;Planos 2026&quot; e &quot;Repasse de preço&quot;): 2026 vira a tabela vigente e 2027 nasce como rascunho com os preços do repasse.</p>
      <Button disabled={pending} onClick={() => start(async () => {
        const r = await importFromSheetAction();
        if (!r.ok) return setMsg({ error: r.error });
        router.push(`/admin/planos?tabela=${r.data.rascunho}`);
      })}><FileUp /> Importar planilha de 2026</Button>
      <FormMessage error={msg?.error} />
    </div>
  );
}

/** Preço editável direto na tabela (salva ao sair do campo). */
function PriceCell({ optionId, field, value, disabled }: { optionId: string; field: 'card' | 'recurring'; value: number | null; disabled: boolean }) {
  const [text, setText] = useState(brNum(value));
  const [state, setState] = useState<'idle' | 'saving' | 'error'>('idle');
  if (disabled) return <span className="tabular-nums">{brl(value)}</span>;
  const save = async () => {
    const v = parseMoney(text);
    if (v === 'invalid') { setState('error'); return; }
    if (v === value) { setText(brNum(value)); return; }
    setState('saving');
    const r = await setOptionPriceAction(optionId, field, v);
    setState(r.ok ? 'idle' : 'error');
    if (r.ok) setText(brNum(r.data));
  };
  return (
    <input
      value={text}
      inputMode="decimal"
      aria-label={field === 'card' ? 'Cartão por mês' : 'Recorrência por mês'}
      onChange={(e) => { setText(e.target.value); setState('idle'); }}
      onBlur={save}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      className={`h-8 w-24 rounded-md border bg-white px-2 text-right text-sm tabular-nums ${state === 'error' ? 'border-critico' : state === 'saving' ? 'border-nacao/50 opacity-70' : 'border-borda'}`}
    />
  );
}

export function PlanBoard({ view, canEdit }: { view: PlanTableView; canEdit: boolean }) {
  const router = useRouter();
  const editable = view.table.editable;
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('');
  const [status, setStatus] = useState<PlanStatus | ''>('');
  const [showOut, setShowOut] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Plan | 'new' | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();

  const plans = useMemo(() => {
    const t = q.trim().toLowerCase();
    return view.plans.filter((p) => (!group || p.group === group) && (!status || p.status === status) && (showOut || p.status !== 'EXCLUIR')
      && (!t || [p.name, p.group, p.modalities, p.specificClasses, p.commonClasses].some((x) => x?.toLowerCase().includes(t))));
  }, [view.plans, q, group, status, showOut]);
  const byGroup = view.groups.map((g) => ({ g, items: plans.filter((p) => p.group === g) })).filter((x) => x.items.length);
  const toggle = (set: Set<string>, id: string) => { const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); return n; };
  const allVisible = plans.map((p) => p.id);

  const copy = () => start(async () => {
    const r = await tableTsvAction(view.table.id);
    if (!r.ok) return setMsg({ error: r.error });
    await navigator.clipboard.writeText(r.data);
    setMsg({ ok: 'Tabela copiada: é só colar (Ctrl+V) numa planilha do Google ou do Excel.' });
  });
  const newDraft = () => start(async () => {
    const year = view.table.year + 1;
    const name = window.prompt('Nome do novo rascunho', `Planos ${year}`);
    if (!name) return;
    const r = await createDraftAction({ fromTableId: view.table.id, name, year });
    if (!r.ok) return setMsg({ error: r.error });
    router.push(`/admin/planos?tabela=${r.data}`);
  });
  const publish = () => start(async () => {
    if (!window.confirm(`Publicar "${view.table.name}"? Ela vira a tabela vigente (travada) e a atual vai para o arquivo.`)) return;
    const r = await publishTableAction(view.table.id);
    setMsg(r.ok ? { ok: r.message } : { error: r.error });
  });

  return (
    <div className="space-y-4">
      {/* Resumo e ações */}
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-navy">{view.table.name}</span>
          {view.base && <span className="text-xs text-tinta-suave">comparada com {view.base.name}</span>}
          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" disabled={pending} onClick={copy}><Copy /> Copiar para planilha</Button>
            {editable && <Button size="sm" variant="secondary" onClick={() => setEditing('new')}><Plus /> Novo plano</Button>}
            {editable && <Button size="sm" variant="secondary" disabled={!selected.size} onClick={() => setAdjusting(true)} title="Marque os planos na lista"><Percent /> Reajustar {selected.size ? `(${selected.size})` : ''}</Button>}
            {editable && <Button size="sm" disabled={pending} onClick={publish}><Send /> Publicar</Button>}
            {canEdit && !editable && <Button size="sm" variant="secondary" disabled={pending} onClick={newDraft}><Plus /> Novo rascunho a partir desta</Button>}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PLAN_STATUS.map((s) => (
            <button key={s.id} type="button" title={s.hint} onClick={() => setStatus(status === s.id ? '' : s.id)}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${status === s.id ? 'bg-nacao text-white ring-nacao' : 'bg-white text-tinta-suave ring-borda hover:text-tinta'}`}>
              {s.label} · {view.counts[s.id]}
            </button>
          ))}
        </div>
        {view.missingFromBase.length > 0 && editable && (
          <p className="rounded-lg bg-atencao/10 px-3 py-2 text-xs text-atencao">Da {view.base?.name}, não vieram para cá: {view.missingFromBase.join(', ')}.</p>
        )}
        <FormMessage error={msg?.error} success={msg?.ok} />
      </Card>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-3 size-4 text-tinta-fraca" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar plano ou modalidade" className="pl-9" />
        </div>
        <Select value={group} onChange={(e) => setGroup(e.target.value)} className="w-48" aria-label="Grupo">
          <option value="">Todos os grupos</option>
          {view.groups.map((g) => <option key={g}>{g}</option>)}
        </Select>
        <label className="flex items-center gap-2 text-sm text-tinta-suave"><input type="checkbox" checked={showOut} onChange={(e) => setShowOut(e.target.checked)} /> Mostrar os que saem</label>
        {editable && (
          <button type="button" className="text-xs font-semibold text-nacao underline" onClick={() => setSelected(selected.size ? new Set() : new Set(allVisible))}>
            {selected.size ? 'Desmarcar todos' : 'Marcar os da lista'}
          </button>
        )}
      </div>

      {byGroup.length === 0 && <Card className="p-8 text-center text-sm text-tinta-suave">Nenhum plano com esses filtros.</Card>}

      {byGroup.map(({ g, items }) => (
        <section key={g} className="space-y-2">
          <div className="flex items-center gap-2">
            {editable && (
              <input type="checkbox" aria-label={`Marcar o grupo ${g}`} checked={items.every((p) => selected.has(p.id))}
                onChange={(e) => { const n = new Set(selected); items.forEach((p) => (e.target.checked ? n.add(p.id) : n.delete(p.id))); setSelected(n); }} />
            )}
            <h2 className="text-sm font-extrabold uppercase tracking-wide text-navy">{g}</h2>
            <span className="text-xs text-tinta-fraca">{items.length} plano(s)</span>
          </div>
          <Card className="divide-y divide-borda overflow-hidden">
            {items.map((p) => {
              const out = p.status === 'EXCLUIR';
              return (
                <div key={p.id} className={`p-3 ${out ? 'bg-fundo/60' : ''}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    {editable && <input type="checkbox" aria-label={`Marcar ${p.name}`} checked={selected.has(p.id)} onChange={() => setSelected(toggle(selected, p.id))} />}
                    <button type="button" className={`text-left font-semibold ${out ? 'text-tinta-fraca line-through' : 'text-tinta'} hover:underline`}
                      onClick={() => (editable ? setEditing(p) : setOpen(toggle(open, p.id)))}>{p.name}</button>
                    {editable ? (
                      <select value={p.status} aria-label="Situação" className="h-7 rounded-full border border-borda bg-white px-2 text-xs"
                        onChange={(e) => start(async () => { const r = await setPlanStatusAction(p.id, e.target.value); if (!r.ok) setMsg({ error: r.error }); })}>
                        {PLAN_STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                      </select>
                    ) : p.status !== 'MANTEM' && <Badge tone={statusTone(p.status)}>{statusLabel(p.status)}</Badge>}
                    {p.checkin && <Badge>{p.checkin}</Badge>}
                    <button type="button" onClick={() => setOpen(toggle(open, p.id))} className="ml-auto flex items-center gap-1 text-xs text-tinta-suave hover:text-tinta">
                      Detalhes <ChevronDown className={`size-3.5 transition-transform ${open.has(p.id) ? 'rotate-180' : ''}`} />
                    </button>
                  </div>
                  {p.note && <p className="mt-1 text-xs text-atencao">{p.note}</p>}
                  {open.has(p.id) && (
                    <dl className="mt-2 grid gap-x-4 gap-y-1 rounded-lg bg-fundo p-3 text-xs text-tinta-suave sm:grid-cols-[auto_1fr]">
                      {p.modalities && <><dt className="font-semibold text-tinta">Modalidades</dt><dd>{p.modalities}</dd></>}
                      {p.commonClasses && <><dt className="font-semibold text-tinta">Aulas em comum</dt><dd>{p.commonClasses}</dd></>}
                      {p.specificClasses && <><dt className="font-semibold text-tinta">Aulas específicas</dt><dd>{p.specificClasses}</dd></>}
                      {p.baseName && p.baseName !== p.name && <><dt className="font-semibold text-tinta">Em {view.base?.name}</dt><dd>{p.baseName}</dd></>}
                    </dl>
                  )}
                  {p.options.length > 0 && (
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full min-w-[720px] table-fixed text-sm">
                        <colgroup><col className="w-[24%]" /><col className="w-[12%]" /><col className="w-[12%]" /><col className="w-[13%]" /><col className="w-[12%]" />{view.base && <col className="w-[12%]" />}{view.base && <col className="w-[15%]" />}</colgroup>
                        <thead>
                          <tr className="text-left text-[11px] uppercase tracking-wide text-tinta-fraca">
                            <th className="py-1 pr-2 font-semibold">Opção</th>
                            <th className="px-2 font-semibold">Cartão / mês</th>
                            <th className="px-2 font-semibold">Total</th>
                            <th className="px-2 font-semibold">Recorrência / mês</th>
                            <th className="px-2 font-semibold">Total</th>
                            {view.base && <th className="px-2 font-semibold">{view.base.name}</th>}
                            {view.base && <th className="px-2 font-semibold">Variação</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {p.options.map((o) => (
                            <tr key={o.id} className="border-t border-borda/60">
                              <td className="py-1.5 pr-2 text-tinta">{o.label}{o.months && o.months > 1 ? <span className="text-xs text-tinta-fraca"> · {o.months} meses</span> : null}</td>
                              <td className="px-2"><PriceCell key={`${o.id}-c-${o.card}`} optionId={o.id} field="card" value={o.card} disabled={!editable} /></td>
                              <td className="px-2 tabular-nums text-tinta-suave">{o.months && o.months > 1 ? brl(o.cardTotal) : ''}</td>
                              <td className="px-2"><PriceCell key={`${o.id}-r-${o.recurring}`} optionId={o.id} field="recurring" value={o.recurring} disabled={!editable} /></td>
                              <td className="px-2 tabular-nums text-tinta-suave">{o.months && o.months > 1 ? brl(o.recurringTotal) : ''}</td>
                              {view.base && <td className="px-2 tabular-nums text-tinta-suave">{brl(o.baseCard)}</td>}
                              {view.base && (
                                <td className="px-2 text-xs">
                                  <Change pct={o.cardChange} />
                                  {o.recurring !== null && <span className="text-tinta-fraca"> · rec. </span>}
                                  {o.recurring !== null && <Change pct={o.recurringChange} />}
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </Card>
        </section>
      ))}

      {editing && <PlanEditor tableId={view.table.id} plan={editing === 'new' ? null : editing} groups={view.groups} hasBase={!!view.base} onClose={() => setEditing(null)} onMsg={setMsg} />}
      {adjusting && <AdjustSheet view={view} ids={[...selected]} onClose={() => setAdjusting(false)} onDone={(n) => { setAdjusting(false); setMsg({ ok: `${n} opção(ões) de preço reajustada(s).` }); }} />}
    </div>
  );
}

// ── Editor do plano ─────────────────────────────────────

interface OptionDraft { id?: string; label: string; months: string; card: string; recurring: string }

function PlanEditor({ tableId, plan, groups, hasBase, onClose, onMsg }: { tableId: string; plan: Plan | null; groups: string[]; hasBase: boolean; onClose: () => void; onMsg: (m: Msg) => void }) {
  const [f, setF] = useState({
    group: plan?.group ?? groups[0] ?? '', name: plan?.name ?? '', modalities: plan?.modalities ?? '', commonClasses: plan?.commonClasses ?? '',
    specificClasses: plan?.specificClasses ?? '', checkin: plan?.checkin ?? '', status: (plan?.status ?? 'NOVO') as PlanStatus, note: plan?.note ?? '',
  });
  const [opts, setOpts] = useState<OptionDraft[]>(plan?.options.map((o) => ({ id: o.id, label: o.label, months: o.months ? String(o.months) : '', card: brNum(o.card), recurring: brNum(o.recurring) }))
    ?? OPTION_PRESETS.slice(0, 3).map((p) => ({ label: p.label, months: String(p.months), card: '', recurring: '' })));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const setOpt = (i: number, k: keyof OptionDraft, v: string) => setOpts(opts.map((o, j) => (j === i ? { ...o, [k]: v } : o)));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const options: { id: string | null; label: string; months: number | null; card: number | null; recurring: number | null }[] = [];
    for (const o of opts) {
      const card = parseMoney(o.card), recurring = parseMoney(o.recurring);
      if (card === 'invalid' || recurring === 'invalid') return setError(`Valor inválido na opção "${o.label}".`);
      options.push({ id: o.id ?? null, label: o.label, months: o.months ? Number(o.months) : null, card, recurring });
    }
    start(async () => {
      const r = await savePlanAction({ tableId, id: plan?.id ?? null, ...f, options });
      if (!r.ok) return setError(r.error);
      onMsg({ ok: r.message }); onClose();
    });
  };
  const remove = () => start(async () => {
    if (!plan || !window.confirm(`Apagar o plano "${plan.name}" deste rascunho?`)) return;
    const r = await deletePlanAction(plan.id);
    if (!r.ok) return setError(r.error);
    onMsg({ ok: r.message }); onClose();
  });

  return (
    <Sheet title={plan ? 'Editar plano' : 'Novo plano'} onClose={onClose} onSubmit={submit}
      footer={<>
        <Button type="submit" disabled={pending}>Salvar</Button>
        <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
        {plan && (!hasBase || !plan.baseName) && <Button type="button" variant="ghost" className="ml-auto text-critico" onClick={remove} disabled={pending}><Trash2 /> Apagar</Button>}
      </>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label>Grupo</Label><Input list="plan-groups" value={f.group} onChange={set('group')} required /><datalist id="plan-groups">{groups.map((g) => <option key={g} value={g} />)}</datalist></div>
        <div><Label>Situação</Label><Select value={f.status} onChange={set('status')}>{PLAN_STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Select></div>
      </div>
      <div><Label>Nome do plano</Label><Input value={f.name} onChange={set('name')} required /></div>
      <div><Label>Modalidades</Label><Input value={f.modalities} onChange={set('modalities')} placeholder="Ex.: Academia + Aulas Coletivas" /></div>
      <div><Label>Aulas em comum</Label><Input value={f.commonClasses} onChange={set('commonClasses')} placeholder="Ex.: Funcional, Mobilidade, Core" /></div>
      <div><Label>Aulas específicas</Label><Input value={f.specificClasses} onChange={set('specificClasses')} /></div>
      <div><Label>Check-in semanal</Label><Input value={f.checkin} onChange={set('checkin')} placeholder="Ex.: Check In Ilimitado, 3x, Turma Fixa" /></div>
      <div>
        <Label>Opções de preço (valor por mês)</Label>
        <div className="space-y-2">
          {opts.map((o, i) => {
            const card = parseMoney(o.card), months = o.months ? Number(o.months) : null;
            return (
              <div key={o.id ?? `n${i}`} className="rounded-lg border border-borda p-2">
                <div className="flex gap-2">
                  <Input value={o.label} onChange={(e) => setOpt(i, 'label', e.target.value)} placeholder="Mensal" aria-label="Opção" className="flex-1" />
                  <Input value={o.months} onChange={(e) => setOpt(i, 'months', e.target.value.replace(/\D/g, ''))} placeholder="meses" aria-label="Meses" className="w-20" />
                  <button type="button" aria-label="Tirar opção" className="px-1 text-tinta-fraca hover:text-critico" onClick={() => setOpts(opts.filter((_, j) => j !== i))}><Trash2 className="size-4" /></button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="text-xs text-tinta-suave">Cartão / mês<Input value={o.card} inputMode="decimal" onChange={(e) => setOpt(i, 'card', e.target.value)} /></label>
                  <label className="text-xs text-tinta-suave">Recorrência / mês<Input value={o.recurring} inputMode="decimal" onChange={(e) => setOpt(i, 'recurring', e.target.value)} /></label>
                </div>
                {typeof card === 'number' && months && months > 1 && <p className="mt-1 text-xs text-tinta-fraca">Total no cartão: {brl(totalOf(card, months))}</p>}
              </div>
            );
          })}
          <div className="flex flex-wrap gap-1.5">
            {OPTION_PRESETS.filter((p) => !opts.some((o) => o.label.toLowerCase() === p.label.toLowerCase())).map((p) => (
              <Button key={p.label} type="button" size="sm" variant="secondary" onClick={() => setOpts([...opts, { label: p.label, months: String(p.months), card: '', recurring: '' }])}><Plus /> {p.label}</Button>
            ))}
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpts([...opts, { label: '', months: '', card: '', recurring: '' }])}><Plus /> Outra</Button>
          </div>
        </div>
      </div>
      <div><Label>Observação</Label><textarea value={f.note} onChange={set('note')} rows={2} className="w-full rounded-lg border border-borda px-3 py-2 text-sm" placeholder="Ex.: unificar com o Crossfit 3x em 2027" /></div>
      <FormMessage error={error} />
    </Sheet>
  );
}

// ── Reajuste em lote ────────────────────────────────────

function AdjustSheet({ view, ids, onClose, onDone }: { view: PlanTableView; ids: string[]; onClose: () => void; onDone: (n: number) => void }) {
  const chosen = view.plans.filter((p) => ids.includes(p.id));
  const labels = [...new Set(chosen.flatMap((p) => p.options.map((o) => o.label)))];
  const [pick, setPick] = useState<string[]>([]);
  const [target, setTarget] = useState<'CARD' | 'RECURRING' | 'BOTH' | 'RECURRING_FROM_CARD'>('CARD');
  const [from, setFrom] = useState<'ATUAL' | 'BASE'>('ATUAL');
  const [pct, setPct] = useState('10');
  const [rounding, setRounding] = useState<Rounding>('NOVENTA');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const n = Number(pct.replace(',', '.'));

  // Prévia: as primeiras opções que mudam.
  const preview = chosen.flatMap((p) => p.options.filter((o) => !pick.length || pick.includes(o.label)).map((o) => {
    const src = target === 'RECURRING_FROM_CARD' ? o.card : from === 'BASE' ? o.baseCard : target === 'RECURRING' ? o.recurring : o.card;
    const now = target === 'RECURRING' || target === 'RECURRING_FROM_CARD' ? o.recurring : o.card;
    if (src === null || !Number.isFinite(n) || (target === 'RECURRING_FROM_CARD' && (o.months ?? 1) <= 1)) return null;
    return { key: o.id, text: `${p.name} · ${o.label}`, now, next: adjustPrice(src, n, rounding) };
  })).filter((x): x is NonNullable<typeof x> => !!x);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!Number.isFinite(n)) return setError('Percentual inválido.');
    start(async () => {
      const r = await adjustPricesAction({ tableId: view.table.id, itemIds: ids, labels: pick, target, from, pct: n, rounding });
      if (!r.ok) return setError(r.error);
      onDone(r.data);
    });
  };

  return (
    <Sheet title={`Reajustar ${chosen.length} plano(s)`} onClose={onClose} onSubmit={submit}
      footer={<><Button type="submit" disabled={pending || !preview.length}>Aplicar em {preview.length} opção(ões)</Button><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button></>}>
      <p className="text-xs text-tinta-suave">{chosen.map((p) => p.name).join(', ')}</p>
      <div>
        <Label>Quais opções</Label>
        <div className="flex flex-wrap gap-1.5">
          {labels.map((l) => (
            <label key={l} className={`flex cursor-pointer items-center rounded-full px-2.5 py-1 text-xs ring-1 ${pick.includes(l) ? 'bg-nacao/10 text-nacao ring-nacao/30' : 'bg-white text-tinta-suave ring-borda'}`}>
              <input type="checkbox" className="sr-only" checked={pick.includes(l)} onChange={() => setPick(pick.includes(l) ? pick.filter((x) => x !== l) : [...pick, l])} />{l}
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-tinta-fraca">Nenhuma marcada = todas.</p>
      </div>
      <div><Label>O que muda</Label>
        <Select value={target} onChange={(e) => setTarget(e.target.value as typeof target)}>
          <option value="CARD">Preço no cartão</option>
          <option value="RECURRING">Preço na recorrência</option>
          <option value="BOTH">Cartão e recorrência</option>
          <option value="RECURRING_FROM_CARD">Recorrência = cartão + % (semestral, anual…)</option>
        </Select>
      </div>
      {target !== 'RECURRING_FROM_CARD' && view.base && (
        <div><Label>Sobre qual preço</Label>
          <Select value={from} onChange={(e) => setFrom(e.target.value as typeof from)}>
            <option value="ATUAL">O que está neste rascunho</option>
            <option value="BASE">O de {view.base.name}</option>
          </Select>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Percentual (%)</Label><Input value={pct} inputMode="decimal" onChange={(e) => setPct(e.target.value)} /></div>
        <div><Label>Arredondar</Label><Select value={rounding} onChange={(e) => setRounding(e.target.value as Rounding)}>{ROUNDINGS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</Select></div>
      </div>
      <div>
        <Label>Prévia</Label>
        {preview.length === 0 ? <p className="text-xs text-tinta-fraca">Nada a mudar com essa escolha.</p> : (
          <ul className="space-y-0.5 text-xs">
            {preview.slice(0, 12).map((x) => <li key={x.key} className="flex justify-between gap-2"><span className="truncate text-tinta-suave">{x.text}</span><span className="shrink-0 tabular-nums">{brl(x.now)} → <strong>{brl(x.next)}</strong></span></li>)}
            {preview.length > 12 && <li className="text-tinta-fraca">… e mais {preview.length - 12}.</li>}
          </ul>
        )}
      </div>
      <FormMessage error={error} />
    </Sheet>
  );
}
