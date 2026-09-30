'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarRange } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Input, Label, Select } from '@/components/ui/input';
import { isIsoDate, WEEKDAYS } from '@/domain/dates';
import { CAPACITY_LABEL, HORIZON_LABEL, LEVEL_LABEL, PROGRAM_KINDS, horizon, trainingDates, type ProgramRequest } from '@/domain/programming/ai-program';
import { cn } from '@/lib/cn';
import { createProgramAction } from './ai-actions';

type Form = Omit<ProgramRequest, 'length'> & { length: string };

/** Nova planilha: estratégia de curto, médio ou longo prazo. */
export function ProgramForm({ slug, defaultStart, enabled }: { slug: string; defaultStart: string; enabled: boolean }) {
  const router = useRouter();
  const [f, setF] = useState<Form>({
    kind: 'periodizacao', title: '', startDate: defaultStart, length: '4', unit: 'semanas', weekdays: [1, 2, 3, 4, 5, 6],
    goal: '', capacity: 'forca', movement: '', test: '3RM', level: 'geral', window: 14,
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  const preview = useMemo(() => {
    const length = Number(f.length);
    if (!isIsoDate(f.startDate) || !(length >= 1 && length <= 84)) return null;
    const req = { ...f, length };
    return { classes: trainingDates(req).length, horizon: HORIZON_LABEL[horizon(req)] };
  }, [f]);

  const submit = () => start(async () => {
    setError(null);
    const r = await createProgramAction(slug, { ...f, length: Number(f.length) });
    if (!r.ok) return setError(r.error);
    router.push(`/treinos/${slug}/ia/planilha/${r.data}`);
  });

  const perio = f.kind === 'periodizacao';
  return (
    <Card className="p-4">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className="grid gap-2 sm:grid-cols-2">
          {PROGRAM_KINDS.map((k) => (
            <label key={k.id} className={cn('cursor-pointer rounded-xl border p-3 text-sm', f.kind === k.id ? 'border-nacao bg-nacao/5' : 'border-borda')}>
              <span className="flex items-center gap-2 font-bold text-navy">
                <input type="radio" name="kind" className="accent-[#0169E9]" checked={f.kind === k.id} onChange={() => set('kind', k.id)} />
                {k.label}
              </span>
              <span className="mt-1 block text-tinta-suave">{k.help}</span>
            </label>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label htmlFor="pg-start">Início</Label>
            <Input id="pg-start" type="date" required value={f.startDate} onChange={(e) => set('startDate', e.target.value)} />
          </div>
          <div>
            <Label htmlFor="pg-len">Duração</Label>
            <div className="flex gap-2">
              <Input id="pg-len" type="number" min={1} max={f.unit === 'semanas' ? 12 : 84} required className="w-20" value={f.length} onChange={(e) => set('length', e.target.value)} />
              <Select aria-label="Unidade" value={f.unit} onChange={(e) => set('unit', e.target.value as Form['unit'])}>
                <option value="semanas">semanas</option>
                <option value="dias">dias</option>
              </Select>
            </div>
            {preview && <p className="mt-1 text-xs text-tinta-suave">{preview.horizon} · {preview.classes} aulas</p>}
          </div>
          <div>
            <Label htmlFor="pg-win">Baseado nos últimos</Label>
            <Select id="pg-win" value={f.window} onChange={(e) => set('window', Number(e.target.value) as Form['window'])}>
              <option value={14}>14 dias de treinos</option>
              <option value={30}>30 dias de treinos</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="pg-title">Nome (opcional)</Label>
            <Input id="pg-title" maxLength={80} placeholder="Ex.: Ciclo de back squat" value={f.title} onChange={(e) => set('title', e.target.value)} />
          </div>
        </div>

        <div>
          <Label>Dias de aula</Label>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.slice(0, 6).map((w) => {
              const on = f.weekdays.includes(w.n);
              return (
                <button key={w.n} type="button" onClick={() => set('weekdays', on ? f.weekdays.filter((x) => x !== w.n) : [...f.weekdays, w.n].sort())}
                  className={cn('rounded-full border px-3 py-1.5 text-sm font-semibold', on ? 'border-navy bg-navy text-white' : 'border-borda text-tinta')}>
                  {w.short}
                </button>
              );
            })}
          </div>
        </div>

        {perio && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label htmlFor="pg-cap">Capacidade</Label>
              <Select id="pg-cap" value={f.capacity} onChange={(e) => set('capacity', e.target.value as Form['capacity'])}>
                {Object.entries(CAPACITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="pg-mov">Movimento (opcional)</Label>
              <Input id="pg-mov" maxLength={80} placeholder="Ex.: back squat, muscle-up, Murph" value={f.movement} onChange={(e) => set('movement', e.target.value)} />
            </div>
            <div>
              <Label htmlFor="pg-test">Teste ao final</Label>
              <Select id="pg-test" value={f.test} onChange={(e) => set('test', e.target.value as Form['test'])}>
                {['nenhum', '1RM', '3RM', '5RM', 'benchmark', 'max reps'].map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="pg-lvl">Perfil dos alunos</Label>
              <Select id="pg-lvl" value={f.level} onChange={(e) => set('level', e.target.value as Form['level'])}>
                {Object.entries(LEVEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </div>
          </div>
        )}

        <div>
          <Label htmlFor="pg-goal">{perio ? 'Objetivo' : 'Observações (opcional)'}</Label>
          <textarea id="pg-goal" maxLength={600} rows={2}
            className="w-full rounded-lg border border-borda bg-white px-3 py-2 text-sm outline-none focus:border-nacao"
            placeholder={perio ? 'Ex.: aumentar a força no back squat com 2 estímulos por semana, sem descaracterizar o CrossFit geral' : 'Ex.: semana de Open, evitar corrida às sextas'}
            value={f.goal} onChange={(e) => set('goal', e.target.value)} />
        </div>

        <FormMessage error={error} />
        <Button type="submit" disabled={pending || !enabled}>
          <CalendarRange /> {pending ? 'Criando a estratégia… (até 2–3 min)' : 'Criar planilha'}
        </Button>
        <p className="text-xs text-tinta-fraca">A IA desenha a estratégia (fases, semanas e o tema de cada dia). Depois você gera as aulas completas semana a semana, confere e lança no Cadastro de Treino.</p>
      </form>
    </Card>
  );
}
