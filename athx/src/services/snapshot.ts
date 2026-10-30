import type { EventInfo, EventSettings, Team } from '@/types/domain';
import type { AgendaItem, ProvaResult, Wod, WodEntry } from '@/types/wod';

/**
 * Snapshot — o estado completo do evento em um único objeto serializável.
 *
 * Por que um snapshot único: são 20 duplas. O payload inteiro é menor que
 * uma foto. Buscar tudo de uma vez e recalcular no cliente é mais barato,
 * mais simples e mais consistente do que N consultas parciais — e garante
 * que servidor e navegador rodem EXATAMENTE o mesmo motor de cálculo
 * (src/lib/scoring), sem duplicar regra (§25, §34).
 *
 * O snapshot carrega também a DEFINIÇÃO do evento — os WODs e suas provas —,
 * porque elas agora são dado editável e não constante de código. A tela
 * precisa saber quantas colunas desenhar antes de desenhar.
 */
export interface Snapshot {
  event: EventInfo;
  settings: EventSettings;
  teams: Team[];
  /** Os workouts do evento, com as provas de cada um. */
  wods: Wod[];
  /** A programação do dia. */
  agenda: AgendaItem[];
  /** Homologação e CAP: uma linha por dupla por WOD. */
  entries: WodEntry[];
  /** Os valores lançados: uma linha por dupla por prova. */
  results: ProvaResult[];
  /** ISO. Alimenta o "Última atualização HH:MM" (§9). */
  lastUpdate: string;
  /** true quando os dados são fictícios (§54). */
  demo: boolean;
}
