import { roundCents } from './money';

/**
 * Energia por submedidor: leitura acumulada do relógio (kWh) por competência.
 *   valor = consumo × tarifa (R$/kWh) × fator da bandeira
 * Planilha (aba ENERGIA): 0,9564346 × (leitura − anterior) × 1,15.
 */

export type Flag = 'VERDE' | 'AMARELA' | 'VERMELHA_1' | 'VERMELHA_2' | 'PERSONALIZADA';
export const FLAGS: { id: Flag; label: string }[] = [
  { id: 'VERDE', label: 'Verde' },
  { id: 'AMARELA', label: 'Amarela' },
  { id: 'VERMELHA_1', label: 'Vermelha 1' },
  { id: 'VERMELHA_2', label: 'Vermelha 2' },
  { id: 'PERSONALIZADA', label: 'Personalizada' },
];
/** Fator usado pela Nação em todos os meses da planilha (2024–2026). Editável no cadastro. */
export const DEFAULT_FLAG_FACTORS: Record<Flag, number> = { VERDE: 1.15, AMARELA: 1.15, VERMELHA_1: 1.15, VERMELHA_2: 1.15, PERSONALIZADA: 1.15 };

export interface ReadingInput {
  /** Leitura do mês anterior (ou a de instalação, no 1º mês). */
  previous: number;
  current: number;
  /** Troca/zeramento do relógio: última leitura do relógio antigo e a inicial do novo. */
  reset?: { oldFinal: number | null; baseline: number } | null;
}

export interface EnergyResult {
  kwh: number;
  cents: number;
  /** Bloqueia o fechamento (consumo negativo sem marcar troca de relógio). */
  error: string | null;
}

/** Consumo do mês (kWh, 1 casa). Com troca de relógio: cauda do antigo + o que o novo marcou. */
export function consumption(r: ReadingInput): number {
  const raw = r.reset
    ? Math.max(0, (r.reset.oldFinal ?? r.previous) - r.previous) + (r.current - r.reset.baseline)
    : r.current - r.previous;
  return Math.round(raw * 10) / 10;
}

export function energyCharge(r: ReadingInput, tariff: number, factor: number): EnergyResult {
  const kwh = consumption(r);
  if (kwh < 0) {
    return { kwh, cents: 0, error: r.reset ? 'A leitura atual é menor que a inicial do relógio novo.' : 'Leitura menor que a do mês anterior. Confira, ou marque como troca de relógio.' };
  }
  return { kwh, cents: roundCents(kwh * tariff * factor * 100), error: null };
}

/** Alerta (não bloqueia) quando o consumo foge mais de 50% da média dos últimos 3 meses. */
export function consumptionAlert(kwh: number, history: number[]): string | null {
  const last = history.filter((v) => v > 0).slice(-3);
  if (last.length < 2 || kwh <= 0) return null;
  const avg = last.reduce((s, v) => s + v, 0) / last.length;
  const delta = (kwh - avg) / avg;
  if (Math.abs(delta) <= 0.5) return null;
  return `Consumo ${delta > 0 ? `${Math.round(delta * 100)}% acima` : `${Math.round(-delta * 100)}% abaixo`} da média dos últimos ${last.length} meses (${Math.round(avg)} kWh).`;
}
