'use client';

import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Clock, Plus, Trash2, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Input, Label, Select } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { formatDateBR, parseClock, weekdayOf, WEEKDAYS } from '@/domain/dates';
import { windowsLabel } from '@/domain/escalas/calendar';
import type { HoursMap } from '@/domain/escalas/types';
import type { calendarData } from '@/server/services/ws-service';
import { deleteOverrideAction, saveNacaoHoursAction, saveOverrideAction } from '../actions';
import { HoursMapEditor } from '../shared';

type Data = Awaited<ReturnType<typeof calendarData>>;
type Draft = { date: string; sectorId: string; closed: boolean; start: string; end: string; reason: string; eventId: string; extraPeople: number };

export function CalendarClient({ data, mes, sectorId, canEdit, adjustDate }: { data: Data; mes: string; sectorId: string | null; canEdit: boolean; adjustDate: string | null }) {
  const router = useRouter();
  const path = usePathname();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [hours, setHours] = useState<HoursMap>(data.nacaoHours);
  const newDraft = (o: Partial<Draft> = {}): Draft => ({ date: data.month.first, sectorId: data.canAdmin ? '' : sectorId ?? '', closed: false, start: '', end: '', reason: '', eventId: '', extraPeople: 0, ...o });
  const holidayDraft = (date: string) => newDraft({ date, reason: `Feriado: ${data.holidays.find((h) => h.date === date)?.name ?? ''} — horário reduzido` });
  // Vindo da escala ("Ajustar" num feriado): já abre a exceção daquela data.
  const [draft, setDraft] = useState<Draft | null>(() => (canEdit && adjustDate && data.holidays.some((h) => h.date === adjustDate) ? holidayDraft(adjustDate) : null));
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => start(async () => {
    const r = await fn();
    if (!r.ok) setError(r.error ?? 'Erro.'); else { setError(null); after?.(); router.refresh(); }
  });
  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <div><Label htmlFor="f-mes">Mês</Label><Input id="f-mes" type="month" value={mes} onChange={(e) => e.target.value && router.push(`${path}?mes=${e.target.value}${sectorId ? `&setor=${sectorId}` : ''}`)} className="w-44" /></div>
        <p className="text-sm text-tinta-suave">{data.month.label}: {data.month.length} dias.</p>
        <div className="flex-1" />
        {canEdit && <Button onClick={() => setDraft(newDraft())}><Plus /> Exceção / reforço</Button>}
      </Card>
      <FormMessage error={error} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-2 font-bold text-navy">Datas do mês</h2>
          <ul className="space-y-2 text-sm">
            {data.holidays.map((h) => (
              <li key={`h${h.date}`} className="flex flex-wrap items-center gap-1">
                <Badge tone="blue">Feriado</Badge> <b className="text-navy">{formatDateBR(h.date).slice(0, 5)}</b> {WEEKDAYS[weekdayOf(h.date) - 1]!.short.toLowerCase()} · {h.name} <span className="text-xs text-tinta-fraca">({h.scope.toLowerCase()})</span>
                {canEdit && <button type="button" onClick={() => setDraft(holidayDraft(h.date))} className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-nacao"><Clock className="size-3.5" /> Ajustar horário</button>}
              </li>
            ))}
            {data.overrides.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-1">
                <Badge tone={o.closed ? 'red' : o.extraPeople ? 'amber' : 'cyan'}>{o.closed ? 'Fechado' : o.hours?.length ? 'Horário especial' : 'Reforço'}</Badge>
                <b className="text-navy">{formatDateBR(o.date).slice(0, 5)}</b>
                <span>{o.sector ?? 'Nação inteira'} · {o.reason}{o.hours?.length ? ` · ${windowsLabel(o.hours)}` : ''}{o.extraPeople ? ` · +${o.extraPeople} pessoa(s)` : ''}</span>
                {canEdit && (data.canAdmin || o.sectorId) && <button type="button" aria-label="Excluir" onClick={() => confirm('Excluir esta exceção?') && run(() => deleteOverrideAction(o.id))} className="ml-auto text-tinta-fraca hover:text-critico"><Trash2 className="size-4" /></button>}
              </li>
            ))}
            {!data.holidays.length && !data.overrides.length && <li className="text-tinta-suave">Nenhum feriado ou exceção neste mês.</li>}
          </ul>
          <p className="mt-3 text-xs text-tinta-suave">Feriados vêm do cadastro do sistema (Administração → Cadastros). Cada setor tem o horário de feriado pré-programado (Pré-requisitos). Num feriado diferente (ex.: fechar às 14h), use <b>Ajustar horário</b> antes de gerar a escala: vale para a Nação inteira ou só para um setor, e o setor fica dentro desse horário.</p>
        </Card>

        <Card className="p-4">
          <h2 className="mb-2 font-bold text-navy">Eventos do mês (Marketing)</h2>
          <ul className="space-y-2 text-sm">
            {data.events.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2">
                <b className="text-navy">{formatDateBR(e.start).slice(0, 5)}{e.end && e.end !== e.start ? `–${formatDateBR(e.end).slice(0, 5)}` : ''}</b>
                <span>{e.name}{e.location ? ` · ${e.location}` : ''}</span>
                {canEdit && <button type="button" onClick={() => setDraft(newDraft({ date: e.start, reason: e.name, eventId: e.id, extraPeople: 1 }))} className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-nacao"><Users className="size-3.5" /> pedir reforço</button>}
              </li>
            ))}
            {!data.events.length && <li className="text-tinta-suave">Nenhum evento cadastrado no Marketing para este mês.</li>}
          </ul>
          <p className="mt-3 text-xs text-tinta-suave">O reforço aparece como sugestão na escala do setor (quem está livre) — a escala aprovada não muda sozinha.</p>
        </Card>
      </div>

      <Card className="p-4">
        <h2 className="mb-1 font-bold text-navy">Horário geral da Nação</h2>
        <p className="mb-3 text-xs text-tinta-suave">Referência para setores sem horário próprio. {data.canAdmin ? '' : 'Só a gestão altera.'}</p>
        <HoursMapEditor value={hours} onChange={setHours} undefinedLabel="Não definido" />
        {data.canAdmin && <Button className="mt-3" disabled={pending} onClick={() => run(() => saveNacaoHoursAction(hours))}>Salvar horário da Nação</Button>}
      </Card>

      {draft && (
        <Sheet title="Exceção de funcionamento / reforço" onClose={() => setDraft(null)}
          onSubmit={(e) => {
            e.preventDefault();
            const s = parseClock(draft.start); const en = draft.end === '00:00' ? 1440 : parseClock(draft.end);
            run(() => saveOverrideAction(null, { date: draft.date, sectorId: draft.sectorId || null, closed: draft.closed, hours: !draft.closed && s != null && en != null ? [[s, en]] : null, reason: draft.reason, eventId: draft.eventId || null, extraPeople: draft.extraPeople }), () => setDraft(null));
          }}
          footer={<><Button type="submit" disabled={pending}>Salvar</Button><Button type="button" variant="ghost" onClick={() => setDraft(null)}>Cancelar</Button></>}>
          <div className="grid grid-cols-2 gap-2">
            <div><Label htmlFor="o-d">Data</Label><Input id="o-d" type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></div>
            <div><Label htmlFor="o-s">Vale para</Label>
              <Select id="o-s" value={draft.sectorId} onChange={(e) => setDraft({ ...draft, sectorId: e.target.value })}>
                {data.canAdmin && <option value="">Nação inteira</option>}
                {data.sectors.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </Select>
            </div>
          </div>
          <div><Label htmlFor="o-r">Motivo</Label><Input id="o-r" value={draft.reason} maxLength={120} onChange={(e) => setDraft({ ...draft, reason: e.target.value })} placeholder="Nação Celebration, dedetização, horário reduzido…" /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.closed} onChange={(e) => setDraft({ ...draft, closed: e.target.checked })} className="size-4 accent-[#0169E9]" /> Fechado neste dia</label>
          {!draft.closed && (
            <div className="grid grid-cols-2 gap-2">
              <div><Label htmlFor="o-a">Horário especial: das (opcional)</Label><Input id="o-a" type="time" value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} /></div>
              <div><Label htmlFor="o-b">até</Label><Input id="o-b" type="time" value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} /></div>
            </div>
          )}
          <div><Label htmlFor="o-x">Reforço de equipe (pessoas a mais)</Label><Input id="o-x" type="number" min={0} max={50} value={draft.extraPeople} onChange={(e) => setDraft({ ...draft, extraPeople: Number(e.target.value) || 0 })} /></div>
          <p className="text-xs text-tinta-suave">{draft.start && draft.end ? `Funcionamento: ${draft.start}–${draft.end}.` : 'Sem horário especial: mantém o horário do dia.'}</p>
          <FormMessage error={error} />
        </Sheet>
      )}
    </div>
  );
}
