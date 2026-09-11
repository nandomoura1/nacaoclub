import type { StandingRow } from '@/types/domain';
import { normalize } from './format';

/**
 * Busca por dupla OU atleta (§8).
 * Encontra pelo nome da dupla, pelo atleta 1, pelo atleta 2 e pelo número
 * da dupla — o público digita "07" tanto quanto digita "Marina".
 */
export function matchesQuery(row: StandingRow, query: string): boolean {
  const q = normalize(query);
  if (!q) return true;

  const { team } = row;
  const haystack = [
    team.teamName,
    team.athlete1,
    team.athlete2,
    String(team.teamNumber),
    String(team.teamNumber).padStart(2, '0'),
  ]
    .map(normalize)
    .join(' | ');

  // Todos os termos precisam aparecer: "ana cerrado" acha "Ana" da "Cerrado".
  return q.split(/\s+/).every((term) => haystack.includes(term));
}
