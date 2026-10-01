'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarOff, Plus, Trash2, Undo2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Input, Label, Select } from '@/components/ui/input';
import { WEEKDAYS, formatDateBR } from '@/domain/dates';
import { COVERAGE_LABEL, LEAVE_LABEL, type LeaveCoverage, type LeaveType } from '@/domain/leave';
import { cn } from '@/lib/cn';
import { formatMinutes } from '@/lib/format';
import type { GradeItem } from '@/server/services/schedule-service';
import type { LeaveItem } from '@/server/services/leave-service';
import { RemoveSlotSheet, SlotCard, SlotSheet, type Editing, type SheetProps } from '../../grade/GradeClient';
import { cancelLeaveAction, previewLeaveAction, saveLeaveAction } from './actions';

/* ───────────────────────── Aulas fixas ───────────────────────── */

export function AulasTab({ teacherId, teacherName, date, today, grade, sheet }: {
  teacherId: string; teacherName: string; date: string; today: string; grade: GradeItem[]; sheet: SheetProps;
}) {
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
                  {sheet.canEdit && (
                    <button className="mt-1 inline-flex w-full items-center justify-center gap-1 rounded-md border border-borda bg-white py-1 text-xs font-semibold text-tinta-suave hover:border-critico hover:text-critico"
                      aria-label={`Excluir horário ${g.modality.name} ${d.long}`}
                      onClick={() => { setMsg({}); setRemoving(g); }}>
                      <Trash2 className="size-3.5" /> Excluir
                    </button>
                  )}
                </div>
              ))}
              {d.items.length === 0 && <p className="rounded-lg border border-dashed border-borda p-3 text-center text-xs text-tinta-fraca">livre</p>}
            </div>
          </section>
        ))}
      </div>

      <FormMessage error={msg.error} success={msg.ok} />

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
                {LEAVE_LABEL[l.type]} · {formatDateBR(l.startDate)}{l.endDate !== l.startDate ? ` a ${formatDateBR(l.endDate)}` : ''}
                {l.cancelled && <Badge tone="neutral" className="ml-2">anulada</Badge>}
              </p>
              <p className="text-xs text-tinta-suave">{COVERAGE_LABEL[l.coverage]}{l.substitute ? `: ${l.substitute}` : ''} · {l.classes} aula(s){l.notes ? ` · ${l.notes}` : ''}</p>
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

