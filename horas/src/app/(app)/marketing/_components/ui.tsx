import { Badge } from '@/components/ui/badge';
import { CAMPAIGN_STATUSES, labelOf, PRIORITIES } from '@/domain/marketing/constants';
import { cn } from '@/lib/cn';

/** Peças visuais do Marketing (servidor e cliente). */
export function CampaignStatusBadge({ status }: { status: string }) {
  const s = CAMPAIGN_STATUSES.find((x) => x.id === status);
  return <Badge tone={(s?.tone ?? 'neutral') as 'neutral'}>{s?.label ?? status}</Badge>;
}

/** Anel 0–100 do Marketing Readiness. */
export function ReadinessRing({ score, size = 44 }: { score: number; size?: number }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const color = score >= 80 ? '#16a34a' : score >= 60 ? '#d97706' : '#dc2626';
  return (
    <span className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }} title={`Readiness ${score}/100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={5} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={5} strokeLinecap="round" strokeDasharray={`${(score / 100) * c} ${c}`} />
      </svg>
      <span className="absolute font-titulo text-[11px] font-extrabold tabular-nums text-navy">{score}</span>
    </span>
  );
}

export function AreaChip({ area, className }: { area: { name: string; color: string } | null; className?: string }) {
  if (!area) return null;
  return (
    <span className={cn('inline-flex max-w-full items-center gap-1 truncate rounded-full bg-fundo px-2 py-0.5 text-[10px] font-semibold text-tinta-suave', className)}>
      <span className="size-2 shrink-0 rounded-full" style={{ background: area.color }} />
      <span className="truncate">{area.name.split(' ')[0]}</span>
    </span>
  );
}

export function PriorityTag({ p }: { p: string }) {
  if (p === 'MEDIA' || p === 'BAIXA') return null;
  return <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-bold', p === 'URGENTE' ? 'bg-critico text-white' : 'bg-atencao/15 text-atencao')}>{labelOf(PRIORITIES, p)}</span>;
}

export const fmtDate = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—');
export const daysLabel = (n: number) => (n === 0 ? 'hoje' : n === 1 ? 'amanhã' : n < 0 ? `há ${-n} dia(s)` : `em ${n} dias`);
