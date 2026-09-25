import { eachDay, weekdayOf, type IsoDate } from './dates';

/**
 * Expansão da grade no calendário real — puro.
 * Grade recorrente + vigência → aulas previstas em cada data do período.
 */
export type HolidayPolicy = 'CANCELAR_TODAS' | 'MANTER_TODAS' | 'DECIDIR_INDIVIDUALMENTE';

export interface GradeVersion {
  id: string;
  slotId: string;
  weekday: number;
  startMin: number;
  durationMin: number;
  validFrom: IsoDate;
  validTo: IsoDate | null;
  modalityId: string;
  activityTypeId: string;
  spaceId: string | null;
  label: string | null;
  people: { teacherId: string; role: 'TITULAR' | 'AUXILIAR' | 'ESTAGIARIO' }[];
}

export interface HolidayInfo { id: string; date: IsoDate; policy: HolidayPolicy }

export interface PlannedOccurrence {
  slotId: string;
  slotVersionId: string;
  date: IsoDate;
  startMin: number;
  durationMin: number;
  modalityId: string;
  activityTypeId: string;
  spaceId: string | null;
  label: string | null;
  people: GradeVersion['people'];
  holidayId: string | null;
  status: 'PREVISTA' | 'CANCELADA' | 'AGUARDANDO_DECISAO_FERIADO';
  /** Cancelada pela política do feriado. */
  cancelledByHoliday: boolean;
}

/** Nunca some aula em silêncio: o feriado cancela com motivo, mantém ou pede decisão. */
export function holidayEffect(policy: HolidayPolicy | null): PlannedOccurrence['status'] {
  if (policy === 'CANCELAR_TODAS') return 'CANCELADA';
  if (policy === 'DECIDIR_INDIVIDUALMENTE') return 'AGUARDANDO_DECISAO_FERIADO';
  return 'PREVISTA';
}

export function expandGrade(
  range: { start: IsoDate; end: IsoDate },
  versions: GradeVersion[],
  holidays: HolidayInfo[],
  only?: { slotId?: string | null; from?: IsoDate },
): PlannedOccurrence[] {
  const holidayByDate = new Map(holidays.map((h) => [h.date, h]));
  const byWeekday = new Map<number, GradeVersion[]>();
  for (const v of versions) {
    if (only?.slotId && v.slotId !== only.slotId) continue;
    const list = byWeekday.get(v.weekday) ?? [];
    list.push(v);
    byWeekday.set(v.weekday, list);
  }

  const out: PlannedOccurrence[] = [];
  const from = only?.from && only.from > range.start ? only.from : range.start;
  if (from > range.end) return out;
  for (const date of eachDay(from, range.end)) {
    const holiday = holidayByDate.get(date) ?? null;
    for (const v of byWeekday.get(weekdayOf(date)) ?? []) {
      if (v.validFrom > date || (v.validTo !== null && v.validTo < date)) continue;
      const status = holidayEffect(holiday?.policy ?? null);
      out.push({
        slotId: v.slotId,
        slotVersionId: v.id,
        date,
        startMin: v.startMin,
        durationMin: v.durationMin,
        modalityId: v.modalityId,
        activityTypeId: v.activityTypeId,
        spaceId: v.spaceId,
        label: v.label,
        people: v.people,
        holidayId: holiday?.id ?? null,
        status,
        cancelledByHoliday: status === 'CANCELADA',
      });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin);
}
