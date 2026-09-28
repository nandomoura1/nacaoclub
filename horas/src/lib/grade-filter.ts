/** Filtros da grade (tela e impressão usam o mesmo): modalidade, professor e espaço. */
export interface GradeFilters { modalityId: string | null; teacherId: string | null; spaceId: string | null }

export function filterGrade<T extends { modality: { id: string }; space: { id: string } | null; people: { teacherId: string }[] }>(items: T[], f: GradeFilters): T[] {
  return items.filter((g) =>
    (!f.modalityId || g.modality.id === f.modalityId) &&
    (!f.spaceId || g.space?.id === f.spaceId) &&
    (!f.teacherId || g.people.some((p) => p.teacherId === f.teacherId)));
}

export function gradeParams(p: { date: string; areaId: string | null } & GradeFilters): URLSearchParams {
  const sp = new URLSearchParams({ data: p.date });
  if (p.areaId) sp.set('area', p.areaId);
  if (p.modalityId) sp.set('modalidade', p.modalityId);
  if (p.teacherId) sp.set('professor', p.teacherId);
  if (p.spaceId) sp.set('espaco', p.spaceId);
  return sp;
}
