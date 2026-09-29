'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarPlus, Copy, FileText, MessageCircle, Plus, Save, TriangleAlert, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Input, Select } from '@/components/ui/input';
import { formatClock } from '@/domain/dates';
import { dayTitle, defaultShifts, dutyWhatsapp, type DayType } from '@/domain/duty';
import { cn } from '@/lib/cn';
import type { DutyView } from '@/server/services/duty-service';
import { saveDutyAction } from './actions';

type Person = { id: string; name: string; fullName: string; modalityIds: string[] };
type Shift = { key: string; date: string; startMin: number; endMin: number; notes: string | null; people: { id: string; name: string }[] };
type Sector = DutyView['sectors'][number];

let seq = 0;
const k = () => `n${++seq}`;
const toMin = (v: string) => { const [h, m] = v.split(':').map(Number); return (h ?? 0) * 60 + (m ?? 0); };
const hours = (min: number) => `${Math.floor(min / 60)}h${min % 60 ? String(min % 60).padStart(2, '0') : ''}`;
const TYPE_LABEL: Record<DayType, string> = { SAB: 'sábado', DOM: 'domingo', FERIADO: 'feriado', SEMANA: 'dia útil' };

export function DutyClient({ duty, people, title }: { duty: DutyView; people: Person[]; title: string }) {
  const router = useRouter();
  const [state, setState] = useState<Record<string, Shift[]>>(() =>
    Object.fromEntries(duty.sectors.map((s) => [s.id, s.shifts.map((sh) => ({ ...sh, key: sh.id }))])));
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [text, setText] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const anyDirty = dirty.size > 0;

  const update = (sectorId: string, fn: (list: Shift[]) => Shift[]) => {
    setState((all) => ({ ...all, [sectorId]: fn(all[sectorId] ?? []) }));
    setDirty((d) => new Set(d).add(sectorId));
    setMsg({});
  };

  const fillDefaults = (s: Sector) => update(s.id, (list) => {
    const added = duty.dates.filter((d) => !list.some((x) => x.date === d))
      .flatMap((date) => defaultShifts(s.defaults, duty.dayTypes[date] as DayType).map((r) => ({ key: k(), date, ...r, notes: null, people: [] })));
    return [...list, ...added];
  });

  const save = (s: Sector) => start(async () => {
    const list = state[s.id] ?? [];
    const r = await saveDutyAction({
      sectorId: s.id, start: duty.start, end: duty.end,
      shifts: list.map((x) => ({ date: x.date, startMin: x.startMin, endMin: x.endMin, notes: x.notes, people: x.people.map((p) => p.id) })),
    });
    if (!r.ok) return setMsg({ error: `${s.name}: ${r.error}` });
    setDirty((d) => { const n = new Set(d); n.delete(s.id); return n; });
    setMsg({ ok: `Escala de ${s.name} salva: ${r.data.shifts} turno(s), ${hours(r.data.minutes)} de plantão lançadas nas horas.` });
    router.refresh();
  });

  const whatsapp = (only?: string) => dutyWhatsapp({
    title: only ? `${title} · ${duty.sectors.find((s) => s.id === only)?.name}` : title,
    holidays: duty.holidays,
    sectors: duty.sectors.filter((s) => !only || s.id === only).map((s) => ({ name: s.name, shifts: state[s.id] ?? [] })),
  });
  const pdfHref = (only?: string) => `/escalas/pdf?de=${duty.start}&ate=${duty.end}${only ? `&setor=${only}` : ''}`;

  return (
    <>
      <Card className="z-20 mb-4 flex flex-wrap items-center gap-2 p-3 lg:sticky lg:top-2">
        <h2 className="mr-2 text-lg font-extrabold text-navy">{title}</h2>
        <a href={anyDirty ? undefined : pdfHref()} target="_blank" rel="noopener" aria-disabled={anyDirty}
          className={cn(buttonVariants({ variant: 'secondary' }), anyDirty && 'pointer-events-none opacity-50')}>
          <FileText /> PDF de todos os setores
        </a>
        <Button variant="secondary" onClick={() => setText(whatsapp())}><MessageCircle /> Texto WhatsApp</Button>
        {anyDirty && <span className="text-xs text-atencao">Há setores com mudanças não salvas.</span>}
      </Card>
      <FormMessage error={msg.error} success={msg.ok} />

      {duty.dates.length === 0 && (
        <Card className="p-6 text-sm text-tinta-suave">Esse período não tem sábado, domingo nem feriado. Escolha outro período acima.</Card>
      )}

      {duty.warnings.length > 0 && (
        <Card className="mb-4 border-atencao/40 bg-atencao/5 p-4">
          <h3 className="mb-1 flex items-center gap-2 font-bold text-atencao"><TriangleAlert className="size-4" /> Atenção (não impede salvar)</h3>
          <ul className="list-disc pl-5 text-sm text-tinta">{duty.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </Card>
      )}

      {duty.dates.length > 0 && (
        <div className="grid gap-4">
          {duty.sectors.map((s) => {
            const list = state[s.id] ?? [];
            const isDirty = dirty.has(s.id);
            const total = list.reduce((a, x) => a + (x.endMin - x.startMin) * x.people.length, 0);
            const ofSector = people.filter((p) => p.modalityIds.includes(s.modalityId));
            const others = people.filter((p) => !p.modalityIds.includes(s.modalityId));
            return (
              <Card key={s.id} className="min-w-0 p-3 sm:p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="size-3 rounded-full" style={{ background: s.color }} />
                  <h3 className="text-lg font-extrabold text-navy">{s.name}</h3>
                  {total > 0 && <Badge tone="blue">{hours(total)} de plantão</Badge>}
                  <div className="flex-1" />
                  <Button variant="ghost" size="sm" onClick={() => fillDefaults(s)} title="Cria os turnos de funcionamento nos dias que ainda não têm"><CalendarPlus /> Turnos padrão</Button>
                  <Button variant="ghost" size="sm" onClick={() => setText(whatsapp(s.id))}><MessageCircle /> Texto</Button>
                  {!isDirty && list.length > 0 && <a href={pdfHref(s.id)} target="_blank" rel="noopener" className={buttonVariants({ variant: 'ghost', size: 'sm' })}><FileText /> PDF</a>}
                  <Button size="sm" onClick={() => save(s)} disabled={pending || !isDirty}><Save /> {isDirty ? 'Salvar' : 'Salvo'}</Button>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {duty.dates.map((date) => {
                    const type = duty.dayTypes[date] as DayType;
                    const day = list.filter((x) => x.date === date).sort((a, b) => a.startMin - b.startMin);
                    const std = defaultShifts(s.defaults, type);
                    return (
                      <div key={date} className="min-w-0 rounded-lg border border-borda bg-fundo/50 p-3">
                        <div className="mb-2 flex items-center gap-2">
                          <span className="font-bold text-tinta">{dayTitle(date, duty.holidays[date])}</span>
                          <div className="flex-1" />
                          <Button variant="ghost" size="sm" aria-label="Adicionar turno" onClick={() => update(s.id, (l) => [...l, { key: k(), date, ...(std[0] ?? { startMin: 480, endMin: 720 }), notes: null, people: [] }])}><Plus /></Button>
                        </div>
                        {day.length === 0 && (
                          <p className="text-xs text-tinta-suave">{std.length ? `Sem turno lançado (padrão de ${TYPE_LABEL[type]}: ${std.map((r) => `${formatClock(r.startMin)}–${formatClock(r.endMin)}`).join(', ')}).` : `Não funciona no ${TYPE_LABEL[type]}. Use + para um turno extra (ex.: aulão).`}</p>
                        )}
                        <div className="grid gap-2">
                          {day.map((x) => {
                            const set = (patch: Partial<Shift>) => update(s.id, (l) => l.map((y) => (y.key === x.key ? { ...y, ...patch } : y)));
                            return (
                              <div key={x.key} className="min-w-0 rounded-md border border-borda bg-white p-2">
                                <div className="flex items-center gap-1">
                                  <Input type="time" step={900} className="h-8 min-w-0 flex-1 text-sm sm:w-[7.75rem] sm:flex-none" value={formatClock(x.startMin)} onChange={(e) => e.target.value && set({ startMin: toMin(e.target.value) })} aria-label="Início" />
                                  <span className="text-tinta-suave">–</span>
                                  <Input type="time" step={900} className="h-8 min-w-0 flex-1 text-sm sm:w-[7.75rem] sm:flex-none" value={formatClock(x.endMin % 1440)} onChange={(e) => e.target.value && set({ endMin: toMin(e.target.value) || 1440 })} aria-label="Término" />
                                  <div className="flex-1 max-sm:hidden" />
                                  <Button variant="ghost" size="sm" aria-label="Remover turno" onClick={() => update(s.id, (l) => l.filter((y) => y.key !== x.key))}><X /></Button>
                                </div>
                                {x.endMin <= x.startMin && <p className="mt-1 text-xs text-critico">O término precisa ser depois do início.</p>}
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {x.people.map((p) => (
                                    <span key={p.id} className="inline-flex items-center gap-1 rounded-full bg-nacao/10 px-2 py-0.5 text-xs font-semibold text-nacao">
                                      {p.name}
                                      <button type="button" aria-label={`Tirar ${p.name}`} onClick={() => set({ people: x.people.filter((q) => q.id !== p.id) })}><X className="size-3" /></button>
                                    </span>
                                  ))}
                                  <Select className="h-7 w-auto min-w-36 text-xs" value="" aria-label="Adicionar pessoa"
                                    onChange={(e) => { const p = people.find((q) => q.id === e.target.value); if (p) set({ people: [...x.people, { id: p.id, name: p.name }] }); }}>
                                    <option value="">+ pessoa</option>
                                    {ofSector.length > 0 && <optgroup label={s.modality}>{ofSector.filter((p) => !x.people.some((q) => q.id === p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>}
                                    <optgroup label="Outros">{others.filter((p) => !x.people.some((q) => q.id === p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>
                                  </Select>
                                </div>
                                <Input className="mt-2 h-7 text-xs" maxLength={120} placeholder="Observação (opcional)" value={x.notes ?? ''} onChange={(e) => set({ notes: e.target.value || null })} />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {text !== null && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-navy/40 p-4" onClick={() => setText(null)}>
          <Card className="w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-2 font-extrabold text-navy">Texto para WhatsApp</h3>
            <textarea readOnly value={text} rows={18} className="w-full rounded-lg border border-borda bg-fundo p-3 font-mono text-xs" />
            <div className="mt-3 flex gap-2">
              <Button onClick={async () => { await navigator.clipboard.writeText(text); setMsg({ ok: 'Texto copiado. É só colar no grupo.' }); setText(null); }}><Copy /> Copiar</Button>
              <Button variant="ghost" onClick={() => setText(null)}>Fechar</Button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
