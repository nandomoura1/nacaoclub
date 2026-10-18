/**
 * Impressão da grade (puro): quem aparece em cada aula e como.
 *  - "todos": titulares e auxiliares/estagiários (auxiliar com *).
 *  - "professores": só titulares que não são estagiários, com o nº do CREF
 *    (documento CREF da pasta do professor) — a versão para afixar/fiscalização.
 */
export type PrintMode = 'todos' | 'professores';

export interface PrintPerson { teacherId: string; role: string; name: string; leave: { type: string; substitute: string | null } | null }
export interface TeacherInfo { intern: boolean; cref: string | null }
export interface PrintLine { name: string; cref: string | null; aux: boolean; note: string | null }

/** "012345-G/DF" → "CREF 012345-G/DF" (sem duplicar o prefixo). */
export function formatCref(n: string | null | undefined): string | null {
  const v = n?.trim().replace(/\s+/g, ' ');
  if (!v) return null;
  return /^cref\b/i.test(v) ? v.replace(/^cref\b:?\s*/i, 'CREF ') : `CREF ${v}`;
}

export function printLines(people: PrintPerson[], mode: PrintMode, info: Map<string, TeacherInfo>, leaveLabel: (type: string) => string): PrintLine[] {
  const shown = mode === 'professores'
    ? people.filter((p) => p.role === 'TITULAR' && !info.get(p.teacherId)?.intern)
    : people;
  return shown.map((p) => ({
    name: p.name,
    cref: mode === 'professores' ? formatCref(info.get(p.teacherId)?.cref) : null,
    aux: mode === 'todos' && p.role !== 'TITULAR',
    note: p.leave ? `${leaveLabel(p.leave.type).toLowerCase()}${p.leave.substitute ? ` → ${p.leave.substitute}` : ''}` : null,
  }));
}

/** Tamanho da letra para caber numa página A4 deitada (mais horários/aulas = menor). */
export function printDensity(rows: number, maxPerCell: number): 'normal' | 'compacta' | 'mini' {
  const load = rows * Math.max(1, maxPerCell);
  return load > 40 || rows > 16 ? 'mini' : load > 22 || rows > 11 ? 'compacta' : 'normal';
}
