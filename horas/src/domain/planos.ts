/**
 * Planos Nação (puro, sem banco): tabela de planos e preços por ano.
 * Cada plano tem opções (mensal, semestral, anual…) com o valor POR MÊS no cartão/cheque e na
 * recorrência; o total é mensal × meses (opção sem meses = valor único, ex.: diária da colônia).
 * O rascunho do ano seguinte é comparado com a tabela-base (ex.: 2027 × 2026) e reajustado
 * plano a plano — o reajuste não é linear.
 */

export const PLAN_STATUS = [
  { id: 'MANTEM', label: 'Mantém', hint: 'Continua igual (só o preço pode mudar).' },
  { id: 'NOVO', label: 'Novo', hint: 'Plano novo nesta tabela.' },
  { id: 'SIMPLIFICADO', label: 'Simplificado', hint: 'Continua, mas mudou (modalidades, check-in, opções).' },
  { id: 'A_DECIDIR', label: 'A decidir', hint: 'Ainda falta decidir se fica.' },
  { id: 'EXCLUIR', label: 'Sai', hint: 'Não entra na nova tabela (fica registrado, riscado).' },
] as const;
export type PlanStatus = (typeof PLAN_STATUS)[number]['id'];
export const isPlanStatus = (v: string): v is PlanStatus => PLAN_STATUS.some((s) => s.id === v);

export const TABLE_STATUS = { RASCUNHO: 'Rascunho', VIGENTE: 'Vigente', ARQUIVADA: 'Arquivada' } as const;
export type TableStatus = keyof typeof TABLE_STATUS;

/** Opções mais comuns (sugestão ao criar). */
export const OPTION_PRESETS = [
  { label: 'Mensal', months: 1 },
  { label: 'Semestral', months: 6 },
  { label: 'Anual', months: 12 },
  { label: '18 meses', months: 18 },
] as const;

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Total do contrato: mensal × meses; sem meses = o próprio valor. */
export function totalOf(monthly: number | null, months: number | null): number | null {
  if (monthly === null) return null;
  return round2(months && months > 0 ? monthly * months : monthly);
}

/** Variação percentual (1 casa) do novo em relação ao antigo; null se não dá para comparar. */
export function changePct(next: number | null, prev: number | null): number | null {
  if (next === null || prev === null || prev <= 0) return null;
  return Math.round(((next / prev) - 1) * 1000) / 10;
}

/**
 * Arredondamento comercial:
 * - CENTAVOS: só 2 casas;
 * - INTEIRO: real mais próximo (438,94 → 439);
 * - NOVENTA: termina em ,90 mais próximo (438,94 → 438,90; 441,20 → 440,90);
 * - NOVE: termina em 9 reais (438,94 → 439; 444 → 449; arredonda para cima até o 9).
 */
export const ROUNDINGS = [
  { id: 'CENTAVOS', label: 'Centavos (sem arredondar)' },
  { id: 'INTEIRO', label: 'Real inteiro (439)' },
  { id: 'NOVENTA', label: 'Final ,90 (438,90)' },
  { id: 'NOVE', label: 'Final 9 (439, 449)' },
] as const;
export type Rounding = (typeof ROUNDINGS)[number]['id'];

export function roundPrice(v: number, mode: Rounding): number {
  if (mode === 'INTEIRO') return Math.round(v);
  if (mode === 'NOVENTA') return round2(Math.max(Math.round(v + 0.1) - 0.1, 0.9));
  if (mode === 'NOVE') { const up = Math.ceil(round2(v)); return up + ((9 - (up % 10)) + 10) % 10; }
  return round2(v);
}

/** Aplica um reajuste percentual (pode ser negativo) e arredonda. */
export function adjustPrice(v: number, pct: number, mode: Rounding): number {
  return roundPrice(v * (1 + pct / 100), mode);
}

/** Como as opções de um plano vão para a planilha/texto. */
export interface OptionRow { label: string; months: number | null; card: number | null; recurring: number | null }
export interface PlanRow {
  group: string; name: string; status: PlanStatus; modalities: string | null; commonClasses: string | null;
  specificClasses: string | null; checkin: string | null; note: string | null; options: OptionRow[];
}

const brNum = (v: number | null) => (v === null ? '' : v.toFixed(2).replace('.', ','));

/** Tabela em TSV (colar no Google Planilhas/Excel), no mesmo formato da planilha de planos. */
export function tableTsv(plans: PlanRow[], opts: { withStatus?: boolean } = {}): string {
  const head = ['GRUPO', 'PLANOS', 'MODALIDADES', 'AULAS EM COMUNS', 'AULAS ESPECÍFICAS', 'CHECK-IN SEMANAL', 'TIPO', 'MESES',
    'CARTÃO VALOR MENSAL', 'CARTÃO VALOR TOTAL', 'RECORRÊNCIA VALOR MENSAL', 'RECORRÊNCIA VALOR TOTAL', ...(opts.withStatus ? ['SITUAÇÃO', 'OBSERVAÇÃO'] : [])];
  const clean = (s: string | null) => (s ?? '').replace(/[\t\r\n]+/g, ' ').trim();
  const lines = [head.join('\t')];
  for (const p of plans) {
    p.options.forEach((o, i) => {
      const first = i === 0;
      lines.push([
        first ? p.group : '', first ? p.name : '', first ? clean(p.modalities) : '', first ? clean(p.commonClasses) : '', first ? clean(p.specificClasses) : '',
        first ? clean(p.checkin) : '', o.label, o.months ? String(o.months) : '-',
        brNum(o.card), brNum(totalOf(o.card, o.months)), brNum(o.recurring), brNum(totalOf(o.recurring, o.months)),
        ...(opts.withStatus ? [first ? PLAN_STATUS.find((s) => s.id === p.status)!.label : '', first ? clean(p.note) : ''] : []),
      ].map((c) => clean(c)).join('\t'));
    });
    if (!p.options.length) lines.push([p.group, p.name, clean(p.modalities), clean(p.commonClasses), clean(p.specificClasses), clean(p.checkin), '', '', '', '', '', ''].join('\t'));
  }
  return lines.join('\n');
}

/** Valores em reais digitados ("438,90", "R$ 1.234,5", "438.9") → número; vazio = null. */
export function parseMoney(v: string): number | null | 'invalid' {
  const t = v.replace(/R\$|\s/g, '');
  if (!t) return null;
  const norm = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  const n = Number(norm);
  return Number.isFinite(n) && n >= 0 && n < 1_000_000 ? round2(n) : 'invalid';
}
