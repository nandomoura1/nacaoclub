import { normalizeName } from '../names';
import { resolveModality, resolveTeacher, suggestedTeacherName, type TeacherRef } from './resolve';
import type { ImportRow, PersonRole } from './types';

/**
 * Plano de importação — puro. Roda no navegador (prévia ao vivo) e no
 * servidor (confirmação) com os mesmos dados: o que o admin vê é o que grava.
 */
export interface ImportCatalog {
  modalities: { id: string; name: string; defaultDurationMin: number }[];
  spaces: { id: string; name: string }[];
  activityTypes: { id: string; kind: string }[];
  teachers: TeacherRef[];
}

/** Modalidade escolhida pelo admin para um texto da planilha, ou ignorar. */
export type ModalityOverrides = Record<string, string | 'ignore'>;

export type NameDecision =
  | { action: 'link'; teacherId: string }
  | { action: 'create'; name: string }
  | { action: 'same'; key: string }
  | { action: 'ignore' };
export type NameDecisions = Record<string, NameDecision>;

export interface PlannedSlot {
  refs: string[];
  sheet: string;
  weekday: number;
  startMin: number;
  durationMin: number;
  modalityId: string;
  activityTypeId: string;
  spaceId: string | null;
  label: string | null;
  /** `teacherId` existente ou `new:<chave>` para quem será cadastrado. */
  people: { ref: string; role: PersonRole }[];
}

export interface HintInfo { key: string; sheet: string; text: string; count: number; auto: { modalityId: string; label: string | null } | null }
export interface NameInfo { key: string; examples: string[]; count: number; auto: NameDecision }

/** Palavras que aparecem no lugar de um nome e não são ninguém. */
const PLACEHOLDERS = new Set(['estagiario', 'estagiaria', 'estagiarios', 'professor', 'professora', '?', 'x', 'a definir']);

export const hintKey = (sheet: string, text: string) => `${sheet}::${normalizeName(text)}`;
export const nameKey = (raw: string) => normalizeName(raw);

function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|\s)\p{L}/gu, (m) => m.toUpperCase());
}

function spaceFor(hint: string | null, spaces: ImportCatalog['spaces']): string | null {
  if (!hint) return null;
  const h = normalizeName(hint);
  const hit = spaces.find((s) => normalizeName(s.name) === h) ?? spaces.find((s) => normalizeName(s.name) === `sala ${h}`);
  return hit?.id ?? null;
}

type ModalityDecision = { modalityId: string; label: string | null } | 'ignore' | { unresolved: string };

function decideModality(row: ImportRow, cat: ImportCatalog, overrides: ModalityOverrides): { decision: ModalityDecision; key: string; text: string } {
  const pick = (text: string) => {
    const k = hintKey(row.sheet, text);
    const o = overrides[k];
    if (o === 'ignore') return { k, r: 'ignore' as const };
    if (o) return { k, r: { modalityId: o, label: null as string | null } };
    return { k, r: resolveModality(text, cat.modalities) };
  };

  if (row.activityText) {
    const p = pick(row.activityText);
    if (p.r === 'ignore') return { decision: 'ignore', key: p.k, text: row.activityText };
    if (p.r) {
      // Texto mapeado à mão ("Core" → Funcional) vira a turma.
      const label = p.r.label ?? (overrides[p.k] ? titleCase(row.activityText) : null);
      return { decision: { modalityId: p.r.modalityId, label }, key: p.k, text: row.activityText };
    }
    if (row.fallbackText) {
      const f = pick(row.fallbackText);
      if (f.r === 'ignore') return { decision: 'ignore', key: f.k, text: row.fallbackText };
      if (f.r) return { decision: { modalityId: f.r.modalityId, label: titleCase(row.activityText) }, key: f.k, text: row.fallbackText };
    }
    return { decision: { unresolved: p.k }, key: p.k, text: row.activityText };
  }
  const text = row.fallbackText ?? row.labelHint ?? '(sem modalidade)';
  const f = pick(text);
  if (f.r === 'ignore') return { decision: 'ignore', key: f.k, text };
  if (f.r) return { decision: { modalityId: f.r.modalityId, label: row.labelHint ? titleCase(row.labelHint) : f.r.label }, key: f.k, text };
  return { decision: { unresolved: f.k }, key: f.k, text };
}

/** Textos de modalidade encontrados, com o que o sistema reconheceu sozinho. */
export function collectHints(rows: ImportRow[], cat: ImportCatalog): HintInfo[] {
  const map = new Map<string, HintInfo>();
  for (const row of rows) {
    const { decision, key, text } = decideModality(row, cat, {});
    // Turma só é "do texto" quando o texto é a própria atividade; vinda da sala, ela varia por aula.
    const resolved = typeof decision === 'object' && 'modalityId' in decision ? decision : null;
    const auto = resolved ? { modalityId: resolved.modalityId, label: text === row.activityText ? resolved.label : null } : null;
    const cur = map.get(key) ?? { key, sheet: row.sheet, text, count: 0, auto };
    cur.count++;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => Number(a.auto !== null) - Number(b.auto !== null) || a.sheet.localeCompare(b.sheet) || a.text.localeCompare(b.text));
}

/** Nomes encontrados, com a decisão automática (vincular, cadastrar ou ignorar). */
export function collectNames(rows: ImportRow[], cat: ImportCatalog): NameInfo[] {
  const map = new Map<string, NameInfo>();
  for (const row of rows) {
    for (const p of row.people) {
      const key = nameKey(p.raw);
      if (!key) continue;
      const cur = map.get(key);
      if (cur) {
        cur.count++;
        if (cur.examples.length < 3 && !cur.examples.includes(p.raw)) cur.examples.push(p.raw);
        continue;
      }
      const teacherId = resolveTeacher(p.raw, cat.teachers);
      const auto: NameDecision = teacherId
        ? { action: 'link', teacherId }
        : PLACEHOLDERS.has(normalizeName(p.raw.replace(/\(.*?\)/g, '')))
          ? { action: 'ignore' }
          : { action: 'create', name: suggestedTeacherName(p.raw) };
      map.set(key, { key, examples: [p.raw], count: 1, auto });
    }
  }
  // "Ana (mobility)" e "Ana" viram a mesma pessoa nova — nunca dois cadastros com o mesmo nome.
  const byName = new Map<string, string>();
  const infos = [...map.values()].sort((a, b) => a.key.length - b.key.length || a.key.localeCompare(b.key));
  for (const info of infos) {
    if (info.auto.action !== 'create') continue;
    const n = normalizeName(info.auto.name);
    const canonical = byName.get(n);
    if (canonical) info.auto = { action: 'same', key: canonical };
    else byName.set(n, info.key);
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/** Segue "é a mesma pessoa que…" até um professor existente ou a criar. */
export function finalPerson(key: string, decisions: NameDecisions, seen = new Set<string>()): { ref: string } | null {
  const d = decisions[key];
  if (!d || d.action === 'ignore' || seen.has(key)) return null;
  if (d.action === 'link') return { ref: d.teacherId };
  if (d.action === 'create') return { ref: `new:${key}` };
  seen.add(key);
  return finalPerson(d.key, decisions, seen);
}

export interface ImportPlan {
  slots: PlannedSlot[];
  ignoredRows: number;
  unresolvedKeys: string[];
}

export function buildPlan(rows: ImportRow[], cat: ImportCatalog, overrides: ModalityOverrides, decisions: NameDecisions): ImportPlan {
  const typeByKind = new Map(cat.activityTypes.map((t) => [t.kind, t.id]));
  const durationOf = new Map(cat.modalities.map((m) => [m.id, m.defaultDurationMin]));
  const merged = new Map<string, PlannedSlot>();
  const unresolved = new Set<string>();
  let ignoredRows = 0;

  for (const row of rows) {
    const { decision } = decideModality(row, cat, overrides);
    if (decision === 'ignore') { ignoredRows++; continue; }
    if ('unresolved' in decision) { unresolved.add(decision.unresolved); continue; }

    const activityTypeId = typeByKind.get(row.kind) ?? typeByKind.get('AULA');
    if (!activityTypeId) { ignoredRows++; continue; }

    const people: PlannedSlot['people'] = [];
    for (const p of row.people) {
      const person = finalPerson(nameKey(p.raw), decisions);
      if (person && !people.some((x) => x.ref === person.ref)) people.push({ ref: person.ref, role: p.role });
    }

    const slot: PlannedSlot = {
      refs: [`${row.sheet}!${row.ref}`],
      sheet: row.sheet,
      weekday: row.weekday,
      startMin: row.startMin,
      durationMin: row.durationMin ?? durationOf.get(decision.modalityId) ?? 60,
      modalityId: decision.modalityId,
      activityTypeId,
      spaceId: spaceFor(row.spaceHint, cat.spaces),
      label: decision.label,
      people,
    };
    // A mesma aula citada duas vezes (mesmo dia/hora/modalidade/turma/espaço/pessoas) entra uma vez só.
    const k = JSON.stringify([slot.weekday, slot.startMin, slot.durationMin, slot.modalityId, slot.activityTypeId, slot.spaceId, slot.label, people.map((p) => p.ref).sort()]);
    const prev = merged.get(k);
    if (prev) prev.refs.push(...slot.refs);
    else merged.set(k, slot);
  }

  return { slots: [...merged.values()], ignoredRows, unresolvedKeys: [...unresolved] };
}

/** Horas por semana por pessoa: é o número para comparar com o "PADRÃO" da HORAS MENSAIS. */
export function weeklyByPerson(slots: PlannedSlot[], countsHours: (activityTypeId: string) => boolean) {
  const out = new Map<string, { count: number; minutes: number }>();
  for (const s of slots) {
    if (!countsHours(s.activityTypeId)) continue;
    for (const p of s.people) {
      const cur = out.get(p.ref) ?? { count: 0, minutes: 0 };
      cur.count++;
      cur.minutes += s.durationMin;
      out.set(p.ref, cur);
    }
  }
  return out;
}
