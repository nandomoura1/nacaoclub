'use client';

import { Fragment, useMemo, useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Copy, Info, Plus, Undo2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Input, Label, Select } from '@/components/ui/input';
import { formatDateBR } from '@/domain/dates';
import { cn } from '@/lib/cn';
import type { TransportReport } from '@/server/services/ws-service';
import { cancelAbsenceAction, saveAbsenceAction, saveMealValueAction, saveTransportValueAction } from '../actions';

const brl = (c: number | null) => (c == null ? '—' : (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const toCents = (v: string): number | null | 'erro' => {
  const t = v.trim().replace(/[R$\s]/g, '');
  if (!t) return null;
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 'erro';
};
const STATUS: Record<string, string> = { RASCUNHO: 'rascunho', APROVADA: 'aprovada', PUBLICADA: 'publicada' };

export function TransportClient({ mes, report }: { mes: string; report: TransportReport }) {
  const router = useRouter();
  const path = usePathname();
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<Record<string, string>>({});
  /** Linha aberta para lançar falta/atestado do mês anterior. */
  const [openAbs, setOpenAbs] = useState<string | null>(null);
  const [abs, setAbs] = useState({ type: 'FALTA', start: report.prevFirst, end: report.prevFirst });
  const launch = (r: TransportReport['rows'][number]) => {
    const ref = r.refs[0];
    if (!ref) return;
    if (abs.end < abs.start) return setMsg({ error: 'A data final é antes da inicial.' });
    start(async () => {
      const x = await saveAbsenceAction(ref.sectorId, { memberId: ref.memberId, type: abs.type, startDate: abs.start, endDate: abs.end });
      if (!x.ok) return setMsg({ error: x.error });
      setMsg({ ok: `${abs.type === 'FALTA' ? 'Falta' : 'Atestado'} lançado para ${r.name}. Benefícios recalculados.` });
      router.refresh();
    });
  };
  const undo = (r: TransportReport['rows'][number], id: string) => {
    const ref = r.refs[0];
    if (!ref || !confirm('Anular esta falta/atestado? Ela sai também da escala e do histórico de ausências.')) return;
    start(async () => {
      const x = await cancelAbsenceAction(ref.sectorId, id);
      if (!x.ok) return setMsg({ error: x.error });
      setMsg({ ok: 'Ausência anulada. Benefícios recalculados.' });
      router.refresh();
    });
  };
  const rows = report.rows;
  /** Gestão: mostra a alimentação também de quem não tem direito (para dar o direito). */
  const [allMeal, setAllMeal] = useState(false);
  const totals = useMemo(() => ({
    pay: rows.reduce((s, r) => s + r.payDays, 0),
    cents: rows.reduce((s, r) => s + (r.totalCents ?? 0), 0),
    missing: rows.filter((r) => r.dailyCents == null).length,
    meal: rows.reduce((s, r) => s + (r.mealCents ?? 0), 0),
    mealPeople: rows.filter((r) => r.mealDailyCents != null).length,
    deposit: rows.reduce((s, r) => s + (r.depositCents ?? 0), 0),
  }), [rows]);
  const sectors = [...new Set(rows.flatMap((r) => r.sectors))];

  /** `key` = id da pessoa (passagem) ou "meal:<id>" (alimentação; vazio = tira o direito). */
  const save = (key: string) => {
    const c = toCents(editing[key] ?? '');
    if (c === 'erro') return setMsg({ error: 'Valor inválido. Use, por exemplo, 11,00.' });
    const meal = key.startsWith('meal:');
    const teacherId = meal ? key.slice(5) : key;
    start(async () => {
      const r = meal ? await saveMealValueAction(teacherId, c) : await saveTransportValueAction(teacherId, c);
      if (!r.ok) return setMsg({ error: r.error });
      setMsg({ ok: meal ? (c == null ? 'Alimentação retirada.' : 'Valor da alimentação salvo.') : 'Valor da passagem salvo.' });
      setEditing((e) => { const n = { ...e }; delete n[key]; return n; });
      router.refresh();
    });
  };

  const csv = () => {
    const n = (c: number | null) => (c == null ? '' : (c / 100).toFixed(2).replace('.', ','));
    const head = 'Setor;Nome;Vínculo;Dias de trabalho;Passagem: faltas/atestados mês anterior;Passagem: dias a pagar;Passagem: valor diário;Passagem: total;Alimentação: valor diário;Alimentação: total;A depositar';
    const lines = rows.map((r) => [r.sectors.join(' + '), r.name, r.bond, r.workDays, r.discount, r.payDays, n(r.dailyCents), n(r.totalCents), n(r.mealDailyCents), n(r.mealCents), n(r.depositCents)].join(';'));
    return [head, ...lines].join('\n');
  };

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end gap-4 p-4">
        <div>
          <Label htmlFor="ps-mes">Mês</Label>
          <Input id="ps-mes" type="month" value={mes} onChange={(e) => e.target.value && router.push(`${path}?mes=${e.target.value}`)} className="w-44" />
        </div>
        <div className="flex flex-wrap gap-6 text-sm">
          <div><p className="text-2xl font-extrabold text-navy">{rows.length}</p><p className="text-tinta-suave">pessoas</p></div>
          <div><p className="text-2xl font-extrabold text-nacao">{brl(totals.cents)}</p><p className="text-tinta-suave">passagem · {totals.pay} dias{totals.missing ? ` · ${totals.missing} sem valor` : ''}</p></div>
          <div><p className="text-2xl font-extrabold text-sucesso">{brl(totals.meal)}</p><p className="text-tinta-suave">alimentação ({totals.mealPeople} {totals.mealPeople === 1 ? 'pessoa' : 'pessoas'})</p></div>
          <div><p className="text-2xl font-extrabold text-navy">{brl(totals.deposit)}</p><p className="text-tinta-suave">total a depositar</p></div>
        </div>
        <div className="flex-1" />
        <Button variant="secondary" onClick={async () => { try { await navigator.clipboard.writeText(csv()); setMsg({ ok: 'Tabela copiada: cole no Excel/Planilhas.' }); } catch { setMsg({ error: 'Não consegui copiar.' }); } }}><Copy /> Copiar tabela</Button>
      </Card>

      <Card className="flex gap-2 p-3 text-sm text-tinta-suave">
        <Info className="mt-0.5 size-4 shrink-0 text-nacao" />
        <p>
          <b className="text-tinta">{report.label}:</b> dias de trabalho pela escala do mês; setor sem escala gerada usa o horário padrão da pessoa (marcado <i>estimado</i>).
          Desconto = faltas e atestados de <b className="text-tinta">{report.prevLabel}</b> que caíram em dia de trabalho.
          Alimentação = dias de trabalho do mês × valor diário (sem desconto do mês anterior), só para quem tem direito.
          A mesma pessoa em mais de um setor conta cada dia uma vez. {report.canEditValues ? 'Clique no valor diário para alterar.' : 'Os valores diários são definidos pela gestão (DP).'}
        </p>
      </Card>
      {report.canEditValues && (
        <label className="flex items-center gap-2 text-sm text-tinta-suave"><input type="checkbox" className="size-4 accent-nacao" checked={allMeal} onChange={(e) => setAllMeal(e.target.checked)} /> Mostrar quem não tem alimentação (para dar o direito)</label>
      )}

      <div className="flex flex-wrap gap-2 text-xs">
        {report.status.map((s) => (
          <span key={s.sector} className="rounded-full bg-white px-2.5 py-1 ring-1 ring-borda">
            <b className="text-navy">{s.sector}</b> · {s.schedule ? `escala ${STATUS[s.schedule] ?? s.schedule}` : <span className="text-atencao">sem escala (estimado)</span>}
          </span>
        ))}
      </div>

      <FormMessage error={msg.error} success={msg.ok} />

      {sectors.length === 0 ? <Card className="p-6 text-sm text-tinta-suave">Nenhum CLT ou FUNAP nas equipes da escala.</Card> : sectors.map((sector) => {
        const list = rows.filter((r) => r.sectors[0] === sector);
        // Alimentação só aparece no setor se alguém tem direito (ou a gestão pediu para ver todos).
        const mealCols = allMeal || list.some((r) => r.mealDailyCents != null);
        const cols = mealCols ? 11 : 8;
        const vt = 'bg-nacao/[0.04]', va = 'bg-sucesso/[0.05]';
        const money = (key: string, value: number | null, placeholder: string, empty: string) => report.canEditValues && editing[key] !== undefined ? (
          <span className="inline-flex items-center gap-1">
            <Input autoFocus inputMode="decimal" className="h-8 w-24 text-right" value={editing[key]} placeholder={placeholder}
              onChange={(e) => setEditing((x) => ({ ...x, [key]: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter') save(key); if (e.key === 'Escape') setEditing((x) => { const n = { ...x }; delete n[key]; return n; }); }} />
            <Button size="sm" disabled={pending} onClick={() => save(key)}>OK</Button>
          </span>
        ) : report.canEditValues ? (
          <button type="button" className={value == null ? 'font-semibold text-atencao underline' : 'underline decoration-dotted'}
            onClick={() => setEditing((x) => ({ ...x, [key]: value == null ? '' : (value / 100).toFixed(2).replace('.', ',') }))}>
            {value == null ? empty : brl(value)}
          </button>
        ) : value == null ? '' : brl(value);
        return (
        <Card key={sector} className="overflow-x-auto">
          <h3 className="px-4 pt-3 font-extrabold text-navy">{sector}</h3>
          <table className={cn('w-full text-sm', mealCols ? 'min-w-[60rem]' : 'min-w-[46rem]')}>
            <thead>
              <tr className="text-[11px] font-bold uppercase tracking-wider">
                <th colSpan={3} />
                <th colSpan={4} className="rounded-t-lg bg-nacao/10 py-1 text-center text-nacao">Passagem</th>
                {mealCols && <th colSpan={2} className="rounded-t-lg bg-sucesso/10 py-1 text-center text-sucesso">Alimentação</th>}
                <th />
              </tr>
              <tr className="border-b border-borda text-left text-xs uppercase text-tinta-suave">
                <th className="px-4 py-2">Nome</th><th className="px-2 py-2">Vínculo</th><th className="px-2 py-2 text-right">Dias de trabalho</th>
                <th className={cn('px-2 py-2 text-right', vt)}>Faltas/atest. ({report.prevLabel.split(' ')[0]})</th><th className={cn('px-2 py-2 text-right', vt)}>Dias a pagar</th>
                <th className={cn('px-2 py-2 text-right', vt)}>Valor diário</th><th className={cn('px-2 py-2 text-right', vt)}>Total</th>
                {mealCols && <><th className={cn('px-2 py-2 text-right', va)}>Valor diário</th><th className={cn('px-2 py-2 text-right', va)}>Total</th></>}
                <th className="px-4 py-2 text-right">A depositar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {list.map((r) => (
                <Fragment key={r.teacherId}>
                <tr>
                  <td className="px-4 py-2 font-semibold text-tinta">{r.name}{r.sectors.length > 1 && <span className="ml-1 text-xs font-normal text-tinta-suave">(também {r.sectors.slice(1).join(', ')})</span>}</td>
                  <td className="px-2 py-2">{r.bond}</td>
                  <td className="tabular px-2 py-2 text-right">{r.workDays}{r.source !== 'escala' && <Badge tone="amber" className="ml-1">{r.source}</Badge>}</td>
                  <td className={cn('tabular px-2 py-2 text-right', vt)} title={r.discountDates.map(formatDateBR).join(', ')}>
                    {report.canEditAbsences && r.refs.length ? (
                      <button type="button" className="inline-flex items-center gap-1 underline decoration-dotted hover:text-nacao"
                        onClick={() => { setOpenAbs(openAbs === r.teacherId ? null : r.teacherId); setAbs({ type: 'FALTA', start: report.prevFirst, end: report.prevFirst }); }}>
                        {r.discount ? `−${r.discount}` : '0'}<Plus className="size-3" />
                      </button>
                    ) : r.discount ? `−${r.discount}` : '0'}
                  </td>
                  <td className={cn('tabular px-2 py-2 text-right font-bold text-navy', vt)}>{r.payDays}</td>
                  <td className={cn('tabular px-2 py-2 text-right', vt)}>{money(r.teacherId, r.dailyCents, '11,00', 'informar')}</td>
                  <td className={cn('tabular px-2 py-2 text-right font-bold', vt)}>{brl(r.totalCents)}</td>
                  {mealCols && (r.mealDailyCents != null || allMeal || editing[`meal:${r.teacherId}`] !== undefined ? <>
                    <td className={cn('tabular px-2 py-2 text-right', va)}>{money(`meal:${r.teacherId}`, r.mealDailyCents, '15,00', 'dar direito')}</td>
                    <td className={cn('tabular px-2 py-2 text-right font-bold', va)}>{r.mealCents == null ? '' : brl(r.mealCents)}</td>
                  </> : <><td className={va} /><td className={va} /></>)}
                  <td className="tabular px-4 py-2 text-right font-extrabold text-navy">{brl(r.depositCents)}</td>
                </tr>
                {openAbs === r.teacherId && (
                  <tr className="bg-fundo">
                    <td colSpan={cols} className="px-4 py-3">
                      <p className="mb-2 text-xs font-semibold uppercase text-tinta-suave">Faltas e atestados de {report.prevLabel} · {r.name}</p>
                      {r.leaves.length ? (
                        <ul className="mb-3 space-y-1 text-sm">
                          {r.leaves.map((l) => (
                            <li key={l.id} className="flex flex-wrap items-center gap-2">
                              <Badge tone={l.type === 'FALTA' ? 'red' : 'amber'}>{l.type === 'FALTA' ? 'Falta' : 'Atestado'}</Badge>
                              <span>{formatDateBR(l.start)}{l.end !== l.start && ` a ${formatDateBR(l.end)}`}</span>
                              <Button size="sm" variant="ghost" disabled={pending} onClick={() => undo(r, l.id)}><Undo2 /> anular</Button>
                            </li>
                          ))}
                        </ul>
                      ) : <p className="mb-3 text-sm text-tinta-suave">Nenhuma lançada.</p>}
                      <div className="flex flex-wrap items-end gap-2">
                        <div><Label>Tipo</Label><Select value={abs.type} onChange={(e) => setAbs({ ...abs, type: e.target.value })} className="h-9 w-32"><option value="FALTA">Falta</option><option value="ATESTADO">Atestado</option></Select></div>
                        <div><Label>De</Label><Input type="date" className="h-9" value={abs.start} onChange={(e) => setAbs({ ...abs, start: e.target.value, end: abs.end < e.target.value ? e.target.value : abs.end })} /></div>
                        <div><Label>Até</Label><Input type="date" className="h-9" value={abs.end} min={abs.start} onChange={(e) => setAbs({ ...abs, end: e.target.value })} /></div>
                        <Button size="sm" disabled={pending} onClick={() => launch(r)}><Plus /> Lançar</Button>
                        <Button size="sm" variant="ghost" onClick={() => setOpenAbs(null)}>Fechar</Button>
                      </div>
                      <p className="mt-2 text-xs text-tinta-suave">É o mesmo registro de “Férias e ausências”: vale para a escala e o histórico. Só desconta o que cair em dia de trabalho{r.sectors.length > 1 ? ` (lançado no setor ${r.sectors[0]})` : ''}.</p>
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
          {report.canEditValues && mealCols && <p className="px-4 pb-3 text-xs text-tinta-suave">Alimentação: para tirar o direito, apague o valor e confirme.</p>}
        </Card>
        );
      })}

      {report.outside.length > 0 && (
        <p className="text-xs text-tinta-suave">Fora da passagem (vínculo sem vale-transporte): {report.outside.map((o) => `${o.name} (${o.bond}, ${o.sector})`).join(' · ')}.</p>
      )}
    </div>
  );
}
