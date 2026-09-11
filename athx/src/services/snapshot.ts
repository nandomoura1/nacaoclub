import type {
  EventInfo,
  EventSettings,
  Team,
  Wod1Result,
  Wod2Result,
  Wod3Result,
} from '@/types/domain';

/**
 * Snapshot — o estado completo do evento em um único objeto serializável.
 *
 * Por que um snapshot único: são 20 duplas. O payload inteiro é menor que
 * uma foto. Buscar tudo de uma vez e recalcular no cliente é mais barato,
 * mais simples e mais consistente do que N consultas parciais — e garante
 * que servidor e navegador rodem EXATAMENTE o mesmo motor de cálculo
 * (src/lib/scoring), sem duplicar regra (§25, §34).
 */
export interface Snapshot {
  event: EventInfo;
  settings: EventSettings;
  teams: Team[];
  wod1: Wod1Result[];
  wod2: Wod2Result[];
  wod3: Wod3Result[];
  /** ISO. Alimenta o "Última atualização HH:MM" (§9). */
  lastUpdate: string;
  /** true quando os dados são fictícios (§54). */
  demo: boolean;
}
