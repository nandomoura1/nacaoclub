import { addDays, eachDay, isoOf, toUtc, weekdayOf, WEEKDAYS, type IsoDate } from '@/domain/dates';
import type { DayEvent, DayKey, DayPlan, HoursMap, Window } from './types';

/**
 * Calendário real do mês e funcionamento de cada dia. Nunca um mês "fictício":
 * as datas vêm do ano/mês escolhidos (novembro/2026 = 30 dias, começa no domingo).
 */

export const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'] as const;

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Segunda-feira da semana da data (semana de segunda a domingo). */
export function mondayOf(date: IsoDate): IsoDate {
  return addDays(date, 1 - weekdayOf(date));
}

export function diffDays(a: IsoDate, b: IsoDate): number {
  return Math.round((toUtc(b).getTime() - toUtc(a).getTime()) / 86_400_000);
}

export interface MonthInfo {
  year: number;
  month: number;
  label: string;
  first: IsoDate;
  last: IsoDate;
  length: number;
  days: IsoDate[];
  /** Quantas segundas, terças… (1 = segunda … 7 = domingo). */
  weekdayCount: Record<number, number>;
  /** Semanas de segunda a domingo que tocam o mês (podem começar/terminar em outro mês). */
  weeks: { monday: IsoDate; days: IsoDate[] }[];
  /** Do 1º dia da 1ª semana ao último da última (o motor equilibra a semana inteira). */
  rangeStart: IsoDate;
  rangeEnd: IsoDate;
}

export function monthInfo(year: number, month: number): MonthInfo {
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error('Mês inválido.');
  }
  const length = daysInMonth(year, month);
  const first = isoOf(year, month, 1);
  const last = isoOf(year, month, length);
  const days = eachDay(first, last);
  const weekdayCount: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 };
  days.forEach((d) => { weekdayCount[weekdayOf(d)]!++; });
  const rangeStart = mondayOf(first);
  const rangeEnd = addDays(mondayOf(last), 6);
  const weeks: MonthInfo['weeks'] = [];
  for (let m = rangeStart; m <= rangeEnd; m = addDays(m, 7)) weeks.push({ monday: m, days: eachDay(m, addDays(m, 6)) });
  return { year, month, label: `${MONTHS[month - 1]} de ${year}`, first, last, length, days, weekdayCount, weeks, rangeStart, rangeEnd };
}

/** Semana do ciclo de N semanas (0 … n−1) pela data de referência — continua entre os meses. */
export function cycleIndex(date: IsoDate, cycleRef: IsoDate, n: number): number {
  const weeks = Math.floor(diffDays(mondayOf(cycleRef), mondayOf(date)) / 7);
  return ((weeks % n) + n) % n;
}

/** Fase do revezamento A/B pela data de referência — continua de um mês para o outro. */
export function cyclePhase(date: IsoDate, cycleRef: IsoDate): 'A' | 'B' {
  const weeks = Math.floor(diffDays(mondayOf(cycleRef), mondayOf(date)) / 7);
  return ((weeks % 2) + 2) % 2 === 0 ? 'A' : 'B';
}

export interface Override {
  date: IsoDate;
  /** null = a Nação toda. */
  sectorId: string | null;
  closed: boolean;
  hours: Window[] | null;
  reason: string;
  eventName?: string | null;
  extraPeople?: number;
  /** Gestor confirmou o funcionamento nesta data. */
  confirmed?: boolean;
}

export interface CalendarInput {
  sectorId: string;
  sectorHours: HoursMap;
  nacaoHours: HoursMap;
  holidays: Map<IsoDate, { name: string; scope: string }>;
  overrides: Override[];
  /** Regra do feriado: SABADO/DOMINGO (horário, equipe e postos desse dia), PROPRIO (linha F) ou FECHADO. Sem regra = como sábado. */
  holidayMode?: string | null;
  /** Todo feriado pede confirmação do gestor, mesmo com horário definido. */
  holidayConfirm?: boolean;
}

export const HOLIDAY_MODES = ['SABADO', 'DOMINGO', 'PROPRIO', 'FECHADO'] as const;
export type HolidayMode = (typeof HOLIDAY_MODES)[number];
export const HOLIDAY_MODE_LABEL: Record<HolidayMode, string> = { SABADO: 'Como sábado', DOMINGO: 'Como domingo', PROPRIO: 'Horário próprio', FECHADO: 'Fechado' };
/** Regra básica da Nação: feriado funciona como sábado. */
export const holidayModeOf = (mode: string | null | undefined): HolidayMode => (HOLIDAY_MODES as readonly string[]).includes(mode ?? '') ? mode as HolidayMode : 'SABADO';
/**
 * Horário pré-programado do setor no feriado (undefined = setor sem esse horário cadastrado).
 * "Como sábado/domingo" troca só o feriado de segunda a sexta; no fim de semana vale o horário do próprio dia.
 */
export function holidayHours(sectorHours: HoursMap, mode: string | null | undefined, weekday: number): Window[] | undefined {
  const m = holidayModeOf(mode);
  if (m === 'FECHADO') return [];
  if (m === 'PROPRIO') return sectorHours.F;
  if (weekday >= 6) return sectorHours[String(weekday) as DayKey];
  return sectorHours[m === 'SABADO' ? '6' : '7'];
}

const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const windowsLabel = (w: Window[]) => (w.length ? w.map(([a, b]) => `${fmt(a)}–${fmt(b)}`).join(', ') : 'fechado');

/** Interseção de duas listas de janelas. */
export function intersect(a: Window[], b: Window[]): Window[] {
  const out: Window[] = [];
  for (const [s1, e1] of a) for (const [s2, e2] of b) {
    const s = Math.max(s1, s2), e = Math.min(e1, e2);
    if (e > s) out.push([s, e]);
  }
  return out.sort((x, y) => x[0] - y[0]);
}

const covers = (outer: Window[], inner: Window[]) => inner.every(([s, e]) => outer.some(([a, b]) => a <= s && b >= e));

/**
 * Funcionamento do setor numa data. Prioridade:
 * 1. exceção do setor para a data; 2. funcionamento especial da Nação na data;
 * 3. horário habitual do setor (com o de feriado, se houver); 4. horário geral da Nação.
 * Feriado não vira folga nem dia normal sozinho: sem horário de feriado, pede confirmação.
 */
export function resolveDay(date: IsoDate, c: CalendarInput): DayPlan {
  const weekday = weekdayOf(date);
  const wk = String(weekday) as DayKey;
  const holiday = c.holidays.get(date) ?? null;
  const notes: string[] = [];
  const confirm: string[] = [];
  const mine = c.overrides.filter((o) => o.date === date && (o.sectorId === c.sectorId || o.sectorId === null));
  const events: DayEvent[] = mine
    .filter((o) => o.eventName || (o.extraPeople ?? 0) > 0)
    .map((o) => ({ name: o.eventName || o.reason, extraPeople: o.extraPeople ?? 0, window: o.hours?.[0] ?? null }));
  const sectorEx = mine.find((o) => o.sectorId === c.sectorId && (o.closed || o.hours?.length));
  const nacaoEx = mine.find((o) => o.sectorId === null && (o.closed || o.hours?.length));

  // Feriado "de verdade" (nacional/distrital/da Nação); ponto facultativo só muda se houver horário de feriado.
  const isHoliday = !!holiday && holiday.scope !== 'FACULTATIVO';
  const mode = holidayModeOf(c.holidayMode);
  const fh = isHoliday ? holidayHours(c.sectorHours, mode, weekday) : undefined;
  if (holiday && !isHoliday) notes.push(`Ponto facultativo: ${holiday.name}`);
  const habitual = (): { open: Window[]; source: DayPlan['source'] } | null => {
    if (c.sectorHours[wk]) return { open: c.sectorHours[wk]!, source: 'SETOR' };
    if (c.nacaoHours[wk]) { notes.push('Sem horário do setor: usando o horário geral da Nação'); return { open: c.nacaoHours[wk]!, source: 'NACAO' }; }
    return null;
  };

  let open: Window[] = [];
  let source: DayPlan['source'];
  if (sectorEx) {
    open = sectorEx.closed ? [] : sectorEx.hours!;
    source = 'SETOR_EXCECAO';
    notes.push(`${sectorEx.closed ? 'Fechado' : 'Horário especial'}: ${sectorEx.reason}`);
  } else if (nacaoEx) {
    source = 'NACAO_EXCECAO';
    if (nacaoEx.closed) { open = []; notes.push(`Nação fechada: ${nacaoEx.reason}`); }
    else {
      const h = (fh?.length ? fh : null) || habitual()?.open || nacaoEx.hours!;
      open = intersect(h, nacaoEx.hours!);
      notes.push(`Funcionamento especial da Nação: ${nacaoEx.reason}`);
      if (!covers(nacaoEx.hours!, h)) confirm.push(`O setor funciona ${windowsLabel(h)}, mas a Nação funciona ${windowsLabel(nacaoEx.hours!)} (${nacaoEx.reason}). Confirme o horário do setor nesta data.`);
    }
  } else if (fh) {
    open = fh; source = 'SETOR_FERIADO';
    const como = mode === 'SABADO' ? ' (como sábado)' : mode === 'DOMINGO' ? ' (como domingo)' : '';
    notes.push(`Feriado (${holiday!.name}): ${open.length ? windowsLabel(open) : 'fechado'}${como}`);
    if (c.holidayConfirm) confirm.push(`Feriado (${holiday!.name}): pré-definido ${open.length ? windowsLabel(open) : 'fechado'}${como}. Confirme o funcionamento e a equipe.`);
  } else if (isHoliday && (c.nacaoHours.F ?? c.nacaoHours['6'])) {
    const nf = (c.nacaoHours.F ?? c.nacaoHours['6'])!;
    const h = habitual()?.open ?? nf;
    open = intersect(h, nf); source = 'NACAO_FERIADO'; notes.push(`Feriado (${holiday!.name}): horário de feriado da Nação`);
  } else {
    const h = habitual();
    if (h) { open = h.open; source = h.source; }
    else { open = []; source = 'SEM_HORARIO'; confirm.push(`Sem horário cadastrado para ${WEEKDAYS[weekday - 1]!.long.toLowerCase()} (nem do setor nem da Nação).`); }
    if (isHoliday) confirm.push(`Feriado (${holiday!.name}) sem horário de feriado cadastrado: usando o horário habitual — confirme se o setor abre.`);
  }
  // Só em feriado de segunda a sexta: no sábado/domingo o fim de semana já tem a equipe dele.
  // Confirmado pelo gestor: o aviso sai (o funcionamento continua o definido).
  if (mine.some((o) => o.confirmed && o.sectorId === c.sectorId) && confirm.length) {
    notes.push('Funcionamento confirmado pelo gestor');
    confirm.length = 0;
  }
  // Exceção de horário num feriado (ex.: fecha mais cedo) continua sendo feriado "como sábado/domingo".
  const asWeekday = isHoliday && weekday <= 5 && open.length && (source! === 'SETOR_FERIADO' || source! === 'NACAO_FERIADO' || source! === 'SETOR_EXCECAO' || source! === 'NACAO_EXCECAO')
    ? (mode === 'SABADO' ? 6 : mode === 'DOMINGO' ? 7 : null) : null;
  return { date, weekday, holiday, asWeekday, open, source: source!, notes, confirm, events };
}
