import { mondayOf } from '@/domain/workout';
import type { Session, SessionBlock } from './history';
import { classifyLoad } from './movements';
import { timeDomain, type TimeDomain } from './dna';
import { blockVolume, type BlockVolume } from './calculator';
import { skillOf, type Pattern } from './taxonomy';

/**
 * Volume semanal e referência da Nação (blueprint, seções 6, 7, 14 e 25):
 * soma a calculadora por semana, tira média e percentis do histórico e
 * calibra o índice de intensidade na própria base.
 */

export const WEEK_METRICS = [
  { id: 'squat', label: 'Squat', unit: 'reps' },
  { id: 'hinge', label: 'Hinge', unit: 'reps' },
  { id: 'push', label: 'Push', unit: 'reps' },
  { id: 'pull', label: 'Pull', unit: 'reps' },
  { id: 'core', label: 'Core', unit: 'reps' },
  { id: 'jump', label: 'Jump', unit: 'reps' },
  { id: 'gymnastics', label: 'Ginástica', unit: 'reps' },
  { id: 'weightlifting', label: 'Levantamento (barra)', unit: 'reps' },
  { id: 'runM', label: 'Corrida', unit: 'm' },
  { id: 'ergCal', label: 'Ergômetros', unit: 'cal' },
  { id: 'carryM', label: 'Carry', unit: 'm' },
  { id: 'impact', label: 'Impacto', unit: 'pts' },
  { id: 'tonnageM', label: 'Tonelagem WOD (RX masc.)', unit: 'kg' },
  { id: 'tonnageF', label: 'Tonelagem WOD (RX fem.)', unit: 'kg' },
  { id: 'relVolume', label: 'Força (reps × %RM)', unit: 'reps-RM' },
] as const;
export type WeekMetric = (typeof WEEK_METRICS)[number]['id'];

export interface WeekVolume {
  weekStart: string;
  sessions: number;
  values: Record<WeekMetric, number>;
}

const P = (v: BlockVolume, ...ps: Pattern[]) => ps.reduce((s, p) => s + (v.patterns[p] ?? 0), 0);

function emptyValues(): Record<WeekMetric, number> {
  return Object.fromEntries(WEEK_METRICS.map((m) => [m.id, 0])) as Record<WeekMetric, number>;
}

export function addBlock(values: Record<WeekMetric, number>, v: BlockVolume) {
  values.squat += P(v, 'SQUAT');
  values.hinge += P(v, 'HINGE');
  values.push += P(v, 'PUSH_V', 'PUSH_H');
  values.pull += P(v, 'PULL_V', 'PULL_H');
  values.core += P(v, 'CORE');
  values.jump += P(v, 'JUMP');
  values.carryM += P(v, 'CARRY');
  values.runM += v.runM;
  values.ergCal += v.ergCal;
  values.impact += v.impact;
  values.tonnageM += v.tonnage.m;
  values.tonnageF += v.tonnage.f;
  values.relVolume += v.relVolume ?? 0;
  for (const l of v.lines) {
    if (l.unit !== 'reps') continue;
    if (l.def.modality === 'G') values.gymnastics += l.qty;
    if (l.def.modality === 'W') values.weightlifting += l.qty;
  }
}

/** Volume por semana (segunda-feira), só dias de aula regular. */
export function weeklyVolumes(sessions: Session[]): WeekVolume[] {
  const weeks = new Map<string, WeekVolume>();
  for (const s of sessions) {
    if (s.special) continue;
    const w = mondayOf(s.date);
    const cur = weeks.get(w) ?? { weekStart: w, sessions: 0, values: emptyValues() };
    cur.sessions++;
    for (const b of s.blocks) {
      const v = blockVolume(b);
      if (v) addBlock(cur.values, v);
    }
    weeks.set(w, cur);
  }
  const out = [...weeks.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  for (const w of out) for (const k of Object.keys(w.values) as WeekMetric[]) w.values[k] = Math.round(w.values[k]);
  return out;
}

export interface Stat { mean: number; p50: number; p75: number; p90: number }
export function quantile(xs: number[], q: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const i = (s.length - 1) * q;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return s[lo]! + (s[hi]! - s[lo]!) * (i - lo);
}
const stat = (xs: number[]): Stat => ({
  mean: Math.round(xs.reduce((a, x) => a + x, 0) / Math.max(1, xs.length)),
  p50: Math.round(quantile(xs, 0.5)), p75: Math.round(quantile(xs, 0.75)), p90: Math.round(quantile(xs, 0.9)),
});

/** Semana cheia = 5+ aulas regulares (evita semanas de feriado distorcerem a referência). */
export const FULL_WEEK = 5;

export function volumeBaseline(weeks: WeekVolume[], minSessions = FULL_WEEK): { weeks: number; minSessions: number; metrics: Record<WeekMetric, Stat> } {
  const full = weeks.filter((w) => w.sessions >= minSessions);
  return {
    weeks: full.length,
    minSessions,
    metrics: Object.fromEntries(WEEK_METRICS.map((m) => [m.id, stat(full.map((w) => w.values[m.id]))])) as Record<WeekMetric, Stat>,
  };
}

// ── Intensidade (seção 7) ──────────────────────────────────────────────

export type IntensityClass = 'LOW' | 'MODERATE' | 'HIGH' | 'VERY HIGH';
export const INTENSITY_CLASSES: IntensityClass[] = ['LOW', 'MODERATE', 'HIGH', 'VERY HIGH'];
const LOAD_SCORE = { leve: 0, moderada: 1, pesada: 2, 'muito pesada': 3 } as const;
const DURATION_SCORE: Record<TimeDomain, number> = { sprint: 3, curto: 2.5, medio: 2, longo: 1.5, endurance: 1 };

export interface IntensityInput { load: number; densityPerMin: number; minutes: number; skill: number }

/** Componentes brutos de um WOD ou bloco de força (densidade ainda sem percentil). */
export function intensityInput(b: SessionBlock, v: BlockVolume): IntensityInput | null {
  const minutes = b.minutes ?? null;
  if (!minutes || v.kind === 'sem-leitura') return null;
  let load = 0.5; // peso corporal / objetos leves
  if (b.kind === 'FOR') {
    const pctMax = Number(b.detail.match(/(\d+)\s*%/g)?.map((x) => Number.parseInt(x, 10)).reduce((a, x) => Math.max(a, x), 0) ?? 0);
    load = pctMax >= 85 ? 3 : pctMax >= 75 ? 2 : pctMax >= 65 ? 1 : pctMax ? 0 : 1.5;
  } else {
    for (const l of v.lines) {
      if (!l.loadKg) continue;
      const c = classifyLoad(l.def, l.loadKg.m);
      if (c) load = Math.max(load, LOAD_SCORE[c]);
      else load = Math.max(load, 1);
    }
  }
  const work = v.totals.reps + v.totals.m / 10 + v.totals.cal;
  const skill = Math.max(1, ...v.lines.map((l) => skillOf(l.def.id)));
  return { load, densityPerMin: work / minutes, minutes, skill };
}

export interface IntensityModel {
  /** Percentis de densidade da base (reps-equivalentes/min). */
  density: number[];
  /** Limites do índice entre LOW|MODERATE|HIGH|VERY HIGH. */
  thresholds: [number, number, number];
}

/** Posição (0–1) de x na distribuição ordenada. */
const rank = (sorted: number[], x: number) => {
  let i = 0;
  while (i < sorted.length && sorted[i]! <= x) i++;
  return sorted.length ? i / sorted.length : 0.5;
};

export function intensityIndex(i: IntensityInput, densitySorted: number[]): number {
  const cDens = 3 * rank(densitySorted, i.densityPerMin);
  const cDur = DURATION_SCORE[timeDomain(i.minutes)];
  const cCx = (i.skill - 1) * 1.5;
  return Math.round((0.35 * i.load + 0.3 * cDens + 0.2 * cDur + 0.15 * cCx) * 100) / 100;
}

/**
 * Calibração na base: os cortes seguem a distribuição de carga da Nação
 * (leve 15% · moderada 49% · pesada 30% · muito pesada 6%) — 15%, 64% e 94%
 * dos WODs do histórico ficam abaixo de cada limite.
 */
export const CLASS_QUANTILES: [number, number, number] = [0.15, 0.64, 0.94];

export function calibrateIntensity(sessions: Session[]): IntensityModel {
  const inputs: IntensityInput[] = [];
  for (const s of sessions) for (const b of s.blocks) {
    if (b.kind !== 'WOD' || s.special) continue;
    const v = blockVolume(b);
    const x = v && intensityInput(b, v);
    if (x) inputs.push(x);
  }
  const density = inputs.map((x) => x.densityPerMin).sort((a, b) => a - b);
  const idx = inputs.map((x) => intensityIndex(x, density));
  const t = CLASS_QUANTILES.map((q) => Math.round(quantile(idx, q) * 100) / 100) as [number, number, number];
  return { density, thresholds: t };
}

export function intensityClass(index: number, model: IntensityModel): IntensityClass {
  const [a, b, c] = model.thresholds;
  return index < a ? 'LOW' : index < b ? 'MODERATE' : index < c ? 'HIGH' : 'VERY HIGH';
}

export function classify(b: SessionBlock, model: IntensityModel): { index: number; cls: IntensityClass } | null {
  const v = blockVolume(b);
  const x = v && intensityInput(b, v);
  if (!x) return null;
  const index = intensityIndex(x, model.density);
  return { index, cls: intensityClass(index, model) };
}
