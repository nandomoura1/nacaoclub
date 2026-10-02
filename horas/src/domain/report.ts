import { sumBuckets, type Bucket, type TeacherHours } from './ledger';

/**
 * Relatórios de horas — puro. Recebe o razão (computeLedger) e os nomes,
 * devolve as visões prontas para tela, impressão e Excel.
 */
export interface ReportModality { id: string; name: string; area: string }
export interface ReportTeacher { id: string; name: string }

export type ReportRow = Omit<Bucket, 'absences'> & { absences: Bucket['absences'] };
export interface TeacherRow extends ReportRow { teacherId: string; teacher: string; modalities: string[] }
export interface ModalityRow extends ReportRow { modalityId: string; modality: string; area: string; teachers: number }
export interface TeacherModalityRow extends ReportRow { teacherId: string; teacher: string; modalityId: string; modality: string; area: string }

export interface HoursReport {
  byTeacher: TeacherRow[];
  byModality: ModalityRow[];
  byTeacherModality: TeacherModalityRow[];
  totals: ReportRow;
}

const pick = (b: Bucket): ReportRow => ({
  plannedMin: b.plannedMin, ownMin: b.ownMin, substitutionMin: b.substitutionMin, extraMin: b.extraMin, bonusMin: b.bonusMin,
  absenceMin: b.absenceMin, cancelledMin: b.cancelledMin, pendingMin: b.pendingMin, totalMin: b.totalMin, absences: { ...b.absences },
});

function addInto(target: ReportRow, b: Bucket) {
  for (const k of ['plannedMin', 'ownMin', 'substitutionMin', 'extraMin', 'absenceMin', 'cancelledMin', 'pendingMin', 'bonusMin', 'totalMin'] as const) target[k] += b[k];
  for (const [r, m] of Object.entries(b.absences)) target.absences[r as keyof Bucket['absences']] = (target.absences[r as keyof Bucket['absences']] ?? 0) + (m ?? 0);
}

const byName = (a: string, b: string) => a.localeCompare(b, 'pt-BR');

export function buildHoursReport(
  ledger: TeacherHours[],
  teachers: ReportTeacher[],
  modalities: ReportModality[],
  opts: { teacherId?: string | null; modalityIds?: Set<string> | null } = {},
): HoursReport {
  const tName = new Map(teachers.map((t) => [t.id, t.name]));
  const mod = new Map(modalities.map((m) => [m.id, m]));
  const rows = ledger.filter((l) => !opts.teacherId || l.teacherId === opts.teacherId);

  const byTeacherModality: TeacherModalityRow[] = [];
  const modAgg = new Map<string, ModalityRow>();
  const byTeacher: TeacherRow[] = [];

  for (const l of rows) {
    const teacher = tName.get(l.teacherId) ?? '?';
    const own = pick(sumBuckets([]));
    const names: string[] = [];
    for (const [modalityId, b] of Object.entries(l.byModality)) {
      // Filtro de modalidade: o professor só leva as horas daquela modalidade.
      if (opts.modalityIds && !opts.modalityIds.has(modalityId)) continue;
      const m = mod.get(modalityId) ?? { id: modalityId, name: '?', area: '?' };
      byTeacherModality.push({ teacherId: l.teacherId, teacher, modalityId, modality: m.name, area: m.area, ...pick(b) });
      addInto(own, b);
      names.push(m.name);
      const agg = modAgg.get(modalityId) ?? { modalityId, modality: m.name, area: m.area, teachers: 0, ...pick(sumBuckets([])) };
      addInto(agg, b);
      agg.teachers++;
      modAgg.set(modalityId, agg);
    }
    if (names.length) byTeacher.push({ teacherId: l.teacherId, teacher, modalities: names.sort(byName), ...own });
  }

  const totals = pick(sumBuckets([]));
  for (const r of byTeacher) addInto(totals, r);

  return {
    byTeacher: byTeacher.sort((a, b) => byName(a.teacher, b.teacher)),
    byModality: [...modAgg.values()].sort((a, b) => byName(a.area, b.area) || byName(a.modality, b.modality)),
    byTeacherModality: byTeacherModality.sort((a, b) => byName(a.teacher, b.teacher) || byName(a.modality, b.modality)),
    totals,
  };
}

/** Minutos → horas decimais para a contabilidade: 90 → 1,5. */
export const toDecimalHours = (min: number) => Math.round((min / 60) * 100) / 100;
