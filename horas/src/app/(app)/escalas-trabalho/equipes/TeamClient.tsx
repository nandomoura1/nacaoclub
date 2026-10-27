'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus, UserMinus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Input, Label, Select } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { WEEKDAYS } from '@/domain/dates';
import { BOND_LABEL, hhmm } from '@/domain/escalas/labels';
import type { Bond, MemberHours, Mode, Shift3 } from '@/domain/escalas/types';
import { removeMemberAction, saveMemberAction } from '../actions';
import { MemberHoursEditor, WeekPatternEditor, WeekdayPicker } from '../shared';

export interface TeamMember {
  id: string; teacherId: string; name: string; functionName: string | null; altFunctions: string[]; bond: Bond; mode: Mode; hours: MemberHours;
  weeklyMin: number; fixedOff: number[]; availableDays: number[]; saturday: boolean; sunday: boolean; holiday: boolean; autoSchedule: boolean;
  notes: string | null; sortOrder: number; active: boolean;
}

const weekText = (w: (readonly [number, number, number] | null)[]) => w.map((x, i) => `${WEEKDAYS[i]!.short.toLowerCase()} ${x ? `${hhmm(x[0])}–${hhmm(x[1])}` : 'folga'}`).join(' · ');
const days = (ns: number[]) => ns.map((n) => WEEKDAYS[n - 1]!.short.toLowerCase()).join('/');

export function TeamClient({ sectorId, members, people, canEdit }: { sectorId: string; members: TeamMember[]; people: { id: string; name: string }[]; canEdit: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState<TeamMember | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const remove = (m: TeamMember) => confirm(`Tirar ${m.name} da equipe? (Se já está numa escala salva, fica só desativado.)`) && start(async () => {
    const r = await removeMemberAction(sectorId, m.id);
    if (!r.ok) setError(r.error); else router.refresh();
  });
  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-tinta-suave">{members.filter((m) => m.active).length} ativo(s)</p>
        {canEdit && <Button onClick={() => setOpen('new')}><Plus /> Adicionar colaborador</Button>}
      </div>
      <FormMessage error={error} />
      <div className="grid gap-2 md:grid-cols-2">
        {members.map((m) => (
          <Card key={m.id} className={m.active ? 'p-3' : 'p-3 opacity-60'}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-bold text-navy">{m.name} {!m.active && <Badge>inativo</Badge>}</p>
                <p className="text-xs text-tinta-suave">{[m.functionName, BOND_LABEL[m.bond], m.mode === 'COBERTURA' ? 'cobertura (só cobre buracos)' : null, !m.autoSchedule ? 'fora da geração automática' : null].filter(Boolean).join(' · ')}</p>
              </div>
              {canEdit && (
                <div className="flex gap-1">
                  <button type="button" aria-label="Editar" onClick={() => setOpen(m)} className="text-tinta-fraca hover:text-nacao"><Pencil className="size-4" /></button>
                  <button type="button" aria-label="Tirar da equipe" disabled={pending} onClick={() => remove(m)} className="text-tinta-fraca hover:text-critico"><UserMinus className="size-4" /></button>
                </div>
              )}
            </div>
            <p className="mt-1 text-xs text-tinta">
              {m.hours.week ? <span>Grade semanal{m.hours.week.B ? ' A/B' : ''}: {weekText(m.hours.week.A)}{m.hours.week.B ? <> · <b>B:</b> {weekText(m.hours.week.B)}</> : null}</span>
                : m.hours.base ? `${hhmm(m.hours.base[0])}–${hhmm(m.hours.base[1])} (intervalo ${m.hours.base[2]} min)` : m.mode === 'COBERTURA' ? 'Sob demanda (cobre postos descobertos)' : <span className="text-atencao">sem horário habitual</span>}
              {m.hours['6'] && ` · sáb ${hhmm(m.hours['6'][0])}–${hhmm(m.hours['6'][1])}`}
              {m.hours['7'] && ` · dom ${hhmm(m.hours['7'][0])}–${hhmm(m.hours['7'][1])}`}
              {` · ${m.weeklyMin / 60}h/semana`}
            </p>
            <p className="text-xs text-tinta-suave">
              {m.fixedOff.length ? `Folga fixa: ${days(m.fixedOff)}` : 'Sem folga fixa'}
              {m.availableDays.length ? ` · Disponível: ${days(m.availableDays)}` : ''}
              {!m.saturday ? ' · não trabalha sábado' : ''}{!m.sunday ? ' · não trabalha domingo' : ''}{!m.holiday ? ' · não trabalha feriado' : ''}
              {m.altFunctions.length ? ` · Também: ${m.altFunctions.join(', ')}` : ''}
            </p>
            {m.notes && <p className="mt-1 text-xs italic text-tinta-suave">{m.notes}</p>}
          </Card>
        ))}
      </div>
      {members.length === 0 && <Card className="p-6 text-center text-sm text-tinta-suave">Nenhum colaborador neste setor ainda.</Card>}
      {open && <MemberSheet sectorId={sectorId} member={open === 'new' ? null : open} people={people.filter((p) => !members.some((m) => m.teacherId === p.id))} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); router.refresh(); }} />}
    </>
  );
}

function MemberSheet({ sectorId, member, people, onClose, onSaved }: { sectorId: string; member: TeamMember | null; people: { id: string; name: string }[]; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState({
    who: 'existente' as 'existente' | 'novo', teacherId: '', newName: '',
    functionName: member?.functionName ?? '', altFunctions: member?.altFunctions.join(', ') ?? '', bond: member?.bond ?? ('CLT' as Bond), mode: member?.mode ?? ('FIXO' as Mode),
    hours: member?.hours ?? ({} as MemberHours), weeklyH: (member?.weeklyMin ?? 2400) / 60, fixedOff: member?.fixedOff ?? [], availableDays: member?.availableDays ?? [],
    saturday: member?.saturday ?? true, sunday: member?.sunday ?? true, holiday: member?.holiday ?? true, autoSchedule: member?.autoSchedule ?? true,
    notes: member?.notes ?? '', sortOrder: member?.sortOrder ?? 0, active: member?.active ?? true,
  });
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((p) => ({ ...p, [k]: val }));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await saveMemberAction(sectorId, member?.id ?? null, {
        teacherId: !member && v.who === 'existente' ? v.teacherId || null : null, newName: !member && v.who === 'novo' ? v.newName : null,
        functionName: v.functionName, altFunctions: v.altFunctions.split(',').map((x) => x.trim()).filter(Boolean), bond: v.bond, mode: v.mode,
        hours: v.hours, weeklyMin: Math.round(v.weeklyH * 60), fixedOff: v.fixedOff, availableDays: v.availableDays,
        saturday: v.saturday, sunday: v.sunday, holiday: v.holiday, autoSchedule: v.autoSchedule, notes: v.notes, sortOrder: v.sortOrder, active: v.active,
      });
      if (!r.ok) setError(r.error); else onSaved();
    });
  };
  const check = (k: 'saturday' | 'sunday' | 'holiday' | 'autoSchedule' | 'active', label: string) => (
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v[k]} onChange={(e) => set(k, e.target.checked)} className="size-4 accent-[#0169E9]" /> {label}</label>
  );
  return (
    <Sheet title={member ? `Editar ${member.name}` : 'Adicionar colaborador'} onClose={onClose} onSubmit={submit}
      footer={<><Button type="submit" disabled={pending}>{pending ? 'Salvando…' : 'Salvar'}</Button><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button></>}>
      {!member && (
        <div className="space-y-2">
          <div className="inline-flex rounded-lg border border-borda p-0.5 text-xs font-semibold">
            <button type="button" onClick={() => set('who', 'existente')} className={v.who === 'existente' ? 'rounded-md bg-navy px-3 py-1 text-white' : 'px-3 py-1 text-tinta-suave'}>Já cadastrado</button>
            <button type="button" onClick={() => set('who', 'novo')} className={v.who === 'novo' ? 'rounded-md bg-navy px-3 py-1 text-white' : 'px-3 py-1 text-tinta-suave'}>Pessoa nova</button>
          </div>
          {v.who === 'existente' ? (
            <div><Label htmlFor="m-t">Pessoa</Label><Select id="m-t" value={v.teacherId} onChange={(e) => set('teacherId', e.target.value)}><option value="">Escolha…</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></div>
          ) : (
            <div><Label htmlFor="m-n">Nome completo</Label><Input id="m-n" value={v.newName} maxLength={120} onChange={(e) => set('newName', e.target.value)} /><p className="mt-1 text-xs text-tinta-suave">Entra no cadastro de pessoas do sistema (documentos e contatos ficam lá).</p></div>
          )}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div><Label htmlFor="m-f">Função</Label><Input id="m-f" value={v.functionName} maxLength={60} onChange={(e) => set('functionName', e.target.value)} placeholder="Recepcionista, Cozinheira…" /></div>
        <div><Label htmlFor="m-b">Vínculo</Label><Select id="m-b" value={v.bond} onChange={(e) => { const b = e.target.value as Bond; setV((p) => ({ ...p, bond: b, mode: b === 'CLT' ? 'FIXO' : p.mode })); }}>{(['CLT', 'FUNAP', 'MEI', 'FREELANCER'] as Bond[]).map((b) => <option key={b} value={b}>{BOND_LABEL[b]}</option>)}</Select></div>
      </div>
      <div><Label htmlFor="m-a">Funções alternativas (separe por vírgula)</Label><Input id="m-a" value={v.altFunctions} onChange={(e) => set('altFunctions', e.target.value)} placeholder="Ex.: Caixa, Limpeza" /></div>
      {v.bond !== 'CLT' && (
        <div>
          <Label>Como entra na escala</Label>
          <Select value={v.mode} onChange={(e) => set('mode', e.target.value as Mode)}>
            <option value="FIXO">Fixo: trabalha nos dias e horário dele</option>
            <option value="COBERTURA">Cobertura: só cobre postos descobertos nos dias disponíveis</option>
          </Select>
          <p className="mt-1 text-xs text-tinta-suave">MEI e freelancer não seguem 5x2 nem regras CLT: o sistema respeita só a disponibilidade.</p>
        </div>
      )}
      <div>
        <Label>Horário</Label>
        <div className="mb-2 inline-flex rounded-lg border border-borda p-0.5 text-xs font-semibold">
          <button type="button" onClick={() => set('hours', { ...v.hours, week: undefined })} className={!v.hours.week ? 'rounded-md bg-navy px-3 py-1 text-white' : 'px-3 py-1 text-tinta-suave'}>Habitual (o sistema distribui as folgas)</button>
          <button type="button" onClick={() => set('hours', { ...v.hours, week: v.hours.week ?? { A: [1, 2, 3, 4, 5, 6, 7].map((d): Shift3 | null => (d <= 5 ? v.hours.base ?? [420, 960, 60] : null)) } })} className={v.hours.week ? 'rounded-md bg-navy px-3 py-1 text-white' : 'px-3 py-1 text-tinta-suave'}>Grade semanal fixa</button>
        </div>
        {v.hours.week ? <WeekPatternEditor value={v.hours.week} onChange={(w) => set('hours', { ...v.hours, week: w })} /> : <MemberHoursEditor value={v.hours} onChange={(h) => set('hours', h)} />}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><Label htmlFor="m-w">Carga semanal de referência (h)</Label><Input id="m-w" type="number" min={0} max={73} step={0.5} value={v.weeklyH} onChange={(e) => set('weeklyH', Number(e.target.value) || 0)} /></div>
        <div><Label htmlFor="m-o">Ordem na grade</Label><Input id="m-o" type="number" min={0} max={999} value={v.sortOrder} onChange={(e) => set('sortOrder', Number(e.target.value) || 0)} /></div>
      </div>
      <div><Label>Folgas fixas</Label><WeekdayPicker value={v.fixedOff} onChange={(x) => set('fixedOff', x)} /></div>
      <div><Label>Dias disponíveis (vazio = todos; para cobertura, só nesses)</Label><WeekdayPicker value={v.availableDays} onChange={(x) => set('availableDays', x)} /></div>
      <div className="grid grid-cols-2 gap-1">
        {check('saturday', 'Trabalha sábado')}{check('sunday', 'Trabalha domingo')}{check('holiday', 'Trabalha feriado')}{check('autoSchedule', 'Entra na geração automática')}{check('active', 'Ativo')}
      </div>
      <div><Label htmlFor="m-obs">Observações e restrições</Label><Input id="m-obs" value={v.notes} maxLength={500} onChange={(e) => set('notes', e.target.value)} /></div>
      <FormMessage error={error} />
    </Sheet>
  );
}
