import { formatDateBR, type IsoDate } from '@/domain/dates';

/**
 * Premiação (gratificação mensal, paga no dia 15 do mês seguinte) — puro.
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
export interface AwardLeave { type: string; start: IsoDate; end: IsoDate }

export const DEFAULT_VALUES: AwardValues = { productivity: 10000, punctuality: 10000, attendance: 10000 };
export const maxOf = (v: AwardValues) => v.productivity + v.punctuality + v.attendance;

/** Sugestão do sistema para o mês, a partir das ausências lançadas e da admissão. */
export function suggest(leaves: AwardLeave[], monthFirst: IsoDate, monthLast: IsoDate, admission: IsoDate | null): { state: AwardState; reasons: string[] } {
  const inMonth = leaves.filter((l) => l.start <= monthLast && l.end >= monthFirst);
  const span = (l: AwardLeave) => {
    const s = l.start < monthFirst ? monthFirst : l.start, e = l.end > monthLast ? monthLast : l.end;
    return s === e ? formatDateBR(s) : `${formatDateBR(s)} a ${formatDateBR(e)}`;
  };
  const faltas = inMonth.filter((l) => l.type === 'FALTA');
  const atestados = inMonth.filter((l) => l.type === 'ATESTADO');
  const reasons = [
    ...faltas.map((l) => `Falta ${span(l)}`),
    ...atestados.map((l) => `Atestado ${span(l)}`),
  ];
  if (admission && admission > monthFirst) {
    return { state: { productivity: false, punctuality: false, attendance: false, extraCents: 0 }, reasons: [`Admitido em ${formatDateBR(admission)}: não completou o mês`, ...reasons] };
  }
  if (faltas.length) return { state: { productivity: false, punctuality: false, attendance: false, extraCents: 0 }, reasons };
  return { state: { productivity: true, punctuality: true, attendance: atestados.length === 0, extraCents: 0 }, reasons };
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

/** Dia do pagamento: 15 do mês seguinte ao avaliado. */
export function payDay(month: string): IsoDate {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01-15` : `${y}-${String(m + 1).padStart(2, '0')}-15`;
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
