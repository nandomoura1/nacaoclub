import { CalendarClock, CalendarX2, FileWarning, Hourglass } from 'lucide-react';
import { formatDateBR } from '@/domain/dates';
import type { InternStatus } from '@/domain/staff-docs';
import { cn } from '@/lib/cn';

const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;

/** Texto do contador: "vence em 12 dias", "vencido há 3 dias"… */
export function internText(s: InternStatus): string {
  if (s.state === 'sem_contrato') return 'sem contrato de estágio';
  if (s.state === 'vencido') return s.daysLeft === -1 ? 'contrato venceu ontem' : `contrato vencido há ${plural(-(s.daysLeft ?? 0), 'dia', 'dias')}`;
  if (s.state === 'nao_iniciado') return `contrato começa em ${formatDateBR(s.start!)}`;
  if (s.daysLeft === 0) return 'contrato vence hoje';
  return `vence em ${plural(s.daysLeft ?? 0, 'dia', 'dias')}`;
}

const TONE = {
  vencido: 'bg-critico text-white',
  sem_contrato: 'bg-critico/10 text-critico ring-1 ring-critico/30',
  vence_em_breve: 'bg-atencao/15 text-atencao ring-1 ring-atencao/30',
  nao_iniciado: 'bg-fundo text-tinta-suave ring-1 ring-borda',
  vigente: 'bg-sucesso/10 text-sucesso ring-1 ring-sucesso/25',
} as const;
const ICON = { vencido: CalendarX2, sem_contrato: FileWarning, vence_em_breve: Hourglass, nao_iniciado: CalendarClock, vigente: CalendarClock } as const;

/** Selo compacto (tabelas, alertas). */
export function InternBadge({ s, className }: { s: InternStatus; className?: string }) {
  const Icon = ICON[s.state];
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold', TONE[s.state], className)}>
      <Icon className="size-3" /> {internText(s)}
    </span>
  );
}

/** Contador grande (ficha do estagiário). */
export function InternCounter({ s }: { s: InternStatus }) {
  const big = s.daysLeft === null ? '—' : String(Math.abs(s.daysLeft));
  const caption = s.state === 'vencido' ? (s.daysLeft === -1 ? 'dia vencido' : 'dias vencido') : s.state === 'sem_contrato' ? 'sem contrato' : s.daysLeft === 1 ? 'dia restante' : 'dias restantes';
  const ring = s.state === 'vencido' || s.state === 'sem_contrato' ? 'border-critico/40 bg-critico/5' : s.state === 'vence_em_breve' ? 'border-atencao/40 bg-atencao/5' : 'border-sucesso/30 bg-sucesso/5';
  const num = s.state === 'vencido' || s.state === 'sem_contrato' ? 'text-critico' : s.state === 'vence_em_breve' ? 'text-atencao' : 'text-sucesso';
  return (
    <div className={cn('flex flex-wrap items-center gap-4 rounded-2xl border p-4', ring)}>
      <div className="text-center">
        <p className={cn('font-titulo text-4xl font-extrabold leading-none tabular-nums', num)}>{big}</p>
        <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-tinta-suave">{caption}</p>
      </div>
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-bold text-navy">Contrato de estágio</p>
        {s.end ? <p className="text-tinta-suave">{s.start ? `${formatDateBR(s.start)} a ` : 'até '}{formatDateBR(s.end)}</p> : <p className="text-tinta-suave">Envie o termo de compromisso com as datas de início e fim.</p>}
        <InternBadge s={s} className="mt-1.5" />
        {s.state === 'vencido' && <p className="mt-1.5 text-xs font-semibold text-critico">Não escale este estagiário até subir o aditivo ou o novo termo.</p>}
        {s.over2Years && <p className="mt-1.5 text-xs font-semibold text-atencao">Os contratos somam mais de 2 anos — a Lei do Estágio limita a 2 anos na mesma empresa (exceto estagiário com deficiência).</p>}
      </div>
    </div>
  );
}
