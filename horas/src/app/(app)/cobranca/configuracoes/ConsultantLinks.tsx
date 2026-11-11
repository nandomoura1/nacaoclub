'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FormMessage } from '@/components/ui/alert';
import { linkConsultantAction } from '../actions';

interface Row { id: string; tecnofitId: string; name: string; userId: string | null; active: boolean; openCustomers: number }

export function ConsultantLinks({ consultants, agents }: { consultants: Row[]; agents: { id: string; name: string }[] }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ error?: string; success?: string }>({});
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <FormMessage error={msg.error} success={msg.success} />
      <div className="divide-y divide-borda rounded-lg border border-borda">
        {consultants.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-2.5 text-sm">
            <div>
              <span className="font-semibold text-tinta">{c.name}</span>
              <span className="ml-2 text-xs text-tinta-suave">id Tecnofit {c.tecnofitId} · {c.openCustomers} aluno(s) com caso aberto</span>
            </div>
            <select
              defaultValue={c.userId ?? ''}
              disabled={pending}
              aria-label={`Usuário do consultor ${c.name}`}
              className="h-9 min-w-48 rounded-lg border border-borda bg-white px-2 text-sm"
              onChange={(e) => {
                const userId = e.target.value || null;
                start(async () => {
                  setMsg({});
                  const r = await linkConsultantAction(c.id, userId);
                  if (!r.ok) { setMsg({ error: r.error }); router.refresh(); return; }
                  setMsg({ success: userId ? `${c.name} vinculado.${r.data ? ` ${r.data} caso(s) sem responsável passaram para essa pessoa.` : ''}` : `${c.name} desvinculado.` });
                  router.refresh();
                });
              }}
            >
              <option value="">— sem vínculo —</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
