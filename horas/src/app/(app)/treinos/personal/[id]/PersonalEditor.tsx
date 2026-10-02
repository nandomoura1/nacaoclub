'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, Copy, Plus, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Input, Label, Select } from '@/components/ui/input';
import { WEEKDAYS, addDays, formatDateBR, weekdayOf } from '@/domain/dates';
import { PERSONAL_KINDS, PERSONAL_LABEL, personalWhatsapp, type PersonalBlockData } from '@/domain/personal';
import type { PersonalWorkoutView } from '@/server/services/personal-workout-service';
import { deletePersonalAction, savePersonalAction } from '../actions';

type Slot = { slotId: string; weekday: number; startMin: number; description: string; modality: string; teachers: { id: string; name: string }[] };
const AREA = 'w-full rounded-lg border border-borda bg-white px-3 py-2 text-sm outline-none focus:border-nacao';
const empty = (kind: string): PersonalBlockData => ({ kind, title: '', durationMin: null, format: '', content: '', notes: '' });
/** Próxima data (a partir de hoje) no dia da semana da aula. */
const nextOn = (today: string, weekday: number) => { let d = today; while (weekdayOf(d) !== weekday) d = addDays(d, 1); return d; };

export function PersonalEditor({ workout, slots, today, teachers, myTeacherId, all }: {
  workout: PersonalWorkoutView | null; slots: Slot[]; today: string; teachers: { id: string; name: string }[]; myTeacherId: string | null; all: boolean;
}) {
  const router = useRouter();
  const [v, setV] = useState({
    teacherId: workout?.teacherId ?? myTeacherId ?? '',
    slotId: workout?.slotId ?? '',
    date: workout?.date ?? today,
    student: workout?.student ?? '',
    title: workout?.title ?? '',
    goal: workout?.goal ?? '',
  });
  const [blocks, setBlocks] = useState<PersonalBlockData[]>(workout?.blocks ?? [empty('AQUECIMENTO'), empty('FORCA'), empty('CORE')]);
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [pending, start] = useTransition();
  const mySlots = slots.filter((s) => !v.teacherId || s.teachers.some((t) => t.id === v.teacherId));
  const slot = slots.find((s) => s.slotId === v.slotId);
  const wrongDay = slot && weekdayOf(v.date) !== slot.weekday;
  const setBlock = (i: number, patch: Partial<PersonalBlockData>) => setBlocks((b) => b.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, d: -1 | 1) => setBlocks((b) => { const c = [...b]; const [x] = c.splice(i, 1); c.splice(i + d, 0, x!); return c; });

  const save = () => start(async () => {
    setMsg({});
    const r = await savePersonalAction(workout?.id ?? null, { ...v, slotId: v.slotId || null, teacherId: v.teacherId || null, blocks });
    if (!r.ok) return setMsg({ error: r.error });
    setMsg({ ok: 'Treino salvo.' });
    if (!workout) router.replace(`/treinos/personal/${r.data}`); else router.refresh();
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <div className="min-w-0 space-y-4">
        <Card className="grid gap-3 p-4 sm:grid-cols-2">
          {all && (
            <div className="sm:col-span-2">
              <Label htmlFor="pw-teacher">Professor</Label>
              <Select id="pw-teacher" value={v.teacherId} onChange={(e) => setV({ ...v, teacherId: e.target.value, slotId: '' })}>
                <option value="">Escolha o professor</option>
                {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </div>
          )}
          <div>
            <Label htmlFor="pw-slot">Aula de Personal</Label>
            <Select id="pw-slot" value={v.slotId} onChange={(e) => {
              const s = slots.find((x) => x.slotId === e.target.value);
              setV({ ...v, slotId: e.target.value, date: s && weekdayOf(v.date) !== s.weekday ? nextOn(v.date < today ? today : v.date, s.weekday) : v.date });
            }}>
              <option value="">Aula avulsa (fora da grade)</option>
              {mySlots.map((s) => <option key={s.slotId} value={s.slotId}>{s.description}{all ? ` · ${s.teachers.map((t) => t.name).join(', ')}` : ''}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="pw-date">Data</Label>
            <Input id="pw-date" type="date" required value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} />
            <p className={wrongDay ? 'mt-1 text-xs font-semibold text-atencao' : 'mt-1 text-xs text-tinta-suave'}>
              {WEEKDAYS[weekdayOf(v.date) - 1]?.long}{wrongDay ? ` — a aula é de ${WEEKDAYS[slot!.weekday - 1]!.long.toLowerCase()}` : ''}
            </p>
          </div>
          <div>
            <Label htmlFor="pw-student">Aluno</Label>
            <Input id="pw-student" maxLength={120} placeholder="Nome do aluno" value={v.student} onChange={(e) => setV({ ...v, student: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="pw-title">Nome do treino</Label>
            <Input id="pw-title" required maxLength={120} placeholder="Ex.: Membros inferiores + core" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="pw-goal">Objetivo (opcional)</Label>
            <Input id="pw-goal" maxLength={600} placeholder="Ex.: força de pernas sem sobrecarregar o joelho" value={v.goal} onChange={(e) => setV({ ...v, goal: e.target.value })} />
          </div>
        </Card>

        {blocks.map((b, i) => (
          <Card key={i} className="p-4">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-40 flex-1">
                <Label htmlFor={`pb-kind-${i}`}>Bloco {i + 1}</Label>
                <Select id={`pb-kind-${i}`} value={b.kind} onChange={(e) => setBlock(i, { kind: e.target.value })}>
                  {PERSONAL_KINDS.map((k) => <option key={k} value={k}>{PERSONAL_LABEL[k]}</option>)}
                </Select>
              </div>
              <div className="w-24">
                <Label htmlFor={`pb-min-${i}`}>Minutos</Label>
                <Input id={`pb-min-${i}`} type="number" min={0} max={240} value={b.durationMin ?? ''} onChange={(e) => setBlock(i, { durationMin: e.target.value ? Number(e.target.value) : null })} />
              </div>
              <div className="flex gap-1">
                <Button type="button" variant="ghost" size="sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Subir"><ArrowUp /></Button>
                <Button type="button" variant="ghost" size="sm" disabled={i === blocks.length - 1} onClick={() => move(i, 1)} aria-label="Descer"><ArrowDown /></Button>
                <Button type="button" variant="ghost" size="sm" disabled={blocks.length === 1} onClick={() => setBlocks((x) => x.filter((_, j) => j !== i))} aria-label="Remover bloco"><Trash2 /></Button>
              </div>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div><Label htmlFor={`pb-title-${i}`}>Título (opcional)</Label><Input id={`pb-title-${i}`} maxLength={120} placeholder="Ex.: Agachamento" value={b.title} onChange={(e) => setBlock(i, { title: e.target.value })} /></div>
              <div><Label htmlFor={`pb-format-${i}`}>Formato (opcional)</Label><Input id={`pb-format-${i}`} maxLength={160} placeholder="Ex.: 4 x 10, descanso 60s" value={b.format} onChange={(e) => setBlock(i, { format: e.target.value })} /></div>
            </div>
            <div className="mt-3">
              <Label htmlFor={`pb-content-${i}`}>Exercícios (um por linha)</Label>
              <textarea id={`pb-content-${i}`} rows={4} maxLength={2000} className={AREA} placeholder={'Agachamento goblet 12kg\nAvanço alternado\nPonte de glúteo'} value={b.content} onChange={(e) => setBlock(i, { content: e.target.value })} />
            </div>
            <div className="mt-3"><Label htmlFor={`pb-notes-${i}`}>Observação (opcional)</Label><Input id={`pb-notes-${i}`} maxLength={600} value={b.notes} onChange={(e) => setBlock(i, { notes: e.target.value })} /></div>
          </Card>
        ))}
        <Button type="button" variant="secondary" onClick={() => setBlocks((b) => [...b, empty('OUTRO')])} disabled={blocks.length >= 15}><Plus /> Adicionar bloco</Button>
      </div>

      <div className="min-w-0 space-y-3 lg:sticky lg:top-4 lg:self-start">
        <Card className="space-y-2 p-4">
          <Button className="w-full" disabled={pending} onClick={save}><Save /> {pending ? 'Salvando…' : 'Salvar treino'}</Button>
          <Button className="w-full" variant="secondary" onClick={async () => { await navigator.clipboard.writeText(personalWhatsapp({ ...v, blocks })); setMsg({ ok: 'Texto copiado: é só colar no WhatsApp do aluno.' }); }}><Copy /> Copiar para o WhatsApp</Button>
          {workout && (
            <Button className="w-full text-critico" variant="ghost" disabled={pending} onClick={() => {
              if (!confirm(`Excluir o treino "${workout.title}" de ${formatDateBR(workout.date)}?`)) return;
              start(async () => { const r = await deletePersonalAction(workout.id); if (!r.ok) return setMsg({ error: r.error }); router.push('/treinos/personal'); });
            }}><Trash2 /> Excluir</Button>
          )}
          <FormMessage error={msg.error} success={msg.ok} />
        </Card>
        <Card className="p-4">
          <p className="mb-1 text-xs font-semibold text-tinta-suave">Prévia para o aluno</p>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-[#E7FFDB] p-3 font-sans text-sm text-tinta">{personalWhatsapp({ ...v, blocks })}</pre>
        </Card>
      </div>
    </div>
  );
}
