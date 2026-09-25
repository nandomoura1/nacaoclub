'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { CalendarPlus, ChevronLeft, ChevronRight, Pencil, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Input, Label, Select } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { WEEKDAYS, formatDateBR, weekdayOf } from '@/domain/dates';
import { importHolidaysAction, saveHolidayAction } from './actions';

interface HolidayRow { id: string; date: string; name: string; scope: string; policy: string }
type Opt = { value: string; label: string };

const POLICY_TONE: Record<string, 'amber' | 'red' | 'green'> = {
  DECIDIR_INDIVIDUALMENTE: 'amber',
  CANCELAR_TODAS: 'red',
  MANTER_TODAS: 'green',
};

export function HolidaysClient({ year, rows, policies, scopes }: { year: number; rows: HolidayRow[]; policies: Opt[]; scopes: Opt[] }) {
  const [editing, setEditing] = useState<HolidayRow | 'new' | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const label = (list: Opt[], v: string) => list.find((o) => o.value === v)?.label ?? v;

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Link className={buttonVariants({ variant: 'secondary', size: 'sm' })} href={`/admin/cadastros?c=feriados&ano=${year - 1}`} aria-label="Ano anterior"><ChevronLeft /></Link>
          <span className="tabular min-w-14 text-center text-lg font-extrabold text-navy">{year}</span>
          <Link className={buttonVariants({ variant: 'secondary', size: 'sm' })} href={`/admin/cadastros?c=feriados&ano=${year + 1}`} aria-label="Próximo ano"><ChevronRight /></Link>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => start(async () => {
              const r = await importHolidaysAction(year);
              setMsg(r.ok ? (r.data ? `${r.data} feriado(s) oficial(is) adicionado(s).` : 'Os feriados oficiais já estavam todos cadastrados.') : r.error);
            })}
          >
            <CalendarPlus /> Carregar feriados oficiais de {year}
          </Button>
          <Button onClick={() => setEditing('new')}><Plus /> Data da Nação</Button>
        </div>
      </div>
      <p className="mb-4 max-w-3xl text-sm text-tinta-suave">
        Nenhuma aula some em silêncio. A política decide o que acontece com as aulas do dia quando a competência é gerada:
        cancelar todas (com o motivo &quot;Feriado&quot;), manter todas ou deixar em Pendências para decidir aula por aula.
      </p>
      {msg && <div className="mb-4"><FormMessage success={msg} /></div>}

      <Card className="divide-y divide-borda">
        {rows.map((h) => (
          <div key={h.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
            <div className="w-36 shrink-0">
              <p className="tabular font-bold text-navy">{formatDateBR(h.date).slice(0, 5)}</p>
              <p className="text-xs text-tinta-fraca">{WEEKDAYS[weekdayOf(h.date) - 1]!.long}</p>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{h.name}</p>
              <p className="text-xs text-tinta-fraca">{label(scopes, h.scope)}</p>
            </div>
            <Badge tone={POLICY_TONE[h.policy]}>{label(policies, h.policy)}</Badge>
            <Button variant="ghost" size="sm" onClick={() => setEditing(h)} aria-label={`Editar ${h.name}`}><Pencil /></Button>
          </div>
        ))}
        {rows.length === 0 && <p className="p-8 text-center text-sm text-tinta-suave">Nenhum feriado em {year}. Carregue os oficiais.</p>}
      </Card>

      {editing && (
        <HolidaySheet
          row={editing === 'new' ? null : editing}
          year={year}
          policies={policies}
          scopes={scopes}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function HolidaySheet({ row, year, policies, scopes, onClose }: { row: HolidayRow | null; year: number; policies: Opt[]; scopes: Opt[]; onClose: () => void }) {
  const [v, setV] = useState({
    date: row?.date ?? `${year}-01-01`,
    name: row?.name ?? '',
    scope: row?.scope ?? 'NACAO',
    policy: row?.policy ?? 'DECIDIR_INDIVIDUALMENTE',
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <Sheet
      title={row ? 'Editar feriado' : 'Nova data especial'}
      onClose={onClose}
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveHolidayAction(row?.id ?? null, v);
          if (!r.ok) return setError(r.error);
          onClose();
        });
      }}
      footer={<Button type="submit" disabled={pending}>{pending ? 'Salvando…' : 'Salvar'}</Button>}
    >
      <div>
        <Label htmlFor="h-date">Data</Label>
        <Input id="h-date" type="date" required value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} />
      </div>
      <div>
        <Label htmlFor="h-name">Nome</Label>
        <Input id="h-name" required value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="Ex.: Aniversário da Nação" />
      </div>
      <div>
        <Label htmlFor="h-scope">Tipo</Label>
        <Select id="h-scope" value={v.scope} onChange={(e) => setV({ ...v, scope: e.target.value })}>
          {scopes.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </Select>
      </div>
      <fieldset>
        <legend className="mb-1.5 text-xs font-semibold text-tinta-suave">O que acontece com as aulas do dia</legend>
        <div className="space-y-2">
          {policies.map((p) => (
            <label key={p.value} className="flex cursor-pointer items-center gap-3 rounded-lg border border-borda p-3 has-[:checked]:border-nacao has-[:checked]:bg-nacao/5">
              <input type="radio" name="policy" className="accent-[#0169E9]" checked={v.policy === p.value} onChange={() => setV({ ...v, policy: p.value })} />
              <span className="text-sm font-semibold">{p.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <FormMessage error={error} />
    </Sheet>
  );
}
