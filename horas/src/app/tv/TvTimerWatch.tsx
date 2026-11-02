'use client';

import { useEffect } from 'react';

/** TV sem cronômetro: confere a cada 3 s se o professor programou um timer e recarrega na hora. */
export function TvTimerWatch({ token }: { token: string }) {
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const r = await fetch(`/tv/${token}/timer`, { cache: 'no-store' });
        if (!r.ok) return;
        const j = (await r.json()) as { timer: unknown };
        if (j.timer) location.reload();
      } catch { /* sem rede: tenta de novo */ }
    }, 3000);
    return () => clearInterval(id);
  }, [token]);
  return null;
}
