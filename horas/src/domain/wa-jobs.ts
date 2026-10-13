import { addDays, weekdayOf, type IsoDate } from './dates';

/** Utilidades de período e tipos usados pelas automações de WhatsApp (puro). */

/** Semana ISO (segunda a domingo), ex.: 2026-W42. */
export function isoWeek(date: IsoDate): string {
  const t = new Date(`${date}T12:00:00Z`);
  const day = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - day + 3);
  const year = t.getUTCFullYear();
  const first = new Date(Date.UTC(year, 0, 4, 12));
  const week = 1 + Math.round(((t.getTime() - first.getTime()) / 86_400_000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** O sábado que vem (ou hoje, se já for sábado). */
export function nextSaturday(today: IsoDate): IsoDate {
  const wd = weekdayOf(today);
  return addDays(today, (6 - wd + 7) % 7);
}

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const monthName = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} de ${ym.slice(0, 4)}`;

export interface LeaderDemand { title: string; sector: string; dueDate: string | null; late: boolean; priority: string }
export interface PersonalShift { date: IsoDate; startMin: number; endMin: number; sector: string; holiday?: string | null }
