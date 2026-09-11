import Link from 'next/link';
import { Activity, Layers, Radio, Users } from 'lucide-react';

/**
 * Resumo do evento (§6). Quatro números, sem enfeite: o público precisa
 * entender o formato em dois segundos e descer para o ranking.
 */
export function EventSummary({
  teamCount,
  live,
}: {
  teamCount: number;
  live: boolean;
}) {
  const items = [
    { value: String(teamCount), label: 'Duplas', Icon: Users, href: '/leaderboard' },
    { value: '3', label: 'WODs', Icon: Activity, href: '/wod/1' },
    { value: '2', label: 'Baterias', Icon: Layers, href: '/schedule' },
    {
      value: live ? 'Ao vivo' : 'Em breve',
      label: 'Resultados',
      Icon: Radio,
      href: '/leaderboard',
      highlight: true,
    },
  ] as const;

  return (
    <ul className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
      {items.map(({ value, label, Icon, href, ...rest }) => {
        const highlight = 'highlight' in rest && rest.highlight === true;
        return (
          <li key={label}>
            <Link
              href={href}
              className={`surface flex h-full items-center gap-3 p-3.5 transition-colors hover:bg-white/[0.08] sm:flex-col sm:items-start sm:justify-between sm:gap-3 sm:p-5 ${
                highlight && live ? 'border-nacao-cyan/30' : ''
              }`}
            >
              <Icon
                size={18}
                aria-hidden="true"
                className={`shrink-0 ${highlight && live ? 'text-nacao-cyan' : 'text-nacao-sky'}`}
              />
              <div className="min-w-0">
                <p
                  className={`font-display text-xl font-black tracking-tight uppercase sm:text-3xl ${
                    highlight && live ? 'text-nacao-cyan' : 'text-white'
                  }`}
                >
                  {value}
                </p>
                <p className="font-display text-[10px] font-bold tracking-kicker text-white/45 uppercase">
                  {label}
                </p>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
