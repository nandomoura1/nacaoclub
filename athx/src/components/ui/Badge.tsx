import type { ReactNode } from 'react';

type Tone = 'cyan' | 'blue' | 'sky' | 'neutral' | 'warn' | 'danger' | 'ok';

const TONES: Record<Tone, string> = {
  cyan: 'bg-nacao-cyan/15 text-nacao-cyan border-nacao-cyan/35',
  blue: 'bg-nacao-blue/20 text-nacao-sky border-nacao-blue/40',
  sky: 'bg-nacao-sky/15 text-nacao-sky border-nacao-sky/35',
  neutral: 'bg-white/8 text-white/70 border-white/15',
  warn: 'bg-amber-400/15 text-amber-300 border-amber-400/35',
  danger: 'bg-red-500/15 text-red-300 border-red-500/35',
  ok: 'bg-emerald-400/15 text-emerald-300 border-emerald-400/35',
};

export function Badge({
  children,
  tone = 'neutral',
  className = '',
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
