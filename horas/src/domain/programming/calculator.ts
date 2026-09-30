import type { SessionBlock } from './history';
import { MOVEMENT, detectMovements, type MovementDef } from './movements';
import { strengthScheme, wodFormat } from './dna';
import {
  LEVEL_RATIO, PATTERNS, REPS_PER_M, impactPerUnit, paceOf, patternWeights,
  type Level, type Pattern, type Unit,
} from './taxonomy';

/**
 * CALCULADORA DE MOVIMENTOS (blueprint, seção 5): transforma um bloco de
 * treino em volume por movimento, por padrão, impacto e tonelagem.
 *
 * Exato quando o formato tem fim fixo (rounds, escada, chipper, EMOM);
 * estimado quando depende do atleta (AMRAP, intervalos, estações por tempo),
 * usando o ritmo RX da taxonomia e 10% do tempo em transições.
 */

export interface LineVolume {
  def: MovementDef;
  unit: Unit;
  /** Total por atleta no bloco. */
  qty: number;
  /** Carga RX por rep (kg), feminina e masculina, se prescrita. */
  loadKg: { f: number; m: number } | null;
}

export interface BlockVolume {
  kind: 'exato' | 'estimado' | 'sem-leitura';
  /** Rounds usados (estimados no AMRAP). */
  rounds: number | null;
  athletes: number;
  lines: LineVolume[];
  totals: { reps: number; m: number; cal: number };
  /** Reps-equivalentes por padrão (metros convertidos quando faz sentido). */
  patterns: Partial<Record<Pattern, number>>;
  runM: number;
  ergCal: number;
  impact: number;
  /** Tonelagem por atleta RX (kg), por sexo. */
  tonnage: { f: number; m: number };
  /** Força em % do RM: Σ reps × %RM ("reps-RM"). */
  relVolume: number | null;
}

const PARTS = /\s+\+\s+/;
const span = (a: number, b: number) => Array.from({ length: Math.abs(b - a) + 1 }, (_, i) => (a <= b ? a + i : a - i));
const num = (s: string) => Number(s.replace(',', '.'));

/** Par de cargas "29/43kg", "15/22,5kg", "93/65", "35/50lb" → {f, m} em kg. */
export function loadPair(text: string): { f: number; m: number } | null {
  const t = text.toLowerCase();
  const x = t.match(/(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)\s*(kg|lbs?|lb)\b/) ?? t.match(/kg:?\s*(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)/);
  if (!x) return null;
  const k = x[3]?.startsWith('lb') ? 0.4536 : 1;
  const a = num(x[1]!) * k, b = num(x[2]!) * k;
  return { f: Math.round(Math.min(a, b) * 10) / 10, m: Math.round(Math.max(a, b) * 10) / 10 };
}

/** Quantidade no começo do item: "15", "24/30 cal", "400m", "15-12-9", "1:00", "30s". */
export function leadingQty(item: string): { qty: number; unit: Unit; seq: number[] | null; time: boolean } | null {
  const t = item.trim().toLowerCase().replace(/^min\s*\d+\s*/, '').replace(/^(max|máx)\s+/, '');
  const time = t.match(/^(\d+)?:(\d{2})\b|^(\d+)\s*(?:'|min\b)(?!\s*(?:rounds?|x))|^(\d+)\s*(?:s|seg|sec|")(?=\s|$)/);
  if (time) {
    const s = time[2] ? Number(time[1] ?? 0) * 60 + Number(time[2]) : time[3] ? Number(time[3]) * 60 : Number(time[4]);
    return { qty: s, unit: 's', seq: null, time: true };
  }
  const seq = t.match(/^(\d+(?:\s*-\s*\d+){2,})\b/);
  if (seq) {
    const xs = seq[1]!.split('-').map((x) => Number(x.trim()));
    return { qty: xs.reduce((s, x) => s + x, 0), unit: 'reps', seq: xs, time: false };
  }
  const q = t.match(/^(\d+(?:[.,]\d+)?)(?:\s*\/\s*(\d+(?:[.,]\d+)?))?\s*(m\b|km\b|cal\b|calories\b|reps?\b)?/);
  if (!q) return null;
  let qty = q[2] ? (num(q[1]!) + num(q[2])) / 2 : num(q[1]!);
  let unit: Unit = 'reps';
  if (q[3]?.startsWith('m')) unit = 'm';
  else if (q[3] === 'km') { unit = 'm'; qty *= 1000; }
  else if (q[3]?.startsWith('cal')) unit = 'cal';
  return { qty, unit, seq: null, time: false };
}

interface Station { def: MovementDef; perRound: number; unit: Unit; load: { f: number; m: number } | null; timed: boolean }

/** Itens do bloco → estações (movimento + quantidade por round). */
function stations(items: string[]): { list: Station[]; noQty: { def: MovementDef; load: Station['load'] }[]; ladderItems: Station[] } {
  const list: Station[] = [];
  const noQty: { def: MovementDef; load: Station['load'] }[] = [];
  const ladderItems: Station[] = [];
  const lastLoad = new Map<string, { f: number; m: number }>();
  for (const raw of items) {
    // "20m HSW / 40m DB OH walk": vale a primeira opção (RX). "(2 pull-up)" é adaptação.
    const clean = raw.replace(/\([^)]*\)/g, ' ');
    for (const part of clean.split(PARTS)) {
      const first = part.split(/\s+\/\s+(?=\d)/)[0]!;
      const defs = detectMovements(first);
      if (!defs.length) continue;
      const def = defs[0]!;
      const q = leadingQty(first);
      const load = loadPair(first) ?? lastLoad.get(def.id) ?? null;
      if (load) lastLoad.set(def.id, load);
      if (!q) { noQty.push({ def, load }); continue; }
      let { qty, unit } = q;
      if (def.id === 'shuttle-run' && unit === 'reps') { qty *= 20; unit = 'm'; }
      if (def.id === 'run' && unit === 'reps' && qty >= 100) unit = 'm';
      if (def.family === 'row' || def.family === 'bike' || def.family === 'ski') unit = unit === 'reps' ? (qty >= 100 && !/cal/.test(first) ? 'm' : 'cal') : unit;
      const st: Station = { def, perRound: qty, unit, load, timed: q.time };
      (q.seq ? ladderItems : list).push(st);
    }
  }
  return { list, noQty, ladderItems };
}

const roundSeconds = (sts: Station[]) => sts.reduce((s, x) => s + (x.timed ? x.perRound : x.perRound * paceOf(x.def, x.unit)), 0);

/** Reps de uma estação por tempo ("1:00 wall ball") para um atleta RX. */
const timedUnit = (d: MovementDef): Unit => (['row', 'bike', 'ski'].includes(d.family) ? 'cal' : d.family === 'run' || d.id === 'hs-walk' || d.family === 'carry' ? 'm' : 'reps');
const timedReps = (x: Station) => (x.perRound * 0.85) / paceOf(x.def, timedUnit(x.def));
const unitOf = (x: Station) => (x.timed ? timedUnit(x.def) : x.unit);

function athletesOf(b: SessionBlock): number {
  if (b.tags.includes('trio')) return 3;
  if (b.tags.includes('partner') || /partner|dupla/i.test(b.title)) return 2;
  return 1;
}

/** Volume de um WOD (ou cardio/acessório com itens). */
export function wodVolume(b: SessionBlock): BlockVolume {
  const title = b.title.toLowerCase();
  const fmt = wodFormat(b);
  const { list, noQty, ladderItems } = stations(b.items);
  const athletes = athletesOf(b);
  const minutes = b.minutes ?? null;
  const range = title.match(/\b(\d+)\s*-\s*(\d+)\b(?!\s*-)(?=[^']*(?:ladder|$))/);
  const ladder = title.match(/\b(\d+(?:\s*-\s*\d+){2,})\b/)?.[1]?.split('-').map((x) => Number(x.trim()))
    ?? (range && /for time|ladder/.test(title) ? span(Number(range[1]), Number(range[2])) : undefined);
  const ascending = /\d+-\d+-\d+-\d+-\d+\.{2,}|\+\s*\d+\s*reps?\s*\/\s*round|add(ing)? \d+ rep|\+1 rep/.test(title);
  const roundsMatch = title.match(/(\d+)\s*(?:rounds?|rft|x\b)/);
  let rounds = roundsMatch && Number(roundsMatch[1]) <= 30 ? Number(roundsMatch[1]) : 1;
  let kind: BlockVolume['kind'] = 'exato';
  const out = new Map<string, LineVolume>();
  const add = (def: MovementDef, unit: Unit, qty: number, loadKg: { f: number; m: number } | null) => {
    const key = `${def.id}|${unit}`;
    const cur = out.get(key);
    if (cur) { cur.qty += qty; cur.loadKg = cur.loadKg ?? loadKg; } else out.set(key, { def, unit, qty, loadKg });
  };

  if (!list.length && !ladderItems.length && !(ladder && noQty.length)) {
    return finish(b, { kind: 'sem-leitura', rounds: null, athletes, lines: [] });
  }

  if (ladder && noQty.length) {
    // "For time 21-15-9 | thruster; pull-up": itens sem número seguem a escada;
    // itens com número ("400m run", "2 wall walk após cada set") repetem por degrau.
    const sum = ladder.reduce((s, x) => s + x, 0);
    for (const { def, load } of noQty) add(def, def.family === 'run' ? 'm' : 'reps', sum, load);
    for (const x of list) add(x.def, x.unit, x.perRound * ladder.length, x.load);
    rounds = ladder.length;
  } else if (fmt === 'AMRAP' || /on a \d|intervalad|on\s*\/?\s*\d*'?\s*off|max/.test(title) && !roundsMatch) {
    kind = 'estimado';
    const work = workMinutes(title, minutes);
    // Item sem número no AMRAP: 1 rep na escada crescente, senão 5 reps [HIPÓTESE].
    const guessed = noQty.map(({ def, load }): Station => ({ def, load, timed: false, unit: def.family === 'run' ? 'm' : 'reps', perRound: def.family === 'run' ? 200 : ascending ? 1 : 5 }));
    const all = [...list, ...ladderItems, ...guessed];
    const sec = roundSeconds(all);
    if (!work || !sec) return finish(b, { kind: 'sem-leitura', rounds: null, athletes, lines: [] });
    const budget = work * 60 * 0.9 * athletes;
    let est: number;
    if (ascending) {
      // AMRAP crescente: rounds cujo custo acumulado cabe no tempo.
      const inc = Number(title.match(/\+\s*(\d+)/)?.[1] ?? 1);
      const base = sec, step = all.reduce((s, x) => s + inc * paceOf(x.def, x.unit), 0);
      let n = 0, used = 0;
      while (used + base + n * step <= budget && n < 200) { used += base + n * step; n++; }
      est = n;
      for (const x of all) add(x.def, x.unit, (n * x.perRound + (inc * n * (n - 1)) / 2) / athletes, x.load);
    } else {
      est = budget / sec;
      for (const x of all) add(x.def, unitOf(x), (est * (x.timed ? timedReps(x) : x.perRound)) / athletes, x.load);
    }
    rounds = Math.round(est * 10) / 10;
    return finish(b, { kind, rounds, athletes: 1, lines: [...out.values()], partnerDivided: true });
  } else if (fmt === 'EMOM / a cada' && /emom\s*\d+\s*(?:'|min|$)/.test(title)) {
    const emomMin = Number(title.match(/emom\s*(\d+)/)![1]);
    const slots = Math.max(list.length, ...b.items.map((i) => Number(i.match(/^min\s*(\d+)/i)?.[1] ?? 0)));
    const perStation = emomMin / Math.max(1, slots);
    for (const x of list) add(x.def, unitOf(x), (x.timed ? timedReps(x) : x.perRound) * perStation, x.load);
    rounds = Math.round(perStation * 10) / 10;
  } else {
    for (const x of list) add(x.def, unitOf(x), (x.timed ? timedReps(x) : x.perRound) * rounds, x.load);
    if (list.some((x) => x.timed)) kind = 'estimado';
  }
  for (const x of ladderItems) add(x.def, x.unit, x.perRound * (ladder ? 1 : rounds), x.load);
  if (noQty.length && !ladder) kind = 'estimado';
  return finish(b, { kind, rounds, athletes, lines: [...out.values()] });
}

/** Minutos de trabalho: "3x AMRAP 4'" = 12; "AMRAP 7' + 10'" = 17; senão a duração do bloco. */
function workMinutes(title: string, minutes: number | null): number | null {
  const rep = title.match(/(\d+)\s*x\s*amrap\s*(\d+)/);
  if (rep) return Number(rep[1]) * Number(rep[2]);
  const mins = [...title.matchAll(/(\d+)\s*'/g)].map((x) => Number(x[1]));
  const rest = title.match(/rest\s*(\d+)/);
  if (mins.length) return mins.reduce((s, x) => s + x, 0) - (rest ? Number(rest[1]) : 0);
  return minutes;
}

function finish(
  b: SessionBlock,
  v: { kind: BlockVolume['kind']; rounds: number | null; athletes: number; lines: LineVolume[]; partnerDivided?: boolean },
): BlockVolume {
  const div = v.partnerDivided ? 1 : v.athletes;
  const lines = v.lines.map((l) => {
    const synchro = b.items.some((it) => /sincro|synchro/i.test(it) && detectMovements(it).some((d) => d.id === l.def.id));
    return { ...l, qty: Math.round((synchro ? l.qty : l.qty / div) * 10) / 10 };
  });
  const totals = { reps: 0, m: 0, cal: 0 };
  const patterns: Partial<Record<Pattern, number>> = {};
  let runM = 0, ergCal = 0, impact = 0;
  const tonnage = { f: 0, m: 0 };
  for (const l of lines) {
    if (l.unit === 'reps') totals.reps += l.qty;
    if (l.unit === 'm') totals.m += l.qty;
    if (l.unit === 'cal') totals.cal += l.qty;
    if (l.def.family === 'run') runM += l.unit === 'm' ? l.qty : 0;
    if (['row', 'bike', 'ski'].includes(l.def.family)) ergCal += l.unit === 'cal' ? l.qty : l.unit === 'm' ? l.qty / 10 : 0;
    const reps = l.unit === 'reps' ? l.qty : l.unit === 'm' ? l.qty * (REPS_PER_M[l.def.id] ?? 0) : 0;
    for (const [p, w] of Object.entries(patternWeights(l.def.id)) as [Pattern, number][]) {
      const v2 = p === 'CARRY' ? (l.unit === 'm' ? l.qty : 0) : reps * w;
      if (v2) patterns[p] = (patterns[p] ?? 0) + v2;
    }
    impact += l.qty * impactPerUnit(l.def.id);
    if (l.loadKg && l.unit === 'reps') { tonnage.f += l.qty * l.loadKg.f; tonnage.m += l.qty * l.loadKg.m; }
  }
  const round = (x: number) => Math.round(x);
  for (const p of Object.keys(patterns) as Pattern[]) patterns[p] = round(patterns[p]!);
  return {
    kind: v.kind, rounds: v.rounds, athletes: v.athletes, lines,
    totals: { reps: round(totals.reps), m: round(totals.m), cal: round(totals.cal) },
    patterns, runM: round(runM), ergCal: round(ergCal), impact: Math.round(impact * 10) / 10,
    tonnage: { f: round(tonnage.f), m: round(tonnage.m) }, relVolume: null,
  };
}

/** Volume de um bloco de força: reps do esquema × padrões; volume relativo em reps-RM. */
export function strengthVolume(b: SessionBlock): BlockVolume {
  const s = strengthScheme(b.detail);
  const defs = detectMovements(b.title).length ? detectMovements(b.title) : b.items.flatMap((i) => detectMovements(i));
  const reps = s.reps.reduce((a, x) => a + x, 0);
  const pct = s.pctMin != null && s.pctMax != null ? (s.pctMin + s.pctMax) / 200 : null;
  const lines: LineVolume[] = defs.slice(0, 1).map((def) => ({ def, unit: 'reps', qty: reps, loadKg: null }));
  const v = finish(b, { kind: reps ? 'exato' : 'sem-leitura', rounds: s.reps.length || null, athletes: 1, lines });
  return { ...v, relVolume: pct != null && reps ? Math.round(reps * pct * 10) / 10 : null };
}

export function blockVolume(b: SessionBlock): BlockVolume | null {
  if (b.kind === 'FOR') return strengthVolume(b);
  if (b.kind === 'WOD' || b.kind === 'CARDIO') return wodVolume(b);
  return null;
}

/** Tonelagem estimada por nível a partir da RX (proporções medidas na base). */
export function tonnageByLevel(rx: { f: number; m: number }): Record<Level, { f: number; m: number }> {
  return Object.fromEntries(
    (Object.keys(LEVEL_RATIO) as Level[]).map((l) => [l, { f: Math.round(rx.f * LEVEL_RATIO[l]), m: Math.round(rx.m * LEVEL_RATIO[l]) }]),
  ) as Record<Level, { f: number; m: number }>;
}

export const PATTERN_IDS = PATTERNS.map((p) => p.id);
export { MOVEMENT };
