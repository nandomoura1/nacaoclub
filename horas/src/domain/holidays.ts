import { addDays, isoOf, type IsoDate } from './dates';

export type HolidayScope = 'NACIONAL' | 'DISTRITAL' | 'FACULTATIVO';

export interface HolidaySeed {
  date: IsoDate;
  name: string;
  scope: HolidayScope;
}

/** Domingo de Páscoa — algoritmo de Meeus/Jones/Butcher (calendário gregoriano). */
export function easterSunday(year: number): IsoDate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return isoOf(year, month, day);
}

/**
 * Feriados nacionais + Distrito Federal + pontos facultativos usuais.
 * Pontos facultativos entram marcados como tal: a Nação decide a política.
 */
export function holidaysOf(year: number): HolidaySeed[] {
  const easter = easterSunday(year);
  const list: HolidaySeed[] = [
    { date: isoOf(year, 1, 1), name: 'Confraternização Universal', scope: 'NACIONAL' },
    { date: addDays(easter, -48), name: 'Carnaval (segunda)', scope: 'FACULTATIVO' },
    { date: addDays(easter, -47), name: 'Carnaval (terça)', scope: 'FACULTATIVO' },
    { date: addDays(easter, -2), name: 'Sexta-feira Santa', scope: 'NACIONAL' },
    { date: isoOf(year, 4, 21), name: 'Tiradentes · Aniversário de Brasília', scope: 'NACIONAL' },
    { date: isoOf(year, 5, 1), name: 'Dia do Trabalho', scope: 'NACIONAL' },
    { date: addDays(easter, 60), name: 'Corpus Christi', scope: 'FACULTATIVO' },
    { date: isoOf(year, 9, 7), name: 'Independência do Brasil', scope: 'NACIONAL' },
    { date: isoOf(year, 10, 12), name: 'Nossa Senhora Aparecida', scope: 'NACIONAL' },
    { date: isoOf(year, 11, 2), name: 'Finados', scope: 'NACIONAL' },
    { date: isoOf(year, 11, 15), name: 'Proclamação da República', scope: 'NACIONAL' },
    { date: isoOf(year, 11, 20), name: 'Dia da Consciência Negra', scope: 'NACIONAL' },
    { date: isoOf(year, 11, 30), name: 'Dia do Evangélico (DF)', scope: 'DISTRITAL' },
    { date: isoOf(year, 12, 25), name: 'Natal', scope: 'NACIONAL' },
  ];
  return list.sort((x, y) => x.date.localeCompare(y.date));
}
