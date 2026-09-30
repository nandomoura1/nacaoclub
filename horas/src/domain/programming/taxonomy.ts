import type { MovementDef } from './movements';

/**
 * Taxonomia de movimentos (blueprint, seção 3): padrões com peso, skill,
 * impacto e ritmo estimado. Tudo aqui é [HIPÓTESE] configurável — o valor
 * inicial é o que o motor usa até o Head Coach ajustar.
 */
export type Pattern = 'SQUAT' | 'HINGE' | 'PUSH_V' | 'PUSH_H' | 'PULL_V' | 'PULL_H' | 'CORE' | 'JUMP' | 'CARRY';
export const PATTERNS: { id: Pattern; label: string }[] = [
  { id: 'SQUAT', label: 'Squat' },
  { id: 'HINGE', label: 'Hinge' },
  { id: 'PUSH_V', label: 'Push vertical' },
  { id: 'PUSH_H', label: 'Push horizontal' },
  { id: 'PULL_V', label: 'Pull vertical' },
  { id: 'PULL_H', label: 'Pull horizontal' },
  { id: 'CORE', label: 'Core' },
  { id: 'JUMP', label: 'Jump' },
  { id: 'CARRY', label: 'Carry (m)' },
];

type W = Partial<Record<Pattern, number>>;
/** Quanto de cada rep entra em cada padrão. */
export const PATTERN_WEIGHTS: Record<string, W> = {
  'man-maker': { PUSH_H: 0.5, PULL_H: 1, HINGE: 1, SQUAT: 1, PUSH_V: 1 },
  'squat-thrust': { CORE: 0.5 },
  'broad-jump': { JUMP: 1, SQUAT: 0.25 },
  'jump-squat': { JUMP: 1, SQUAT: 1 },
  'jumping-jack': { JUMP: 0.5 },
  'sled-pull': { CARRY: 1 },
  'horizontal-row': { PULL_H: 1 },
  'mountain-climber': { CORE: 1 },
  'bird-dog': { CORE: 1 },
  'glute-bridge': { HINGE: 1 },
  'burpee-pull-up': { PUSH_H: 0.5, JUMP: 0.5, PULL_V: 1 },
  'burpee-box-jump': { PUSH_H: 0.5, JUMP: 1 },
  'burpee-over-bar': { PUSH_H: 0.5, JUMP: 0.5 },
  'burpee-broad-jump': { PUSH_H: 0.5, JUMP: 1 },
  'db-burpee': { PUSH_H: 0.5, JUMP: 0.5 },
  burpee: { PUSH_H: 0.5, JUMP: 0.5 },
  'box-jump-over': { JUMP: 1, SQUAT: 0.25 },
  'box-jump': { JUMP: 1, SQUAT: 0.25 },
  sdhp: { HINGE: 1, PULL_V: 0.25 },
  'db-snatch': { HINGE: 1, PUSH_V: 0.25 },
  'db-clean-jerk': { HINGE: 0.5, PUSH_V: 1 },
  'db-squat-clean': { HINGE: 0.5, SQUAT: 1 },
  'db-thruster': { SQUAT: 1, PUSH_V: 1 },
  'db-press': { PUSH_V: 1 },
  'db-sto': { PUSH_V: 1 },
  'db-deadlift': { HINGE: 1 },
  'devil-press': { PUSH_H: 0.5, HINGE: 1, PUSH_V: 0.5 },
  'db-lunge': { SQUAT: 0.75 },
  'barbell-lunge': { SQUAT: 0.75 },
  'step-up': { SQUAT: 0.75 },
  'goblet-squat': { SQUAT: 1 },
  'kb-swing': { HINGE: 1 },
  'kb-sdhp': { HINGE: 1, PULL_V: 0.25 },
  carry: { CARRY: 1 },
  sled: { CARRY: 1 },
  'wall-ball': { SQUAT: 1, PUSH_V: 0.5 },
  'medball-other': { HINGE: 0.5, SQUAT: 0.5 },
  sandbag: { HINGE: 1 },
  'clean-and-jerk': { HINGE: 1, SQUAT: 0.5, PUSH_V: 1 },
  'squat-snatch': { HINGE: 1, SQUAT: 1, PUSH_V: 0.25 },
  'power-snatch': { HINGE: 1, SQUAT: 0.25, PUSH_V: 0.25 },
  snatch: { HINGE: 1, SQUAT: 0.5, PUSH_V: 0.25 },
  'squat-clean': { HINGE: 1, SQUAT: 1 },
  'power-clean': { HINGE: 1, SQUAT: 0.25 },
  clean: { HINGE: 1, SQUAT: 0.5 },
  stoh: { PUSH_V: 1 },
  'push-jerk': { PUSH_V: 1, SQUAT: 0.25 },
  'split-jerk': { PUSH_V: 1, SQUAT: 0.25 },
  jerk: { PUSH_V: 1, SQUAT: 0.25 },
  thruster: { SQUAT: 1, PUSH_V: 1 },
  ohs: { SQUAT: 1, CORE: 0.5 },
  'front-squat': { SQUAT: 1 },
  'back-squat': { SQUAT: 1 },
  'push-press': { PUSH_V: 1 },
  'shoulder-press': { PUSH_V: 1 },
  deadlift: { HINGE: 1 },
  'good-morning': { HINGE: 1 },
  'curtis-p': { HINGE: 1, SQUAT: 0.5, PUSH_V: 0.5 },
  'ring-muscle-up': { PULL_V: 1, PUSH_V: 0.5 },
  'bar-muscle-up': { PULL_V: 1, PUSH_V: 0.5 },
  'muscle-up': { PULL_V: 1, PUSH_V: 0.5 },
  c2b: { PULL_V: 1 },
  'rope-climb': { PULL_V: 3 },
  'pull-up': { PULL_V: 1 },
  t2b: { CORE: 1, PULL_V: 0.5 },
  k2e: { CORE: 1, PULL_V: 0.25 },
  hspu: { PUSH_V: 1 },
  'hs-walk': { PUSH_V: 0.5, CORE: 0.25 },
  dip: { PUSH_V: 1 },
  'push-up': { PUSH_H: 1 },
  pistol: { SQUAT: 1 },
  'air-squat': { SQUAT: 1 },
  lunge: { SQUAT: 0.75 },
  'sit-up': { CORE: 1 },
  'core-hold': { CORE: 1 },
  'double-under': { JUMP: 1 },
  'single-under': { JUMP: 0.5 },
  'shuttle-run': {},
  run: {},
  row: { PULL_H: 0.5, HINGE: 0.25 },
  bike: {},
  ski: { PULL_V: 0.25 },
};
export const patternWeights = (id: string): W => PATTERN_WEIGHTS[id] ?? {};

/** Skill 1 baixa · 2 média · 3 alta. */
const SKILL3 = new Set(['squat-snatch', 'snatch', 'squat-clean', 'clean-and-jerk', 'ohs', 'pistol', 'ring-muscle-up', 'bar-muscle-up', 'muscle-up', 'hspu', 'hs-walk', 'split-jerk', 'curtis-p']);
const SKILL2 = new Set(['man-maker', 'power-snatch', 'power-clean', 'clean', 'jerk', 'push-jerk', 'stoh', 'thruster', 'c2b', 't2b', 'pull-up', 'rope-climb', 'double-under', 'db-snatch', 'devil-press', 'box-jump-over', 'dip', 'k2e']);
export const skillOf = (id: string): 1 | 2 | 3 => (SKILL3.has(id) ? 3 : SKILL2.has(id) ? 2 : 1);

/**
 * Pontos de impacto = aterrissagens ÷ 10. Corrida ~1,4 passada/m; salto,
 * DU e burpee = 1 aterrissagem por rep; box jump ~1,5 (sobe + desce).
 */
const IMPACT: Record<string, number> = {
  run: 0.14, 'shuttle-run': 0.14, 'double-under': 0.1, 'single-under': 0.05,
  'box-jump': 0.15, 'box-jump-over': 0.15, 'burpee-box-jump': 0.15, 'burpee-broad-jump': 0.1,
  'broad-jump': 0.1, 'jump-squat': 0.1, 'jumping-jack': 0.1,
  burpee: 0.1, 'burpee-over-bar': 0.1, 'burpee-pull-up': 0.1, 'db-burpee': 0.1, 'wall-ball': 0.05,
};
/** Impacto por unidade (rep ou metro). */
export const impactPerUnit = (id: string) => IMPACT[id] ?? 0;

export type Unit = 'reps' | 'm' | 'cal' | 's';

/**
 * Ritmo estimado de um atleta RX (segundos por unidade) — usado só para
 * estimar rounds de AMRAP e reps de estações por tempo.
 */
const PACE: Record<string, number> = {
  run: 0.3, 'shuttle-run': 0.36, row: 4, bike: 3.5, ski: 4,
  'double-under': 0.5, 'single-under': 0.35, 'air-squat': 1.5, 'push-up': 2, 'sit-up': 2, 'core-hold': 1,
  'pull-up': 2, c2b: 2.5, t2b: 2.5, k2e: 2, 'bar-muscle-up': 4, 'ring-muscle-up': 6, 'muscle-up': 5, 'rope-climb': 20,
  hspu: 3, 'hs-walk': 1.5, dip: 2, pistol: 3, lunge: 1.5, 'db-lunge': 2, 'barbell-lunge': 2.5, 'step-up': 3,
  'box-jump': 2.5, 'box-jump-over': 3, burpee: 4, 'burpee-over-bar': 5, 'burpee-box-jump': 6, 'burpee-pull-up': 6, 'burpee-broad-jump': 5, 'db-burpee': 5,
  'man-maker': 8, 'squat-thrust': 2.5, 'broad-jump': 3, 'jump-squat': 2, 'jumping-jack': 0.7, 'sled-pull': 2,
  'horizontal-row': 2.5, 'mountain-climber': 0.5, 'bird-dog': 2, 'glute-bridge': 1.5,
  'devil-press': 6, 'wall-ball': 3, 'kb-swing': 2, 'db-snatch': 2.5, carry: 1, sled: 2,
};
export function paceOf(def: MovementDef, unit: Unit): number {
  if (unit === 's') return 1;
  const p = PACE[def.id];
  if (p) return p;
  if (unit === 'm') return 1;
  if (unit === 'cal') return 4;
  return def.modality === 'W' ? 3.5 : 3;
}

/** Movimentos prescritos em metros que viram reps-equivalentes nos padrões. */
export const REPS_PER_M: Record<string, number> = {
  lunge: 1.25, 'db-lunge': 1.25, 'barbell-lunge': 1.25, 'hs-walk': 1, 'burpee-broad-jump': 0.5,
};

/**
 * Proporção de carga por nível, medida nas prescrições da base que trazem as
 * três faixas (JSON 08/09–03/10/2026). Iniciante não aparece na base:
 * [HIPÓTESE] 0,5 da carga RX.
 */
export const LEVEL_LOAD_SAMPLES: { what: string; rx: number; int: number; scale?: number }[] = [
  { what: 'Squat snatch 14/09', rx: 60, int: 50, scale: 40 },
  { what: 'Front squat 26/09', rx: 50, int: 40, scale: 30 },
  { what: "Thruster O'Connor 28/09", rx: 43, int: 30 },
  { what: 'Deadlift Quick and the Dead 30/09', rx: 93, int: 80, scale: 70 },
  { what: 'DB walking lunge 21/09', rx: 22.5, int: 15 },
  { what: 'KB swing 29/09', rx: 24, int: 20 },
  { what: 'Power snatch 02/10', rx: 60, int: 50, scale: 40 },
];
export type Level = 'RX' | 'INTERMEDIARIO' | 'SCALE' | 'INICIANTE';
export const LEVELS: { id: Level; label: string }[] = [
  { id: 'RX', label: 'RX' }, { id: 'INTERMEDIARIO', label: 'Intermediário' }, { id: 'SCALE', label: 'Scale' }, { id: 'INICIANTE', label: 'Iniciante' },
];
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const r2 = (x: number) => Math.round(x * 100) / 100;
export const LEVEL_RATIO: Record<Level, number> = {
  RX: 1,
  INTERMEDIARIO: r2(mean(LEVEL_LOAD_SAMPLES.map((s) => s.int / s.rx))),
  SCALE: r2(mean(LEVEL_LOAD_SAMPLES.filter((s) => s.scale).map((s) => s.scale! / s.rx))),
  INICIANTE: 0.5,
};
