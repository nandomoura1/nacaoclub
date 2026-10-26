'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Plus, X } from 'lucide-react';
import { Input, Label, Select } from '@/components/ui/input';
import { formatClock, parseClock, WEEKDAYS } from '@/domain/dates';
import type { DayKey, HoursMap, MemberHours, Shift3, Window } from '@/domain/escalas/types';
import { cn } from '@/lib/cn';

export const DAY_KEYS: { key: DayKey; label: string }[] = [...WEEKDAYS.map((w) => ({ key: String(w.n) as DayKey, label: w.long })), { key: 'F', label: 'Feriado' }];

/** Escolha do setor e do mês (vai para a mesma página com ?setor=&mes=). */
export function SectorMonthPicker({ sectors, sectorId, month, showMonth = true }: { sectors: { id: string; name: string }[]; sectorId: string; month: string; showMonth?: boolean }) {
  const router = useRouter();
  const path = usePathname();
  const go = (s: string, m: string) => router.push(`${path}?setor=${s}&mes=${m}`);
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-48 flex-1 sm:flex-none">
        <Label htmlFor="ws-setor">Setor</Label>
        <Select id="ws-setor" value={sectorId} onChange={(e) => go(e.target.value, month)}>
          {sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
      </div>
      {showMonth && (
        <div>
          <Label htmlFor="ws-mes">Mês e ano</Label>
          <Input id="ws-mes" type="month" value={month} onChange={(e) => e.target.value && go(sectorId, e.target.value)} className="w-44" />
        </div>
      )}
    </div>
  );
}

const toClock = (m: number | undefined) => (m == null ? '' : formatClock(Math.min(m, 1439)));
const fromClock = (v: string, end = false) => { const m = parseClock(v); return m == null ? null : end && m === 0 ? 1440 : m; };

function WindowInput({ value, onChange, onRemove }: { value: Window; onChange: (w: Window) => void; onRemove?: () => void }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Input type="time" value={toClock(value[0])} onChange={(e) => { const v = fromClock(e.target.value); if (v != null) onChange([v, value[1]]); }} className="h-8 w-[7.5rem] px-2" />
      <span className="text-xs text-tinta-fraca">às</span>
      <Input type="time" value={toClock(value[1])} onChange={(e) => { const v = fromClock(e.target.value, true); if (v != null) onChange([value[0], v]); }} className="h-8 w-[7.5rem] px-2" />
      {onRemove && <button type="button" aria-label="Tirar janela" onClick={onRemove} className="text-tinta-fraca hover:text-critico"><X className="size-4" /></button>}
    </span>
  );
}

/** Horário de funcionamento por dia: não definido (usa o da Nação), fechado ou janelas. */
export function HoursMapEditor({ value, onChange, undefinedLabel = 'Usa o da Nação' }: { value: HoursMap; onChange: (v: HoursMap) => void; undefinedLabel?: string }) {
  const set = (k: DayKey, w: Window[] | undefined) => { const n = { ...value }; if (w === undefined) delete n[k]; else n[k] = w; onChange(n); };
  return (
    <div className="divide-y divide-borda rounded-lg border border-borda">
      {DAY_KEYS.map(({ key, label }) => {
        const w = value[key];
        const mode = w === undefined ? 'indef' : w.length ? 'aberto' : 'fechado';
        return (
          <div key={key} className="flex flex-wrap items-center gap-2 px-3 py-2">
            <span className="w-20 text-sm font-semibold text-navy">{label}</span>
            <Select value={mode} onChange={(e) => set(key, e.target.value === 'indef' ? undefined : e.target.value === 'fechado' ? [] : [[420, 1320]])} className="h-8 w-40 text-xs">
              <option value="indef">{key === 'F' ? 'Sem horário de feriado' : undefinedLabel}</option>
              <option value="aberto">Aberto</option>
              <option value="fechado">Fechado</option>
            </Select>
            {w && w.map((win, i) => (
              <WindowInput key={i} value={win} onChange={(nw) => set(key, w.map((x, j) => (j === i ? nw : x)))} onRemove={w.length > 1 ? () => set(key, w.filter((_, j) => j !== i)) : undefined} />
            ))}
            {w && w.length > 0 && w.length < 3 && <button type="button" onClick={() => set(key, [...w, [w.at(-1)![1], Math.min(1440, w.at(-1)![1] + 120)]])} className="inline-flex items-center gap-1 text-xs font-semibold text-nacao"><Plus className="size-3" /> janela</button>}
          </div>
        );
      })}
    </div>
  );
}

function ShiftInput({ value, onChange }: { value: Shift3; onChange: (s: Shift3) => void }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <WindowInput value={[value[0], value[1]]} onChange={([a, b]) => onChange([a, b, value[2]])} />
      <span className="text-xs text-tinta-fraca">intervalo</span>
      <Input type="number" min={0} max={240} step={5} value={value[2]} onChange={(e) => onChange([value[0], value[1], Math.max(0, Number(e.target.value) || 0)])} className="h-8 w-20 px-2" />
      <span className="text-xs text-tinta-fraca">min</span>
    </span>
  );
}

/** Horário do colaborador: habitual + exceções de sábado, domingo e feriado. */
export function MemberHoursEditor({ value, onChange }: { value: MemberHours; onChange: (v: MemberHours) => void }) {
  const rows: { key: 'base' | '6' | '7' | 'F'; label: string }[] = [{ key: 'base', label: 'Habitual' }, { key: '6', label: 'Sábado' }, { key: '7', label: 'Domingo' }, { key: 'F', label: 'Feriado' }];
  const set = (k: 'base' | '6' | '7' | 'F', s: Shift3 | undefined) => { const n = { ...value }; if (s) n[k] = s; else delete n[k]; onChange(n); };
  return (
    <div className="space-y-2">
      {rows.map(({ key, label }) => {
        const s = value[key];
        return (
          <div key={key} className={cn('flex flex-wrap items-center gap-2', key !== 'base' && !s && 'opacity-80')}>
            <span className="w-16 text-xs font-semibold text-navy">{label}</span>
            {s ? <ShiftInput value={s} onChange={(v) => set(key, v)} /> : null}
            {key === 'base'
              ? !s && <button type="button" onClick={() => set('base', [420, 960, 60])} className="text-xs font-semibold text-nacao">+ definir horário</button>
              : s
                ? <button type="button" onClick={() => set(key, undefined)} className="text-xs text-tinta-fraca hover:text-critico">usar o habitual</button>
                : <button type="button" onClick={() => set(key, value.base ?? [480, 840, 0])} className="text-xs font-semibold text-nacao">+ horário diferente</button>}
          </div>
        );
      })}
    </div>
  );
}

/** Botões de dias da semana (1–7, e opcionalmente 8 = feriado). */
export function WeekdayPicker({ value, onChange, withHoliday = false }: { value: number[]; onChange: (v: number[]) => void; withHoliday?: boolean }) {
  const opts = [...WEEKDAYS.map((w) => ({ n: w.n, label: w.short })), ...(withHoliday ? [{ n: 8, label: 'FER' }] : [])];
  return (
    <div className="flex flex-wrap gap-1">
      {opts.map((o) => {
        const on = value.includes(o.n);
        return (
          <button key={o.n} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== o.n) : [...value, o.n].sort())}
            className={cn('h-8 min-w-11 rounded-md border px-2 text-xs font-bold', on ? 'border-nacao bg-nacao text-white' : 'border-borda text-tinta-suave hover:border-nacao')}>{o.label}</button>
        );
      })}
    </div>
  );
}
