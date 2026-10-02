import type { Tx } from '@/server/db';
import { fromUtc, toUtc, type IsoDate } from '@/domain/dates';
import { isDoubleDay } from '@/domain/ledger';

/**
 * Regra do dobro (domingo e feriado) para um intervalo: devolve "esta data vale o dobro?".
 * Feriado nacional, distrital e da Nação dobram; ponto facultativo (ex.: Carnaval) não.
 */
export async function doubleDayRule(db: Tx, start: IsoDate, end: IsoDate): Promise<(date: IsoDate) => boolean> {
  const [holidays, settings] = await Promise.all([
    db.holiday.findMany({ where: { date: { gte: toUtc(start), lte: toUtc(end) }, scope: { not: 'FACULTATIVO' } }, select: { date: true } }),
    db.appSettings.findUnique({ where: { id: 1 }, select: { doubleHoursFrom: true } }),
  ]);
  const set = new Set(holidays.map((h) => fromUtc(h.date)));
  const from = settings?.doubleHoursFrom ? fromUtc(settings.doubleHoursFrom) : null;
  return (date) => isDoubleDay(date, set, from);
}
