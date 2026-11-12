'use client';

import { useEffect, useState } from 'react';
import type { TvCheckinView } from '@/server/services/tv-checkin-service';

const MAX_NAMES = 24;

/**
 * Faixa de check-in da aula atual (acima do rodapé). Só "Nome I." — sem horário de chegada,
 * sem id. Some fora do horário de aula. Consulta a cada 45 s (a Tecnofit é lida no máximo 1×/min).
 */
export function TvCheckins({ token, initial }: { token: string; initial: TvCheckinView }) {
  const [v, setV] = useState<TvCheckinView>(initial);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch(`/tv/${token}/checkins`, { cache: 'no-store' });
        if (r.ok && alive) setV((await r.json()) as TvCheckinView);
      } catch { /* sem rede: mantém o último */ }
    };
    const id = setInterval(load, 45_000);
    void load();
    return () => { alive = false; clearInterval(id); };
  }, [token]);
  if (!v.active) return null;
  const extra = v.labels.length - MAX_NAMES;
  return (
    <div className="flex items-center gap-[1vw] overflow-hidden border-t border-white/10 bg-white/[0.06] px-[3vw]" style={{ height: '7vh' }}>
      <span className="shrink-0 rounded-full bg-[#20C4FA] px-[1vw] py-[0.4vh] font-extrabold uppercase tracking-[0.08em] text-[#022B57]" style={{ fontSize: '1.9vh' }}>
        ✅ Check-in{v.count > 0 ? ` ${v.count}${v.capacity ? `/${v.capacity}` : ''}` : ''}
      </span>
      {v.title && <span className="shrink-0 font-bold text-white/80" style={{ fontSize: '1.9vh' }}>{v.title}</span>}
      <div className="flex min-w-0 flex-1 flex-wrap gap-[0.6vw] overflow-hidden" style={{ maxHeight: '5vh' }}>
        {!v.configured
          ? <span className="font-semibold text-white/60" style={{ fontSize: '1.9vh' }}>Check-in da Tecnofit ainda não ligado a esta aula</span>
          : v.labels.length === 0
            ? <span className="font-semibold text-white/60" style={{ fontSize: '1.9vh' }}>Faça seu check-in no app da Tecnofit 💙</span>
            : v.labels.slice(0, MAX_NAMES).map((l, i) => <span key={i} className="rounded-full bg-white/12 px-[0.8vw] py-[0.2vh] font-bold" style={{ fontSize: '2vh' }}>{l}</span>)}
        {extra > 0 && <span className="font-bold text-white/70" style={{ fontSize: '2vh' }}>+{extra}</span>}
      </div>
      <span className="shrink-0 font-semibold text-white/50" style={{ fontSize: '1.5vh' }}>Não quer aparecer? Fale com a recepção.</span>
    </div>
  );
}
