/** Competência "AAAA-MM": cobra-se o mês vencido, com vencimento no mês seguinte. */
export type Month = `${number}-${string}`;

export const isMonth = (v: string): v is Month => /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

export function addMonths(month: Month, n: number): Month {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}` as Month;
}

export const monthOf = (isoDate: string): Month => isoDate.slice(0, 7) as Month;
export const firstDay = (month: Month): string => `${month}-01`;

export function daysInMonth(month: Month): number {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
export const lastDay = (month: Month): string => `${month}-${String(daysInMonth(month)).padStart(2, '0')}`;

/** Vencimento padrão: dia `dueDay` do mês seguinte à competência (limitado ao fim do mês). */
export function defaultDueDate(month: Month, dueDay: number): string {
  const next = addMonths(month, 1);
  return `${next}-${String(Math.min(Math.max(1, dueDay), daysInMonth(next))).padStart(2, '0')}`;
}

/** Competência sugerida: o mês anterior ao de hoje (o mês vencido). */
export const suggestedMonth = (todayIso: string): Month => addMonths(monthOf(todayIso), -1);

const NAMES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
/** "08/2026". */
export const monthLabel = (month: Month): string => `${month.slice(5)}/${month.slice(0, 4)}`;
/** "agosto de 2026". */
export const monthLong = (month: Month): string => `${NAMES[Number(month.slice(5)) - 1]} de ${month.slice(0, 4)}`;
/** "Ago/26". */
export const monthShort = (month: Month): string => {
  const n = NAMES[Number(month.slice(5)) - 1]!;
  return `${n[0]!.toUpperCase()}${n.slice(1, 3)}/${month.slice(2, 4)}`;
};
/** "Agosto de 2026" (só a primeira letra maiúscula). */
export const monthTitle = (month: Month): string => { const s = monthLong(month); return s[0]!.toUpperCase() + s.slice(1); };
