/** Filtros da grade (tela e impressão usam o mesmo): modalidades (uma ou várias), professor e espaço. */
export interface GradeFilters { modalityIds: string[]; teacherId: string | null; spaceId: string | null }

export function filterGrade<T extends { modality: { id: string }; space: { id: string } | null; people: { teacherId: string }[] }>(items: T[], f: GradeFilters): T[] {
  const mods = new Set(f.modalityIds);
  return items.filter((g) =>
    (!mods.size || mods.has(g.modality.id)) &&
    (!f.spaceId || g.space?.id === f.spaceId) &&
    (!f.teacherId || g.people.some((p) => p.teacherId === f.teacherId)));
}

/** `?modalidade=a,b` → só os ids que existem (vazio = todas). */
export function parseModalities(param: string | undefined, valid: (id: string) => boolean): string[] {
  return [...new Set((param ?? '').split(',').map((s) => s.trim()).filter((id) => id && valid(id)))];
}

/** `?area=a,b` → áreas (uma ou várias; vazio = todas). */
export const parseAreas = parseModalities;

export function gradeParams(p: { date: string; areaIds: string[] } & GradeFilters): URLSearchParams {
  const sp = new URLSearchParams({ data: p.date });
  if (p.areaIds.length) sp.set('area', p.areaIds.join(','));
  if (p.modalityIds.length) sp.set('modalidade', p.modalityIds.join(','));
  if (p.teacherId) sp.set('professor', p.teacherId);
  if (p.spaceId) sp.set('espaco', p.spaceId);
  return sp;
}
