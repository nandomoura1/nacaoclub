'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { DEFAULT_KINDS, FILTERABLE_KINDS, OPT_IN_KINDS, SEND_HOURS, TASK_KINDS } from '@/domain/cobranca';
import { WEEKDAYS } from '@/domain/dates';
import { saveAgentRuleAction } from '../actions';

interface Member { id: string; name: string; hasPhone: boolean; taskKinds: string[]; sendHour: number; sendDays: number[] }

function Row({ m }: { m: Member }) {
  const router = useRouter();
  const [kinds, setKinds] = useState<string[]>(m.taskKinds.length ? m.taskKinds : DEFAULT_KINDS);
  const [hour, setHour] = useState(m.sendHour);
  const [days, setDays] = useState<number[]>(m.sendDays);
  const [msg, setMsg] = useState<{ error?: string; success?: string }>({});
  const [pending, start] = useTransition();
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-tinta">{m.name}</span>
        {!m.hasPhone && <Badge tone="amber">sem WhatsApp no cadastro — não recebe a mensagem</Badge>}
      </div>
      <div>
        <p className="mb-1 text-xs font-semibold text-tinta-suave">Tarefas que entram na lista (a tarefa do líder sempre entra). D-3 e D0 vêm desligados: muita parcela é cobrada sozinha no cartão.</p>
        <div className="flex flex-wrap gap-1.5">
          {FILTERABLE_KINDS.map((k) => (
            <label key={k} className={`flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ring-1 ${kinds.includes(k) ? 'bg-nacao/10 text-nacao ring-nacao/30' : 'bg-white text-tinta-suave ring-borda'}`}>
              <input type="checkbox" className="sr-only" checked={kinds.includes(k)} onChange={() => setKinds(toggle(kinds, k))} />
              {TASK_KINDS[k]?.label ?? k}{OPT_IN_KINDS.includes(k) && ' (antes de vencer)'}
            </label>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2">WhatsApp às
          <select value={hour} onChange={(e) => setHour(Number(e.target.value))} className="h-9 rounded-lg border border-borda bg-white px-2 text-sm">
            {SEND_HOURS.map((h) => <option key={h} value={h}>{String(h).padStart(2, '0')}h</option>)}
          </select>
        </label>
        <div className="flex flex-wrap gap-1">
          {WEEKDAYS.map((w, i) => (
            <label key={i} className={`cursor-pointer rounded-md px-2 py-1 text-xs ring-1 ${days.includes(i + 1) ? 'bg-nacao text-white ring-nacao' : 'bg-white text-tinta-suave ring-borda'}`}>
              <input type="checkbox" className="sr-only" checked={days.includes(i + 1)} onChange={() => setDays(toggle(days, i + 1))} />
              {w.short}
            </label>
          ))}
        </div>
        <Button size="sm" disabled={pending} onClick={() => start(async () => {
          setMsg({});
          const r = await saveAgentRuleAction({ userId: m.id, taskKinds: kinds, sendHour: hour, sendDays: days });
          if (!r.ok) return setMsg({ error: r.error });
          setMsg({ success: 'Salvo.' });
          router.refresh();
        })}>{pending ? 'Salvando…' : 'Salvar'}</Button>
      </div>
      <p className="text-xs text-tinta-suave">A mensagem chega a partir do horário escolhido (nunca antes), uma vez por dia, só nos dias marcados e só se houver tarefa.</p>
      <FormMessage error={msg.error} success={msg.success} />
    </Card>
  );
}

export function TeamRules({ team }: { team: Member[] }) {
  return <div className="space-y-3">{team.map((m) => <Row key={m.id} m={m} />)}</div>;
}
