'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock, Copy, History, MapPin, Plus, Trash2, UserPlus, Users, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Input, Label, Select } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { WEEKDAYS, formatClock, formatDateBR, parseClock } from '@/domain/dates';
import { cn } from '@/lib/cn';
import { formatMinutes } from '@/lib/format';
import type { GradeItem } from '@/server/services/schedule-service';
import { changeSlotAction, createSlotsAction, endSlotAction, slotHistoryAction } from './actions';

type Area = { id: string; name: string; color: string };
type Mod = { id: string; name: string; color: string; areaId: string; defaultDurationMin: number };
type Opt = { id: string; name: string };
type ActType = Opt & { kind: string };
type Teacher = { id: string; name: string; fullName: string; modalityIds: string[] };
type Role = 'TITULAR' | 'AUXILIAR' | 'ESTAGIARIO';

const ROLE_LABEL: Record<Role, string> = { TITULAR: 'Professor', AUXILIAR: 'Auxiliar', ESTAGIARIO: 'Estagiário' };

interface Props {
  date: string; today: string; areaId: string | null; areas: Area[]; grade: GradeItem[]; canEdit: boolean;
  modalities: Mod[]; activityTypes: ActType[]; spaces: Opt[]; teachers: Teacher[];
}

type Editing = { mode: 'create'; weekday: number; base?: GradeItem } | { mode: 'edit'; item: GradeItem } | null;

export function GradeClient(props: Props) {
  const { date, today, areaId, areas, grade, canEdit } = props;
  const router = useRouter();
  const [editing, setEditing] = useState<Editing>(null);
  const [mobileDay, setMobileDay] = useState(() => {
    const d = new Date(`${date}T12:00:00Z`).getUTCDay();
    return d === 0 ? 7 : d;
  });

  const byDay = useMemo(() => {
    const map = new Map<number, GradeItem[]>();
    for (const w of WEEKDAYS) map.set(w.n, []);
    for (const g of grade) map.get(g.weekday)!.push(g);
    return map;
  }, [grade]);

  const weeklyClassMin = grade.reduce((s, g) => s + g.durationMin, 0);
  const weeklyPeopleMin = grade.filter((g) => g.activityType.kind !== 'PERSONAL').reduce((s, g) => s + g.durationMin * g.people.length, 0);
  const days = WEEKDAYS.filter((w) => w.n <= 6 || byDay.get(7)!.length > 0);

  const go = (params: Record<string, string | null>) => {
    const sp = new URLSearchParams({ data: date, ...(areaId ? { area: areaId } : {}) });
    for (const [k, v] of Object.entries(params)) (v ? sp.set(k, v) : sp.delete(k));
    router.push(`/grade?${sp}`);
  };

  return (
    <>
      <Card className="mb-4 flex flex-col gap-4 p-4 lg:flex-row lg:items-center">
        <div className="flex items-center gap-2">
          <CalendarClock className="size-5 text-nacao" />
          <Label htmlFor="g-date" className="mb-0 whitespace-nowrap">Grade valendo em</Label>
          <Input id="g-date" type="date" className="w-40" value={date} onChange={(e) => e.target.value && go({ data: e.target.value })} />
          {date !== today && <Button variant="ghost" size="sm" onClick={() => go({ data: today })}>hoje</Button>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {areas.length > 1 && (
            <button onClick={() => go({ area: null })} className={cn('rounded-full px-3 py-1 text-xs font-semibold', !areaId ? 'bg-navy text-white' : 'ring-1 ring-borda text-tinta-suave')}>Todas</button>
          )}
          {areas.map((a) => (
            <button key={a.id} onClick={() => go({ area: a.id })} className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold', areaId === a.id ? 'bg-navy text-white' : 'ring-1 ring-borda text-tinta-suave')}>
              <span className="size-2 rounded-full" style={{ background: a.color }} />{a.name}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <div className="flex gap-4 text-sm">
          <Stat label="atividades/semana" value={String(grade.length)} />
          <Stat label="horas de aula/semana" value={formatMinutes(weeklyClassMin)} />
          <Stat label="horas de professor/semana" value={formatMinutes(weeklyPeopleMin)} />
        </div>
      </Card>

      {/* Mobile: um dia por vez */}
      <div className="mb-3 flex gap-1 overflow-x-auto lg:hidden">
        {days.map((w) => (
          <button key={w.n} onClick={() => setMobileDay(w.n)} className={cn('min-w-12 flex-1 rounded-lg py-2 text-xs font-bold', mobileDay === w.n ? 'bg-nacao text-white' : 'bg-white text-tinta-suave ring-1 ring-borda')}>
            {w.short}<span className="block text-[10px] font-semibold opacity-75">{byDay.get(w.n)!.length}</span>
          </button>
        ))}
      </div>

      <div className={cn('grid gap-3', days.length === 7 ? 'lg:grid-cols-7' : 'lg:grid-cols-6')}>
        {days.map((w) => (
          <section key={w.n} className={cn('min-w-0', mobileDay !== w.n && 'hidden lg:block')}>
            <header className="sticky top-14 z-10 mb-2 flex items-center justify-between rounded-lg bg-fundo/95 py-1 backdrop-blur lg:top-0">
              <h2 className="text-xs font-extrabold tracking-[0.14em] text-navy">{w.short}<span className="ml-1.5 font-semibold text-tinta-fraca">{byDay.get(w.n)!.length}</span></h2>
              {canEdit && (
                <button onClick={() => setEditing({ mode: 'create', weekday: w.n })} className="rounded-md p-1 text-tinta-fraca hover:bg-white hover:text-nacao" aria-label={`Nova aula ${w.long}`}>
                  <Plus className="size-4" />
                </button>
              )}
            </header>
            <div className="space-y-2">
              {byDay.get(w.n)!.map((g) => (
                <SlotCard key={g.id} item={g} onClick={() => setEditing({ mode: 'edit', item: g })} />
              ))}
              {byDay.get(w.n)!.length === 0 && <p className="rounded-lg border border-dashed border-borda p-3 text-center text-xs text-tinta-fraca">sem aulas</p>}
            </div>
          </section>
        ))}
      </div>

      {editing && (
        <SlotSheet
          {...props}
          key={editing.mode === 'edit' ? editing.item.id : `new-${editing.weekday}`}
          editing={editing}
          defaultFrom={date > today ? date : today}
          onDuplicate={(item) => setEditing({ mode: 'create', weekday: item.weekday, base: item })}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-right">
      <p className="tabular text-lg font-extrabold leading-none text-navy">{value}</p>
      <p className="text-[11px] text-tinta-fraca">{label}</p>
    </div>
  );
}

function SlotCard({ item, onClick }: { item: GradeItem; onClick: () => void }) {
  const noCount = item.activityType.kind === 'PERSONAL';
  return (
    <button onClick={onClick} className="block w-full rounded-lg border border-borda bg-white p-2.5 text-left shadow-[0_1px_2px_rgba(2,43,87,0.05)] transition hover:border-nacao/40 hover:shadow-md" style={{ borderLeft: `4px solid ${item.modality.color}` }}>
      <p className="tabular text-[11px] font-bold text-tinta-fraca">{formatClock(item.startMin)}–{formatClock(item.startMin + item.durationMin)}</p>
      <p className="truncate text-sm font-extrabold uppercase tracking-tight" style={{ color: item.modality.color }}>{item.modality.name}</p>
      {item.label && <p className="truncate text-xs font-semibold text-tinta-suave">{item.label}</p>}
      <p className={cn('mt-0.5 truncate text-xs', item.people.length ? 'text-tinta' : 'font-semibold text-critico')}>
        {item.people.length ? item.people.map((p) => (p.role === 'TITULAR' ? p.name : `${p.name}*`)).join(', ') : 'sem professor'}
      </p>
      <div className="mt-1 flex flex-wrap gap-1">
        {item.activityType.kind !== 'AULA' && <Badge tone={noCount ? 'neutral' : 'cyan'}>{item.activityType.name}</Badge>}
        {item.space && <span className="inline-flex items-center gap-0.5 text-[10px] text-tinta-fraca"><MapPin className="size-3" />{item.space.name}</span>}
        {item.nextChange && <Badge tone="amber">muda {formatDateBR(item.nextChange).slice(0, 5)}</Badge>}
      </div>
    </button>
  );
}

function SlotSheet({
  editing, defaultFrom, canEdit, modalities, activityTypes, spaces, teachers, onClose, onDuplicate,
}: Props & { editing: NonNullable<Editing>; defaultFrom: string; onClose: () => void; onDuplicate: (i: GradeItem) => void }) {
  const base = editing.mode === 'edit' ? editing.item : editing.base;
  const aula = activityTypes.find((a) => a.kind === 'AULA') ?? activityTypes[0];
  const [v, setV] = useState({
    weekdays: [editing.mode === 'edit' ? editing.item.weekday : editing.weekday],
    start: base ? formatClock(base.startMin) : '06:00',
    durationMin: String(base?.durationMin ?? 60),
    modalityId: base?.modality.id ?? '',
    activityTypeId: base?.activityType.id ?? aula?.id ?? '',
    spaceId: base?.space?.id ?? '',
    label: base?.label ?? '',
    people: (base?.people ?? []).map((p) => ({ teacherId: p.teacherId, role: p.role as Role })),
    from: defaultFrom,
    reason: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<{ id: string; validFrom: string; validTo: string | null; summary: string; changeReason: string | null }[] | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((p) => ({ ...p, [k]: val }));
  const readOnly = !canEdit;

  const payload = () => {
    const startMin = parseClock(v.start);
    if (startMin === null) throw new Error('Horário inválido.');
    return { startMin, durationMin: v.durationMin, modalityId: v.modalityId, activityTypeId: v.activityTypeId, spaceId: v.spaceId, label: v.label, people: v.people.filter((p) => p.teacherId) };
  };

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    start(async () => {
      try {
        const r = await fn();
        if (!r.ok) return setError(r.error ?? 'Erro.');
        onClose();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editing.mode === 'create') run(() => createSlotsAction({ ...payload(), weekdays: v.weekdays, validFrom: v.from }));
    else run(() => changeSlotAction(editing.item.slotId, { ...payload(), weekday: v.weekdays[0], from: v.from, reason: v.reason }));
  };

  const modality = modalities.find((m) => m.id === v.modalityId);
  const sortedTeachers = useMemo(() => {
    const able = teachers.filter((t) => t.modalityIds.includes(v.modalityId));
    const others = teachers.filter((t) => !t.modalityIds.includes(v.modalityId));
    return { able, others };
  }, [teachers, v.modalityId]);

  return (
    <Sheet
      title={editing.mode === 'create' ? 'Nova aula na grade' : `${editing.item.modality.name} · ${WEEKDAYS[editing.item.weekday - 1]!.long} ${formatClock(editing.item.startMin)}`}
      onClose={onClose}
      onSubmit={submit}
      footer={readOnly ? <Button type="button" variant="secondary" onClick={onClose}>Fechar</Button> : (
        <>
          <Button type="submit" disabled={pending}>{pending ? 'Salvando…' : editing.mode === 'create' ? 'Criar aula' : 'Salvar alteração'}</Button>
          {editing.mode === 'edit' && (
            <>
              <Button type="button" variant="secondary" onClick={() => onDuplicate(editing.item)}><Copy /> Duplicar</Button>
              <Button type="button" variant="ghost" className="text-critico" disabled={pending}
                onClick={() => {
                  if (confirm(`Encerrar esta aula? A última acontece em ${formatDateBR(v.from)} menos um dia. O histórico é mantido.`)) {
                    run(() => endSlotAction(editing.item.slotId, v.from, v.reason));
                  }
                }}>
                <Trash2 /> Encerrar
              </Button>
            </>
          )}
        </>
      )}
    >
      <fieldset disabled={readOnly} className="space-y-5">
        <div>
          <p className="mb-1.5 text-xs font-semibold text-tinta-suave">{editing.mode === 'create' ? 'Dias da semana (cria uma aula por dia)' : 'Dia da semana'}</p>
          <div className="flex gap-1">
            {WEEKDAYS.map((w) => {
              const on = v.weekdays.includes(w.n);
              return (
                <button key={w.n} type="button" aria-pressed={on}
                  onClick={() => set('weekdays', editing.mode === 'edit' ? [w.n] : on ? v.weekdays.filter((d) => d !== w.n) : [...v.weekdays, w.n])}
                  className={cn('flex-1 rounded-md py-1.5 text-[11px] font-bold', on ? 'bg-nacao text-white' : 'bg-fundo text-tinta-suave')}>
                  {w.short}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="s-start">Início</Label>
            <Input id="s-start" type="time" step={300} required value={v.start} onChange={(e) => set('start', e.target.value)} />
          </div>
          <div>
            <Label htmlFor="s-dur">Duração (min)</Label>
            <Input id="s-dur" type="number" min={5} max={600} step={5} required value={v.durationMin} onChange={(e) => set('durationMin', e.target.value)} />
          </div>
        </div>

        <div>
          <Label htmlFor="s-mod">Modalidade</Label>
          <Select id="s-mod" required value={v.modalityId} onChange={(e) => {
            const m = modalities.find((x) => x.id === e.target.value);
            setV((p) => ({ ...p, modalityId: e.target.value, durationMin: editing.mode === 'create' && m ? String(m.defaultDurationMin) : p.durationMin }));
          }}>
            <option value="">Escolha…</option>
            {modalities.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="s-act">Tipo</Label>
            <Select id="s-act" required value={v.activityTypeId} onChange={(e) => set('activityTypeId', e.target.value)}>
              {activityTypes.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="s-space">Espaço</Label>
            <Select id="s-space" value={v.spaceId} onChange={(e) => set('spaceId', e.target.value)}>
              <option value="">—</option>
              {spaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
        </div>

        <div>
          <Label htmlFor="s-label">Turma (opcional)</Label>
          <Input id="s-label" placeholder="Ex.: Série A, Master, Aprendiz" value={v.label} onChange={(e) => set('label', e.target.value)} />
        </div>

        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-tinta-suave"><Users className="size-3.5" /> Quem dá a aula (cada pessoa recebe a duração cheia)</p>
          <div className="space-y-2">
            {v.people.map((p, i) => (
              <div key={i} className="flex gap-2">
                <Select aria-label="Professor" className="flex-1" value={p.teacherId} onChange={(e) => set('people', v.people.map((x, j) => (j === i ? { ...x, teacherId: e.target.value } : x)))}>
                  <option value="">Escolha…</option>
                  {sortedTeachers.able.length > 0 && (
                    <optgroup label={`Habilitados em ${modality?.name ?? 'modalidade'}`}>
                      {sortedTeachers.able.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </optgroup>
                  )}
                  <optgroup label="Outros">
                    {sortedTeachers.others.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </optgroup>
                </Select>
                <Select aria-label="Papel" className="w-32" value={p.role} onChange={(e) => set('people', v.people.map((x, j) => (j === i ? { ...x, role: e.target.value as Role } : x)))}>
                  {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                </Select>
                <button type="button" onClick={() => set('people', v.people.filter((_, j) => j !== i))} className="px-1 text-tinta-fraca hover:text-critico" aria-label="Remover">
                  <X className="size-4" />
                </button>
              </div>
            ))}
            <Button type="button" variant="secondary" size="sm" onClick={() => set('people', [...v.people, { teacherId: '', role: v.people.length ? 'AUXILIAR' : 'TITULAR' }])}>
              <UserPlus /> Adicionar pessoa
            </Button>
          </div>
        </div>

        <div className="rounded-lg bg-fundo p-3">
          <Label htmlFor="s-from">{editing.mode === 'create' ? 'Vale a partir de' : 'Esta alteração vale a partir de'}</Label>
          <Input id="s-from" type="date" required value={v.from} onChange={(e) => set('from', e.target.value)} />
          {editing.mode === 'edit' && (
            <>
              <p className="mt-1.5 text-xs text-tinta-suave">
                Antes dessa data a aula continua como era (em vigor desde {formatDateBR(editing.item.validFrom)}). Para mudar um dia só — falta, troca pontual — use o calendário.
              </p>
              <Input className="mt-2" placeholder="Motivo (opcional): ex. novo horário de HYROX" value={v.reason} onChange={(e) => set('reason', e.target.value)} />
            </>
          )}
        </div>
      </fieldset>

      {editing.mode === 'edit' && (
        <div>
          <Button type="button" variant="ghost" size="sm" onClick={() => start(async () => {
            const r = await slotHistoryAction(editing.item.slotId);
            if (r.ok) setHistory(r.data);
          })}>
            <History /> Ver histórico desta aula
          </Button>
          {history && (
            <ol className="mt-2 space-y-2 border-l-2 border-borda pl-3 text-xs">
              {history.map((h) => (
                <li key={h.id}>
                  <p className="font-bold text-navy">{formatDateBR(h.validFrom)} → {h.validTo ? formatDateBR(h.validTo) : 'em aberto'}</p>
                  <p className="text-tinta-suave">{h.summary}</p>
                  {h.changeReason && <p className="italic text-tinta-fraca">{h.changeReason}</p>}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
      <FormMessage error={error} />
    </Sheet>
  );
}
