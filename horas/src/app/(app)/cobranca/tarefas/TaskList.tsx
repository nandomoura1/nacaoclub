'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Phone, PhoneOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { brl } from '@/domain/cobranca';
import type { TaskRow } from '@/server/services/crm-task-service';
import { markTaskDoneAction } from '../actions';

const lateText = (d: number | null) => (d === null ? '' : d < 0 ? `vence em ${-d} dia(s)` : d === 0 ? 'vence hoje' : `${d} dia(s) de atraso`);

export function TaskList({ rows, showOwner }: { rows: TaskRow[]; showOwner: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();
  return (
    <div className="space-y-2">
      <FormMessage error={msg} />
      <Card className="divide-y divide-borda">
        {rows.map((t) => (
          <div key={t.id} className="flex flex-wrap items-start gap-3 p-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-tinta">{t.customer.name}</span>
                <Badge tone={t.kind === 'D+15' ? 'red' : t.kind === 'RETORNO' ? 'cyan' : t.kind === 'PENDENCIA' ? 'amber' : t.kind === 'D-3' || t.kind === 'D0' ? 'blue' : 'amber'}>{t.label}</Badge>
                {t.age > 0 && <Badge tone="red">atrasada há {t.age} dia(s)</Badge>}
                {t.missed.length > 0 && <Badge>sem contato no {t.missed.join(', ')}</Badge>}
              </div>
              <p className="mt-1 text-sm text-tinta">{t.todo}</p>
              <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-tinta-suave">
                {t.caseKind === 'COBRANCA' && <span className="font-semibold text-tinta">{brl(t.openValue)}</span>}
                {t.caseKind === 'COBRANCA' && <span>{lateText(t.daysLate)}</span>}
                <span className="flex items-center gap-1">{t.phone ? <Phone className="size-3" /> : <PhoneOff className="size-3" />}{t.phone ?? 'sem celular na Tecnofit'}</span>
                {showOwner && <span>Responsável: {t.ownerName ?? <em className="text-atencao">sem responsável</em>}</span>}
              </div>
            </div>
            <Button size="sm" variant="secondary" disabled={busy === t.id} title="Use se já registrou a ligação na Tecnofit e quer tirar da lista agora (senão sai sozinha amanhã)."
              onClick={() => { setBusy(t.id); start(async () => { setMsg(null); const r = await markTaskDoneAction(t.id); setBusy(null); if (!r.ok) return setMsg(r.error); router.refresh(); }); }}>
              <Check /> {busy === t.id ? 'Salvando…' : 'Já registrei na Tecnofit'}
            </Button>
          </div>
        ))}
      </Card>
    </div>
  );
}
