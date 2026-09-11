'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Snapshot } from '@/services/snapshot';
import { getBrowserSupabase } from '@/lib/supabase/client';

/** Tabelas cuja mudança precisa refletir na tela do público. */
const WATCHED_TABLES = [
  'wod1_results',
  'wod2_results',
  'wod3_results',
  'wod_results',
  'teams',
  'event_settings',
] as const;

/**
 * useLiveSnapshot — mantém a tela sincronizada com o evento (§27).
 *
 * O admin lança um resultado -> o Postgres emite a mudança -> o Realtime
 * avisa este hook -> ele rebusca o snapshot inteiro (é pequeno) -> a tela
 * se redesenha. Ninguém aperta F5.
 *
 * As rajadas são agrupadas: ao salvar 10 duplas de uma bateria chegam 10
 * eventos em sequência, mas acontece UMA busca só.
 */
export function useLiveSnapshot(initial: Snapshot) {
  const [snapshot, setSnapshot] = useState<Snapshot>(initial);
  const [connected, setConnected] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number>(() => Date.now());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);

  const refetch = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch('/api/snapshot', { cache: 'no-store' });
      if (!res.ok) return;
      const next = (await res.json()) as Snapshot;
      setSnapshot(next);
      setUpdatedAt(Date.now());
    } catch {
      // Rede oscilou (ginásio lotado). A próxima mudança tenta de novo.
    } finally {
      inFlight.current = false;
    }
  }, []);

  const scheduleRefetch = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(refetch, 350);
  }, [refetch]);

  useEffect(() => {
    // Modo demo não tem banco — nada a assinar.
    if (initial.demo) return;

    let channel: RealtimeChannel | null = null;

    try {
      const supabase = getBrowserSupabase();
      const live = supabase.channel('athx-leaderboard');
      channel = live;

      for (const table of WATCHED_TABLES) {
        live.on('postgres_changes', { event: '*', schema: 'public', table }, scheduleRefetch);
      }

      live.subscribe((status: string) => {
        setConnected(status === 'SUBSCRIBED');
        // Ao (re)conectar, sincroniza o que tiver perdido enquanto offline.
        if (status === 'SUBSCRIBED') void refetch();
      });
    } catch {
      setConnected(false);
    }

    // Rede de segurança: se o websocket cair sem avisar, uma sincronização
    // a cada 60 s garante que o telão nunca fique congelado.
    const heartbeat = setInterval(refetch, 60_000);

    // Voltou para a aba depois de um tempo? Sincroniza na hora.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refetch();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', onVisible);
      if (timer.current) clearTimeout(timer.current);
      if (channel) {
        try {
          getBrowserSupabase().removeChannel(channel);
        } catch {
          /* nada a fazer no unmount */
        }
      }
    };
  }, [initial.demo, refetch, scheduleRefetch]);

  return { snapshot, connected, updatedAt, refetch };
}
