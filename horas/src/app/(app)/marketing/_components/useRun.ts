'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export type Msg = { error?: string | null; ok?: string | null };
type Result = { ok: boolean; error?: string; message?: string };

/** Executa uma action, mostra a mensagem e atualiza a página. */
export function useRun() {
  const router = useRouter();
  const [msg, setMsg] = useState<Msg>({});
  const [pending, start] = useTransition();
  const run = <R extends Result>(fn: () => Promise<R>, after?: (r: R) => void) => start(async () => {
    setMsg({});
    const r = await fn();
    if (!r.ok) return setMsg({ error: r.error });
    setMsg({ ok: r.message ?? null });
    after?.(r);
    router.refresh();
  });
  return { msg, setMsg, pending, run };
}
