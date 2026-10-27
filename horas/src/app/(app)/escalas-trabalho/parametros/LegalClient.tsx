'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Input, Label, Select } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { formatDateBR } from '@/domain/dates';
import { BOND_LABEL, fmtHours } from '@/domain/escalas/labels';
import type { Bond } from '@/domain/escalas/types';
import { saveLegalAction } from '../actions';

type Row = {
  id: string; bond: Bond; validFrom: string; maxDailyMin: number | null; maxDailyExtraMin: number | null; maxWeeklyMin: number | null; minRestBetweenMin: number | null;
  maxConsecutiveDays: number | null; sundayOffEveryWeeks: number | null; breakLongOverMin: number | null; breakLongMin: number | null; breakShortOverMin: number | null; breakShortMin: number | null; maxBreakMin: number | null;
  notes: string | null; validatedAt: string | null; validatedBy: string | null;
};

/** Campos em horas (h) ou minutos (min) na tela; no banco tudo em minutos. */
const FIELDS: { key: keyof Row; label: string; unit: 'h' | 'min' | 'dias' | 'semanas' }[] = [
  { key: 'maxDailyMin', label: 'Jornada diária normal', unit: 'h' },
  { key: 'maxDailyExtraMin', label: 'Horas extras por dia (máximo)', unit: 'h' },
  { key: 'maxWeeklyMin', label: 'Jornada semanal máxima', unit: 'h' },
  { key: 'minRestBetweenMin', label: 'Descanso mínimo entre jornadas', unit: 'h' },
  { key: 'maxConsecutiveDays', label: 'Dias seguidos de trabalho (máximo)', unit: 'dias' },
  { key: 'sundayOffEveryWeeks', label: 'Folga no domingo ao menos 1 vez a cada', unit: 'semanas' },
  { key: 'breakLongOverMin', label: 'Jornada acima de… pede intervalo longo', unit: 'h' },
  { key: 'breakLongMin', label: 'Intervalo longo (mínimo)', unit: 'min' },
  { key: 'breakShortOverMin', label: 'Jornada acima de… pede intervalo curto', unit: 'h' },
  { key: 'breakShortMin', label: 'Intervalo curto (mínimo)', unit: 'min' },
  { key: 'maxBreakMin', label: 'Intervalo máximo por dia', unit: 'h' },
];
const show = (v: number | null, unit: string) => (v == null ? '—' : unit === 'h' ? fmtHours(v) : `${v} ${unit}`);

/** Sugestão inicial CLT para o DP conferir (não vale como validada até o DP marcar). */
/** FUNAP (contrato 6x1): 44h semanais, 6 dias seguidos, intervalo de até 2h; sem domingo, interjornada e intervalo mínimo. */
const FUNAP_DRAFT = { maxWeeklyMin: 2640, maxConsecutiveDays: 6, maxBreakMin: 120 };
const CLT_DRAFT = { maxDailyMin: 480, maxDailyExtraMin: 120, maxWeeklyMin: 2400, minRestBetweenMin: 660, maxConsecutiveDays: 6, sundayOffEveryWeeks: 3, breakLongOverMin: 360, breakLongMin: 60, breakShortOverMin: 240, breakShortMin: 15 };

export function LegalClient({ rows, canEdit }: { rows: Row[]; canEdit: boolean }) {
  const [open, setOpen] = useState<Row | 'new' | null>(null);
  return (
    <>
      {canEdit && <div className="mb-3 flex justify-end"><Button onClick={() => setOpen('new')}><Plus /> Nova vigência</Button></div>}
      <div className="grid gap-3 md:grid-cols-2">
        {rows.map((r) => (
          <Card key={r.id} className="p-4">
            <div className="mb-2 flex items-center gap-2">
              <h2 className="font-bold text-navy">{BOND_LABEL[r.bond]}</h2>
              <span className="text-xs text-tinta-suave">vigência a partir de {formatDateBR(r.validFrom)}</span>
              <span className="flex-1" />
              <Badge tone={r.validatedAt ? 'green' : 'amber'}>{r.validatedAt ? `Validado${r.validatedBy ? ` por ${r.validatedBy}` : ''}` : 'Não validado pelo DP'}</Badge>
              {canEdit && <button type="button" aria-label="Editar" onClick={() => setOpen(r)} className="text-tinta-fraca hover:text-nacao"><Pencil className="size-4" /></button>}
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
              {FIELDS.map((f) => <div key={f.key} className="contents"><dt className="text-tinta-suave">{f.label}</dt><dd className="font-semibold text-navy">{show(r[f.key] as number | null, f.unit)}</dd></div>)}
            </dl>
            {r.notes && <p className="mt-2 text-xs italic text-tinta-suave">{r.notes}</p>}
          </Card>
        ))}
      </div>
      {!rows.length && <Card className="p-6 text-sm text-tinta-suave">Nenhum parâmetro cadastrado. Enquanto isso, toda escala aparece com “pendência legal”.</Card>}
      <p className="mt-4 text-xs text-tinta-fraca">MEI e freelancer não seguem jornada CLT (natureza do contrato): o sistema respeita só a disponibilidade cadastrada. Não presuma 5x2 para todos os vínculos.</p>
      {open && <LegalSheet row={open === 'new' ? null : open} onClose={() => setOpen(null)} />}
    </>
  );
}

function LegalSheet({ row, onClose }: { row: Row | null; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [bond, setBond] = useState<Bond>(row?.bond ?? 'CLT');
  const [validFrom, setValidFrom] = useState(row?.validFrom ?? '');
  const [notes, setNotes] = useState(row?.notes ?? '');
  const [validated, setValidated] = useState(!!row?.validatedAt);
  const init = (k: keyof Row) => (row ? (row[k] as number | null) : bond === 'CLT' ? (CLT_DRAFT as Record<string, number>)[k] ?? null : bond === 'FUNAP' ? (FUNAP_DRAFT as Record<string, number>)[k] ?? null : null);
  const [vals, setVals] = useState<Record<string, string>>(Object.fromEntries(FIELDS.map((f) => { const v = init(f.key); return [f.key, v == null ? '' : f.unit === 'h' ? String(v / 60) : String(v)]; })));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const out: Record<string, number | null> = {};
    for (const f of FIELDS) { const s = vals[f.key]!.replace(',', '.').trim(); out[f.key] = s === '' ? null : Math.round(Number(s) * (f.unit === 'h' ? 60 : 1)); }
    start(async () => {
      const r = await saveLegalAction(row?.id ?? null, { bond, validFrom, notes, validated, ...out });
      if (!r.ok) setError(r.error); else { onClose(); router.refresh(); }
    });
  };
  return (
    <Sheet title={row ? 'Editar parâmetros' : 'Nova vigência'} onClose={onClose} onSubmit={submit}
      footer={<><Button type="submit" disabled={pending}>Salvar</Button><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button></>}>
      <div className="grid grid-cols-2 gap-2">
        <div><Label htmlFor="l-b">Vínculo</Label><Select id="l-b" value={bond} disabled={!!row} onChange={(e) => { const b = e.target.value as Bond; setBond(b); const d = (b === 'CLT' ? CLT_DRAFT : b === 'FUNAP' ? FUNAP_DRAFT : {}) as Record<string, number>; setVals(Object.fromEntries(FIELDS.map((f) => { const v = d[f.key]; return [f.key, v == null ? '' : f.unit === 'h' ? String(v / 60) : String(v)]; }))); }}>{(['CLT', 'FUNAP', 'MEI', 'FREELANCER'] as Bond[]).map((b) => <option key={b} value={b}>{BOND_LABEL[b]}</option>)}</Select></div>
        <div><Label htmlFor="l-v">Vigência a partir de</Label><Input id="l-v" type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} /></div>
      </div>
      {!row && bond === 'FUNAP' && <p className="text-xs text-atencao">Contrato FUNAP (6x1): 44h semanais, até 6 dias seguidos e intervalo de até 2h por dia. Sem folga obrigatória no domingo, sem descanso mínimo entre jornadas e sem intervalo mínimo (deixe esses campos vazios).</p>}
      {!row && bond === 'CLT' && <p className="text-xs text-atencao">Valores sugeridos para a escala da Nação (8h/dia, 40h/semana — a CLT permite até 44h —, 11h entre jornadas, intervalo de 1h acima de 6h e 15 min acima de 4h, 1 domingo a cada 3 semanas no comércio). Confira com a convenção coletiva antes de marcar como validado.</p>}
      <div className="grid grid-cols-2 gap-2">
        {FIELDS.map((f) => (
          <div key={f.key}><Label htmlFor={`l-${f.key}`}>{f.label} ({f.unit})</Label><Input id={`l-${f.key}`} inputMode="decimal" value={vals[f.key]} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} placeholder="vazio = não verifica" /></div>
        ))}
      </div>
      <div><Label htmlFor="l-n">Base legal / observações</Label><Input id="l-n" value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} placeholder="CLT arts. 58, 59, 66, 67, 71; CCT 2026…" /></div>
      <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={validated} onChange={(e) => setValidated(e.target.checked)} className="size-4 accent-[#0169E9]" /> Validado pelo Departamento Pessoal</label>
      <FormMessage error={error} />
    </Sheet>
  );
}
