'use client';

import { Fragment, useEffect, useMemo, useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Check, Copy, Info, Lock, LockOpen, Minus, Plus, Settings2, Undo2, Wallet, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Input, Label, Select } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { formatDateBR } from '@/domain/dates';
import { CRITERIA, applyOverrides, awardTotal, awardTsv, lostLabel, toggleOverride, type CriterionKey } from '@/domain/premiacao';
import { cn } from '@/lib/cn';
import type { AwardBoard, AwardRow } from '@/server/services/premiacao-service';
import { cancelAbsenceAction, saveAbsenceAction } from '../actions';
import { addAwardPeopleAction, closeAwardMonthAction, reopenAwardMonthAction, saveAwardMonthAction, saveAwardPersonAction, setAwardPaidAction, setAwardPersonActiveAction, setGroupValuesAction } from './actions';

type Msg = { ok?: string; error?: string };
const brl = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const toCents = (v: string): number | 'erro' => {
  const t = v.trim().replace(/[R$\s]/g, '');
  if (!t) return 0;
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  return Number.isFinite(n) ? Math.round(n * 100) : 'erro';
};
const centsText = (c: number) => (c ? (c / 100).toFixed(2).replace('.', ',') : '');
const short = (d: string) => formatDateBR(d).slice(0, 5);
const SHORT: Record<CriterionKey, string> = { productivity: 'Produtiv.', punctuality: 'Pontual.', attendance: 'Assiduid.' };

/** Recalcula a linha no navegador (otimista), com as mesmas regras do servidor. */
function recompute(r: AwardRow, patch: Partial<Pick<AwardRow, 'overrides' | 'lateCount' | 'note'>> & { extraCents?: number }): AwardRow {
  const overrides = patch.overrides ?? r.overrides;
  const lateCount = patch.lateCount ?? r.lateCount;
  // Falta ou admissão no meio zeram tudo; senão, Pontualidade cai com qualquer atraso > 15 min.
  const blocked = r.faltas.length > 0 || r.reasons.some((x) => x.startsWith('Admitido'));
  const auto = { ...r.auto, punctuality: !blocked && lateCount === 0 };
  const state = applyOverrides(auto, overrides, patch.extraCents ?? r.state.extraCents);
  return { ...r, overrides, lateCount, auto, state, note: patch.note !== undefined ? patch.note : r.note, total: awardTotal(r.values, state), lost: lostLabel(state), reviewed: true };
}

export function AwardClient({ board }: { board: AwardBoard }) {
  const router = useRouter();
  const path = usePathname();
  const [msg, setMsg] = useState<Msg>({});
  const [pending, start] = useTransition();
  const [rows, setRows] = useState(board.rows);
  useEffect(() => setRows(board.rows), [board.rows]);
  const [config, setConfig] = useState<AwardRow | null>(null);
  const [groupCfg, setGroupCfg] = useState<string | null>(null);
  const [openAbs, setOpenAbs] = useState<string | null>(null);
  const [abs, setAbs] = useState({ type: 'FALTA', start: board.period.first, end: board.period.first });
  const [add, setAdd] = useState({ id: '', group: 'Academia' });
  const locked = !!board.closure;
  const edit = board.canEdit && !locked;

  const totals = useMemo(() => ({
    total: rows.reduce((a, r) => a + r.total, 0), max: rows.reduce((a, r) => a + r.max, 0),
    full: rows.filter((r) => r.max > 0 && r.total >= r.max).length,
    faltas: rows.reduce((a, r) => a + r.faltas.length, 0), atestados: rows.reduce((a, r) => a + r.atestados.length, 0), atrasos: rows.reduce((a, r) => a + r.lateCount, 0),
    lost: Object.fromEntries(CRITERIA.map((c) => [c.key, rows.filter((r) => !r.state[c.key]).length])) as Record<CriterionKey, number>,
  }), [rows]);
  const groups = [...new Set(rows.map((r) => r.group))];

  /** Grava a apuração da linha; a tela muda na hora e volta se der erro. */
  const save = (r: AwardRow, next: AwardRow) => {
    const before = rows;
    setRows((rs) => rs.map((x) => (x.teacherId === r.teacherId ? next : x)));
    start(async () => {
      const x = await saveAwardMonthAction({ teacherId: r.teacherId, month: board.month, ...next.overrides, lateCount: next.lateCount, extraCents: next.state.extraCents, note: next.note });
      if (!x.ok) { setRows(before); setMsg({ error: x.error }); }
    });
  };
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => start(async () => {
    const x = await fn();
    if (!x.ok) return setMsg({ error: x.error });
    setMsg({ ok }); router.refresh();
  });
  const copy = async () => {
    const text = awardTsv(rows.map((r) => ({ group: r.group, name: r.name, total: r.total, note: [r.lost, r.reasons.join('; '), r.state.extraCents ? `ajuste ${brl(r.state.extraCents)}` : '', r.note].filter(Boolean).join(' · ') })));
    try { await navigator.clipboard.writeText(text); setMsg({ ok: 'Tabela copiada: cole na planilha (Equipe · Nome · Valor · Obs.).' }); } catch { setMsg({ error: 'Não consegui copiar.' }); }
  };

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end gap-4 p-4">
        <div>
          <Label htmlFor="pr-mes">Pagamento (dia 15 de)</Label>
          <Input id="pr-mes" type="month" value={board.month} onChange={(e) => e.target.value && router.push(`${path}?mes=${e.target.value}`)} className="w-44" />
        </div>
        <div className="flex flex-wrap gap-6 text-sm">
          <div><p className="text-2xl font-extrabold text-navy">{rows.length}</p><p className="text-tinta-suave">pessoas</p></div>
          <div><p className="text-2xl font-extrabold text-nacao">{brl(totals.total)}</p><p className="text-tinta-suave">a pagar em {formatDateBR(board.payDay)} · de {brl(totals.max)}</p></div>
          <div><p className="text-2xl font-extrabold text-sucesso">{totals.full}</p><p className="text-tinta-suave">premiação cheia</p></div>
          <div className="text-xs text-tinta-suave">
            <p className="font-semibold uppercase">Na competência</p>
            <p>{totals.faltas} falta(s) · {totals.atestados} dia(s) de atestado · {totals.atrasos} atraso(s)</p>
            <p>Perderam: {CRITERIA.map((c) => `${SHORT[c.key]} ${totals.lost[c.key]}`).join(' · ')}</p>
          </div>
        </div>
        <div className="flex-1" />
        <div className="flex flex-wrap items-center gap-2">
          {board.closure && <Badge tone={board.closure.paidAt ? 'green' : 'blue'}>{board.closure.paidAt ? `Pago em ${formatDateBR(board.closure.paidAt.slice(0, 10))}` : 'Competência fechada'}</Badge>}
          <Button variant="secondary" onClick={copy}><Copy /> Copiar tabela</Button>
          {board.canEdit && !board.closure && <Button disabled={pending || !rows.length} onClick={() => confirm(`Fechar a competência com ${brl(totals.total)}? Os valores ficam congelados.`) && act(() => closeAwardMonthAction(board.month), 'Competência fechada: valores congelados.')}><Lock /> Fechar competência</Button>}
          {board.canEdit && board.closure && !board.closure.paidAt && (
            <>
              <Button disabled={pending} onClick={() => act(() => setAwardPaidAction(board.month, true), 'Pagamento registrado.')}><Wallet /> Marcar como pago</Button>
              <Button variant="ghost" disabled={pending} onClick={() => { const why = prompt('Motivo para reabrir:'); if (why) act(() => reopenAwardMonthAction(board.month, why), 'Competência reaberta.'); }}><LockOpen /> Reabrir</Button>
            </>
          )}
          {board.canEdit && board.closure?.paidAt && <Button variant="ghost" disabled={pending} onClick={() => confirm('Desmarcar o pagamento?') && act(() => setAwardPaidAction(board.month, false), 'Pagamento desmarcado.')}>Desmarcar pago</Button>}
        </div>
      </Card>

      <Card className="flex gap-2 p-3 text-sm text-tinta-suave">
        <Info className="mt-0.5 size-4 shrink-0 text-nacao" />
        <p>
          <b className="text-tinta">Competência {formatDateBR(board.period.first)} a {formatDateBR(board.period.last)}</b>, paga em <b className="text-tinta">{formatDateBR(board.payDay)}</b>.
          Entram as equipes da escala 5x2 (CLT, FUNAP e estágio) e quem for incluído. Regras: <b className="text-tinta">falta</b> perde os três;
          <b className="text-tinta"> atestado</b> perde Assiduidade; <b className="text-tinta">atraso &gt; 15 min</b> perde Pontualidade; Produtividade (tarefas e checklists) marca-se à mão.
          {edit && ' Clique no número de faltas para lançar falta/atestado; no critério para corrigir (selo "manual"; clicar de novo volta à regra).'}
          {locked && ' Competência fechada: valores congelados.'}
        </p>
      </Card>

      <FormMessage error={msg.error} success={msg.ok} />

      {groups.length === 0 && <Card className="p-6 text-sm text-tinta-suave">Ninguém nas equipes da escala nem incluído.</Card>}
      {groups.map((g) => {
        const list = rows.filter((r) => r.group === g);
        const vt = 'bg-nacao/[0.04]', vc = 'bg-sucesso/[0.05]';
        return (
          <Card key={g} className="overflow-x-auto">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3">
              <h3 className="font-extrabold text-navy">{g}</h3>
              <div className="flex items-center gap-3 text-sm text-tinta-suave">
                <span>subtotal <b className="text-navy">{brl(list.reduce((a, r) => a + r.total, 0))}</b></span>
                {edit && <Button size="sm" variant="ghost" onClick={() => setGroupCfg(g)}><Settings2 /> Valores da equipe</Button>}
              </div>
            </div>
            <table className="w-full min-w-[76rem] text-sm">
              <thead>
                <tr className="text-[11px] font-bold uppercase tracking-wider">
                  <th colSpan={2} />
                  <th colSpan={3} className="rounded-t-lg bg-nacao/10 py-1 text-center text-nacao">Na competência</th>
                  <th colSpan={3} className="rounded-t-lg bg-sucesso/10 py-1 text-center text-sucesso">Critérios</th>
                  <th colSpan={3} />
                </tr>
                <tr className="border-b border-borda text-left text-xs uppercase text-tinta-suave">
                  <th className="px-4 py-2">Nome</th><th className="px-2 py-2">Vínculo</th>
                  <th className={cn('px-2 py-2 text-right', vt)}>Faltas</th><th className={cn('px-2 py-2 text-right', vt)}>Atestados</th><th className={cn('px-2 py-2 text-center', vt)} title="Atrasos de mais de 15 minutos">Atrasos &gt;15&apos;</th>
                  {CRITERIA.map((c) => <th key={c.key} className={cn('px-2 py-2 text-center', vc)} title={c.hint}>{c.label}</th>)}
                  <th className="px-2 py-2 text-right">Ajuste</th><th className="px-2 py-2 text-right">Total</th><th className="px-4 py-2">Obs.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borda">
                {list.map((r) => (
                  <Fragment key={r.teacherId}>
                    <Line r={r} edit={edit} canAbs={edit && board.canEditAbsences && !!r.ref} vt={vt} vc={vc} onSave={save} onConfig={() => setConfig(r)}
                      onOpenAbs={() => { setOpenAbs(openAbs === r.teacherId ? null : r.teacherId); setAbs({ type: 'FALTA', start: board.period.first, end: board.period.first }); }} />
                    {openAbs === r.teacherId && r.ref && (
                      <tr className="bg-fundo">
                        <td colSpan={11} className="px-4 py-3">
                          <p className="mb-2 text-xs font-semibold uppercase text-tinta-suave">Faltas e atestados da competência · {r.name}</p>
                          {r.leaves.length ? (
                            <ul className="mb-3 space-y-1 text-sm">
                              {r.leaves.map((l) => (
                                <li key={l.id} className="flex flex-wrap items-center gap-2">
                                  <Badge tone={l.type === 'FALTA' ? 'red' : 'amber'}>{l.type === 'FALTA' ? 'Falta' : 'Atestado'}</Badge>
                                  <span>{formatDateBR(l.start)}{l.end !== l.start && ` a ${formatDateBR(l.end)}`}</span>
                                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => confirm('Anular este lançamento? Sai também da escala e do histórico de ausências.') && act(() => cancelAbsenceAction(r.ref!.sectorId, l.id), 'Lançamento anulado.')}><Undo2 /> anular</Button>
                                </li>
                              ))}
                            </ul>
                          ) : <p className="mb-3 text-sm text-tinta-suave">Nenhum lançado.</p>}
                          <div className="flex flex-wrap items-end gap-2">
                            <div><Label>Tipo</Label><Select value={abs.type} onChange={(e) => setAbs({ ...abs, type: e.target.value })} className="h-9 w-32"><option value="FALTA">Falta</option><option value="ATESTADO">Atestado</option></Select></div>
                            <div><Label>De</Label><Input type="date" className="h-9" min={board.period.first} max={board.period.last} value={abs.start} onChange={(e) => setAbs({ ...abs, start: e.target.value, end: abs.end < e.target.value ? e.target.value : abs.end })} /></div>
                            <div><Label>Até</Label><Input type="date" className="h-9" min={abs.start} max={board.period.last} value={abs.end} onChange={(e) => setAbs({ ...abs, end: e.target.value })} /></div>
                            <Button size="sm" disabled={pending} onClick={() => act(() => saveAbsenceAction(r.ref!.sectorId, { memberId: r.ref!.memberId, type: abs.type, startDate: abs.start, endDate: abs.end }), `${abs.type === 'FALTA' ? 'Falta' : 'Atestado'} lançado para ${r.name}. Premiação recalculada.`)}><Plus /> Lançar</Button>
                            <Button size="sm" variant="ghost" onClick={() => setOpenAbs(null)}>Fechar</Button>
                          </div>
                          <p className="mt-2 text-xs text-tinta-suave">É o mesmo registro de Férias e ausências: vale também para a escala e para os Benefícios.</p>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </Card>
        );
      })}

      {edit && board.candidates.length > 0 && (
        <Card className="flex flex-wrap items-end gap-2 p-4">
          <div className="min-w-[16rem] flex-1">
            <Label htmlFor="pr-add">Incluir quem não está nas escalas (professor, Kids…)</Label>
            <Select id="pr-add" value={add.id} onChange={(e) => setAdd({ ...add, id: e.target.value })}>
              <option value="">Escolha o colaborador…</option>
              {board.candidates.map((c) => <option key={c.id} value={c.id}>{c.name}{c.team === 'PROFESSOR' ? ' (professor)' : ''}</option>)}
            </Select>
          </div>
          <div className="w-48">
            <Label htmlFor="pr-add-g">Equipe</Label>
            <Input id="pr-add-g" value={add.group} onChange={(e) => setAdd({ ...add, group: e.target.value })} list="award-groups" />
            <datalist id="award-groups">{board.groups.map((x) => <option key={x} value={x} />)}</datalist>
          </div>
          <Button disabled={!add.id || add.group.trim().length < 2 || pending} onClick={() => act(() => addAwardPeopleAction({ teacherIds: [add.id], groupName: add.group, productivity: 10000, punctuality: 10000, attendance: 10000 }), 'Incluído na Premiação (R$ 100 por critério; clique no nome para mudar).')}><Plus /> Incluir</Button>
        </Card>
      )}

      {config && <PersonSheet row={config} groups={board.groups} onClose={() => setConfig(null)} onDone={(ok) => { setConfig(null); setMsg({ ok }); router.refresh(); }} />}
      {groupCfg && <GroupSheet month={board.month} group={groupCfg} sample={rows.find((r) => r.group === groupCfg)!} count={rows.filter((r) => r.group === groupCfg).length} onClose={() => setGroupCfg(null)} onDone={(ok) => { setGroupCfg(null); setMsg({ ok }); router.refresh(); }} />}
    </div>
  );
}

function Line({ r, edit, canAbs, vt, vc, onSave, onConfig, onOpenAbs }: {
  r: AwardRow; edit: boolean; canAbs: boolean; vt: string; vc: string;
  onSave: (r: AwardRow, next: AwardRow) => void; onConfig: () => void; onOpenAbs: () => void;
}) {
  const [extra, setExtra] = useState(centsText(r.state.extraCents));
  const [note, setNote] = useState(r.note ?? '');
  useEffect(() => { setExtra(centsText(r.state.extraCents)); setNote(r.note ?? ''); }, [r.state.extraCents, r.note]);
  const commitExtra = () => {
    const c = toCents(extra);
    if (c === 'erro' || c === r.state.extraCents) return setExtra(centsText(r.state.extraCents));
    onSave(r, recompute(r, { extraCents: c }));
  };
  const commitNote = () => { const n = note.trim() || null; if (n !== r.note) onSave(r, recompute(r, { note: n })); };
  const late = (d: number) => onSave(r, recompute(r, { lateCount: Math.max(0, r.lateCount + d) }));
  const dates = (ds: string[]) => ds.map(short).join(', ');
  return (
    <tr>
      <td className="min-w-[13rem] px-4 py-2">
        {edit ? (
          <button type="button" onClick={onConfig} className="inline-flex items-center gap-1 text-left font-semibold text-tinta hover:text-nacao" title="Equipe e valores">{r.name}<Settings2 className="size-3.5 text-tinta-fraca" /></button>
        ) : <span className="font-semibold text-tinta">{r.name}</span>}
        <p className="text-[11px] text-tinta-suave">até {brl(r.max)}</p>
      </td>
      <td className="px-2 py-2 text-xs">{r.bond}</td>
      <td className={cn('tabular px-2 py-2 text-right', vt)} title={dates(r.faltas)}>
        {canAbs ? <button type="button" onClick={onOpenAbs} className={cn('inline-flex items-center gap-1 underline decoration-dotted hover:text-nacao', r.faltas.length && 'font-bold text-critico')}>{r.faltas.length}<Plus className="size-3" /></button>
          : <span className={cn(r.faltas.length && 'font-bold text-critico')}>{r.faltas.length}</span>}
      </td>
      <td className={cn('tabular px-2 py-2 text-right', vt, r.atestados.length && 'font-bold text-atencao')} title={dates(r.atestados)}>{r.atestados.length}</td>
      <td className={cn('px-2 py-2 text-center', vt)}>
        {edit ? (
          <span className="inline-flex items-center gap-1">
            <button type="button" aria-label="Menos um atraso" disabled={!r.lateCount} onClick={() => late(-1)} className="rounded p-0.5 text-tinta-fraca hover:bg-white disabled:opacity-30"><Minus className="size-3.5" /></button>
            <span className={cn('tabular w-5 text-center', r.lateCount && 'font-bold text-atencao')}>{r.lateCount}</span>
            <button type="button" aria-label="Mais um atraso" onClick={() => late(1)} className="rounded p-0.5 text-tinta-fraca hover:bg-white"><Plus className="size-3.5" /></button>
          </span>
        ) : r.lateCount}
      </td>
      {CRITERIA.map((c) => {
        const on = r.state[c.key], manual = r.overrides[c.key] !== null;
        return (
          <td key={c.key} className={cn('px-2 py-2 text-center', vc)}>
            <button type="button" disabled={!edit} onClick={() => onSave(r, recompute(r, { overrides: toggleOverride(r.auto, r.overrides, c.key) }))}
              title={`${c.label}: ${on ? 'ganhou' : 'perdeu'}${manual ? ' (corrigido à mão)' : ' (pela regra)'} — ${c.hint}`}
              className={cn('inline-flex min-w-[6.5rem] items-center justify-center gap-1 rounded-full px-3 py-1 text-xs font-bold ring-1',
                on ? 'bg-sucesso/10 text-sucesso ring-sucesso/30' : 'bg-critico/10 text-critico line-through ring-critico/30', manual && 'ring-2 ring-nacao', edit ? 'hover:opacity-80' : 'cursor-default')}>
              {on ? <Check className="size-3.5" /> : <X className="size-3.5" />}{brl(r.values[c.key])}
            </button>
            {manual && <p className="text-[10px] font-semibold uppercase text-nacao">manual</p>}
          </td>
        );
      })}
      <td className="px-2 py-2 text-right">
        {edit ? <Input value={extra} onChange={(e) => setExtra(e.target.value)} onBlur={commitExtra} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} inputMode="decimal" placeholder="0,00" className="ml-auto h-8 w-24 text-right" title="Ajuste em R$ (− para descontar)" />
          : r.state.extraCents ? brl(r.state.extraCents) : ''}
      </td>
      <td className="tabular px-2 py-2 text-right text-base font-extrabold text-navy">{brl(r.total)}</td>
      <td className="px-4 py-2">
        <div className="flex flex-wrap gap-1 text-[11px]">{r.reasons.map((x) => <span key={x} className="rounded bg-atencao/10 px-1.5 py-0.5 text-atencao">{x}</span>)}</div>
        {edit ? <input value={note} onChange={(e) => setNote(e.target.value)} onBlur={commitNote} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} placeholder={r.lost || 'Observação'} className="mt-1 w-full min-w-[11rem] rounded border border-transparent bg-transparent px-1 py-0.5 text-xs hover:border-borda focus:border-nacao focus:outline-none" />
          : <p className="mt-1 text-xs text-tinta-suave">{[r.lost, r.note].filter(Boolean).join(' · ')}</p>}
      </td>
    </tr>
  );
}

function ValuesFields({ f, setF }: { f: { p: string; pu: string; a: string }; setF: (v: { p: string; pu: string; a: string }) => void }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <div><Label htmlFor="v-p">Produtividade</Label><Input id="v-p" inputMode="decimal" value={f.p} onChange={(e) => setF({ ...f, p: e.target.value })} placeholder="0,00" /></div>
      <div><Label htmlFor="v-pu">Pontualidade</Label><Input id="v-pu" inputMode="decimal" value={f.pu} onChange={(e) => setF({ ...f, pu: e.target.value })} placeholder="0,00" /></div>
      <div><Label htmlFor="v-a">Assiduidade</Label><Input id="v-a" inputMode="decimal" value={f.a} onChange={(e) => setF({ ...f, a: e.target.value })} placeholder="0,00" /></div>
    </div>
  );
}
const readValues = (f: { p: string; pu: string; a: string }) => {
  const [p, pu, a] = [toCents(f.p), toCents(f.pu), toCents(f.a)];
  return p === 'erro' || pu === 'erro' || a === 'erro' || p < 0 || pu < 0 || a < 0 ? null : { productivity: p, punctuality: pu, attendance: a };
};

function PersonSheet({ row, groups, onClose, onDone }: { row: AwardRow; groups: string[]; onClose: () => void; onDone: (ok: string) => void }) {
  const [group, setGroup] = useState(row.group);
  const [f, setF] = useState({ p: centsText(row.values.productivity), pu: centsText(row.values.punctuality), a: centsText(row.values.attendance) });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Sheet title={row.name} onClose={onClose}
      onSubmit={(e) => {
        e.preventDefault();
        const v = readValues(f);
        if (!v) return setError('Valor inválido. Use, por exemplo, 100,00.');
        start(async () => {
          const x = await saveAwardPersonAction({ teacherId: row.teacherId, groupName: group, ...v });
          if (!x.ok) return setError(x.error);
          onDone(`Valores de ${row.name} salvos.`);
        });
      }}
      footer={<>
        <Button type="submit" disabled={pending}>Salvar</Button>
        <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button type="button" variant="ghost" className="ml-auto" disabled={pending} onClick={() => confirm(`Tirar ${row.name} da Premiação? As apurações antigas ficam guardadas.`) && start(async () => {
          const x = await setAwardPersonActiveAction(row.teacherId, false, row.group);
          if (!x.ok) return setError(x.error);
          onDone(`${row.name} saiu da Premiação.`);
        })}>Tirar da Premiação</Button>
      </>}
    >
      <div>
        <Label htmlFor="ap-g">Equipe na Premiação</Label>
        <Input id="ap-g" value={group} onChange={(e) => setGroup(e.target.value)} list="award-groups-p" required />
        <datalist id="award-groups-p">{groups.map((g) => <option key={g} value={g} />)}</datalist>
        {row.source === 'escala' && <p className="mt-1 text-xs text-tinta-suave">Vem da escala 5x2; aqui só muda o agrupamento da Premiação.</p>}
      </div>
      <p className="text-sm text-tinta-suave">Valor de cada critério para {row.name}.</p>
      <ValuesFields f={f} setF={setF} />
      <FormMessage error={error} />
    </Sheet>
  );
}

function GroupSheet({ month, group, sample, count, onClose, onDone }: { month: string; group: string; sample: AwardRow; count: number; onClose: () => void; onDone: (ok: string) => void }) {
  const [f, setF] = useState({ p: centsText(sample.values.productivity), pu: centsText(sample.values.punctuality), a: centsText(sample.values.attendance) });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Sheet title={`Valores da equipe · ${group}`} onClose={onClose}
      onSubmit={(e) => {
        e.preventDefault();
        const v = readValues(f);
        if (!v) return setError('Valor inválido. Use, por exemplo, 100,00.');
        start(async () => {
          const x = await setGroupValuesAction({ month, group, ...v });
          if (!x.ok) return setError(x.error);
          onDone(`Valores aplicados a ${count} pessoa(s) de ${group}.`);
        });
      }}
      footer={<><Button type="submit" disabled={pending}>Aplicar a {count} pessoa(s)</Button><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button></>}
    >
      <p className="text-sm text-tinta-suave">Aplica os mesmos valores a todos de <b className="text-tinta">{group}</b> (ex.: Cozinha com valores diferentes). Depois dá para ajustar pessoa a pessoa clicando no nome.</p>
      <ValuesFields f={f} setF={setF} />
      <FormMessage error={error} />
    </Sheet>
  );
}
