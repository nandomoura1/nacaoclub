import type { Ind } from '@/domain/financeiro/metrics';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';

/** Formatação dos indicadores do motor: R$, %, quantidade; "Dado não informado" quando falta. */
export function fmtValue(value: number | null, unit: Ind['unit']): string {
  if (value === null) return 'Dado não informado';
  if (unit === 'BRL') return (value / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  if (unit === 'PCT') return `${(value * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}
export const brl = (cents: number | null) => fmtValue(cents, 'BRL');
export const pct = (ratio: number | null) => fmtValue(ratio, 'PCT');
export const compactBRL = (cents: number) => {
  const r = cents / 100;
  return Math.abs(r) >= 1000 ? `R$ ${(r / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : brl(cents);
};

export function StatusTag({ status }: { status: Ind['status'] }) {
  if (status === 'estimativa') return <Badge tone="amber">estimativa</Badge>;
  if (status === 'importado') return <Badge tone="cyan">relatório importado</Badge>;
  return null;
}

/** Valor do indicador com fórmula no hover e selo de estado. */
export function IndValue({ ind, className }: { ind: Ind; className?: string }) {
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1', className)} title={ind.formula}>
      <span className={cn('tabular-nums', ind.value === null && 'text-sm font-normal italic text-tinta-fraca')}>{fmtValue(ind.value, ind.unit)}</span>
      <StatusTag status={ind.status} />
    </span>
  );
}

/** Card de indicador (painel, competência). */
export function Kpi({ label, ind, hint }: { label: string; ind: Ind; hint?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-borda bg-white p-3">
      <p className="text-xs font-semibold text-tinta-suave">{label}</p>
      <IndValue ind={ind} className="mt-1 text-lg font-extrabold text-navy" />
      {hint && <p className="mt-0.5 text-[11px] text-tinta-fraca">{hint}</p>}
    </div>
  );
}

export const FIN_STATUS: Record<string, { label: string; tone: 'neutral' | 'amber' | 'green' | 'blue' }> = {
  DRAFT: { label: 'Rascunho', tone: 'neutral' },
  REVIEW: { label: 'Em conferência', tone: 'amber' },
  APPROVED: { label: 'Aprovado', tone: 'green' },
};
export const DOC_STATUS: Record<string, { label: string; tone: 'neutral' | 'amber' | 'green' | 'blue' | 'red' }> = {
  PROCESSING: { label: 'Processando', tone: 'blue' },
  EXTRACTED: { label: 'Extraído', tone: 'blue' },
  PENDING_REVIEW: { label: 'Para conferir', tone: 'amber' },
  DIVERGENT: { label: 'Com avisos', tone: 'amber' },
  APPROVED: { label: 'Aprovado', tone: 'green' },
  ERROR: { label: 'Erro na leitura', tone: 'red' },
};
