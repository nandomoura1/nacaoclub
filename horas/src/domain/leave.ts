/**
 * Ausência (férias, atestado, folga, falta) — puro. Decide o que acontece com
 * cada "cadeira" do professor nas aulas do período. Testado sem banco.
 */
export type LeaveType = 'FERIAS' | 'ATESTADO' | 'AFASTAMENTO' | 'FOLGA' | 'FALTA';
export type LeaveCoverage = 'PENDENTE' | 'CANCELAR' | 'SUBSTITUIR';
export type AbsenceReason = 'FALTA' | 'FERIAS' | 'ATESTADO' | 'FOLGA' | 'OUTRO';

export const LEAVE_LABEL: Record<LeaveType, string> = {
  FERIAS: 'Férias', ATESTADO: 'Atestado', AFASTAMENTO: 'Afastamento', FOLGA: 'Folga', FALTA: 'Falta',
};
export const COVERAGE_LABEL: Record<LeaveCoverage, string> = {
  SUBSTITUIR: 'Substituto dá as aulas', PENDENTE: 'Aguardando substituto', CANCELAR: 'Cancelar as aulas',
};

export const absenceReasonOf = (t: LeaveType): AbsenceReason =>
  t === 'AFASTAMENTO' ? 'OUTRO' : t;

/** Tipo da exceção registrada na aula (a trilha diz "férias", não "outro"). */
export const exceptionTypeOf = (t: LeaveType, coverage: LeaveCoverage) =>
  coverage === 'SUBSTITUIR' ? ('SUBSTITUICAO' as const) : t === 'AFASTAMENTO' ? ('OUTRO' as const) : t;

export interface AssignmentState {
  status: 'PREVISTA' | 'REALIZADA' | 'SUBSTITUIDA' | 'CANCELADA' | 'AUSENTE_PENDENTE';
  executingTeacherId: string | null;
  absenceReason: AbsenceReason | null;
}

/** A cadeira só muda se estava como prevista/dada pelo próprio professor. */
export function isAffectable(a: AssignmentState & { plannedTeacherId: string | null }, teacherId: string, occurrenceStatus: string): boolean {
  return a.plannedTeacherId === teacherId
    && (a.status === 'PREVISTA' || a.status === 'REALIZADA')
    && (occurrenceStatus === 'PREVISTA' || occurrenceStatus === 'REALIZADA');
}

export function leaveEffect(leave: { type: LeaveType; coverage: LeaveCoverage; substituteId: string | null }): AssignmentState {
  const absenceReason = absenceReasonOf(leave.type);
  if (leave.coverage === 'SUBSTITUIR') return { status: 'SUBSTITUIDA', executingTeacherId: leave.substituteId, absenceReason };
  if (leave.coverage === 'CANCELAR') return { status: 'CANCELADA', executingTeacherId: null, absenceReason };
  return { status: 'AUSENTE_PENDENTE', executingTeacherId: null, absenceReason };
}

/** Duas ausências ativas do mesmo professor não podem se sobrepor. */
export function overlaps(a: { start: string; end: string }, b: { start: string; end: string }): boolean {
  return a.start <= b.end && b.start <= a.end;
}
