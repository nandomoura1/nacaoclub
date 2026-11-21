'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FormMessage } from '@/components/ui/alert';
import { setCrmLeaderAction } from '../actions';

/** Líder Comercial: fica com as cobranças de mais de 30 dias de atraso. */
export function LeaderPicker({ current, agents }: { current: string | null; agents: { id: string; name: string }[] }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ error?: string; success?: string }>({});
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <select
        defaultValue={current ?? ''}
        disabled={pending}
        aria-label="Líder Comercial"
        className="h-9 min-w-64 rounded-lg border border-borda bg-white px-2 text-sm"
        onChange={(e) => {
          const v = e.target.value || null;
          start(async () => {
            const r = await setCrmLeaderAction(v);
            setMsg(r.ok ? { success: r.message ?? 'Salvo.' } : { error: r.error });
            router.refresh();
          });
        }}
      >
        <option value="">Ninguém (cobrança antiga fica com o consultor)</option>
        {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
      <FormMessage error={msg.error} success={msg.success} />
    </div>
  );
}
