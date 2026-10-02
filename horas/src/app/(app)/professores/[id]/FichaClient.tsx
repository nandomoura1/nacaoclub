'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarOff, Plus, Repeat, Trash2, Undo2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Sheet } from '@/components/ui/sheet';
import { Input, Label, Select } from '@/components/ui/input';
import { WEEKDAYS, addDays, formatClock, formatDateBR } from '@/domain/dates';
import { COVERAGE_LABEL, LEAVE_LABEL, type LeaveCoverage, type LeaveType } from '@/domain/leave';
import { cn } from '@/lib/cn';
import { formatMinutes } from '@/lib/format';
import type { GradeItem } from '@/server/services/schedule-service';
import type { LeaveItem } from '@/server/services/leave-service';
import { RemoveSlotSheet, SlotCard, SlotSheet, type Editing, type SheetProps } from '../../grade/GradeClient';
import { cancelLeaveAction, previewLeaveAction, removeExtraHoursAction, saveExtraHoursAction, saveLeaveAction } from './actions';
import type { ExtraHoursItem } from '@/server/services/extra-hours-service';

/* ───────────────────────── Aulas fixas ───────────────────────── */

export function AulasTab({ teacherId, teacherName, date, today, grade, sheet, canSubstitute }: {
  teacherId: string; teacherName: string; date: string; today: string; grade: GradeItem[]; sheet: SheetProps; canSubstitute: boolean;
}) {
  const [substituting, setSubstituting] = useState<GradeItem | null>(null);
  const router = useRouter();
  const [editing, setEditing] = useState<Editing>(null);
  const [removing, setRemoving] = useState<GradeItem | null>(null);
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const byDay = useMemo(() => WEEKDAYS.map((w) => ({ ...w, items: grade.filter((g) => g.weekday === w.n) })), [grade]);
  const weekly = grade.filter((g) => g.activityType.kind !== 'PERSONAL').reduce((s, g) => s + g.durationMin, 0);

  return (
    <>
      <Card className="mb-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <p className="text-sm text-tinta-suave">
          <b className="text-navy">{grade.length}</b> aula(s) por semana · <b className="text-navy">{formatMinutes(weekly)}</b> semanais, na grade valendo em {formatDateBR(date)}.
          Tudo aqui é a mesma grade da tela <b>Grade semanal</b>: mudou aqui, mudou lá.
        </p>
        <div className="flex-1" />
        {sheet.canEdit && <Button onClick={() => setEditing({ mode: 'create', weekday: 1, presetTeacherId: teacherId })}><Plus /> Nova aula para {teacherName.split(' ')[0]}</Button>}
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {byDay.filter((d) => d.n <= 6 || d.items.length).map((d) => (
          <section key={d.n}>
            <h3 className="mb-2 text-xs font-extrabold tracking-[0.14em] text-navy">{d.short}<span className="ml-1.5 font-semibold text-tinta-fraca">{d.items.length}</span></h3>
            <div className="space-y-2">
              {d.items.map((g) => (
                <div key={g.id}>
                  <SlotCard item={g} onClick={() => setEditing({ mode: 'edit', item: g })} />
                  {(sheet.canEdit || canSubstitute) && <div className="mt-1 flex gap-1">
                  {canSubstitute && (
                    <button className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-borda bg-white py-1 text-xs font-semibold text-tinta-suave hover:border-nacao hover:text-nacao"
                      aria-label={`Substituir ${g.modality.name} ${d.long}`}
                      onClick={() => { setMsg({}); setSubstituting(g); }}>
                      <Repeat className="size-3.5" /> Substituir
                    </button>
                  )}
                  {sheet.canEdit && (
                    <button className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-borda bg-white py-1 text-xs font-semibold text-tinta-suave hover:border-critico hover:text-critico"
                      aria-label={`Excluir horário ${g.modality.name} ${d.long}`}
                      onClick={() => { setMsg({}); setRemoving(g); }}>
                      <Trash2 className="size-3.5" /> Excluir
                    </button>
                  )}
                  </div>}
                </div>
              ))}
              {d.items.length === 0 && <p className="rounded-lg border border-dashed border-borda p-3 text-center text-xs text-tinta-fraca">livre</p>}
            </div>
          </section>
        ))}
      </div>

      <FormMessage error={msg.error} success={msg.ok} />

      {substituting && (
        <SubstituteSheet item={substituting} teacherId={teacherId} teacherName={teacherName} teachers={sheet.teachers} defaultStart={date > today ? date : today}
          onClose={(ok) => { setSubstituting(null); if (ok) { setMsg({ ok }); router.refresh(); } }} />
      )}
      {removing && (
        <RemoveSlotSheet item={removing} teacher={{ id: teacherId, name: removing.people.find((p) => p.teacherId === teacherId)?.name ?? teacherName }}
          defaultFrom={date > today ? date : today}
          onClose={(changed) => { setRemoving(null); if (changed) { setMsg({ ok: 'Horário excluído. As horas a partir da data já foram refeitas.' }); router.refresh(); } }} />
      )}

      {editing && (
        <SlotSheet
          {...sheet}
          key={editing.mode === 'edit' ? editing.item.id : 'new'}
          editing={editing}
          defaultFrom={date > today ? date : today}
          onDuplicate={(item) => setEditing({ mode: 'create', weekday: item.weekday, base: item })}
          onClose={() => { setEditing(null); router.refresh(); }}
        />
      )}
    </>
  );
}

/**
 * Substituição de UMA aula por um período (ex.: alguém puxa a aula de segunda
 * durante as férias). Cada aula pode ter o seu substituto.
 */
function SubstituteSheet({ item, teacherId, teacherName, teachers, defaultStart, onClose }: {
  item: GradeItem; teacherId: string; teacherName: string; teachers: SheetProps['teachers']; defaultStart: string; onClose: (ok?: string) => void;
}) {
  const [v, setV] = useState({ substituteId: '', type: 'FERIAS' as LeaveType, startDate: defaultStart, endDate: addDays(defaultStart, 13), notes: '' });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => { setV((p) => ({ ...p, [k]: val })); setPreview(null); };
  const others = teachers.filter((t) => t.id !== teacherId);
  const able = others.filter((t) => t.modalityIds.includes(item.modality.id));
  const rest = others.filter((t) => !able.includes(t));
  const what = `${item.modality.name} · ${WEEKDAYS[item.weekday - 1]!.long} ${formatClock(item.startMin)}`;
  const payload = () => ({ ...v, coverage: 'SUBSTITUIR', slotId: item.slotId });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!v.substituteId) return setError('Escolha quem vai dar a aula.');
    start(async () => {
      if (!preview) {
        const r = await previewLeaveAction(teacherId, payload());
        return r.ok ? setPreview(r.data) : setError(r.error);
      }
      const r = await saveLeaveAction(teacherId, payload());
      if (!r.ok) return setError(r.error);
      onClose(`Substituição lançada: ${r.data.applied} aula(s) de ${what}${r.data.closed ? ` · ${r.data.closed} em competência fechada ficaram como estavam` : ''}.`);
    });
  };

  return (
    <Sheet title="Substituir aula" onClose={() => onClose()} onSubmit={submit}
      footer={<>
        <Button type="submit" disabled={pending}><Repeat /> {pending ? 'Conferindo…' : preview ? 'Lançar substituição' : 'Conferir'}</Button>
        <Button type="button" variant="ghost" onClick={() => onClose()}>Cancelar</Button>
      </>}>
      <div className="space-y-4">
        <div className="rounded-lg border border-borda p-3" style={{ borderLeft: `4px solid ${item.modality.color}` }}>
          <p className="font-extrabold text-navy">{what}</p>
          <p className="text-sm text-tinta-suave">{formatClock(item.startMin)}–{formatClock(item.startMin + item.durationMin)} · hoje com {teacherName}</p>
        </div>
        <div>
          <Label htmlFor="sb-who">Quem dá a aula</Label>
          <Select id="sb-who" value={v.substituteId} onChange={(e) => set('substituteId', e.target.value)}>
            <option value="">Escolha o substituto</option>
            {able.length > 0 && <optgroup label={`Dão ${item.modality.name}`}>{able.map((t) => <option key={t.id} value={t.id}>{t.fullName}</option>)}</optgroup>}
            <optgroup label="Outros">{rest.map((t) => <option key={t.id} value={t.id}>{t.fullName}</option>)}</optgroup>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="sb-from">De</Label>
            <Input id="sb-from" type="date" required value={v.startDate} onChange={(e) => e.target.value && set('startDate', e.target.value)} />
          </div>
          <div>
            <Label htmlFor="sb-to">Até</Label>
            <Input id="sb-to" type="date" required min={v.startDate} value={v.endDate} onChange={(e) => e.target.value && set('endDate', e.target.value)} />
          </div>
        </div>
        <div>
          <Label htmlFor="sb-type">Motivo</Label>
          <Select id="sb-type" value={v.type} onChange={(e) => set('type', e.target.value as LeaveType)}>
            {(['FERIAS', 'ATESTADO', 'AFASTAMENTO', 'FOLGA'] as LeaveType[]).map((t) => <option key={t} value={t}>{LEAVE_LABEL[t]}</option>)}
          </Select>
        </div>
        <div>
          <Label htmlFor="sb-notes">Observação (opcional)</Label>
          <Input id="sb-notes" maxLength={500} value={v.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Ex.: combinado com a coordenação" />
        </div>
        {preview && (
          <div className="rounded-lg bg-fundo p-3 text-sm text-tinta">
            <p><b>{preview.count}</b> aula(s) passam para o substituto{preview.closed ? ` (${preview.closed} em competência fechada não mudam)` : ''}.</p>
            {preview.sample.length > 0 && <p className="mt-1 text-xs text-tinta-suave">{preview.sample.join(' · ')}{preview.count > preview.sample.length ? ' …' : ''}</p>}
            {preview.note && <p className="mt-1 text-xs text-tinta-suave">{preview.note}</p>}
            {preview.conflicts.length > 0 && <p className="mt-2 text-xs font-semibold text-atencao">Atenção: {preview.conflicts.join('; ')}</p>}
            <p className="mt-2 text-xs text-tinta-suave">As horas vão para o substituto nesse período; depois a aula volta sozinha para {teacherName}. Dá para anular na aba Ausências e exceções.</p>
          </div>
        )}
        <FormMessage error={error} />
      </div>
    </Sheet>
  );
}

/* ───────────────────────── Ausências ───────────────────────── */

type Preview = Extract<Awaited<ReturnType<typeof previewLeaveAction>>, { ok: true }>['data'];

export function AusenciasTab({ teacherId, leaves, substitutes, canManage, today }: {
  teacherId: string; leaves: LeaveItem[]; substitutes: { suggested: { id: string; name: string }[]; others: { id: string; name: string }[] };
  canManage: boolean; today: string;
}) {
  const router = useRouter();
  const [v, setV] = useState({ type: 'FERIAS' as LeaveType, startDate: today, endDate: today, coverage: 'PENDENTE' as LeaveCoverage, substituteId: '', notes: '' });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [pending, start] = useTransition();
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => { setV((p) => ({ ...p, [k]: val })); setPreview(null); };
  const payload = () => ({ ...v, endDate: v.type === 'FALTA' ? v.startDate : v.endDate });

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      {canManage && (
        <Card className="h-fit p-5">
          <h3 className="mb-3 flex items-center gap-2 font-extrabold text-navy"><CalendarOff className="size-4" /> Lançar ausência</h3>
          <form className="space-y-3" onSubmit={(e) => {
            e.preventDefault();
            setMsg({});
            start(async () => {
              if (!preview) {
                const r = await previewLeaveAction(teacherId, payload());
                return r.ok ? setPreview(r.data) : setMsg({ error: r.error });
              }
              const r = await saveLeaveAction(teacherId, payload());
              if (!r.ok) return setMsg({ error: r.error });
              setMsg({ ok: `Ausência lançada: ${r.data.applied} aula(s) ajustada(s)${r.data.closed ? ` · ${r.data.closed} em competência fechada ficaram como estavam` : ''}.` });
              setPreview(null);
              router.refresh();
            });
          }}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="l-type">Tipo</Label>
                <Select id="l-type" value={v.type} onChange={(e) => set('type', e.target.value as LeaveType)}>
                  {(Object.keys(LEAVE_LABEL) as LeaveType[]).map((t) => <option key={t} value={t}>{LEAVE_LABEL[t]}</option>)}
                </Select>
              </div>
              <div />
              <div>
                <Label htmlFor="l-start">{v.type === 'FALTA' ? 'Dia' : 'De'}</Label>
                <Input id="l-start" type="date" required value={v.startDate} onChange={(e) => { set('startDate', e.target.value); if (e.target.value > v.endDate) set('endDate', e.target.value); }} />
              </div>
              {v.type !== 'FALTA' && (
                <div>
                  <Label htmlFor="l-end">Até (inclusive)</Label>
                  <Input id="l-end" type="date" required min={v.startDate} value={v.endDate} onChange={(e) => set('endDate', e.target.value)} />
                </div>
              )}
            </div>
            <fieldset>
              <legend className="mb-1.5 text-xs font-semibold text-tinta-suave">O que acontece com as aulas</legend>
              <div className="space-y-1.5">
                {(['SUBSTITUIR', 'PENDENTE', 'CANCELAR'] as LeaveCoverage[]).map((c) => (
                  <label key={c} className={cn('flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-sm', v.coverage === c ? 'border-nacao bg-nacao/5' : 'border-borda')}>
                    <input type="radio" name="coverage" className="accent-[#0169E9]" checked={v.coverage === c} onChange={() => set('coverage', c)} />
                    {COVERAGE_LABEL[c]}
                    <span className="text-xs text-tinta-fraca">
                      {c === 'SUBSTITUIR' ? '— as horas vão para quem cobrir' : c === 'PENDENTE' ? '— define depois, aula a aula' : '— ninguém dá; aula sai das horas'}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            {v.coverage === 'SUBSTITUIR' && (
              <div>
                <Label htmlFor="l-sub">Quem substitui</Label>
                <Select id="l-sub" required value={v.substituteId} onChange={(e) => set('substituteId', e.target.value)}>
                  <option value="">Escolha…</option>
                  {substitutes.suggested.length > 0 && <optgroup label="Habilitados nas mesmas modalidades">{substitutes.suggested.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</optgroup>}
                  <optgroup label="Outros">{substitutes.others.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</optgroup>
                </Select>
              </div>
            )}
            <div>
              <Label htmlFor="l-notes">Observação (opcional)</Label>
              <Input id="l-notes" value={v.notes} maxLength={500} onChange={(e) => set('notes', e.target.value)} placeholder="Ex.: atestado entregue ao DP" />
            </div>

            {preview && (
              <div className="rounded-lg bg-fundo p-3 text-sm">
                <p className="font-bold text-navy">Afeta {preview.count} aula(s) · {formatMinutes(preview.minutes)}</p>
                {preview.sample.length > 0 && <p className="mt-1 text-xs text-tinta-suave">{preview.sample.join(' · ')}{preview.count > preview.sample.length ? ' …' : ''}</p>}
                {preview.note && <p className="mt-1 text-xs text-tinta-suave">{preview.note}</p>}
                {preview.closed > 0 && <p className="mt-1 text-xs text-atencao">{preview.closed} aula(s) estão em competência fechada e não serão alteradas.</p>}
                {preview.conflicts.map((c) => <p key={c} className="mt-1 text-xs text-atencao">⚠ {c}</p>)}
              </div>
            )}
            <FormMessage error={msg.error} success={msg.ok} />
            <div className="flex gap-2">
              <Button type="submit" disabled={pending}>{pending ? 'Calculando…' : preview ? 'Confirmar ausência' : 'Ver impacto'}</Button>
              {preview && <Button type="button" variant="ghost" onClick={() => setPreview(null)}>Ajustar</Button>}
            </div>
          </form>
        </Card>
      )}

      <Card className="h-fit divide-y divide-borda">
        <h3 className="p-4 font-extrabold text-navy">Histórico de ausências</h3>
        {leaves.length === 0 && <p className="p-4 text-sm text-tinta-suave">Nenhuma ausência lançada.</p>}
        {leaves.map((l) => (
          <div key={l.id} className={cn('flex items-start gap-3 p-4', l.cancelled && 'opacity-55')}>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-tinta">
                {l.slot ? `Substituição · ${l.slot}` : LEAVE_LABEL[l.type]} · {formatDateBR(l.startDate)}{l.endDate !== l.startDate ? ` a ${formatDateBR(l.endDate)}` : ''}
                {l.cancelled && <Badge tone="neutral" className="ml-2">anulada</Badge>}
              </p>
              <p className="text-xs text-tinta-suave">{l.slot ? `${LEAVE_LABEL[l.type]} · dá a aula: ${l.substitute}` : `${COVERAGE_LABEL[l.coverage]}${l.substitute ? `: ${l.substitute}` : ''}`} · {l.classes} aula(s){l.notes ? ` · ${l.notes}` : ''}</p>
            </div>
            {canManage && !l.cancelled && (
              <Button variant="ghost" size="sm" disabled={pending} onClick={() => {
                if (!confirm('Anular esta ausência? As aulas voltam ao previsto (fica registrado no histórico).')) return;
                setMsg({});
                start(async () => {
                  const r = await cancelLeaveAction(l.id);
                  setMsg(r.ok ? { ok: `Ausência anulada: ${r.data.restored} aula(s) voltaram ao previsto.` } : { error: r.error });
                  router.refresh();
                });
              }}><Undo2 /> Anular</Button>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
}


/* ───────────────────────── Horas extras ───────────────────────── */

/** Horas extras do professor na competência: lançar e remover (competência aberta). */
export function ExtraHoursCard({ teacherId, items, canEdit, defaultDate, modalities, activityTypes }: {
  teacherId: string; items: ExtraHoursItem[]; canEdit: boolean; defaultDate: string;
  modalities: { id: string; name: string }[]; activityTypes: { id: string; name: string; kind: string }[];
}) {
  const router = useRouter();
  const aula = activityTypes.find((t) => t.kind === 'AULA') ?? activityTypes[0];
  const [v, setV] = useState({ date: defaultDate, start: '', end: '', modalityId: modalities[0]?.id ?? '', activityTypeId: aula?.id ?? '', description: '' });
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [pending, start] = useTransition();
  const total = items.reduce((s, i) => s + i.minutes, 0);
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((p) => ({ ...p, [k]: val }));

  return (
    <Card className="mb-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-extrabold text-navy">Horas extras</h3>
        <span className="text-sm text-tinta-suave">{items.length ? `${items.length} lançamento(s) · ${formatMinutes(total)} nesta competência` : 'nenhuma nesta competência'}</span>
        <span className="flex-1" />
        {canEdit && !open && <Button size="sm" onClick={() => { setMsg({}); setOpen(true); }}><Plus /> Lançar hora extra</Button>}
      </div>
      {open && (
        <form className="mt-3 grid gap-3 rounded-lg bg-fundo p-3 sm:grid-cols-2 lg:grid-cols-6" onSubmit={(e) => {
          e.preventDefault();
          setMsg({});
          start(async () => {
            const r = await saveExtraHoursAction(teacherId, v);
            if (!r.ok) return setMsg({ error: r.error });
            setMsg({ ok: `Hora extra lançada: ${formatMinutes(r.data.minutes)}. Já entra no quadro de horas.` });
            setV((p) => ({ ...p, start: '', end: '', description: '' }));
            setOpen(false);
            router.refresh();
          });
        }}>
          <div><Label htmlFor="ex-date">Data</Label><Input id="ex-date" type="date" required value={v.date} onChange={(e) => set('date', e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label htmlFor="ex-start">Início</Label><Input id="ex-start" type="time" required value={v.start} onChange={(e) => set('start', e.target.value)} /></div>
            <div><Label htmlFor="ex-end">Fim</Label><Input id="ex-end" type="time" required value={v.end} onChange={(e) => set('end', e.target.value)} /></div>
          </div>
          <div><Label htmlFor="ex-mod">Modalidade</Label>
            <Select id="ex-mod" value={v.modalityId} onChange={(e) => set('modalityId', e.target.value)}>{modalities.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select>
          </div>
          <div><Label htmlFor="ex-type">Tipo</Label>
            <Select id="ex-type" value={v.activityTypeId} onChange={(e) => set('activityTypeId', e.target.value)}>{activityTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
          </div>
          <div className="sm:col-span-2"><Label htmlFor="ex-desc">Descrição</Label><Input id="ex-desc" required maxLength={120} placeholder="Ex.: aulão de sábado, cobriu turno extra, evento" value={v.description} onChange={(e) => set('description', e.target.value)} /></div>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-6">
            <Button type="submit" disabled={pending}>{pending ? 'Lançando…' : 'Lançar'}</Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          </div>
        </form>
      )}
      <FormMessage error={msg.error} success={msg.ok} />
      {items.length > 0 && (
        <ul className="mt-3 divide-y divide-borda text-sm">
          {items.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <span className="tabular w-24 font-semibold text-navy">{formatDateBR(i.date)}</span>
              <span className="tabular text-tinta">{i.start}–{i.end} · {formatMinutes(i.minutes)}</span>
              <span className="min-w-0 flex-1 text-tinta-suave">{i.modality} · {i.type} · {i.description}</span>
              {canEdit && !i.closed && (
                <Button variant="ghost" size="sm" disabled={pending} onClick={() => {
                  if (!confirm(`Remover a hora extra de ${formatDateBR(i.date)} ${i.start}–${i.end}?`)) return;
                  start(async () => {
                    const r = await removeExtraHoursAction(i.id);
                    setMsg(r.ok ? { ok: 'Hora extra removida.' } : { error: r.error });
                    router.refresh();
                  });
                }}><Trash2 /> Remover</Button>
              )}
              {i.closed && <Badge tone="neutral">competência fechada</Badge>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
