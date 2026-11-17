import { formatDateBR, type IsoDate } from '@/domain/dates';

/**
 * Premiação (gratificação mensal) — puro. Competência = dia 15 de um mês até o dia 14 do seguinte, paga no dia 15
 * (decisão 17/11): a competência é identificada pelo mês do PAGAMENTO ("2026-12" = 15/11/2026 a 14/12/2026, paga em 15/12/2026).
 * Três critérios, cada um com valor próprio por pessoa (padrão R$ 100):
 * - Produtividade: feedback das tarefas (app Task) e checklists diários — avaliação manual.
 * - Pontualidade: atraso de mais de 15 min no mês faz perder — avaliação manual (sem ponto integrado).
 * - Assiduidade: qualquer falta ou atestado no mês faz perder.
 * Falta sem justificativa faz perder as três. Ajuste em R$ (+/−) cobre os casos fora da regra.
 */

export const CRITERIA = [
  { key: 'productivity', label: 'Produtividade', hint: 'Tarefas (app Task) e checklists diários' },
  { key: 'punctuality', label: 'Pontualidade', hint: 'Atraso de mais de 15 min perde' },
  { key: 'attendance', label: 'Assiduidade', hint: 'Falta ou atestado no mês perde' },
] as const;
export type CriterionKey = (typeof CRITERIA)[number]['key'];

export interface AwardValues { productivity: number; punctuality: number; attendance: number }
export interface AwardState { productivity: boolean; punctuality: boolean; attendance: boolean; extraCents: number }
export interface AwardLeave { id?: string; type: string; start: IsoDate; end: IsoDate }
/** Correção à mão por critério (null = automático pela regra). */
export type AwardOverrides = Record<CriterionKey, boolean | null>;
export const NO_OVERRIDES: AwardOverrides = { productivity: null, punctuality: null, attendance: null };

export const DEFAULT_VALUES: AwardValues = { productivity: 10000, punctuality: 10000, attendance: 10000 };
export const maxOf = (v: AwardValues) => v.productivity + v.punctuality + v.attendance;

/** Dias de falta/atestado dentro do período (cada dia uma vez). */
export function daysIn(leaves: AwardLeave[], type: string, first: IsoDate, last: IsoDate): IsoDate[] {
  const out = new Set<IsoDate>();
  for (const l of leaves) {
    if (l.type !== type) continue;
    for (let d = l.start < first ? first : l.start; d <= (l.end > last ? last : l.end); d = nextDay(d)) out.add(d);
  }
  return [...out].sort();
}
const nextDay = (d: IsoDate): IsoDate => { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + 1); return t.toISOString().slice(0, 10) as IsoDate; };

/**
 * Regra da competência (automático): falta perde os três; atestado perde Assiduidade; atraso > 15 min perde
 * Pontualidade; admitido depois do início zera. Produtividade fica ganha até ser marcada à mão.
 */
export function suggest(leaves: AwardLeave[], first: IsoDate, last: IsoDate, admission: IsoDate | null, lateCount = 0): { state: AwardState; reasons: string[] } {
  const faltas = daysIn(leaves, 'FALTA', first, last);
  const atestados = daysIn(leaves, 'ATESTADO', first, last);
  const dates = (ds: IsoDate[]) => ds.map((d) => formatDateBR(d).slice(0, 5)).join(', ');
  const reasons = [
    ...(faltas.length ? [`${faltas.length === 1 ? 'Falta' : `${faltas.length} faltas`} (${dates(faltas)})`] : []),
    ...(atestados.length ? [`${atestados.length === 1 ? 'Atestado' : `${atestados.length} dias de atestado`} (${dates(atestados)})`] : []),
    ...(lateCount > 0 ? [`${lateCount} ${lateCount === 1 ? 'atraso' : 'atrasos'} > 15 min`] : []),
  ];
  const none = { productivity: false, punctuality: false, attendance: false, extraCents: 0 };
  if (admission && admission > first) return { state: none, reasons: [`Admitido em ${formatDateBR(admission)}: não completou a competência`, ...reasons] };
  if (faltas.length) return { state: none, reasons };
  return { state: { productivity: true, punctuality: lateCount === 0, attendance: atestados.length === 0, extraCents: 0 }, reasons };
}

/** Estado final: correção à mão onde houver, senão a regra. */
export function applyOverrides(auto: AwardState, o: AwardOverrides, extraCents: number): AwardState {
  return {
    productivity: o.productivity ?? auto.productivity,
    punctuality: o.punctuality ?? auto.punctuality,
    attendance: o.attendance ?? auto.attendance,
    extraCents,
  };
}

/** Clique no critério: inverte; se o resultado for igual à regra, volta a "automático". */
export function toggleOverride(auto: AwardState, o: AwardOverrides, k: CriterionKey): AwardOverrides {
  const current = o[k] ?? auto[k];
  const next = !current;
  return { ...o, [k]: next === auto[k] ? null : next };
}

/** Total do mês: critérios alcançados × valor + ajuste (nunca negativo). */
export function awardTotal(v: AwardValues, s: AwardState): number {
  const base = (s.productivity ? v.productivity : 0) + (s.punctuality ? v.punctuality : 0) + (s.attendance ? v.attendance : 0);
  return Math.max(0, base + s.extraCents);
}

/** Observação automática do que se perdeu ("Atraso", "Falta"…), como na planilha de controle. */
export function lostLabel(s: AwardState): string {
  const lost = CRITERIA.filter((c) => !s[c.key]).map((c) => c.label);
  return lost.length === 3 ? 'Perdeu os 3 critérios' : lost.length ? `Perdeu: ${lost.join(', ')}` : '';
}

/** Dia do pagamento da competência ("AAAA-MM" = mês do pagamento): dia 15 desse mês. */
export const payDay = (month: string): IsoDate => `${month}-15`;

/** Período avaliado: dia 15 do mês anterior ao pagamento até o dia 14 do mês do pagamento. */
export function awardPeriod(month: string): { first: IsoDate; last: IsoDate } {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  return { first: `${prev}-15`, last: `${month}-14` };
}

/** Competência em aberto numa data: a partir do dia 15, a que termina no dia 14 do mês seguinte. */
export function currentAwardMonth(today: IsoDate): string {
  const [y, m, d] = today.split('-').map(Number) as [number, number, number];
  if (d < 15) return `${y}-${String(m).padStart(2, '0')}`;
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

export interface AwardRowText { group: string; name: string; total: number; note: string }

/** Tabela para colar na planilha (TSV): Equipe · Nome · Valor a receber · Obs., com subtotais. */
export function awardTsv(rows: AwardRowText[]): string {
  const money = (c: number) => (c / 100).toFixed(2).replace('.', ',');
  const out = ['Equipe\tNome\tValor a receber\tObs.'];
  const groups = [...new Set(rows.map((r) => r.group))];
  let total = 0;
  for (const g of groups) {
    const list = rows.filter((r) => r.group === g);
    for (const r of list) out.push([g, r.name, money(r.total), r.note].join('\t'));
    const sub = list.reduce((a, r) => a + r.total, 0);
    total += sub;
    out.push(`Subtotal — ${g}\t\t${money(sub)}\t`, '');
  }
  out.push(`TOTAL GERAL\t\t${money(total)}\t`);
  return out.join('\n');
}
