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

// ── Texto da grade por pessoa (WhatsApp) ────────────────────────

export interface TextClass { weekday: number; startMin: number; durationMin: number; modality: string; people: { teacherId: string; name: string }[] }

const DAY = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
/** 300 → "5h"; 330 → "5h30". */
export const clockShort = (min: number) => `${Math.floor(min / 60)}h${min % 60 ? String(min % 60).padStart(2, '0') : ''}`;

/** [1,2,3,4,5] → "Seg a Sex"; [1,3,5] → "Seg, Qua e Sex"; [1,2,3,5] → "Seg a Qua e Sex". */
export function daysLabel(days: number[]): string {
  const d = [...new Set(days)].sort((a, b) => a - b);
  const runs: string[] = [];
  for (let i = 0; i < d.length;) {
    let j = i;
    while (j + 1 < d.length && d[j + 1] === d[j]! + 1) j++;
    runs.push(j - i >= 2 ? `${DAY[d[i]! - 1]} a ${DAY[d[j]! - 1]}` : j > i ? `${DAY[d[i]! - 1]}, ${DAY[d[j]! - 1]}` : DAY[d[i]! - 1]!);
    i = j + 1;
  }
  const parts = runs.join(', ').split(', ');
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} e ${parts.at(-1)}` : parts[0] ?? '';
}

/** Blocos contínuos do dia: aulas encostadas (ou sobrepostas) viram um período só. */
function blocks(cls: { startMin: number; durationMin: number }[]): [number, number][] {
  const out: [number, number][] = [];
  for (const c of [...cls].sort((a, b) => a.startMin - b.startMin)) {
    const end = c.startMin + c.durationMin, last = out.at(-1);
    if (last && c.startMin <= last[1]) last[1] = Math.max(last[1], end);
    else out.push([c.startMin, end]);
  }
  return out;
}

/**
 * Agenda de uma pessoa em texto curto: dias com o mesmo horário são juntados.
 * Ex.: "Seg a Sex - 5h às 8h" · "Seg a Sex - 5h às 8h e 17h às 20h; Sáb - 8h às 10h".
 */
export function personSchedule(cls: { weekday: number; startMin: number; durationMin: number }[]): string {
  const byDay = new Map<number, string>();
  for (let d = 1; d <= 7; d++) {
    const b = blocks(cls.filter((c) => c.weekday === d));
    if (b.length) byDay.set(d, b.map(([s, e]) => `${clockShort(s)} às ${clockShort(e)}`).join(' e '));
  }
  const groups = new Map<string, number[]>();
  for (const [d, h] of byDay) groups.set(h, [...(groups.get(h) ?? []), d]);
  return [...groups].sort((a, b) => a[1][0]! - b[1][0]!).map(([h, ds]) => `${daysLabel(ds)} - ${h}`).join('; ');
}

/**
 * Grade em texto para WhatsApp, por pessoa, separada em Professores e Estagiários.
 * `modalities`: mostra as modalidades de cada um entre parênteses.
 */
export function gradeTeamText(classes: TextClass[], info: Map<string, { intern: boolean }>, opts: { title: string; modalities?: boolean }): string {
  const people = new Map<string, { name: string; cls: TextClass[] }>();
  for (const c of classes) for (const p of c.people) {
    const cur = people.get(p.teacherId) ?? { name: p.name, cls: [] };
    cur.cls.push(c);
    people.set(p.teacherId, cur);
  }
  const line = ([id, p]: [string, { name: string; cls: TextClass[] }]) => {
    void id;
    const mods = opts.modalities ? ` (${[...new Set(p.cls.map((c) => c.modality))].sort().join(', ')})` : '';
    return `• *${p.name.trim()}*${mods} - ${personSchedule(p.cls)}`;
  };
  const sorted = [...people].sort((a, b) => a[1].name.localeCompare(b[1].name, 'pt-BR'));
  const pros = sorted.filter(([id]) => !info.get(id)?.intern), interns = sorted.filter(([id]) => info.get(id)?.intern);
  const out = [`📋 *${opts.title}*`];
  if (pros.length) out.push('', '*Professores*', ...pros.map(line));
  if (interns.length) out.push('', '*Estagiários*', ...interns.map(line));
  if (!pros.length && !interns.length) out.push('', '_Nenhuma aula com esses filtros._');
  return out.join('\n');
}
