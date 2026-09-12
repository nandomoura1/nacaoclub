import Link from 'next/link';
import type { StandingRow } from '@/types/domain';
import { categoryShort, points, teamNumber } from '@/lib/format';

/**
 * Podium — o Top 3 (§7).
 *
 * É aqui que os emojis de medalha aparecem: uma vez, com espaço e hierarquia.
 * Na tabela eles não entram — lá o destaque é gráfico (RankPosition), como
 * pede o manual ("elementos gráficos elegantes", sem exagero).
 */
const MEDALS = ['🥇', '🥈', '🥉'] as const;
const LABELS = ['1º lugar', '2º lugar', '3º lugar'] as const;

export function Podium({
  rows,
  categoryScoped = false,
}: {
  rows: readonly StandingRow[];
  /** true quando o pódio já está dentro de um bloco de categoria (§29). */
  categoryScoped?: boolean;
}) {
  const top3 = rows.filter((r) => r.scoredWods > 0).slice(0, 3);
  if (top3.length === 0) return null;

  return (
    <ol className="grid gap-2.5 sm:grid-cols-3 sm:gap-3">
      {top3.map((row, i) => {
        const medal = MEDALS[i] ?? '';
        const label = LABELS[i] ?? `${i + 1}º lugar`;

        return (
          <li key={row.team.id}>
            <Link
              href={`/team/${row.team.id}`}
              className={`surface relative block h-full overflow-hidden p-4 transition-colors hover:bg-white/[0.08] sm:p-5 ${
                i === 0 ? 'border-nacao-cyan/35 bg-nacao-cyan/[0.07]' : ''
              }`}
            >
              <span
                aria-hidden="true"
                className={`absolute inset-x-0 top-0 h-[3px] ${
                  i === 0 ? 'bg-nacao-cyan' : i === 1 ? 'bg-nacao-sky' : 'bg-nacao-blue'
                }`}
              />

              <div className="flex items-center justify-between gap-2">
                <span className="font-display text-[10px] font-bold tracking-kicker text-white/50 uppercase">
                  {label}
                </span>
                <span className="text-xl leading-none" aria-hidden="true">
                  {medal}
                </span>
              </div>

              <p className="mt-3 flex items-center gap-2">
                <span className="tnum font-display text-[11px] font-bold text-nacao-sky">
                  {teamNumber(row.team.teamNumber)}
                </span>
                <span className="truncate font-display text-lg font-extrabold sm:text-xl">
                  {row.team.teamName}
                </span>
              </p>

              <p className="truncate text-xs text-white/50">
                {row.team.athlete1 || 'Atleta 1'} · {row.team.athlete2 || 'Atleta 2'}
              </p>

              <div className="mt-4 flex items-end justify-between">
                {/* Dentro do bloco da categoria, o rótulo já foi dito no
                    título — ali vale mais mostrar a bateria da dupla. */}
                <span className="font-display text-[10px] font-bold tracking-wider text-white/40 uppercase">
                  {categoryScoped
                    ? `Bateria ${row.team.battery}`
                    : categoryShort(row.team.category)}
                </span>
                <span className="text-right">
                  <span className="tnum block font-display text-3xl leading-none font-black text-white">
                    {points(row.totalPoints)}
                  </span>
                  <span className="font-display text-[9px] font-bold tracking-kicker text-white/40 uppercase">
                    Pontos
                  </span>
                </span>
              </div>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
