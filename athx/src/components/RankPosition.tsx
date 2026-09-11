import type { ReactNode } from 'react';

/**
 * RankPosition — tratamento do Top 3 (§7).
 *
 * O manual pede elegância, não confete: em vez de emoji em cada linha da
 * tabela, o pódio ganha um filete vertical ciano e o número em destaque.
 * A informação NUNCA depende só da cor — o texto acessível diz a posição
 * por extenso.
 */
export function RankPosition({
  position,
  size = 'md',
}: {
  position: number;
  size?: 'sm' | 'md' | 'lg';
}) {
  const top3 = position <= 3;

  const scale =
    size === 'lg'
      ? 'text-3xl sm:text-4xl'
      : size === 'sm'
        ? 'text-base'
        : 'text-xl sm:text-2xl';

  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden="true"
        className={`block w-[3px] self-stretch rounded-full ${
          position === 1
            ? 'bg-nacao-cyan'
            : position === 2
              ? 'bg-nacao-sky'
              : position === 3
                ? 'bg-nacao-blue'
                : 'bg-white/12'
        }`}
      />
      <span
        className={`tnum font-display font-extrabold ${scale} ${
          top3 ? 'text-nacao-cyan' : 'text-white/55'
        }`}
      >
        {position}
        <span className="align-super text-[0.5em] font-bold">º</span>
      </span>
      <span className="sr-only">{position}º lugar</span>
    </span>
  );
}

/** Selo compacto de posição dentro de uma prova (ex.: "2º" no WOD 2). */
export function RankChip({ rank, children }: { rank: number | null; children?: ReactNode }) {
  if (rank === null) {
    return <span className="text-white/30">—</span>;
  }
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="tnum font-display text-sm font-bold text-white/85">{rank}º</span>
      {children ? <span className="text-[11px] text-white/40">{children}</span> : null}
    </span>
  );
}
