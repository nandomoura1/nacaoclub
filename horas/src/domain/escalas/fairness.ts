import { weekdayOf, type IsoDate } from '@/domain/dates';

/** Dias "pesados" trabalhados: sábado, domingo e feriado (feriado no fim de semana conta só como feriado). */
export interface HeavyCount { sat: number; sun: number; hol: number; total: number }
export interface FairnessRow {
  memberId: string;
  month: HeavyCount;
  /** Meses anteriores + este mês. */
  sum: HeavyCount;
  /** Meses com escala trabalhada (base da média). */
  months: number;
  /** Diferença para o esperado pela média do time (no mesmo nº de meses). Positivo = trabalhou mais. */
  diff: HeavyCount;
}

const KEYS = ['sat', 'sun', 'hol', 'total'] as const;
const zero = (): HeavyCount => ({ sat: 0, sun: 0, hol: 0, total: 0 });

export function heavyKind(date: IsoDate, holidays: Set<IsoDate>): 'sat' | 'sun' | 'hol' | null {
  if (holidays.has(date)) return 'hol';
  const w = weekdayOf(date);
  return w === 6 ? 'sat' : w === 7 ? 'sun' : null;
}

function add(into: HeavyCount, k: 'sat' | 'sun' | 'hol') {
  into[k] += 1;
  into.total += 1;
}

/**
 * Contador de equidade. `prior` = dias trabalhados em escalas anteriores do setor,
 * `current` = dias trabalhados no mês. `priorMonths` = meses anteriores em que a pessoa trabalhou.
 * A comparação é por mês trabalhado: quem entrou depois não aparece "abaixo" só por ser novo.
 */
export function fairness(input: {
  memberIds: string[];
  prior: { memberId: string; date: IsoDate }[];
  current: { memberId: string; date: IsoDate }[];
  holidays: Set<IsoDate>;
  priorMonths: Record<string, number>;
}): FairnessRow[] {
  const ids = new Set(input.memberIds);
  const rows = new Map(input.memberIds.map((id) => [id, { memberId: id, month: zero(), sum: zero(), months: input.priorMonths[id] ?? 0, diff: zero() }]));
  const workedNow = new Set<string>();
  for (const c of input.current) {
    if (!ids.has(c.memberId)) continue;
    workedNow.add(c.memberId);
    const k = heavyKind(c.date, input.holidays);
    if (k) { add(rows.get(c.memberId)!.month, k); add(rows.get(c.memberId)!.sum, k); }
  }
  for (const c of input.prior) {
    const k = ids.has(c.memberId) ? heavyKind(c.date, input.holidays) : null;
    if (k) add(rows.get(c.memberId)!.sum, k);
  }
  for (const id of workedNow) rows.get(id)!.months += 1;

  const list = [...rows.values()];
  const base = list.filter((r) => r.months > 0);
  const totalMonths = base.reduce((s, r) => s + r.months, 0);
  for (const k of KEYS) {
    const rate = totalMonths ? base.reduce((s, r) => s + r.sum[k], 0) / totalMonths : 0;
    for (const r of base) r.diff[k] = Math.round((r.sum[k] - rate * r.months) * 10) / 10;
  }
  return list;
}
