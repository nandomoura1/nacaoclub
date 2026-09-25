import { normalizeName } from '../names';

/**
 * Casa textos da planilha com o cadastro — puro, testável.
 *   "Mobilidade Master" → Mobilidade + turma "Master"
 *   "Jiu Jitsu Kids"    → Jiu-Jitsu + turma "Kids"
 *   "natação"           → Natação Kids (única modalidade que começa assim)
 */
export interface NamedRef { id: string; name: string }

const key = (s: string) => normalizeName(s).replace(/-/g, ' ').replace(/\s+/g, ' ').trim();

function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|\s)\p{L}/gu, (m) => m.toUpperCase());
}

export function resolveModality(text: string, modalities: NamedRef[]): { modalityId: string; label: string | null } | null {
  const t = key(text);
  if (!t) return null;
  const exact = modalities.find((m) => key(m.name) === t);
  if (exact) return { modalityId: exact.id, label: null };

  // Modalidade mais longa que é prefixo do texto: o resto vira turma.
  const prefix = modalities
    .filter((m) => t.startsWith(`${key(m.name)} `))
    .sort((a, b) => key(b.name).length - key(a.name).length)[0];
  if (prefix) {
    const rest = text.trim().slice(prefix.name.length).trim() || text.trim().split(/\s+/).slice(key(prefix.name).split(' ').length).join(' ');
    return { modalityId: prefix.id, label: rest ? titleCase(rest) : null };
  }

  // Texto é prefixo de UMA modalidade só ("natação" → "Natação Kids").
  const longer = modalities.filter((m) => key(m.name).startsWith(`${t} `));
  if (longer.length === 1) return { modalityId: longer[0]!.id, label: null };
  return null;
}

export interface TeacherRef { id: string; name: string; displayName: string | null; aliases: string[] }

/** "Ana (mobility)" → Ana; "ANDRÉ EST" só casa se houver apelido. */
export function resolveTeacher(raw: string, teachers: TeacherRef[]): string | null {
  const direct = normalizeName(raw);
  const bare = normalizeName(raw.replace(/\(.*?\)/g, ''));
  for (const candidate of [direct, bare]) {
    if (!candidate) continue;
    const hit =
      teachers.find((t) => t.aliases.includes(candidate)) ??
      teachers.find((t) => normalizeName(t.name) === candidate) ??
      teachers.find((t) => t.displayName && normalizeName(t.displayName) === candidate);
    if (hit) return hit.id;
  }
  // Primeiro nome único ("Rafael" → "Rafael Junqueira") só se não houver ambiguidade.
  const first = teachers.filter((t) => normalizeName(t.name).split(' ')[0] === bare);
  return first.length === 1 ? first[0]!.id : null;
}

/** Nome sugerido para cadastrar alguém que a planilha cita: "PEDRO AGUIAR" → "Pedro Aguiar". */
export function suggestedTeacherName(raw: string): string {
  return titleCase(raw.replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim());
}
