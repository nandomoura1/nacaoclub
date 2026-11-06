'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRightLeft, Copy, Plus, RotateCcw, Rocket, Save, Trash2, TriangleAlert, X } from 'lucide-react';
import { FormMessage } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, PageHeader } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { WEEKDAYS, formatClock, formatDateBR } from '@/domain/dates';
import {
  compareHours, itemState, periodMinutes, periodOf, planFrom, replaceTeacher, resulting, weekdayCounts, weeklyMinutes,
  type ItemState, type SimItem, type SimRole,
} from '@/domain/grade-sim';
import { cn } from '@/lib/cn';
import type { SimulationView } from '@/server/services/grade-sim-service';
import { applySimulationAction, discardSimulationAction, saveSimulationAction } from '../actions';

interface Props {
  sim: SimulationView;
  today: string;
  modalities: { id: string; name: string; color: string | null; defaultDurationMin: number | null }[];
  activityTypes: { id: string; name: string; countsHours: boolean; active: boolean }[];
  spaces: { id: string; name: string }[];
  teachers: { id: string; name: string; active: boolean }[];
}

const ROLES: { id: SimRole; label: string }[] = [{ id: 'TITULAR', label: 'Titular' }, { id: 'AUXILIAR', label: 'Auxiliar' }, { id: 'ESTAGIARIO', label: 'Estagiário' }];
const STATE: Record<ItemState, { label: string; tone: 'neutral' | 'green' | 'amber' | 'red' } | null> = {
  igual: null, nova: { label: 'Nova', tone: 'green' }, alterada: { label: 'Alterada', tone: 'amber' }, removida: { label: 'Sai', tone: 'red' },
};
const hm = (min: number) => { const s = min < 0 ? '−' : ''; const a = Math.abs(min); return `${s}${Math.floor(a / 60)}h${a % 60 ? String(a % 60).padStart(2, '0') : ''}`; };
const toMin = (v: string) => { const [h, m] = v.split(':').map(Number); return (h ?? 0) * 60 + (m ?? 0); };
const newKey = () => `n-${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`;

export function SimEditor({ sim, today, modalities, activityTypes, spaces, teachers }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const readOnly = sim.status !== 'RASCUNHO';
  const [name, setName] = useState(sim.name);
  const [from, setFrom] = useState(sim.effectiveFrom);
  const [items, setItems] = useState<SimItem[]>(sim.items);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ error?: string; success?: string }>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [filterTeacher, setFilterTeacher] = useState('');
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [swap, setSwap] = useState({ from: '', to: '' });
  const [view, setView] = useState<'semana' | 'competencia'>('semana');
  const [onlyDelta, setOnlyDelta] = useState(true);

  const tName = useMemo(() => new Map(teachers.map((t) => [t.id, t.name])), [teachers]);
  const mod = useMemo(() => new Map(modalities.map((m) => [m.id, m])), [modalities]);
  const typeName = useMemo(() => new Map(activityTypes.map((t) => [t.id, t.name])), [activityTypes]);
  const counts = useMemo(() => { const c = new Set(activityTypes.filter((t) => t.countsHours).map((t) => t.id)); return (id: string) => c.has(id); }, [activityTypes]);
  const base = useMemo(() => new Map(sim.current.map((c) => [c.slotId!, c])), [sim.current]);

  const update = (next: SimItem[]) => { setItems(next); setDirty(true); };
  const patch = (key: string, p: Partial<SimItem>) => update(items.map((i) => (i.key === key ? { ...i, ...p } : i)));

  // Plano e horas (tudo no navegador, na hora).
  const plan = useMemo(() => planFrom(items, sim.current), [items, sim.current]);
  const result = useMemo(() => resulting(items, plan), [items, plan]);
  const period = periodOf(from);
  const wc = useMemo(() => weekdayCounts(period.start, period.end), [period.start, period.end]);
  const hours = useMemo(() => {
    const cur = view === 'semana' ? weeklyMinutes(sim.current, counts) : periodMinutes(sim.current, counts, wc);
    const nxt = view === 'semana' ? weeklyMinutes(result, counts) : periodMinutes(result, counts, wc);
    return compareHours(cur, nxt);
  }, [view, sim.current, result, counts, wc]);
  const total = hours.reduce((a, r) => ({ c: a.c + r.current, s: a.s + r.simulated }), { c: 0, s: 0 });
  const changes = plan.change.length + plan.end.length + plan.create.length;

  const shown = items
    .filter((i) => !filterTeacher || i.people.some((p) => p.teacherId === filterTeacher))
    .filter((i) => !onlyChanged || itemState(i, base) !== 'igual')
    .sort((a, b) => a.weekday - b.weekday || a.startMin - b.startMin);

  const save = () => start(async () => {
    const r = await saveSimulationAction(sim.id, { name, effectiveFrom: from, notes: sim.notes, items });
    if (!r.ok) { setMsg({ error: r.error }); return; }
    setDirty(false); setMsg({ success: r.message }); router.refresh();
  });
  const apply = () => {
    if (dirty) { setMsg({ error: 'Salve a simulação antes de implantar.' }); return; }
    const conflictText = plan.conflicts.length ? `\n\nAtenção: ${plan.conflicts.length} aula(s) mudaram na grade depois da simulação e vão ficar como na simulação.` : '';
    if (!confirm(`Implantar a nova grade a partir de ${formatDateBR(from)}?\n\n${plan.change.length} aula(s) alterada(s), ${plan.create.length} nova(s), ${plan.end.length} encerrada(s). Antes dessa data nada muda; competências abertas são recalculadas.${conflictText}`)) return;
    start(async () => {
      const r = await applySimulationAction(sim.id, from, plan.conflicts.length > 0);
      if (!r.ok) { setMsg({ error: r.error }); return; }
      setMsg({ success: `Grade implantada a partir de ${formatDateBR(from)}: ${r.data.alteradas} alterada(s), ${r.data.criadas} criada(s), ${r.data.encerradas} encerrada(s).` });
      router.refresh();
    });
  };
  const addItem = () => {
    const m = modalities[0];
    const it: SimItem = { key: newKey(), slotId: null, baseVersionId: null, weekday: 1, startMin: 420, durationMin: m?.defaultDurationMin ?? 60, modalityId: m?.id ?? '', activityTypeId: activityTypes.find((t) => t.active)?.id ?? '', spaceId: null, label: null, people: [] };
    update([...items, it]); setEditing(it.key);
  };

  return (
    <>
      <PageHeader
        title={readOnly ? sim.name : 'Simulação de grade'}
        description={readOnly
          ? `${sim.status === 'IMPLANTADA' ? `Implantada — vale desde ${formatDateBR(sim.effectiveFrom)}` : 'Descartada'}. Só leitura.`
          : `Rascunho a partir da grade de ${formatDateBR(sim.baseDate)}. Nada muda na grade real até você implantar.`}
        actions={!readOnly ? <Button variant={dirty ? 'primary' : 'secondary'} disabled={pending || !dirty} onClick={save}><Save /> {dirty ? 'Salvar simulação' : 'Salva'}</Button> : undefined}
      />
      <FormMessage error={msg.error} success={msg.success} />

      <div className="mt-3 grid gap-5 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="space-y-4">
          {!readOnly && (
            <Card className="flex flex-wrap items-end gap-3 p-4">
              <div className="min-w-48 flex-1"><Label>Nome</Label><Input value={name} maxLength={80} onChange={(e) => { setName(e.target.value); setDirty(true); }} /></div>
              <div><Label>Vale a partir de</Label><Input type="date" min={today} value={from} onChange={(e) => { setFrom(e.target.value); setDirty(true); }} /></div>
              <Button variant="secondary" onClick={addItem}><Plus /> Nova aula</Button>
            </Card>
          )}

          {!readOnly && (
            <Card className="flex flex-wrap items-end gap-2 p-4">
              <ArrowRightLeft className="mb-2.5 size-4 text-nacao" />
              <div className="min-w-40 flex-1"><Label>Trocar em todas as aulas</Label>
                <Select value={swap.from} onChange={(e) => setSwap((s) => ({ ...s, from: e.target.value }))}>
                  <option value="">Quem sai…</option>
                  {[...new Set(items.filter((i) => !i.removed).flatMap((i) => i.people.map((p) => p.teacherId)))].sort((a, b) => (tName.get(a) ?? '').localeCompare(tName.get(b) ?? '')).map((id) => <option key={id} value={id}>{tName.get(id) ?? '?'}</option>)}
                </Select>
              </div>
              <div className="min-w-40 flex-1"><Label>por</Label>
                <Select value={swap.to} onChange={(e) => setSwap((s) => ({ ...s, to: e.target.value }))}>
                  <option value="">Quem entra…</option>
                  {teachers.filter((t) => t.active).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select>
              </div>
              <Button variant="secondary" disabled={!swap.from || !swap.to || swap.from === swap.to} onClick={() => {
                const r = replaceTeacher(items, swap.from, swap.to); update(r.items);
                setMsg({ success: `${tName.get(swap.from)} → ${tName.get(swap.to)} em ${r.count} aula(s). Salve para guardar.` }); setSwap({ from: '', to: '' });
              }}>Trocar</Button>
            </Card>
          )}

          <Card className="p-4">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <h2 className="text-sm font-extrabold text-navy">Aulas da simulação</h2>
              <span className="text-xs text-tinta-suave">{plan.create.length} nova(s) · {plan.change.length} alterada(s) · {plan.end.length} saem</span>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <Select className="h-8 w-48 text-xs" value={filterTeacher} onChange={(e) => setFilterTeacher(e.target.value)}>
                  <option value="">Todos os professores</option>
                  {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select>
                <label className="flex items-center gap-1 text-xs"><input type="checkbox" className="accent-nacao" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} /> Só mudanças</label>
              </div>
            </div>
            {WEEKDAYS.map((w) => {
              const day = shown.filter((i) => i.weekday === w.n);
              if (!day.length) return null;
              return (
                <div key={w.n} className="mb-3">
                  <p className="mb-1 text-xs font-extrabold uppercase tracking-wide text-tinta-suave">{w.long}</p>
                  <div className="divide-y divide-borda rounded-lg border border-borda">
                    {day.map((i) => {
                      const st = itemState(i, base);
                      const m = mod.get(i.modalityId);
                      return (
                        <div key={i.key} className={cn(i.removed && 'bg-critico/5 opacity-70')}>
                          <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm', !readOnly && 'cursor-pointer hover:bg-fundo')} onClick={() => !readOnly && setEditing(editing === i.key ? null : i.key)}>
                            <span className="w-24 font-mono text-xs font-semibold">{formatClock(i.startMin)}–{formatClock(i.startMin + i.durationMin)}</span>
                            <span className="size-2.5 shrink-0 rounded-full" style={{ background: m?.color ?? '#999' }} />
                            <span className={cn('min-w-0 flex-1 truncate', i.removed && 'line-through')}><b className="text-tinta">{m?.name ?? 'Modalidade de outra área'}</b>{i.label ? ` · ${i.label}` : ''} <span className="text-tinta-suave">— {i.people.map((p) => `${tName.get(p.teacherId) ?? '?'}${p.role !== 'TITULAR' ? ` (${p.role === 'AUXILIAR' ? 'aux' : 'est'})` : ''}`).join(', ') || 'sem professor'}</span></span>
                            <span className="text-xs text-tinta-fraca">{typeName.get(i.activityTypeId)}</span>
                            {STATE[st] && <Badge tone={STATE[st]!.tone}>{STATE[st]!.label}</Badge>}
                            {!readOnly && (
                              <span className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                                <button type="button" title="Duplicar" className="text-tinta-fraca hover:text-nacao" onClick={() => { const c = { ...i, key: newKey(), slotId: null, baseVersionId: null, removed: false }; update([...items, c]); setEditing(c.key); }}><Copy className="size-4" /></button>
                                {i.removed
                                  ? <button type="button" title="Manter" className="text-tinta-fraca hover:text-nacao" onClick={() => patch(i.key, { removed: false })}><RotateCcw className="size-4" /></button>
                                  : <button type="button" title={i.slotId ? 'Tirar da grade' : 'Apagar'} className="text-tinta-fraca hover:text-critico" onClick={() => (i.slotId ? patch(i.key, { removed: true }) : update(items.filter((x) => x.key !== i.key)))}><Trash2 className="size-4" /></button>}
                              </span>
                            )}
                          </div>
                          {editing === i.key && !readOnly && !i.removed && (
                            <ItemForm item={i} onChange={(p) => patch(i.key, p)} onClose={() => setEditing(null)} modalities={modalities} activityTypes={activityTypes} spaces={spaces} teachers={teachers} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {shown.length === 0 && <p className="text-sm text-tinta-suave">Nenhuma aula com esse filtro.</p>}
          </Card>
        </div>

        {/* Comparação e implantação */}
        <div className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <Card className="p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-sm font-extrabold text-navy">Horas: atual × simulada</h2>
              <div className="flex rounded-lg bg-fundo p-0.5 text-xs font-semibold">
                {(['semana', 'competencia'] as const).map((v) => <button key={v} type="button" onClick={() => setView(v)} className={cn('rounded-md px-2 py-1', view === v ? 'bg-white text-navy shadow-sm' : 'text-tinta-suave')}>{v === 'semana' ? 'Por semana' : `Competência ${period.label}`}</button>)}
              </div>
            </div>
            <div className="mb-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-fundo p-2"><p className="text-[11px] text-tinta-suave">Atual</p><p className="text-lg font-extrabold text-tinta">{hm(total.c)}</p></div>
              <div className="rounded-lg bg-fundo p-2"><p className="text-[11px] text-tinta-suave">Simulada</p><p className="text-lg font-extrabold text-navy">{hm(total.s)}</p></div>
              <div className={cn('rounded-lg p-2', total.s - total.c > 0 ? 'bg-atencao/10 text-atencao' : total.s - total.c < 0 ? 'bg-sucesso/10 text-sucesso' : 'bg-fundo text-tinta-suave')}><p className="text-[11px]">Diferença</p><p className="text-lg font-extrabold">{total.s - total.c > 0 ? '+' : ''}{hm(total.s - total.c)}</p></div>
            </div>
            {view === 'competencia' && <p className="mb-2 text-[11px] text-tinta-fraca">Projeção de {formatDateBR(period.start)} a {formatDateBR(period.end)} pela grade (sem descontar feriados e ausências).</p>}
            <label className="mb-1 flex items-center gap-1 text-xs"><input type="checkbox" className="accent-nacao" checked={onlyDelta} onChange={(e) => setOnlyDelta(e.target.checked)} /> Só quem muda</label>
            <div className="max-h-[50vh] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white text-tinta-suave"><tr><th className="py-1 text-left font-semibold">Professor</th><th className="text-right font-semibold">Atual</th><th className="text-right font-semibold">Simulada</th><th className="text-right font-semibold">Δ</th></tr></thead>
                <tbody>
                  {hours.filter((r) => !onlyDelta || r.delta !== 0).map((r) => (
                    <tr key={r.teacherId} className="border-t border-borda">
                      <td className="max-w-[10rem] truncate py-1"><button type="button" className="hover:text-nacao" onClick={() => setFilterTeacher(r.teacherId)}>{tName.get(r.teacherId) ?? '?'}</button></td>
                      <td className="text-right tabular-nums">{hm(r.current)}</td>
                      <td className="text-right font-semibold tabular-nums">{hm(r.simulated)}</td>
                      <td className={cn('text-right font-bold tabular-nums', r.delta > 0 ? 'text-atencao' : r.delta < 0 ? 'text-sucesso' : 'text-tinta-fraca')}>{r.delta > 0 ? '+' : ''}{r.delta ? hm(r.delta) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {hours.every((r) => r.delta === 0) && onlyDelta && <p className="py-2 text-xs text-tinta-suave">Ninguém muda de horas ainda.</p>}
            </div>
          </Card>

          {!readOnly && (
            <Card className="space-y-2 p-4">
              <h2 className="text-sm font-extrabold text-navy">Implantar a nova grade</h2>
              <p className="text-xs text-tinta-suave">A partir de <b>{formatDateBR(from)}</b>: {plan.change.length} aula(s) alterada(s), {plan.create.length} nova(s), {plan.end.length} encerrada(s). Antes dessa data, nada muda.</p>
              {plan.conflicts.length > 0 && (
                <div className="rounded-lg bg-atencao/10 p-2 text-xs text-atencao">
                  <p className="flex items-center gap-1 font-semibold"><TriangleAlert className="size-3.5" /> Mudaram na grade depois da simulação:</p>
                  <ul className="ml-4 list-disc">{plan.conflicts.slice(0, 8).map((c) => <li key={c.item.key}>{WEEKDAYS[c.item.weekday - 1]!.short} {formatClock(c.item.startMin)} {mod.get(c.item.modalityId)?.name}: {c.reason}</li>)}</ul>
                </div>
              )}
              {plan.untouched.length > 0 && <p className="text-xs text-tinta-suave">{plan.untouched.length} aula(s) entraram na grade depois da simulação e ficam como estão.</p>}
              <Button className="w-full" disabled={pending || !changes || from < today} onClick={apply}><Rocket /> Implantar a partir de {formatDateBR(from)}</Button>
              {dirty && <p className="text-xs text-atencao">Salve antes de implantar.</p>}
              <button type="button" className="w-full text-center text-xs text-tinta-suave hover:text-critico" disabled={pending} onClick={() => { if (confirm('Descartar esta simulação? A grade real não muda.')) start(async () => { const r = await discardSimulationAction(sim.id); if (!r.ok) setMsg({ error: r.error }); else router.push('/grade/simulacao'); }); }}>Descartar simulação</button>
            </Card>
          )}
          {sim.status === 'IMPLANTADA' && sim.appliedSummary && (
            <Card className="p-4 text-sm text-tinta">Implantada: {sim.appliedSummary.alteradas} alterada(s), {sim.appliedSummary.criadas} criada(s), {sim.appliedSummary.encerradas} encerrada(s).</Card>
          )}
        </div>
      </div>
    </>
  );
}

/** Edição de uma aula da simulação (direto na linha). */
function ItemForm({ item, onChange, onClose, modalities, activityTypes, spaces, teachers }: {
  item: SimItem; onChange: (p: Partial<SimItem>) => void; onClose: () => void;
  modalities: Props['modalities']; activityTypes: Props['activityTypes']; spaces: Props['spaces']; teachers: Props['teachers'];
}) {
  const [add, setAdd] = useState('');
  return (
    <div className="grid gap-3 border-t border-borda bg-fundo/60 p-3 sm:grid-cols-4">
      <div><Label>Dia</Label><Select value={item.weekday} onChange={(e) => onChange({ weekday: Number(e.target.value) })}>{WEEKDAYS.map((w) => <option key={w.n} value={w.n}>{w.long}</option>)}</Select></div>
      <div><Label>Início</Label><Input type="time" value={formatClock(item.startMin)} onChange={(e) => e.target.value && onChange({ startMin: toMin(e.target.value) })} /></div>
      <div><Label>Duração (min)</Label><Input type="number" min={5} max={600} step={5} value={item.durationMin} onChange={(e) => onChange({ durationMin: Math.max(5, Number(e.target.value) || 5) })} /></div>
      <div><Label>Turma</Label><Input value={item.label ?? ''} maxLength={60} placeholder="opcional" onChange={(e) => onChange({ label: e.target.value || null })} /></div>
      <div className="sm:col-span-2"><Label>Modalidade</Label><Select value={item.modalityId} onChange={(e) => onChange({ modalityId: e.target.value })}>{modalities.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select></div>
      <div><Label>Tipo</Label><Select value={item.activityTypeId} onChange={(e) => onChange({ activityTypeId: e.target.value })}>{activityTypes.filter((t) => t.active || t.id === item.activityTypeId).map((t) => <option key={t.id} value={t.id}>{t.name}{t.countsHours ? '' : ' (não conta hora)'}</option>)}</Select></div>
      <div><Label>Espaço</Label><Select value={item.spaceId ?? ''} onChange={(e) => onChange({ spaceId: e.target.value || null })}><option value="">—</option>{spaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></div>
      <div className="sm:col-span-4">
        <Label>Professores</Label>
        <div className="space-y-1.5">
          {item.people.map((p, idx) => (
            <div key={p.teacherId} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm">{teachers.find((t) => t.id === p.teacherId)?.name ?? '?'}</span>
              <Select className="h-8 w-36 text-xs" value={p.role} onChange={(e) => onChange({ people: item.people.map((x, j) => (j === idx ? { ...x, role: e.target.value as SimRole } : x)) })}>{ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</Select>
              <button type="button" aria-label="Tirar da aula" className="text-tinta-fraca hover:text-critico" onClick={() => onChange({ people: item.people.filter((_, j) => j !== idx) })}><X className="size-4" /></button>
            </div>
          ))}
          <div className="flex gap-2">
            <Select className="h-8 flex-1 text-xs" value={add} onChange={(e) => setAdd(e.target.value)}>
              <option value="">Adicionar professor…</option>
              {teachers.filter((t) => t.active && !item.people.some((p) => p.teacherId === t.id)).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
            <Button size="sm" variant="secondary" disabled={!add || item.people.length >= 10} onClick={() => { onChange({ people: [...item.people, { teacherId: add, role: item.people.length ? 'AUXILIAR' : 'TITULAR' }] }); setAdd(''); }}><Plus /> Adicionar</Button>
          </div>
        </div>
      </div>
      <div className="sm:col-span-4"><Button size="sm" variant="ghost" onClick={onClose}>Fechar</Button></div>
    </div>
  );
}
