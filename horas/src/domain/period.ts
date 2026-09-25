import { addDays, eachDay, isoOf, weekdayOf, type IsoDate } from './dates';

/**
 * Competência — lógica pura.
 *
 * Com dia de corte 26: "Setembro/2026" vai de 26/08/2026 a 25/09/2026 e é
 * paga na folha de setembro. Com corte 1, a competência é o mês civil.
 */
export interface PeriodRef { year: number; month: number }
export interface PeriodBounds extends PeriodRef { start: IsoDate; end: IsoDate }

export const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export function periodBounds(year: number, month: number, startDay: number): PeriodBounds {
  if (startDay <= 1) {
    const start = isoOf(year, month, 1);
    const end = addDays(isoOf(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1, 1), -1);
    return { year, month, start, end };
  }
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  return { year, month, start: isoOf(prevYear, prevMonth, startDay), end: isoOf(year, month, startDay - 1) };
}

/** Em qual competência cai uma data. */
export function periodOf(date: IsoDate, startDay: number): PeriodRef {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  if (startDay > 1 && d >= startDay) return m === 12 ? { year: y + 1, month: 1 } : { year: y, month: m + 1 };
  return { year: y, month: m };
}

export function shiftPeriod(p: PeriodRef, delta: number): PeriodRef {
  const idx = p.year * 12 + (p.month - 1) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

export function periodLabel(p: PeriodRef): string {
  return `${MONTHS[p.month - 1]}/${p.year}`;
}

/** "2026-09" ↔ { year: 2026, month: 9 } — formato de URL. */
export function periodKey(p: PeriodRef): string {
  return `${p.year}-${String(p.month).padStart(2, '0')}`;
}

export function parsePeriodKey(value: string | undefined): PeriodRef | null {
  const m = /^(\d{4})-(\d{2})$/.exec(value ?? '');
  if (!m) return null;
  const month = Number(m[2]);
  return month >= 1 && month <= 12 ? { year: Number(m[1]), month } : null;
}

/** Quantas segundas, terças… há no período. É o que a planilha pede para digitar à mão. */
export function weekdayCounts(start: IsoDate, end: IsoDate): Record<number, number> {
  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 };
  for (const d of eachDay(start, end)) counts[weekdayOf(d)]!++;
  return counts;
}
