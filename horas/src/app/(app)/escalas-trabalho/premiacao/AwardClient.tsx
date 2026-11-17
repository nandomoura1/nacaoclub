'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Check, Copy, Lock, LockOpen, Plus, RotateCcw, Search, Settings2, Wallet, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Input, Label } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { formatDateBR } from '@/domain/dates';
import { CRITERIA, awardTotal, awardTsv, lostLabel, type AwardState, type CriterionKey } from '@/domain/premiacao';
import { cn } from '@/lib/cn';
import type { AwardBoard, AwardRow } from '@/server/services/premiacao-service';
import { addAwardPeopleAction, closeAwardMonthAction, reopenAwardMonthAction, saveAwardMonthAction, saveAwardPersonAction, setAwardPaidAction, setAwardPersonActiveAction } from './actions';

type Msg = { ok?: string; error?: string };
const brl = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const toCents = (v: string): number | 'erro' => {
  const t = v.trim().replace(/[R$\s]/g, '');
  if (!t) return 0;
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  return Number.isFinite(n) ? Math.round(n * 100) : 'erro';
};
const centsText = (c: number) => (c ? (c / 100).toFixed(2).replace('.', ',') : '');

export function AwardClient({ board }: { board: AwardBoard }) {
  const router = useRouter();
  const path = usePathname();
  const [msg, setMsg] = useState<Msg>({});
  const [pending, start] = useTransition();
  const [rows, setRows] = useState(board.rows);
  // Depois de fechar/reabrir/incluir, o servidor manda a lista nova.
  useEffect(() => setRows(board.rows), [board.rows]);
  const [q, setQ] = useState('');
  const [config, setConfig] = useState<AwardRow | null>(null);
  const [adding, setAdding] = useState(false);
  const locked = !!board.closure;
  const edit = board.canEdit && !locked;

  const shown = useMemo(() => rows.filter((r) => r.active || r.reviewed).filter((r) => !q.trim() || `${r.name} ${r.group}`.toLowerCase().includes(q.trim().toLowerCase())), [rows, q]);
  const groups = [...new Set(shown.map((r) => r.group))];
  const totals = useMemo(() => {
    const list = rows.filter((r) => r.active || r.reviewed);
    return {
      people: list.length, total: list.reduce((a, r) => a + r.total, 0), max: list.reduce((a, r) => a + r.max, 0),
      full: list.filter((r) => r.total >= r.max && r.max > 0).length,
      pending: list.filter((r) => !r.reviewed).length,
      lost: Object.fromEntries(CRITERIA.map((c) => [c.key, list.filter((r) => !r.state[c.key]).length])) as Record<CriterionKey, number>,
    };
  }, [rows]);

  /** Salva a avaliação da linha (otimista: a tela muda na hora e volta se der erro). */
  const save = (r: AwardRow, state: AwardState, note: string | null, reset = false) => {
    const before = rows;
    const next: AwardRow = reset
      ? { ...r, state: r.suggested, reviewed: false, note: null, total: awardTotal(r.values, r.suggested), lost: lostLabel(r.suggested) }
      : { ...r, state, reviewed: true, note, total: awardTotal(r.values, state), lost: lostLabel(state) };
    setRows((rs) => rs.map((x) => (x.teacherId === r.teacherId ? next : x)));
    start(async () => {
      const x = await saveAwardMonthAction({ teacherId: r.teacherId, month: board.month, ...state, note, reset });
      if (!x.ok) { setRows(before); setMsg({ error: x.error }); }
    });
  };
  const toggle = (r: AwardRow, k: CriterionKey) => save(r, { ...r.state, [k]: !r.state[k] }, r.note);

  const copy = async () => {
    const text = awardTsv(rows.filter((r) => r.active || r.reviewed).map((r) => ({
      group: r.group, name: r.name, total: r.total,
      note: [r.lost, r.state.extraCents ? `ajuste ${brl(r.state.extraCents)}` : '', r.note].filter(Boolean).join(' · '),
    })));
    try { await navigator.clipboard.writeText(text); setMsg({ ok: 'Tabela copiada: cole na planilha (Equipe · Nome · Valor · Obs.).' }); } catch { setMsg({ error: 'Não consegui copiar.' }); }
  };
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => start(async () => {
    const x = await fn();
    if (!x.ok) return setMsg({ error: x.error });
    setMsg({ ok }); router.refresh();
  });

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end gap-4 p-4">
        <div>
          <Label htmlFor="pr-mes">Pagamento (dia 15 de)</Label>
          <Input id="pr-mes" type="month" value={board.month} onChange={(e) => e.target.value && router.push(`${path}?mes=${e.target.value}`)} className="w-44" />
        </div>
        <div className="flex flex-wrap gap-6 text-sm">
          <div><p className="text-2xl font-extrabold text-navy">{totals.people}</p><p className="text-tinta-suave">pessoas</p></div>
          <div><p className="text-2xl font-extrabold text-nacao">{brl(totals.total)}</p><p className="text-tinta-suave">a pagar em {formatDateBR(board.payDay)} · de {brl(totals.max)}</p></div>
          <div><p className="text-2xl font-extrabold text-sucesso">{totals.full}</p><p className="text-tinta-suave">com a premiação cheia</p></div>
          <div className="text-xs text-tinta-suave">
            <p className="font-semibold uppercase">Perderam</p>
            {CRITERIA.map((c) => <p key={c.key}>{c.label}: <b className="text-tinta">{totals.lost[c.key]}</b></p>)}
          </div>
        </div>
        <div className="flex-1" />
        <div className="flex flex-wrap items-center gap-2">
          {board.closure ? (
            <Badge tone={board.closure.paidAt ? 'green' : 'blue'}>{board.closure.paidAt ? `Pago em ${formatDateBR(board.closure.paidAt.slice(0, 10))}` : 'Mês fechado'}</Badge>
          ) : totals.pending > 0 && <Badge tone="amber">{totals.pending} sem revisão</Badge>}
          <Button variant="secondary" onClick={copy}><Copy /> Copiar tabela</Button>
          {board.canEdit && !board.closure && (
            <Button disabled={pending || !totals.people} onClick={() => {
              if (totals.pending && !confirm(`${totals.pending} pessoa(s) ainda estão na sugestão do sistema (não revisadas). Fechar mesmo assim?`)) return;
              act(() => closeAwardMonthAction(board.month), 'Mês fechado: valores congelados.');
            }}><Lock /> Fechar mês</Button>
          )}
          {board.canEdit && board.closure && !board.closure.paidAt && (
            <>
              <Button disabled={pending} onClick={() => act(() => setAwardPaidAction(board.month, true), 'Pagamento registrado.')}><Wallet /> Marcar como pago</Button>
              <Button variant="ghost" disabled={pending} onClick={() => { const why = prompt('Motivo para reabrir o mês:'); if (why) act(() => reopenAwardMonthAction(board.month, why), 'Mês reaberto.'); }}><LockOpen /> Reabrir</Button>
            </>
          )}
          {board.canEdit && board.closure?.paidAt && (
            <Button variant="ghost" disabled={pending} onClick={() => confirm('Desmarcar o pagamento?') && act(() => setAwardPaidAction(board.month, false), 'Pagamento desmarcado.')}>Desmarcar pago</Button>
          )}
        </div>
      </Card>

      <Card className="p-3 text-sm text-tinta-suave">
        <b className="text-tinta">Competência de {formatDateBR(board.period.first)} a {formatDateBR(board.period.last)}</b>, paga em <b className="text-tinta">{formatDateBR(board.payDay)}</b>.
        {edit ? <> Clique nos critérios para marcar o que a pessoa <b className="text-tinta">perdeu</b>. Falta e atestado lançados no período já vêm marcados (selo <i>sugestão</i>); ajuste em R$ para o que foge da regra. Clique no nome para mudar a equipe ou os valores (ex.: Cozinha).</> : locked ? ' Mês fechado: valores congelados.' : ''}
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-tinta-fraca" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar pessoa ou equipe" className="pl-9" />
        </div>
        {edit && <Button variant="secondary" onClick={() => setAdding(true)}><Plus /> Incluir pessoas</Button>}
      </div>

      <FormMessage error={msg.error} success={msg.ok} />

      {groups.length === 0 ? (
        <Card className="p-8 text-center text-sm text-tinta-suave">
          {rows.length === 0 ? (edit ? 'Ninguém na Premiação ainda. Clique em "Incluir pessoas" e escolha a equipe.' : 'Ninguém na Premiação neste mês.') : 'Nada encontrado.'}
        </Card>
      ) : groups.map((g) => {
        const list = shown.filter((r) => r.group === g);
        return (
          <Card key={g} className="overflow-x-auto">
            <div className="flex items-center justify-between px-4 pt-3">
              <h3 className="font-extrabold text-navy">{g}</h3>
              <span className="text-sm text-tinta-suave">subtotal <b className="text-navy">{brl(list.reduce((a, r) => a + r.total, 0))}</b></span>
            </div>
            <table className="w-full min-w-[56rem] text-sm">
              <thead>
                <tr className="border-b border-borda text-left text-xs uppercase text-tinta-suave">
                  <th className="px-4 py-2">Nome</th>
                  {CRITERIA.map((c) => <th key={c.key} className="px-2 py-2 text-center" title={c.hint}>{c.label}</th>)}
                  <th className="px-2 py-2 text-right">Ajuste</th>
                  <th className="px-2 py-2 text-right">Total</th>
                  <th className="px-4 py-2">Obs.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borda">
                {list.map((r) => <Line key={`${r.teacherId}:${r.state.extraCents}:${r.note ?? ''}:${r.reviewed}`} r={r} edit={edit} canConfig={edit} onToggle={toggle} onSave={save} onConfig={() => setConfig(r)} />)}
              </tbody>
            </table>
          </Card>
        );
      })}

      {config && <PersonSheet row={config} groups={board.groups} onClose={() => setConfig(null)} onDone={(ok) => { setConfig(null); setMsg({ ok }); router.refresh(); }} />}
      {adding && <AddSheet board={board} onClose={() => setAdding(false)} onDone={(ok) => { setAdding(false); setMsg({ ok }); router.refresh(); }} />}
    </div>
  );
}

function Line({ r, edit, canConfig, onToggle, onSave, onConfig }: {
  r: AwardRow; edit: boolean; canConfig: boolean;
  onToggle: (r: AwardRow, k: CriterionKey) => void; onSave: (r: AwardRow, s: AwardState, note: string | null, reset?: boolean) => void; onConfig: () => void;
}) {
  const [extra, setExtra] = useState(centsText(r.state.extraCents));
  const [note, setNote] = useState(r.note ?? '');
  const commitExtra = () => {
    const c = toCents(extra);
    if (c === 'erro' || c === r.state.extraCents) return setExtra(centsText(r.state.extraCents));
    onSave(r, { ...r.state, extraCents: c }, r.note);
  };
  const commitNote = () => { if ((r.note ?? '') !== note.trim()) onSave(r, r.state, note.trim() || null); };
  const differs = r.reviewed && CRITERIA.some((c) => r.state[c.key] !== r.suggested[c.key]);
  return (
    <tr className={cn(!r.active && 'opacity-60')}>
      <td className="px-4 py-2">
        {canConfig ? (
          <button type="button" onClick={onConfig} className="inline-flex items-center gap-1 text-left font-semibold text-tinta hover:text-nacao" title="Equipe e valores">
            {r.name}<Settings2 className="size-3.5 text-tinta-fraca" />
          </button>
        ) : <span className="font-semibold text-tinta">{r.name}</span>}
        <p className="text-[11px] text-tinta-suave">até {brl(r.max)}{!r.active && ' · fora da Premiação'}</p>
      </td>
      {CRITERIA.map((c) => {
        const on = r.state[c.key];
        return (
          <td key={c.key} className="px-2 py-2 text-center">
            <button type="button" disabled={!edit} onClick={() => onToggle(r, c.key)} title={`${c.label}: ${on ? 'ganhou' : 'perdeu'} (${c.hint})`}
              className={cn('inline-flex min-w-[6.5rem] items-center justify-center gap-1 rounded-full px-3 py-1 text-xs font-bold ring-1 transition-colors',
                on ? 'bg-sucesso/10 text-sucesso ring-sucesso/30' : 'bg-critico/10 text-critico line-through ring-critico/30',
                edit ? 'hover:opacity-80' : 'cursor-default')}>
              {on ? <Check className="size-3.5" /> : <X className="size-3.5" />}{brl(r.values[c.key])}
            </button>
          </td>
        );
      })}
      <td className="px-2 py-2 text-right">
        {edit ? (
          <Input value={extra} onChange={(e) => setExtra(e.target.value)} onBlur={commitExtra} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            inputMode="decimal" placeholder="0,00" className="ml-auto h-8 w-24 text-right" title="Ajuste em R$ (use − para descontar)" />
        ) : r.state.extraCents ? brl(r.state.extraCents) : ''}
      </td>
      <td className="tabular px-2 py-2 text-right text-base font-extrabold text-navy">{brl(r.total)}</td>
      <td className="px-4 py-2">
        <div className="flex flex-wrap items-center gap-1 text-xs">
          {!r.reviewed && <Badge tone="amber">sugestão</Badge>}
          {r.reasons.map((x) => <span key={x} className="rounded bg-atencao/10 px-1.5 py-0.5 text-atencao">{x}</span>)}
          {r.reviewed && differs && edit && (
            <button type="button" className="inline-flex items-center gap-0.5 text-tinta-fraca hover:text-nacao" title="Voltar à sugestão do sistema" onClick={() => onSave(r, r.suggested, null, true)}>
              <RotateCcw className="size-3" /> sugestão
            </button>
          )}
        </div>
        {edit ? (
          <input value={note} onChange={(e) => setNote(e.target.value)} onBlur={commitNote} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            placeholder={r.lost || 'Observação'} className="mt-1 w-full min-w-[12rem] rounded border border-transparent bg-transparent px-1 py-0.5 text-xs hover:border-borda focus:border-nacao focus:outline-none" />
        ) : <p className="mt-1 text-xs text-tinta-suave">{[r.lost, r.note].filter(Boolean).join(' · ')}</p>}
      </td>
    </tr>
  );
}

function PersonSheet({ row, groups, onClose, onDone }: { row: AwardRow; groups: string[]; onClose: () => void; onDone: (ok: string) => void }) {
  const [f, setF] = useState({ group: row.group, p: centsText(row.values.productivity), pu: centsText(row.values.punctuality), a: centsText(row.values.attendance) });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Sheet title={row.name} onClose={onClose}
      onSubmit={(e) => {
        e.preventDefault();
        const [p, pu, a] = [toCents(f.p), toCents(f.pu), toCents(f.a)];
        if (p === 'erro' || pu === 'erro' || a === 'erro' || p < 0 || pu < 0 || a < 0) return setError('Valor inválido. Use, por exemplo, 100,00.');
        start(async () => {
          const x = await saveAwardPersonAction({ teacherId: row.teacherId, groupName: f.group, productivity: p, punctuality: pu, attendance: a });
          if (!x.ok) return setError(x.error);
          onDone('Equipe e valores salvos.');
        });
      }}
      footer={<>
        <Button type="submit" disabled={pending}>Salvar</Button>
        <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button type="button" variant="ghost" className="ml-auto" disabled={pending} onClick={() => confirm(row.active ? `Tirar ${row.name} da Premiação? As avaliações antigas ficam guardadas.` : `Voltar ${row.name} para a Premiação?`) && start(async () => {
          const x = await setAwardPersonActiveAction(row.teacherId, !row.active);
          if (!x.ok) return setError(x.error);
          onDone(row.active ? 'Retirado da Premiação.' : 'De volta na Premiação.');
        })}>{row.active ? 'Tirar da Premiação' : 'Voltar para a Premiação'}</Button>
      </>}
    >
      <div>
        <Label htmlFor="ap-g">Equipe</Label>
        <Input id="ap-g" value={f.group} onChange={(e) => setF({ ...f, group: e.target.value })} list="award-groups" required />
        <datalist id="award-groups">{groups.map((g) => <option key={g} value={g} />)}</datalist>
      </div>
      <p className="text-sm text-tinta-suave">Valor de cada critério (padrão R$ 100; Cozinha e outras equipes podem ter valores diferentes).</p>
      <div className="grid grid-cols-3 gap-3">
        <div><Label htmlFor="ap-p">Produtividade</Label><Input id="ap-p" inputMode="decimal" value={f.p} onChange={(e) => setF({ ...f, p: e.target.value })} placeholder="0,00" /></div>
        <div><Label htmlFor="ap-pu">Pontualidade</Label><Input id="ap-pu" inputMode="decimal" value={f.pu} onChange={(e) => setF({ ...f, pu: e.target.value })} placeholder="0,00" /></div>
        <div><Label htmlFor="ap-a">Assiduidade</Label><Input id="ap-a" inputMode="decimal" value={f.a} onChange={(e) => setF({ ...f, a: e.target.value })} placeholder="0,00" /></div>
      </div>
      <FormMessage error={error} />
    </Sheet>
  );
}

function AddSheet({ board, onClose, onDone }: { board: AwardBoard; onClose: () => void; onDone: (ok: string) => void }) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [f, setF] = useState({ group: board.groups[0] ?? '', p: '100,00', pu: '100,00', a: '100,00' });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const list = board.candidates.filter((c) => !q.trim() || c.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Sheet title="Incluir pessoas na Premiação" onClose={onClose}
      onSubmit={(e) => {
        e.preventDefault();
        const [p, pu, a] = [toCents(f.p), toCents(f.pu), toCents(f.a)];
        if (p === 'erro' || pu === 'erro' || a === 'erro') return setError('Valor inválido.');
        start(async () => {
          const x = await addAwardPeopleAction({ teacherIds: [...picked], groupName: f.group, productivity: p, punctuality: pu, attendance: a });
          if (!x.ok) return setError(x.error);
          onDone(`${picked.size} pessoa(s) incluída(s) em ${f.group}.`);
        });
      }}
      footer={<><Button type="submit" disabled={pending || !picked.size || f.group.trim().length < 2}>Incluir {picked.size || ''}</Button><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button></>}
    >
      <div>
        <Label htmlFor="aa-g">Equipe</Label>
        <Input id="aa-g" value={f.group} onChange={(e) => setF({ ...f, group: e.target.value })} list="award-groups-add" placeholder="Ex.: Equipe Kids" required />
        <datalist id="award-groups-add">{[...new Set([...board.groups, 'Equipe Kids', 'Equipe Lanchonete', 'Equipe Cozinha', 'Equipe Manutenção', 'Equipe Academia', 'Recepção', 'Equipe FUNAP'])].map((g) => <option key={g} value={g} />)}</datalist>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div><Label htmlFor="aa-p">Produtividade</Label><Input id="aa-p" inputMode="decimal" value={f.p} onChange={(e) => setF({ ...f, p: e.target.value })} /></div>
        <div><Label htmlFor="aa-pu">Pontualidade</Label><Input id="aa-pu" inputMode="decimal" value={f.pu} onChange={(e) => setF({ ...f, pu: e.target.value })} /></div>
        <div><Label htmlFor="aa-a">Assiduidade</Label><Input id="aa-a" inputMode="decimal" value={f.a} onChange={(e) => setF({ ...f, a: e.target.value })} /></div>
      </div>
      <div>
        <Label htmlFor="aa-q">Colaboradores ({picked.size} marcados)</Label>
        <Input id="aa-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" />
        <ul className="mt-2 max-h-72 divide-y divide-borda overflow-y-auto rounded-lg border border-borda text-sm">
          {list.map((c) => (
            <li key={c.id}>
              <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-fundo">
                <input type="checkbox" className="size-4 accent-nacao" checked={picked.has(c.id)}
                  onChange={(e) => setPicked((s) => { const n = new Set(s); if (e.target.checked) n.add(c.id); else n.delete(c.id); return n; })} />
                {c.name}<span className="ml-auto text-[11px] text-tinta-fraca">{c.team === 'PROFESSOR' ? 'professor' : 'escala'}</span>
              </label>
            </li>
          ))}
          {list.length === 0 && <li className="px-3 py-2 text-tinta-suave">Ninguém encontrado.</li>}
        </ul>
      </div>
      <FormMessage error={error} />
    </Sheet>
  );
}
