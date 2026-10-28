import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { formatDateBR } from '@/domain/dates';
import type { FairnessRow } from '@/domain/escalas/fairness';
import { cn } from '@/lib/cn';
import type { MonthView } from '@/server/services/ws-service';

/** A partir de quanto a diferença para a média do time vira alerta (dias). */
const LIMIT = 1.5;

function Diff({ v }: { v: number }) {
  if (Math.abs(v) < LIMIT) return <span className="text-tinta-fraca">{v > 0 ? `+${v}` : v}</span>;
  return <Badge tone={v > 0 ? 'red' : 'blue'}>{v > 0 ? `+${v}` : v}</Badge>;
}

/**
 * Contador de sábados, domingos e feriados trabalhados por pessoa, para conferir
 * se a distribuição está equilibrada ao longo das escalas.
 */
export function FairnessCard({ view }: { view: MonthView }) {
  const name = new Map(view.members.map((m) => [m.id, m]));
  const rows = view.fairness.rows
    .filter((r) => name.get(r.memberId)?.active || r.month.total > 0)
    .filter((r) => r.months > 0 || r.sum.total > 0);
  if (!rows.length) return null;
  const sorted = [...rows].sort((a, b) => b.diff.total - a.diff.total || b.sum.total - a.sum.total);
  const over = sorted.filter((r) => r.diff.total >= LIMIT || r.diff.hol >= LIMIT);
  const n = (r: FairnessRow) => name.get(r.memberId)?.name ?? '—';
  const td = 'border-t border-borda px-2 py-1.5 text-center tabular-nums';

  return (
    <Card className="mt-4 p-4">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-bold text-navy">Sábados, domingos e feriados trabalhados</h2>
        <span className="text-xs text-tinta-fraca">Acumulado desde {formatDateBR(view.fairness.since)} até {view.month.label}</span>
      </div>
      <p className="mb-3 text-xs text-tinta-suave">
        Para conferir se a distribuição está igual para todos. A coluna <b>vs. média</b> compara cada pessoa com a média do time no mesmo número de meses
        (quem entrou depois não aparece &quot;devendo&quot;). <Badge tone="red">+2</Badge> trabalhou mais que a média · <Badge tone="blue">−2</Badge> trabalhou menos.
        Feriado no fim de semana conta só como feriado.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-tinta-fraca">
              <th className="px-2 pb-1 text-left" rowSpan={2}>Colaborador</th>
              <th className="px-2 pb-1" colSpan={3}>Este mês</th>
              <th className="border-l border-borda px-2 pb-1" colSpan={4}>Acumulado</th>
              <th className="px-2 pb-1" rowSpan={2}>Meses</th>
              <th className="border-l border-borda px-2 pb-1" colSpan={2}>vs. média</th>
            </tr>
            <tr className="text-[11px] text-tinta-suave">
              <th className="px-2 pb-1">Sáb</th><th className="px-2 pb-1">Dom</th><th className="px-2 pb-1">Fer</th>
              <th className="border-l border-borda px-2 pb-1">Sáb</th><th className="px-2 pb-1">Dom</th><th className="px-2 pb-1">Fer</th><th className="px-2 pb-1">Total</th>
              <th className="border-l border-borda px-2 pb-1">Feriados</th><th className="px-2 pb-1">Total</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.memberId} className={cn(!name.get(r.memberId)?.active && 'opacity-55')}>
                <td className="border-t border-borda px-2 py-1.5 font-semibold text-navy">{n(r)}</td>
                <td className={td}>{r.month.sat}</td><td className={td}>{r.month.sun}</td><td className={td}>{r.month.hol}</td>
                <td className={cn(td, 'border-l')}>{r.sum.sat}</td><td className={td}>{r.sum.sun}</td><td className={td}>{r.sum.hol}</td>
                <td className={cn(td, 'font-bold text-navy')}>{r.sum.total}</td>
                <td className={td}>{r.months}</td>
                <td className={cn(td, 'border-l')}><Diff v={r.diff.hol} /></td>
                <td className={td}><Diff v={r.diff.total} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {over.length > 0 && (
        <p className="mt-3 text-xs text-tinta-suave">
          Acima da média: <b className="text-tinta">{over.map(n).join(', ')}</b>. No próximo mês, priorize folga de fim de semana/feriado para essas pessoas
          {view.schedule?.status === 'RASCUNHO' ? ' (o rodízio de feriados já usa esse histórico ao gerar)' : ''}.
        </p>
      )}
    </Card>
  );
}
