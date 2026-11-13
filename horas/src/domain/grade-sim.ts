import { addDays, weekdayOf, type IsoDate } from './dates';

/**
 * Simulação de grade (puro): um rascunho da grade inteira que dá para editar à vontade,
 * comparar horas com a grade atual e, se aprovado, implantar a partir de uma data —
 * virando as mesmas operações da grade ("criar", "alterar a partir de", "encerrar a partir de").
 */

export type SimRole = 'TITULAR' | 'AUXILIAR' | 'ESTAGIARIO';
export interface SimPerson { teacherId: string; role: SimRole }
export interface SimItem {
  /** Chave estável na simulação (slotId para aulas que já existem; aleatória para novas). */
  key: string;
  /** Aula real que esta linha representa (null = aula nova). */
  slotId: string | null;
  /** Versão da aula real quando a simulação foi criada (para saber se alguém mexeu depois). */
  baseVersionId: string | null;
  weekday: number;
  startMin: number;
  durationMin: number;
  modalityId: string;
  activityTypeId: string;
  spaceId: string | null;
  label: string | null;
  people: SimPerson[];
  /** Marcada para sair da grade. */
  removed?: boolean;
}

const sameContent = (a: SimItem, b: SimItem) =>
  a.weekday === b.weekday && a.startMin === b.startMin && a.durationMin === b.durationMin && a.modalityId === b.modalityId &&
  a.activityTypeId === b.activityTypeId && (a.spaceId ?? null) === (b.spaceId ?? null) && (a.label ?? null) === (b.label ?? null) &&
  peopleKey(a.people) === peopleKey(b.people);
/** Pessoas comparadas pelo conteúdo (o banco JSONB reordena as chaves dos objetos). */
const peopleKey = (ps: SimPerson[]) => ps.map((p) => `${p.teacherId}:${p.role}`).sort().join('|');

export type ItemState = 'igual' | 'nova' | 'alterada' | 'removida';
/** Situação de cada linha da simulação em relação à grade-base. */
export function itemState(item: SimItem, base: Map<string, SimItem>): ItemState {
  if (!item.slotId) return item.removed ? 'igual' : 'nova';
  const b = base.get(item.slotId);
  if (!b) return item.removed ? 'igual' : 'nova'; // aula que não existia na grade de comparação
  if (item.removed) return 'removida';
  return sameContent(item, b) ? 'igual' : 'alterada';
}

export interface Plan {
  create: SimItem[];
  change: SimItem[];
  end: SimItem[];
  /** Aulas que alguém mexeu na grade real depois da simulação (a simulação vai sobrescrever). */
  conflicts: { item: SimItem; reason: string }[];
  /** Aulas que entraram na grade real depois da simulação: ficam como estão. */
  untouched: SimItem[];
}

/**
 * O que fazer para a grade real (`current`, na data da implantação) ficar igual à simulação.
 * Aula alterada só na simulação → alterar; removida → encerrar; nova → criar.
 */
export function planFrom(sim: SimItem[], current: SimItem[]): Plan {
  const cur = new Map(current.filter((c) => c.slotId).map((c) => [c.slotId!, c]));
  const plan: Plan = { create: [], change: [], end: [], conflicts: [], untouched: [] };
  const seen = new Set<string>();
  for (const it of sim) {
    if (!it.slotId) { if (!it.removed) plan.create.push(it); continue; }
    seen.add(it.slotId);
    const c = cur.get(it.slotId);
    if (!c) {
      // Saiu da grade real nesse meio-tempo: se a simulação ainda quer a aula, ela volta como nova.
      if (!it.removed) { plan.create.push({ ...it, slotId: null }); plan.conflicts.push({ item: it, reason: 'foi encerrada na grade depois da simulação — vai ser criada de novo' }); }
      continue;
    }
    const touchedSince = it.baseVersionId !== null && c.baseVersionId !== it.baseVersionId;
    if (it.removed) {
      plan.end.push(it);
      if (touchedSince) plan.conflicts.push({ item: it, reason: 'mudou na grade depois da simulação — vai ser encerrada mesmo assim' });
    } else if (!sameContent(it, c)) {
      plan.change.push(it);
      if (touchedSince) plan.conflicts.push({ item: it, reason: 'mudou na grade depois da simulação — a versão da simulação vai valer' });
    }
  }
  for (const c of current) if (c.slotId && !seen.has(c.slotId)) plan.untouched.push(c);
  return plan;
}

/** Grade que vai valer depois da implantação (simulação + aulas novas da grade real que ela não conhece). */
export function resulting(sim: SimItem[], plan: Plan): SimItem[] {
  return [...sim.filter((s) => !s.removed), ...plan.untouched];
}

// ── Horas ─────────────────────────────────────────────────────

/** Minutos por semana de cada professor (cada pessoa recebe a duração cheia; só tipos que contam hora). */
export function weeklyMinutes(items: SimItem[], countsHours: (activityTypeId: string) => boolean): Map<string, number> {
  const out = new Map<string, number>();
  for (const it of items) {
    if (it.removed || !countsHours(it.activityTypeId)) continue;
    for (const p of it.people) out.set(p.teacherId, (out.get(p.teacherId) ?? 0) + it.durationMin);
  }
  return out;
}

/** Competência que contém a data: 26 do mês anterior → 25 do mês. */
export function periodOf(date: IsoDate): { start: IsoDate; end: IsoDate; label: string } {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  let ey = y, em = m;
  if (d >= 26) { em += 1; if (em > 12) { em = 1; ey += 1; } }
  const sy = em === 1 ? ey - 1 : ey, sm = em === 1 ? 12 : em - 1;
  const pad = (n: number) => String(n).padStart(2, '0');
  const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return { start: `${sy}-${pad(sm)}-26`, end: `${ey}-${pad(em)}-25`, label: `${MONTHS[em - 1]}/${String(ey).slice(2)}` };
}

/** Quantas vezes cada dia da semana (1–7) aparece no intervalo (inclusive). */
export function weekdayCounts(start: IsoDate, end: IsoDate): Record<number, number> {
  const out: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 };
  for (let d = start; d <= end; d = addDays(d, 1)) out[weekdayOf(d)]! += 1;
  return out;
}

/** Minutos na competência inteira (sem descontar feriados e ausências: é projeção). */
export function periodMinutes(items: SimItem[], countsHours: (id: string) => boolean, counts: Record<number, number>): Map<string, number> {
  const out = new Map<string, number>();
  for (const it of items) {
    if (it.removed || !countsHours(it.activityTypeId)) continue;
    for (const p of it.people) out.set(p.teacherId, (out.get(p.teacherId) ?? 0) + it.durationMin * (counts[it.weekday] ?? 0));
  }
  return out;
}

export interface HoursRow { teacherId: string; current: number; simulated: number; delta: number }
/** Comparação por professor (minutos), da maior diferença para a menor. */
export function compareHours(current: Map<string, number>, simulated: Map<string, number>): HoursRow[] {
  const ids = new Set([...current.keys(), ...simulated.keys()]);
  return [...ids].map((teacherId) => {
    const c = current.get(teacherId) ?? 0, s = simulated.get(teacherId) ?? 0;
    return { teacherId, current: c, simulated: s, delta: s - c };
  }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || b.simulated - a.simulated);
}

/** Troca uma pessoa por outra em todas as aulas da simulação (mantém o papel; não duplica). */
export function replaceTeacher(items: SimItem[], fromId: string, toId: string): { items: SimItem[]; count: number } {
  let count = 0;
  const next = items.map((it) => {
    if (it.removed || !it.people.some((p) => p.teacherId === fromId)) return it;
    count++;
    const already = it.people.some((p) => p.teacherId === toId);
    const people = already ? it.people.filter((p) => p.teacherId !== fromId) : it.people.map((p) => (p.teacherId === fromId ? { ...p, teacherId: toId } : p));
    return { ...it, people };
  });
  return { items: next, count };
}

/**
 * Copia as aulas de um dia da semana para outros (ex.: quarta = segunda nas Aulas Coletivas).
 * `match` limita às aulas de uma área/modalidade. `replace`: as aulas que já existiam no dia de
 * destino (dentro do mesmo filtro) saem — as da grade real ficam marcadas para sair, as novas somem.
 * As cópias nascem como aulas novas (mesmo horário, modalidade, tipo, espaço, turma e pessoas)
 * e podem ser ajustadas ou excluídas uma a uma depois.
 */
export function copyWeekday(
  items: SimItem[], fromDay: number, toDays: number[], opts: { match?: (it: SimItem) => boolean; replace: boolean; newKey: () => string },
): { items: SimItem[]; copied: number; removed: number } {
  const match = opts.match ?? (() => true);
  const targets = [...new Set(toDays)].filter((d) => d !== fromDay && d >= 1 && d <= 7);
  const source = items.filter((i) => !i.removed && i.weekday === fromDay && match(i));
  let removed = 0;
  let next = items;
  if (opts.replace) {
    next = items.flatMap((i) => {
      if (i.removed || !targets.includes(i.weekday) || !match(i)) return [i];
      removed++;
      return i.slotId ? [{ ...i, removed: true }] : [];
    });
  }
  // Aula da grade real que estava no destino no mesmo horário e modalidade é reaproveitada (vira "igual" ou
  // "alterada" em vez de encerrar uma e criar outra): o histórico da aula continua o mesmo.
  const reuse = new Map<string, SimItem>();
  if (opts.replace) for (const i of next) if (i.removed && i.slotId && targets.includes(i.weekday) && match(i)) {
    const k = `${i.weekday}|${i.startMin}|${i.modalityId}`;
    if (!reuse.has(k)) reuse.set(k, i);
  }
  const reused = new Map<string, SimItem>();
  const copies: SimItem[] = [];
  for (const d of targets) for (const src of source) {
    const fields = { weekday: d, startMin: src.startMin, durationMin: src.durationMin, modalityId: src.modalityId, activityTypeId: src.activityTypeId, spaceId: src.spaceId, label: src.label, people: src.people.map((p) => ({ ...p })), removed: false };
    const old = reuse.get(`${d}|${src.startMin}|${src.modalityId}`);
    if (old && !reused.has(old.key)) { reused.set(old.key, { ...old, ...fields }); continue; }
    copies.push({ ...src, ...fields, key: opts.newKey(), slotId: null, baseVersionId: null });
  }
  next = next.map((i) => reused.get(i.key) ?? i);
  return { items: [...next, ...copies], copied: copies.length + reused.size, removed: removed - reused.size };
}
