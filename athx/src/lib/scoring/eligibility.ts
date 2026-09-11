import type { ResultStatus, Team } from '@/types/domain';

/**
 * Quais estados de homologação entram no cálculo.
 *  - Público: apenas PUBLISHED e LOCKED (§19 "somente resultados homologados")
 *  - Admin (prévia): inclui DRAFT, para conferir antes de publicar
 */
export const PUBLIC_STATUSES: readonly ResultStatus[] = ['PUBLISHED', 'LOCKED'];
export const ADMIN_STATUSES: readonly ResultStatus[] = ['DRAFT', 'PUBLISHED', 'LOCKED'];

export function isCounted(
  status: ResultStatus,
  allowed: readonly ResultStatus[] = PUBLIC_STATUSES,
): boolean {
  return allowed.includes(status);
}

/**
 * Duplas elegíveis ao ranking.
 * DESCLASSIFICADA não é ranqueada (é o significado do próprio status); a dupla
 * continua visível na listagem, marcada, mas fora da classificação.
 */
export function isRankable(team: Team): boolean {
  return team.status !== 'DESCLASSIFICADA';
}
