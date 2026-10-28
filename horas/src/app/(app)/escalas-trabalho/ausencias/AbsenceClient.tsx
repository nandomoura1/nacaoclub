'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Input, Label, Select } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { formatDateBR } from '@/domain/dates';
import { BOND_LABEL, fmtHours } from '@/domain/escalas/labels';
import type { Alert, Bond } from '@/domain/escalas/types';
import type { MemberStats } from '@/domain/escalas/validate';
import { LEAVE_LABEL, type LeaveType } from '@/domain/leave';
import { cancelAbsenceAction, saveAbsenceAction } from '../actions';

type Leave = { id: string; teacherId: string; name: string; type: string; start: string; end: string; notes: string | null; substitute: string | null; cancelled: boolean };
const TYPES: [LeaveType, string][] = [['FERIAS', 'Férias'], ['FALTA', 'Falta'], ['ATESTADO', 'Atestado'], ['AFASTAMENTO', 'Afastamento'], ['FOLGA', 'Folga extraordinária'], ['INDISPONIVEL', 'Indisponibilidade']];

export function AbsenceClient({ sectorId, mes, members, leaves, impact, stats, hasSchedule, monthLabel, canEdit }: {
  sectorId: string; mes: string; members: { id: string; teacherId: string; name: string }[]; leaves: Leave[]; impact: Alert[]; stats: MemberStats[]; hasSchedule: boolean; monthLabel: string; canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ memberId: '', type: 'FERIAS' as LeaveType, startDate: `${mes}-01`, endDate: `${mes}-01`, substituteMemberId: '', notes: '' });
  const memberOf = new Map(members.map((m) => [m.teacherId, m.id]));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await saveAbsenceAction(sectorId, v);
      if (!r.ok) setError(r.error); else { setError(null); setOk(r.message ?? null); setOpen(false); router.refresh(); }
    });
  };
  const cancel = (l: Leave) => confirm(`Anular ${LEAVE_LABEL[l.type as LeaveType]?.toLowerCase() ?? 'ausência'} de ${l.name}?`) && start(async () => {
    const r = await cancelAbsenceAction(sectorId, l.id);
    if (!r.ok) setError(r.error); else router.refresh();
  });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <FormMessage error={error} success={ok} />
        {canEdit && <Button onClick={() => setOpen(true)} disabled={!members.length}><Plus /> Registrar ausência</Button>}
      </div>

      {impact.length > 0 && (
        <Card className="border-critico/40 p-4">
          <h2 className="mb-2 font-bold text-critico">Impacto na escala de {monthLabel}</h2>
          <ul className="space-y-1 text-sm">{impact.map((a, i) => <li key={i}>{a.message}{a.suggestions?.length ? <span className="text-xs text-tinta-suave"> — {a.suggestions.join(' · ')}</span> : null}</li>)}</ul>
          <Link href={`/escalas-trabalho?setor=${sectorId}&mes=${mes}`} className="mt-2 inline-block text-xs font-semibold text-nacao">Abrir a escala para ajustar →</Link>
        </Card>
      )}

      <Card className="p-4">
        <h2 className="mb-2 font-bold text-navy">Registros</h2>
        <ul className="divide-y divide-borda text-sm">
          {leaves.map((l) => (
            <li key={l.id} className={l.cancelled ? 'flex flex-wrap items-center gap-2 py-2 opacity-50' : 'flex flex-wrap items-center gap-2 py-2'}>
              <Badge tone={l.type === 'FERIAS' ? 'cyan' : l.type === 'FALTA' ? 'red' : 'amber'}>{LEAVE_LABEL[l.type as LeaveType] ?? l.type}</Badge>
              <b className="text-navy">{l.name}</b>
              <span>{formatDateBR(l.start)}{l.end !== l.start ? ` a ${formatDateBR(l.end)}` : ''}</span>
              {l.substitute && <span className="text-xs text-tinta-suave">substituto: {l.substitute}</span>}
              {l.notes && <span className="text-xs italic text-tinta-suave">{l.notes}</span>}
              <span className="flex-1" />
              <Badge tone={l.cancelled ? 'neutral' : 'green'}>{l.cancelled ? 'Anulada' : 'Ativa'}</Badge>
              {canEdit && !l.cancelled && memberOf.has(l.teacherId) && <button type="button" disabled={pending} onClick={() => cancel(l)} className="text-xs font-semibold text-critico">anular</button>}
            </li>
          ))}
          {!leaves.length && <li className="py-2 text-tinta-suave">Nenhuma ausência registrada para a equipe neste período.</li>}
        </ul>
      </Card>

      <Card className="p-4">
        <h2 className="mb-1 font-bold text-navy">Banco de horas previsto — {monthLabel}</h2>
        <p className="mb-2 text-xs text-tinta-suave">Horas da escala − referência (carga semanal × dias do mês ÷ 7, descontando férias, atestados e afastamentos). Só CLT/FUNAP. Trabalho em dia de folga entra como crédito; folga marcada como “Folga (banco de horas)” na escala sai do saldo. É uma previsão, não substitui o ponto.</p>
        {!hasSchedule ? <p className="text-sm text-tinta-suave">Gere a escala do mês para ver o banco de horas.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-tinta-suave"><th className="py-1">Colaborador</th><th>Vínculo</th><th className="text-right">Escala</th><th className="text-right">Referência</th><th className="text-right">Saldo</th><th className="text-right">Ausências</th><th className="text-right">Folgas do banco</th></tr></thead>
              <tbody className="divide-y divide-borda">
                {stats.map((s) => (
                  <tr key={s.memberId}>
                    <td className="py-1 font-semibold text-navy">{s.name}</td><td>{BOND_LABEL[s.bond as Bond]}</td>
                    <td className="text-right">{fmtHours(s.minutes)}</td><td className="text-right">{s.expectedMin == null ? '—' : fmtHours(s.expectedMin)}</td>
                    <td className={s.balanceMin == null ? 'text-right' : s.balanceMin < 0 ? 'text-right font-bold text-atencao' : 'text-right font-bold text-nacao'}>{s.balanceMin == null ? '—' : fmtHours(s.balanceMin)}</td>
                    <td className="text-right">{s.absenceDays}</td>
                    <td className="text-right">{s.bankDays ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {open && (
        <Sheet title="Registrar ausência" onClose={() => setOpen(false)} onSubmit={submit}
          footer={<><Button type="submit" disabled={pending}>{pending ? 'Salvando…' : 'Registrar'}</Button><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button></>}>
          <div><Label htmlFor="a-m">Colaborador</Label><Select id="a-m" value={v.memberId} onChange={(e) => setV({ ...v, memberId: e.target.value })}><option value="">Escolha…</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select></div>
          <div><Label htmlFor="a-t">Tipo</Label><Select id="a-t" value={v.type} onChange={(e) => setV({ ...v, type: e.target.value as LeaveType })}>{TYPES.map(([t, l]) => <option key={t} value={t}>{l}</option>)}</Select></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label htmlFor="a-s">De</Label><Input id="a-s" type="date" value={v.startDate} onChange={(e) => setV({ ...v, startDate: e.target.value, endDate: e.target.value > v.endDate ? e.target.value : v.endDate })} /></div>
            <div><Label htmlFor="a-e">Até</Label><Input id="a-e" type="date" value={v.endDate} onChange={(e) => setV({ ...v, endDate: e.target.value })} /></div>
          </div>
          <div><Label htmlFor="a-sub">Substituição (opcional)</Label><Select id="a-sub" value={v.substituteMemberId} onChange={(e) => setV({ ...v, substituteMemberId: e.target.value })}><option value="">— sem substituto definido —</option>{members.filter((m) => m.id !== v.memberId).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select></div>
          <div><Label htmlFor="a-n">Observação</Label><Input id="a-n" value={v.notes} maxLength={500} onChange={(e) => setV({ ...v, notes: e.target.value })} /></div>
          <p className="text-xs text-tinta-suave">A escala já aprovada/publicada não muda sozinha: o sistema aponta o conflito e sugere quem pode cobrir.</p>
          <FormMessage error={error} />
        </Sheet>
      )}
    </div>
  );
}
