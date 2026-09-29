import { WEEKDAYS, addDays, formatClock, formatDateBR, weekdayOf, type IsoDate } from './dates';

/**
 * Escalas de fim de semana e feriados — puro. Tipo do dia, turnos padrão,
 * conflitos (mesma pessoa em dois lugares, ausência, aula da grade) e o
 * texto de WhatsApp. Testado sem banco.
 */
export type DayType = 'SAB' | 'DOM' | 'FERIADO' | 'SEMANA';
export type SectorDefaults = Partial<Record<'SAB' | 'DOM' | 'FERIADO', [number, number][]>>;

export function dayType(date: IsoDate, holidays: ReadonlySet<string>): DayType {
  if (holidays.has(date)) return 'FERIADO';
  const wd = weekdayOf(date);
  return wd === 6 ? 'SAB' : wd === 7 ? 'DOM' : 'SEMANA';
}

export function defaultShifts(defaults: SectorDefaults, type: DayType): { startMin: number; endMin: number }[] {
  if (type === 'SEMANA') return [];
  return (defaults[type] ?? []).map(([startMin, endMin]) => ({ startMin, endMin }));
}

export interface ShiftLike { sector: string; date: IsoDate; startMin: number; endMin: number; people: { id: string; name: string }[] }
export interface BusyLike { teacherId: string; date: IsoDate; startMin: number; endMin: number; label: string }
export interface LeaveLike { teacherId: string; start: IsoDate; end: IsoDate; label: string }

const overlaps = (a: { startMin: number; endMin: number }, b: { startMin: number; endMin: number }) => a.startMin < b.endMin && b.startMin < a.endMin;
const when = (d: IsoDate, s: number, e: number) => `${formatDateBR(d).slice(0, 5)} ${formatClock(s)}–${formatClock(e)}`;

/** Avisos (não bloqueiam): turno vazio, pessoa em dois lugares, de férias/afastada, ou com aula na grade no horário. */
export function dutyWarnings(shifts: ShiftLike[], busy: BusyLike[] = [], leaves: LeaveLike[] = []): string[] {
  const out: string[] = [];
  for (const s of shifts) if (!s.people.length) out.push(`${s.sector} ${when(s.date, s.startMin, s.endMin)}: turno sem ninguém.`);
  for (let i = 0; i < shifts.length; i++) {
    for (let j = i + 1; j < shifts.length; j++) {
      const a = shifts[i]!; const b = shifts[j]!;
      if (a.date !== b.date || !overlaps(a, b)) continue;
      for (const p of a.people) {
        if (b.people.some((q) => q.id === p.id)) out.push(`${p.name} está em dois turnos ao mesmo tempo: ${a.sector} e ${b.sector} (${when(a.date, Math.max(a.startMin, b.startMin), Math.min(a.endMin, b.endMin))}).`);
      }
    }
  }
  for (const s of shifts) {
    for (const p of s.people) {
      const l = leaves.find((x) => x.teacherId === p.id && x.start <= s.date && s.date <= x.end);
      if (l) out.push(`${p.name} está de ${l.label.toLowerCase()} em ${formatDateBR(s.date).slice(0, 5)} (${s.sector}).`);
      const c = busy.find((x) => x.teacherId === p.id && x.date === s.date && overlaps(x, s));
      if (c) out.push(`${p.name} tem ${c.label} às ${formatClock(c.startMin)} em ${formatDateBR(s.date).slice(0, 5)}, no meio do turno de ${s.sector}.`);
    }
  }
  return [...new Set(out)];
}

const dayTitle = (d: IsoDate, holidayName?: string) =>
  `${WEEKDAYS[weekdayOf(d) - 1]!.long} ${formatDateBR(d).slice(0, 5)}${holidayName ? ` (${holidayName})` : ''}`;

/** "04 e 05/10", "04/10 a 12/10", "12/10". */
export function rangeLabel(dates: IsoDate[]): string {
  const ds = [...new Set(dates)].sort();
  if (!ds.length) return '';
  if (ds.length === 1) return formatDateBR(ds[0]!).slice(0, 5);
  const [a, b] = [ds[0]!, ds.at(-1)!];
  if (ds.length === 2 && a.slice(0, 7) === b.slice(0, 7)) return `${a.slice(8)} e ${formatDateBR(b).slice(0, 5)}`;
  return `${formatDateBR(a).slice(0, 5)} a ${formatDateBR(b).slice(0, 5)}`;
}

export function dutyWhatsapp(input: { title: string; sectors: { name: string; shifts: (Omit<ShiftLike, 'sector'> & { notes?: string | null })[] }[]; holidays?: Record<string, string> }): string {
  const out = [`*🔵 ESCALA · ${input.title.toUpperCase()}*`];
  for (const s of input.sectors) {
    if (!s.shifts.length) continue;
    out.push('', `*${s.name.toUpperCase()}*`);
    const byDate = new Map<string, typeof s.shifts>();
    for (const sh of [...s.shifts].sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin)) byDate.set(sh.date, [...(byDate.get(sh.date) ?? []), sh]);
    for (const [date, list] of byDate) {
      out.push(`_${dayTitle(date, input.holidays?.[date])}_`);
      for (const sh of list) {
        out.push(`• ${formatClock(sh.startMin)}–${formatClock(sh.endMin)}: ${sh.people.map((p) => p.name).join(', ') || 'a definir'}${sh.notes ? ` — ${sh.notes}` : ''}`);
      }
    }
  }
  out.push('', '_Muitos esportes, muitas paixões, uma Nação!_ 💙');
  return out.join('\n');
}

export { dayTitle };

/** Título do relatório: "Fim de semana 03 e 04/10", "Feriado · Nossa Senhora Aparecida 12/10" ou "03/10 a 12/10". */
export function dutyTitle(start: IsoDate, end: IsoDate, holidays: Record<string, string> = {}): string {
  if (start === end && holidays[start]) return `Feriado · ${holidays[start]} ${formatDateBR(start).slice(0, 5)}`;
  const wd = weekdayOf(start);
  if (wd === 6 && (end === start || end === addDays(start, 1))) return `Fim de semana ${rangeLabel(end === start ? [start] : [start, end])}`;
  if (start === end) return `${WEEKDAYS[wd - 1]!.long} ${formatDateBR(start).slice(0, 5)}`;
  return `${formatDateBR(start).slice(0, 5)} a ${formatDateBR(end).slice(0, 5)}`;
}
