'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock, Check, Phone, PhoneOff, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FormMessage } from '@/components/ui/alert';
import { brl } from '@/domain/cobranca';
import { addDays, formatDateBR } from '@/domain/dates';
import type { TaskRow } from '@/server/services/crm-task-service';
import { markTaskDoneAction, removeTaskAction, snoozeTaskAction } from '../actions';

const lateText = (d: number | null) => (d === null ? '' : d < 0 ? `vence em ${-d} dia(s)` : d === 0 ? 'vence hoje' : `${d} dia(s) de atraso`);
const tone = (k: string) => (k === 'D+15' ? 'red' : k === 'RETORNO' || k === 'RENOVACAO' ? 'cyan' : k === 'MANUAL' ? 'navy' : k === 'D-3' || k === 'D0' ? 'blue' : 'amber') as 'red' | 'cyan' | 'navy' | 'blue' | 'amber';

/** Lista de tarefas. O líder (canManage) também adia ou tira da lista. */
export function TaskList({ rows, showOwner, canManage, today }: { rows: TaskRow[]; showOwner: boolean; canManage: boolean; today: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ id: string; mode: 'snooze' | 'remove'; value: string } | null>(null);
  const [, start] = useTransition();
  const run = (id: string, fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(id);
    start(async () => { setMsg(null); const r = await fn(); setBusy(null); if (!r.ok) return setMsg(r.error ?? 'Erro.'); setEdit(null); router.refresh(); });
  };
  return (
    <div className="space-y-2">
      <FormMessage error={msg} />
      <Card className="divide-y divide-borda">
        {rows.map((t) => (
          <div key={t.id} className="p-3">
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-tinta">{t.customer?.name ?? t.label}</span>
                  <Badge tone={tone(t.kind)}>{t.manual ? 'Tarefa do líder' : t.label}</Badge>
                  {t.showFrom > today && <Badge tone="blue">aparece em {formatDateBR(t.showFrom)}</Badge>}
                  {t.age > 0 && <Badge tone="red">atrasada há {t.age} dia(s)</Badge>}
                  {t.missed.length > 0 && <Badge>sem contato no {t.missed.join(', ')}</Badge>}
                  {t.held && <Badge tone="amber">fora das regras do consultor (não vai para ele)</Badge>}
                </div>
                {t.manual && t.customer && <p className="mt-1 text-sm font-semibold text-tinta">{t.label}</p>}
                {t.plan && <p className="mt-1 text-xs font-semibold text-tinta-suave">Plano: {t.plan}</p>}
                {t.todo && <p className="mt-1 text-sm text-tinta">{t.todo}</p>}
                <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-tinta-suave">
                  {t.caseKind === 'COBRANCA' && <span className="font-semibold text-tinta">{brl(t.openValue)}</span>}
                  {t.caseKind === 'COBRANCA' && <span>{lateText(t.daysLate)}</span>}
                  {t.customer && <span className="flex items-center gap-1">{t.phone ? <Phone className="size-3" /> : <PhoneOff className="size-3" />}{t.phone ?? 'sem celular na Tecnofit'}</span>}
                  {showOwner && <span>Responsável: {t.ownerName ?? <em className="text-atencao">sem responsável</em>}</span>}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant="secondary" disabled={busy === t.id} title={t.customer ? 'Já registrou a ligação na Tecnofit? Tira da lista agora (senão sai sozinha na sincronização).' : 'Marcar como feita.'}
                  onClick={() => run(t.id, () => markTaskDoneAction(t.id))}>
                  <Check /> {t.customer ? 'Já registrei na Tecnofit' : 'Feita'}
                </Button>
                {canManage && <>
                  <Button size="sm" variant="ghost" onClick={() => setEdit({ id: t.id, mode: 'snooze', value: addDays(today, 1) })}><CalendarClock /> Adiar</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEdit({ id: t.id, mode: 'remove', value: '' })}><X /> Tirar da lista</Button>
                </>}
              </div>
            </div>
            {edit?.id === t.id && (
              <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-fundo p-2 text-sm">
                {edit.mode === 'snooze' ? (
                  <>
                    <span>Mostrar de novo em</span>
                    <Input type="date" className="w-44" min={addDays(today, 1)} max={addDays(today, 60)} value={edit.value} onChange={(e) => setEdit({ ...edit, value: e.target.value })} />
                    <Button size="sm" disabled={busy === t.id || !edit.value} onClick={() => run(t.id, () => snoozeTaskAction(t.id, edit.value))}>Adiar</Button>
                  </>
                ) : (
                  <>
                    <Input className="min-w-64 flex-1" placeholder="Motivo (ex.: aluno já negociou com a gerência)" value={edit.value} onChange={(e) => setEdit({ ...edit, value: e.target.value })} />
                    <Button size="sm" variant="danger" disabled={busy === t.id || edit.value.trim().length < 3} onClick={() => run(t.id, () => removeTaskAction(t.id, edit.value))}>Tirar da lista</Button>
                  </>
                )}
                <Button size="sm" variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button>
              </div>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
}
