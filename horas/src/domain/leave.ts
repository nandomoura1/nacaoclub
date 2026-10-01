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

/**
 * A cadeira só muda se estava como prevista/dada pelo próprio professor. A
 * substituição de uma aula específica também resolve a cadeira que as férias
 * deixaram "aguardando substituto".
 */
export function isAffectable(a: AssignmentState & { plannedTeacherId: string | null }, teacherId: string, occurrenceStatus: string, resolvesPending = false): boolean {
  return a.plannedTeacherId === teacherId
    && (a.status === 'PREVISTA' || a.status === 'REALIZADA' || (resolvesPending && a.status === 'AUSENTE_PENDENTE'))
    && (occurrenceStatus === 'PREVISTA' || occurrenceStatus === 'REALIZADA');
}

/**
 * Anular uma ausência: a cadeira só volta se ainda está como a ausência a
 * deixou (uma substituição lançada depois, por cima, é preservada). Se o
 * "antes" era aguardando substituto de férias que já não existem, volta ao previsto.
 */
export function revertState(
  current: { status: string; executingTeacherId: string | null },
  after: { status?: string; executingTeacherId?: string | null },
  before: { status?: string; executingTeacherId?: string | null; absenceReason?: string | null },
  plannedTeacherId: string | null,
  pendingStillCovered: boolean,
): { status: string; executingTeacherId: string | null; absenceReason: string | null } | null {
  if (after.status && (current.status !== after.status || (current.executingTeacherId ?? null) !== (after.executingTeacherId ?? null))) return null;
  if (before.status === 'AUSENTE_PENDENTE' && !pendingStillCovered) return { status: 'PREVISTA', executingTeacherId: plannedTeacherId, absenceReason: null };
  return { status: before.status ?? 'PREVISTA', executingTeacherId: before.executingTeacherId ?? null, absenceReason: before.absenceReason ?? null };
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
