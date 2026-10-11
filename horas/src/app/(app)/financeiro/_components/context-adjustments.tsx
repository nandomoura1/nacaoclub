import { ADJ_KINDS, type ContextAdjustment, type ContextPlan } from '@/domain/financeiro/context-adjust';
import { DATASETS, DEFAULT_CATEGORIES } from '@/domain/financeiro/taxonomy';
import { cn } from '@/lib/cn';
import { brl, fmtValue } from './fmt';

export type ContextEffect = { key: string; label: string; unit: string; from: number | null; to: number | null };

const val = (v: number | null, unit: string) => fmtValue(v, unit as 'BRL' | 'PCT' | 'QTD');

/** O que muda no lançamento: original → considerado. */
const defaultCat = (k: string | null) => (k ? DEFAULT_CATEGORIES.find((c) => c.key === k)?.label ?? k : 'sem categoria');

export function adjustmentChange(a: ContextAdjustment, catLabel: (k: string | null) => string = defaultCat) {
  if (a.kind === 'EXCLUIR') return `${a.fromCents === null ? '—' : brl(a.fromCents)} → fora do relatório`;
  if (a.kind === 'AJUSTAR_VALOR') return `${a.fromCents === null ? '—' : brl(a.fromCents)} → ${brl(a.toCents)}`;
  if (a.kind === 'RECLASSIFICAR') return `${catLabel(a.fromKey)} → ${catLabel(a.toKey)}`;
  return `+ ${brl(a.toCents)}`;
}

/** Efeito nos indicadores + lista de ajustes (com interruptor quando editável). */
export function ContextAdjustments({ plan, effects, onToggle, disabled, catLabel }: {
  plan: ContextPlan; effects: ContextEffect[]; onToggle?: (id: string, active: boolean) => void; disabled?: boolean; catLabel?: (k: string | null) => string;
}) {
  const items = onToggle ? plan.items : plan.items.filter((a) => a.active);
  const reading = plan.readingOnly.filter((r) => onToggle || !r.startsWith('Ajuste não aplicado'));
  return (
    <div className="space-y-3 text-sm">
      {effects.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[22rem] text-sm">
            <thead><tr className="text-left text-[11px] uppercase tracking-wide text-tinta-suave"><th className="py-1 pr-2 font-semibold">Indicador</th><th className="py-1 pr-2 text-right font-semibold">Dados originais</th><th className="py-1 text-right font-semibold">Considerado</th></tr></thead>
            <tbody>{effects.map((e) => (
              <tr key={e.key} className="border-t border-borda"><td className="py-1 pr-2">{e.label}</td><td className="py-1 pr-2 text-right tabular-nums text-tinta-suave line-through decoration-tinta-fraca/60">{val(e.from, e.unit)}</td><td className="py-1 text-right font-semibold tabular-nums text-navy">{val(e.to, e.unit)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {items.length > 0 ? (
        <ul className="space-y-1.5">
          {items.map((a) => (
            <li key={a.id} className={cn('rounded-lg border px-2 py-1.5', a.active ? 'border-nacao/25 bg-white' : 'border-borda bg-fundo opacity-70')}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                {onToggle && <input type="checkbox" aria-label="Aplicar este ajuste" checked={a.active} disabled={disabled} onChange={(e) => onToggle(a.id, e.target.checked)} />}
                <span className="rounded-full bg-nacao/10 px-2 text-[10px] font-bold uppercase tracking-wide text-nacao">{ADJ_KINDS.find((k) => k.id === a.kind)?.label}</span>
                <b className="min-w-0 flex-1 truncate">{a.label}{a.unit ? ` · ${a.unit}` : ''}</b>
                <span className="text-xs text-tinta-suave">{DATASETS.find((d) => d.id === a.dataset)?.label}</span>
                <span className="tabular-nums">{adjustmentChange(a, catLabel)}</span>
              </div>
              <p className="mt-0.5 text-xs text-tinta-suave">{a.reason}{a.quote ? <> — <i>“{a.quote}”</i></> : null}</p>
            </li>
          ))}
        </ul>
      ) : <p className="text-xs text-tinta-suave">O contexto não mudou nenhum número{reading.length ? '; orientou só a leitura:' : '.'}</p>}
      {reading.length > 0 && (
        <div>
          {items.length > 0 && <p className="text-[11px] font-semibold uppercase tracking-wide text-tinta-suave">Orientou a leitura (sem mudar números)</p>}
          <ul className="mt-0.5 list-disc space-y-0.5 pl-5 text-xs text-tinta-suave">{reading.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
