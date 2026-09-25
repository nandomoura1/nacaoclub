/**
 * O cálculo das horas — puro. Cada "cadeira de professor" numa aula vira
 * minutos na conta de alguém (ou em nenhuma, com o motivo registrado).
 *
 * Invariante (testado): para cada professor,
 *   previstas = próprias + ausências + canceladas + aguardando
 */
export type AssignmentStatus = 'PREVISTA' | 'REALIZADA' | 'SUBSTITUIDA' | 'CANCELADA' | 'AUSENTE_PENDENTE';
export type OccurrenceStatus = 'PREVISTA' | 'REALIZADA' | 'CANCELADA' | 'AGUARDANDO_DECISAO_FERIADO';
export type AbsenceReason = 'FALTA' | 'FERIAS' | 'ATESTADO' | 'FOLGA' | 'OUTRO';

export interface LedgerOccurrence {
  id: string;
  date: string;
  modalityId: string;
  status: OccurrenceStatus;
  plannedDurationMin: number;
  durationMin: number;
  countsHours: boolean;
  /** O motivo do cancelamento paga o professor mesmo assim? */
  cancellationCountsHours: boolean;
  assignments: {
    plannedTeacherId: string | null;
    executingTeacherId: string | null;
    status: AssignmentStatus;
    minutes: number;
    absenceReason: AbsenceReason | null;
  }[];
}

export interface Bucket {
  plannedMin: number;
  ownMin: number;
  substitutionMin: number;
  extraMin: number;
  absenceMin: number;
  cancelledMin: number;
  pendingMin: number;
  totalMin: number;
  absences: Partial<Record<AbsenceReason, number>>;
}

export interface TeacherHours extends Bucket {
  teacherId: string;
  byModality: Record<string, Bucket>;
}

const emptyBucket = (): Bucket => ({
  plannedMin: 0, ownMin: 0, substitutionMin: 0, extraMin: 0,
  absenceMin: 0, cancelledMin: 0, pendingMin: 0, totalMin: 0, absences: {},
});

type Field = 'plannedMin' | 'ownMin' | 'substitutionMin' | 'extraMin' | 'absenceMin' | 'cancelledMin' | 'pendingMin';

export function computeLedger(occurrences: LedgerOccurrence[]): TeacherHours[] {
  const map = new Map<string, TeacherHours>();
  const add = (teacherId: string | null, modalityId: string, field: Field, min: number, reason?: AbsenceReason) => {
    if (!teacherId || min === 0) return;
    const t = map.get(teacherId) ?? { teacherId, ...emptyBucket(), byModality: {} };
    const m = (t.byModality[modalityId] ??= emptyBucket());
    for (const b of [t, m] as Bucket[]) {
      b[field] += min;
      if (field === 'ownMin' || field === 'substitutionMin' || field === 'extraMin') b.totalMin += min;
      if (reason) b.absences[reason] = (b.absences[reason] ?? 0) + min;
    }
    map.set(teacherId, t);
  };

  for (const o of occurrences) {
    if (!o.countsHours) continue;
    for (const a of o.assignments) {
      const planned = a.plannedTeacherId;
      if (planned) add(planned, o.modalityId, 'plannedMin', o.plannedDurationMin);

      if (!planned) {
        // Aula avulsa: não havia previsão — tudo é extra de quem deu.
        if (a.executingTeacherId && (a.status === 'PREVISTA' || a.status === 'REALIZADA') && o.status !== 'CANCELADA') {
          add(a.executingTeacherId, o.modalityId, 'extraMin', a.minutes);
        }
        continue;
      }

      if (o.status === 'CANCELADA' || a.status === 'CANCELADA') {
        if (o.cancellationCountsHours) add(planned, o.modalityId, 'ownMin', o.plannedDurationMin);
        else add(planned, o.modalityId, 'cancelledMin', o.plannedDurationMin);
        continue;
      }
      if (o.status === 'AGUARDANDO_DECISAO_FERIADO') {
        add(planned, o.modalityId, 'pendingMin', o.plannedDurationMin);
        continue;
      }
      switch (a.status) {
        case 'PREVISTA':
        case 'REALIZADA':
          // Gestão por exceção: sem exceção registrada, a aula conta como dada.
          add(planned, o.modalityId, 'ownMin', a.minutes);
          break;
        case 'SUBSTITUIDA':
          add(planned, o.modalityId, 'absenceMin', o.plannedDurationMin, a.absenceReason ?? 'OUTRO');
          add(a.executingTeacherId, o.modalityId, 'substitutionMin', a.minutes);
          break;
        case 'AUSENTE_PENDENTE':
          add(planned, o.modalityId, 'absenceMin', o.plannedDurationMin, a.absenceReason ?? 'OUTRO');
          break;
      }
    }
  }
  return [...map.values()];
}

export function sumBuckets(rows: Bucket[]): Bucket {
  const t = emptyBucket();
  for (const r of rows) {
    for (const k of ['plannedMin', 'ownMin', 'substitutionMin', 'extraMin', 'absenceMin', 'cancelledMin', 'pendingMin', 'totalMin'] as const) t[k] += r[k];
  }
  return t;
}
