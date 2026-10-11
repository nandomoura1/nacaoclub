'use client';

import { useState } from 'react';
import { Check, Printer, RefreshCw, Save, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { AREAS, PRIORITIES, labelOf } from '@/domain/marketing/constants';
import { cn } from '@/lib/cn';
import type { MeetingView } from '@/server/services/mkt-ai-service';
import { decideMinutesAction, generateMinutesAction, refreshAgendaAction, saveMeetingNotesAction } from '../../actions';
import { useRun } from '../../_components/useRun';

const areaName = (k: string) => AREAS.find((a) => a.key === k)?.name ?? k;

export function MeetingClient({ m, perms }: { m: MeetingView; perms: { edit: boolean; ai: boolean } }) {
  const { msg, pending, run } = useRun();
  const [notes, setNotes] = useState(m.notes ?? '');
  const [minutes, setMinutes] = useState(m.minutes ?? '');
  const [thinking, setThinking] = useState(false);
  const draft = m.suggestions.find((s) => s.status === 'PENDENTE');
  const [ata, setAta] = useState(draft?.payload.ata ?? '');
  const [accept, setAccept] = useState<number[]>(draft ? draft.payload.decisoes.map((_, i) => i) : []);
  const [draftId, setDraftId] = useState(draft?.id);
  if (draft && draft.id !== draftId) { setDraftId(draft.id); setAta(draft.payload.ata); setAccept(draft.payload.decisoes.map((_, i) => i)); }
  const date = m.date.split('-').reverse().join('/');
  const decided = m.suggestions.filter((s) => s.status !== 'PENDENTE');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="min-w-0 flex-1 text-2xl font-extrabold text-navy">Reunião de {date}</h1>
        <Button size="sm" variant="secondary" onClick={() => window.print()} className="print:hidden"><Printer /> Imprimir</Button>
        {perms.edit && <Button size="sm" variant="secondary" disabled={pending} className="print:hidden" onClick={() => run(() => refreshAgendaAction(m.id))}><RefreshCw /> Atualizar pauta</Button>}
      </div>
      <FormMessage error={msg.error} success={msg.ok} />

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="p-4 lg:col-span-3">
          <h2 className="font-bold text-navy">Pauta</h2>
          <p className="text-xs text-tinta-suave">Gerada pelo sistema a partir do calendário, das campanhas e das pendências.</p>
          <div className="mt-3 space-y-3">
            {m.agenda.filter((s) => s.items.length).map((s) => (
              <section key={s.key}>
                <p className="text-xs font-bold uppercase tracking-wide text-nacao">{s.title}</p>
                <ul className="mt-1 space-y-0.5 text-sm">{s.items.map((it, i) => <li key={i} className="flex gap-1.5"><span className="text-tinta-fraca">•</span><span className="min-w-0">{it}</span></li>)}</ul>
              </section>
            ))}
            {m.agenda.every((s) => !s.items.length) && <p className="text-sm text-tinta-suave">Pauta vazia — nada no radar.</p>}
          </div>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <Card className="p-4 print:hidden">
            <h2 className="font-bold text-navy">Anotações da reunião</h2>
            <p className="text-xs text-tinta-suave">O que foi falado e decidido. A IA usa isto e a pauta para redigir a ata.</p>
            <textarea className="mt-2 min-h-40 w-full rounded-lg border border-borda p-2 text-sm" value={notes} disabled={!perms.edit} onChange={(e) => setNotes(e.target.value)} placeholder="ex.: Celebration — Thais fecha o fornecedor de som até sexta; Duda faz o teaser…" />
            {perms.edit && (
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => saveMeetingNotesAction(m.id, notes, null))}><Save /> Salvar anotações</Button>
                {perms.ai && !draft && (
                  <Button size="sm" disabled={pending} onClick={() => { setThinking(true); run(async () => { const r = await saveMeetingNotesAction(m.id, notes, null); return r.ok ? generateMinutesAction(m.id) : r; }, () => setThinking(false)); }}>
                    <Sparkles /> {thinking && pending ? 'Redigindo a ata…' : 'Gerar ata (IA)'}
                  </Button>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>

      {draft && (
        <Card className="border-nacao/30 p-4 print:hidden">
          <h2 className="flex items-center gap-2 font-bold text-navy"><Sparkles className="size-4 text-nacao" /> Ata sugerida pela IA — revise antes de aprovar</h2>
          <textarea className="mt-2 min-h-48 w-full rounded-lg border border-borda p-2 text-sm" value={ata} disabled={!perms.edit} onChange={(e) => setAta(e.target.value)} />
          <p className="mt-3 text-sm font-semibold text-navy">Encaminhamentos → tarefas ({accept.length}/{draft.payload.decisoes.length})</p>
          <ul className="mt-1 divide-y divide-borda">
            {draft.payload.decisoes.map((d, i) => (
              <li key={i}>
                <label className="flex cursor-pointer items-start gap-2 py-2 text-sm">
                  <input type="checkbox" className="mt-1" checked={accept.includes(i)} disabled={!perms.edit} onChange={(e) => setAccept(e.target.checked ? [...accept, i] : accept.filter((x) => x !== i))} />
                  <span className="min-w-0 flex-1"><span className="font-semibold">{d.titulo}</span><span className="block text-xs text-tinta-suave">{areaName(d.area)} · prazo em {d.prazoDias} dia(s) · {labelOf(PRIORITIES, d.prioridade)}</span></span>
                </label>
              </li>
            ))}
            {draft.payload.decisoes.length === 0 && <li className="py-2 text-sm text-tinta-suave">Nenhum encaminhamento identificado.</li>}
          </ul>
          {perms.edit && (
            <div className="mt-2 flex flex-wrap gap-2">
              <Button disabled={pending} onClick={() => run(() => decideMinutesAction(draft.id, ata, accept))}><Check /> Aprovar ata e criar {accept.length} tarefa(s)</Button>
              <Button variant="secondary" disabled={pending} onClick={() => setAccept([])}>Desmarcar todas</Button>
            </div>
          )}
        </Card>
      )}

      {(m.minutes || decided.length > 0) && (
        <Card className="p-4">
          <h2 className="font-bold text-navy">Ata</h2>
          {perms.edit ? (
            <>
              <textarea className="mt-2 min-h-48 w-full rounded-lg border border-borda p-2 text-sm print:hidden" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
              <pre className="mt-2 hidden whitespace-pre-wrap font-sans text-sm print:block">{minutes}</pre>
              <Button size="sm" variant="secondary" className="mt-2 print:hidden" disabled={pending} onClick={() => run(() => saveMeetingNotesAction(m.id, notes, minutes))}><Save /> Salvar ata</Button>
            </>
          ) : <pre className="mt-2 whitespace-pre-wrap font-sans text-sm">{m.minutes}</pre>}
          {decided.map((s) => (
            <p key={s.id} className="mt-2 text-xs text-tinta-suave">
              IA ({s.model}) · {new Date(s.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · {s.payload.decisoes.filter((d) => d.decisao === 'aceita').length} de {s.payload.decisoes.length} encaminhamento(s) viraram tarefa
              <span className={cn('ml-1 font-semibold', s.status === 'RECUSADA' ? 'text-critico' : 'text-sucesso')}>({s.status.toLowerCase()})</span>
            </p>
          ))}
        </Card>
      )}
    </div>
  );
}
