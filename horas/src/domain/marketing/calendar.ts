import { addDays, weekdayOf } from '@/domain/dates';

/**
 * Calendário de marketing: uma VISÃO que une campanhas, eventos, tarefas,
 * itens avulsos e feriados (não há tabela única). Grades de mês/semana. Puro.
 */

export type CalKind = 'campanha' | 'evento' | 'tarefa' | 'item' | 'feriado';
export interface CalEntry {
  kind: CalKind;
  id: string;
  title: string;
  start: string;
  end: string;
  /** Rótulo curto (tipo, status, área). */
  tag?: string;
  color?: string;
  href?: string;
  ownerId?: string | null;
  areaKey?: string | null;
  modalityId?: string | null;
  status?: string | null;
  campaignId?: string | null;
}

export const mondayOf = (d: string) => addDays(d, 1 - weekdayOf(d));
export const monthStart = (month: string) => `${month}-01`;
export function monthEnd(month: string) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y!, m!, 0)).toISOString().slice(0, 10);
}

/** Semanas (seg–dom) que cobrem o mês. */
export function monthGrid(month: string): string[][] {
  const first = mondayOf(monthStart(month));
  const last = monthEnd(month);
  const weeks: string[][] = [];
  for (let w = first; w <= last; w = addDays(w, 7)) weeks.push(Array.from({ length: 7 }, (_, i) => addDays(w, i)));
  return weeks;
}

export const overlaps = (e: { start: string; end: string }, from: string, to: string) => e.start <= to && e.end >= from;
export const onDay = (entries: CalEntry[], day: string) => entries.filter((e) => e.start <= day && e.end >= day);

export function shiftMonth(month: string, n: number) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

/** Mover um item: mantém a duração. */
export function moveRange(start: string, end: string | null, newStart: string) {
  if (!end) return { start: newStart, end: null };
  const days = Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000);
  return { start: newStart, end: addDays(newStart, days) };
}
