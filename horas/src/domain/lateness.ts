/**
 * Atraso do professor horista (decisão 24/11) — puro. 1h de atraso = 1h a menos na carga horária:
 * desconta dos minutos das aulas do dia, a partir da primeira (se o atraso passa de uma aula, segue na seguinte).
 */
export interface LateClass { assignmentId: string; startMin: number; minutes: number }
export interface LateApplied { assignmentId: string; before: number; after: number }

export function applyLateness(classes: LateClass[], lateMin: number): { applied: LateApplied[]; rest: number } {
  let rest = lateMin;
  const applied: LateApplied[] = [];
  for (const c of [...classes].sort((a, b) => a.startMin - b.startMin)) {
    if (rest <= 0) break;
    if (c.minutes <= 0) continue;
    const cut = Math.min(c.minutes, rest);
    applied.push({ assignmentId: c.assignmentId, before: c.minutes, after: c.minutes - cut });
    rest -= cut;
  }
  return { applied, rest };
}

/** "1:30", "90", "1h30", "45min" → minutos (null = inválido). */
export function parseLateness(v: string): number | null {
  const t = v.trim().toLowerCase().replace(/\s+/g, '');
  let m = /^(\d{1,2})[:h](\d{1,2})?m?(in)?$/.exec(t);
  if (m) return Number(m[1]) * 60 + Number(m[2] ?? 0);
  m = /^(\d{1,3})(m|min)?$/.exec(t);
  if (m) return Number(m[1]);
  return null;
}
