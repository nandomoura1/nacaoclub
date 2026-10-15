'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarCheck, Timer } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { MEETING_KINDS } from '@/domain/proc-meeting';
import { startProcMeetingAction } from '../actions';

/** Dois botões grandes: semanal e daily. */
export function StartMeeting() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        {MEETING_KINDS.map((k) => {
          const Icon = k.id === 'SEMANAL' ? CalendarCheck : Timer;
          return (
            <button key={k.id} type="button" disabled={pending} onClick={() => start(async () => { setError(null); const r = await startProcMeetingAction(k.id); if (!r.ok) setError(r.error); else router.push(`/processos/reuniao/${r.data}`); })}
              className="text-left disabled:opacity-60">
              <Card className="flex h-full items-start gap-3 p-4 transition hover:border-nacao hover:shadow-md">
                <span className="rounded-xl bg-nacao/10 p-2.5 text-nacao"><Icon className="size-6" /></span>
                <span className="min-w-0">
                  <span className="block font-bold text-navy">▶ {k.id === 'SEMANAL' ? 'Começar a reunião semanal' : 'Começar a daily'}</span>
                  <span className="block text-sm text-tinta-suave">{k.hint} ≈ {k.minutes} min.</span>
                </span>
              </Card>
            </button>
          );
        })}
      </div>
      <FormMessage error={error} />
    </>
  );
}
