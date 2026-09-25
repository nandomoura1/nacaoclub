import { Ban, CalendarClock, MapPin, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatClock } from '@/domain/dates';
import { cn } from '@/lib/cn';
import type { OccurrenceItem } from '@/server/services/period-service';

const ROLE_MARK: Record<string, string> = { TITULAR: '', AUXILIAR: ' (aux.)', ESTAGIARIO: ' (est.)' };

/** Card de uma aula no calendário. Estado por cor + ícone + texto, nunca só cor. */
export function OccurrenceCard({ o, compact = false }: { o: OccurrenceItem; compact?: boolean }) {
  const cancelled = o.status === 'CANCELADA';
  const waiting = o.status === 'AGUARDANDO_DECISAO_FERIADO';
  const noTeacher = !cancelled && o.people.length === 0;
  return (
    <div
      className={cn('rounded-lg border bg-white p-2.5 shadow-[0_1px_2px_rgba(2,43,87,0.05)]', cancelled ? 'border-borda opacity-60' : 'border-borda', waiting && 'border-purple-300 bg-purple-50/40')}
      style={{ borderLeft: `4px solid ${cancelled ? '#94a3b8' : o.modality.color}` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="tabular text-[11px] font-bold text-tinta-fraca">{formatClock(o.startMin)}–{formatClock(o.startMin + o.durationMin)}</p>
          <p className={cn('truncate text-sm font-extrabold uppercase tracking-tight', cancelled && 'line-through')} style={{ color: cancelled ? undefined : o.modality.color }}>
            {o.modality.name}
          </p>
          {o.label && <p className="truncate text-xs font-semibold text-tinta-suave">{o.label}</p>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {cancelled && <Badge tone="neutral"><Ban className="size-3" /> cancelada</Badge>}
          {waiting && <Badge tone="amber"><CalendarClock className="size-3" /> decidir</Badge>}
          {noTeacher && <Badge tone="red"><TriangleAlert className="size-3" /> sem professor</Badge>}
          {o.origin === 'EXTRA' && <Badge tone="cyan">avulsa</Badge>}
        </div>
      </div>
      {!compact && (
        <>
          <p className="mt-1 truncate text-xs text-tinta">
            {o.people.map((p) => `${p.executing ?? p.planned ?? '?'}${ROLE_MARK[p.role]}`).join(', ') || '—'}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[10px] text-tinta-fraca">
            {o.space && <span className="inline-flex items-center gap-0.5"><MapPin className="size-3" />{o.space}</span>}
            {o.activityType.kind !== 'AULA' && <span>{o.activityType.name}{!o.activityType.countsHours && ' · não conta hora'}</span>}
            {cancelled && o.cancellationReason && <span>motivo: {o.cancellationReason}</span>}
            {o.holiday && <span>feriado: {o.holiday}</span>}
          </div>
        </>
      )}
    </div>
  );
}
