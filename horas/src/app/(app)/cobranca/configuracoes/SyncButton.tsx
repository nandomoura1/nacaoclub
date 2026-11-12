'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/alert';
import { syncNowAction } from '../actions';

/** Roda um pedaço da sincronização (até ~50 s). Se faltar aluno, clicar de novo continua. */
export function SyncButton({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ error?: string; success?: string }>({});
  const [pending, start] = useTransition();
  const run = (force: boolean) => start(async () => {
    setMsg({});
    const r = await syncNowAction(force);
    if (!r.ok) return setMsg({ error: r.error });
    const d = r.data;
    setMsg(d.status === 'FALHOU' ? { error: 'A sincronização falhou — veja o motivo na tabela.' }
      : d.status === 'CONCLUIDA' ? { success: `Sincronização concluída (${d.processed} aluno(s)).` }
      : { success: `${d.processed} aluno(s) processados; faltam ${d.remaining}. A rodada continua sozinha em segundo plano — atualize a página daqui a alguns minutos para acompanhar.` });
    router.refresh();
  });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button disabled={disabled || pending} onClick={() => run(false)}><RefreshCw /> {pending ? 'Sincronizando…' : 'Sincronizar / continuar'}</Button>
        <Button variant="secondary" disabled={disabled || pending} onClick={() => run(true)}>Refazer a de hoje</Button>
      </div>
      <FormMessage error={msg.error} success={msg.success} />
    </div>
  );
}
