import type { IsoDate } from '@/domain/dates';

/** "Hoje" no fuso da Nação — não no do servidor (a Vercel roda em UTC). */
export function todayIso(now: Date = new Date()): IsoDate {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
