/**
 * Datas de calendário puras, como string ISO "AAAA-MM-DD".
 *
 * A escala é local (05:00 é 05:00 em Brasília, com ou sem horário de verão),
 * então o domínio NUNCA usa Date com fuso: só aritmética em UTC sobre dias.
 */
export type IsoDate = string;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): value is IsoDate {
  if (!ISO.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function toUtc(date: IsoDate): Date {
  return new Date(`${date}T00:00:00Z`);
}

export function fromUtc(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

export function isoOf(year: number, month: number, day: number): IsoDate {
  return fromUtc(new Date(Date.UTC(year, month - 1, day)));
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
}

/** 1 = segunda … 7 = domingo (ISO-8601), como a grade da Nação. */
export function weekdayOf(date: IsoDate): number {
  const js = toUtc(date).getUTCDay(); // 0 = domingo
  return js === 0 ? 7 : js;
}

/** Todos os dias de `start` a `end`, inclusive. */
export function eachDay(start: IsoDate, end: IsoDate): IsoDate[] {
  const out: IsoDate[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export const WEEKDAYS = [
  { n: 1, short: 'SEG', long: 'Segunda' },
  { n: 2, short: 'TER', long: 'Terça' },
  { n: 3, short: 'QUA', long: 'Quarta' },
  { n: 4, short: 'QUI', long: 'Quinta' },
  { n: 5, short: 'SEX', long: 'Sexta' },
  { n: 6, short: 'SÁB', long: 'Sábado' },
  { n: 7, short: 'DOM', long: 'Domingo' },
] as const;

/** "05:30" ↔ 330 minutos desde a meia-noite. */
export function parseClock(value: string): number | null {
  const m = /^(\d{1,2})(?::|h)?(\d{2})?$/i.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function formatClock(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatDateBR(date: IsoDate): string {
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y}`;
}
