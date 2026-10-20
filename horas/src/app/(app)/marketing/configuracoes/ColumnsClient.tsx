'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Input, Select } from '@/components/ui/input';
import { STAGES, type BoardColumn } from '@/domain/marketing/board';
import { isDone } from '@/domain/marketing/constants';
import { deleteColumnAction, reorderColumnsAction, saveColumnAction } from '../actions';
import { useRun } from '../_components/useRun';

type Row = { name: string; color: string; stage: string };
const toRow = (c: BoardColumn): Row => ({ name: c.name, color: c.color ?? '#0169E9', stage: c.stage });

/** Colunas do Kanban: nome, cor, como funciona (etapa), ordem e exclusão. */
export function ColumnsClient({ columns, counts }: { columns: BoardColumn[]; counts: Record<string, number> }) {
  const { msg, pending, run } = useRun();
  const [edits, setEdits] = useState<Record<string, Row>>({});
  const [novo, setNovo] = useState<Row | null>(null);
  const [del, setDel] = useState<{ id: string; to: string } | null>(null);
  const row = (c: BoardColumn) => edits[c.id] ?? toRow(c);
  const dirty = (c: BoardColumn) => !!edits[c.id] && JSON.stringify(edits[c.id]) !== JSON.stringify(toRow(c));
  const edit = (c: BoardColumn, k: keyof Row, v: string) => setEdits((e) => ({ ...e, [c.id]: { ...row(c), [k]: v } }));
  const swap = (i: number, j: number) => {
    const ids = columns.map((c) => c.id);
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    run(() => reorderColumnsAction(ids));
  };

  return (
    <div className="space-y-3">
      <FormMessage error={msg.error} success={msg.ok} />
      <Card className="divide-y divide-borda">
        {columns.map((c, i) => {
          const r = row(c);
          const n = counts[c.id] ?? 0;
          return (
            <div key={c.id} className="p-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-col">
                  <button type="button" aria-label={`Subir ${c.name}`} disabled={pending || i === 0} onClick={() => swap(i, i - 1)} className="text-tinta-fraca hover:text-nacao disabled:opacity-30"><ArrowUp className="size-4" /></button>
                  <button type="button" aria-label={`Descer ${c.name}`} disabled={pending || i === columns.length - 1} onClick={() => swap(i, i + 1)} className="text-tinta-fraca hover:text-nacao disabled:opacity-30"><ArrowDown className="size-4" /></button>
                </div>
                <input type="color" aria-label="Cor" value={r.color} onChange={(e) => edit(c, 'color', e.target.value)} className="size-8 shrink-0 cursor-pointer rounded border border-borda" />
                <Input aria-label="Nome da coluna" value={r.name} onChange={(e) => edit(c, 'name', e.target.value)} className="h-9 min-w-36 flex-1" maxLength={40} />
                <Select aria-label="Funciona como" value={r.stage} onChange={(e) => edit(c, 'stage', e.target.value)} className="h-9 w-auto">
                  {STAGES.map((s) => <option key={s.id} value={s.id}>Funciona como: {s.label}</option>)}
                </Select>
                <span className="w-20 text-xs text-tinta-suave">{n} tarefa{n === 1 ? '' : 's'}</span>
                {dirty(c) && <Button size="sm" disabled={pending} onClick={() => run(() => saveColumnAction(c.id, { ...r }), () => setEdits((e) => { const x = { ...e }; delete x[c.id]; return x; }))}><Save /> Salvar</Button>}
                <Button size="sm" variant="ghost" disabled={pending} aria-label={`Excluir ${c.name}`}
                  onClick={() => (n ? setDel({ id: c.id, to: columns.find((x) => x.id !== c.id)?.id ?? '' }) : confirm(`Excluir a coluna “${c.name}”?`) && run(() => deleteColumnAction(c.id, null)))}><Trash2 /></Button>
              </div>
              {dirty(c) && isDone(r.stage) !== isDone(c.stage) && n > 0 && (
                <p className="mt-1 pl-8 text-xs text-atencao">As {n} tarefa(s) desta coluna passam a contar como {isDone(r.stage) ? 'concluídas' : 'não concluídas'}.</p>
              )}
              {del?.id === c.id && (
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-fundo p-2 pl-8 text-sm">
                  <span>Mover as {n} tarefa(s) para</span>
                  <Select value={del.to} onChange={(e) => setDel({ ...del, to: e.target.value })} className="h-8 w-auto">
                    {columns.filter((x) => x.id !== c.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </Select>
                  <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => deleteColumnAction(c.id, del.to), () => setDel(null))}><Trash2 /> Excluir coluna</Button>
                  <Button size="sm" variant="ghost" onClick={() => setDel(null)}>Cancelar</Button>
                </div>
              )}
            </div>
          );
        })}
        {novo ? (
          <div className="flex flex-wrap items-center gap-2 bg-nacao/5 p-3 pl-9">
            <input type="color" aria-label="Cor" value={novo.color} onChange={(e) => setNovo({ ...novo, color: e.target.value })} className="size-8 shrink-0 cursor-pointer rounded border border-borda" />
            <Input autoFocus aria-label="Nome da nova coluna" placeholder="ex.: Revisão do cliente" value={novo.name} onChange={(e) => setNovo({ ...novo, name: e.target.value })} className="h-9 min-w-36 flex-1" maxLength={40} />
            <Select aria-label="Funciona como" value={novo.stage} onChange={(e) => setNovo({ ...novo, stage: e.target.value })} className="h-9 w-auto">
              {STAGES.map((s) => <option key={s.id} value={s.id}>Funciona como: {s.label}</option>)}
            </Select>
            <Button size="sm" disabled={pending} onClick={() => run(() => saveColumnAction(null, novo), () => setNovo(null))}><Save /> Criar</Button>
            <Button size="sm" variant="ghost" onClick={() => setNovo(null)}>Cancelar</Button>
          </div>
        ) : (
          <div className="p-3"><Button size="sm" variant="secondary" onClick={() => setNovo({ name: '', color: '#3A86FF', stage: 'PRODUCAO' })}><Plus /> Nova coluna</Button></div>
        )}
      </Card>
      <p className="text-xs text-tinta-suave">“Funciona como” diz ao sistema o que a coluna significa: as de <b>Concluído ✔</b> contam como tarefa feita (prontidão da campanha, atrasos e briefing). Dá para ter várias colunas com o mesmo “funciona como”.</p>
    </div>
  );
}
