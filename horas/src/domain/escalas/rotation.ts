import type { WeekPattern } from './types';

/**
 * Rodízio de posições: cada pessoa começa na própria posição (a grade atual
 * dela) e avança uma posição por semana. Com 6 pessoas e 6 posições, todo
 * mundo passa por todas em 6 semanas — inclusive pelos fins de semana.
 * Pessoa i, semana k → posição (i + k) mod n.
 */
export function buildRotation(positions: WeekPattern[]): WeekPattern[][] {
  const n = positions.length;
  return positions.map((_, i) => Array.from({ length: n }, (_, k) => positions[(i + k) % n]!));
}
