import type { ValidityState } from '@/domain/company';
import { cn } from '@/lib/cn';

const plural = (n: number) => `${n} ${n === 1 ? 'dia' : 'dias'}`;

/** Selo de validade de um documento da empresa. */
export function ValidityBadge({ state, daysLeft, className }: { state: ValidityState; daysLeft: number | null; className?: string }) {
  if (state === 'sem_validade') return null;
  const text = state === 'vencido' ? `vencido há ${plural(-(daysLeft ?? 0))}` : daysLeft === 0 ? 'vence hoje' : `vence em ${plural(daysLeft ?? 0)}`;
  const tone = state === 'vencido' ? 'bg-critico text-white' : state === 'vence_em_breve' ? 'bg-atencao/15 text-atencao ring-1 ring-atencao/30' : 'bg-sucesso/10 text-sucesso ring-1 ring-sucesso/25';
  return <span className={cn('inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold', tone, className)}>{state === 'vigente' ? `válido · ${text}` : text}</span>;
}
