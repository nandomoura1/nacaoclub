'use client';

import { useEffect, useState } from 'react';

/**
 * LiveIndicator — "● AO VIVO" + "Atualizado há X" (§9).
 *
 * O ponto pulsa, mas a informação NÃO depende só da cor nem do movimento:
 * o texto diz o estado por extenso, e há `aria-live` para leitor de tela.
 */
export function LiveIndicator({
  live,
  lastUpdate,
  compact = false,
}: {
  live: boolean;
  lastUpdate: string;
  compact?: boolean;
}) {
  const [texto, setTexto] = useState('agora');

  useEffect(() => {
    const atualizar = () => {
      const diff = Math.max(0, Math.floor((Date.now() - new Date(lastUpdate).getTime()) / 1000));
      if (diff < 10) setTexto('agora');
      else if (diff < 60) setTexto(`há ${diff} segundos`);
      else if (diff < 3600) {
        const min = Math.floor(diff / 60);
        setTexto(`há ${min} ${min === 1 ? 'minuto' : 'minutos'}`);
      } else {
        setTexto(
          new Date(lastUpdate).toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
          }),
        );
      }
    };
    atualizar();
    const id = setInterval(atualizar, 5000);
    return () => clearInterval(id);
  }, [lastUpdate]);

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span
          className={`h-2 w-2 rounded-full ${live ? 'animate-live-dot bg-nacao-cyan' : 'bg-white/35'}`}
          aria-hidden="true"
        />
        <span className="font-display text-[10px] font-bold tracking-wider uppercase">
          {live ? 'Ao vivo' : 'Pausado'}
        </span>
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span
        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 ${
          live
            ? 'border-nacao-cyan/45 bg-nacao-cyan/12 text-nacao-cyan'
            : 'border-white/20 bg-white/5 text-white/60'
        }`}
      >
        <span
          className={`h-2 w-2 rounded-full ${live ? 'animate-live-dot bg-nacao-cyan' : 'bg-white/50'}`}
          aria-hidden="true"
        />
        <span className="font-display text-[11px] font-extrabold tracking-wider uppercase">
          {live ? 'Leaderboard ao vivo' : 'Leaderboard pausado'}
        </span>
      </span>

      <span className="text-xs text-white/50" aria-live="polite">
        Atualizado {texto}
      </span>
    </div>
  );
}
