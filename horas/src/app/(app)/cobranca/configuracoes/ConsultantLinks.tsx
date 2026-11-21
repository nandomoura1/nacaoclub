'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FormMessage } from '@/components/ui/alert';
import { linkConsultantAction, setConsultantActiveAction } from '../actions';

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
          <div key={c.id} className={`flex flex-wrap items-center justify-between gap-2 p-2.5 text-sm ${c.active ? '' : 'bg-fundo'}`}>
            <div>
              <span className={`font-semibold ${c.active ? 'text-tinta' : 'text-tinta-suave line-through'}`}>{c.name}</span>
              <span className="ml-2 text-xs text-tinta-suave">id Tecnofit {c.tecnofitId} · {c.openCustomers} aluno(s) com caso aberto</span>
              {!c.active && <span className="ml-2 text-xs font-semibold text-atencao">não é mais consultor(a): alunos vão para o Líder Comercial</span>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={pending}
              className="h-9 rounded-lg px-2 text-xs font-semibold text-tinta-suave hover:bg-fundo hover:text-tinta"
              onClick={() => {
                if (c.active && !confirm(`${c.name} não é mais consultor(a) da Nação? Os casos dos alunos dele(a) vão para o Líder Comercial designar outro consultor.`)) return;
                start(async () => {
                  setMsg({});
                  const r = await setConsultantActiveAction(c.id, !c.active);
                  if (!r.ok) { setMsg({ error: r.error }); return; }
                  setMsg({ success: c.active ? `${c.name} marcado(a) como fora do time.${r.data ? ` ${r.data} caso(s) foram para o Líder Comercial.` : ''}` : `${c.name} reativado(a).` });
                  router.refresh();
                });
              }}>{c.active ? 'Não é mais consultor(a)' : 'Reativar'}</button>
            <select
              defaultValue={c.userId ?? ''}
              disabled={pending || !c.active}
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
          </div>
        ))}
      </div>
    </div>
  );
}
