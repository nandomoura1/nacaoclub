import type { Month } from './months';
import { roundCents } from './money';

/**
 * IPTU proporcional à área ocupada (aba IPTU):
 *   cota = área / área total;  parcela = IPTU do ano × cota / nº de parcelas
 * Ex.: 6 parcelas de maio a outubro ("4 de 6" em agosto); o valor e a área total vêm do cadastro do ano.
 */
export interface IptuYear {
  year: number;
  totalCents: number;
  totalAreaM2: number;
  /** Mês (1–12) da 1ª parcela. */
  firstMonth: number;
  parcels: number;
}

/** Nº da parcela na competência (1…n) ou null fora da janela. */
export function parcelOf(cfg: IptuYear, month: Month): number | null {
  const [y, m] = month.split('-').map(Number) as [number, number];
  if (y !== cfg.year) return null;
  const n = m - cfg.firstMonth + 1;
  return n >= 1 && n <= cfg.parcels ? n : null;
}

/** Parcela do mês de um centro de custo, já com o percentual dele (Society paga 50%). */
export function iptuParcelCents(cfg: IptuYear, areaM2: number, sharePct = 100): number {
  if (cfg.totalAreaM2 <= 0 || cfg.parcels <= 0) return 0;
  return roundCents((cfg.totalCents * areaM2 * sharePct) / (cfg.totalAreaM2 * cfg.parcels * 100));
}

/** "IPTU 4 de 6", "50% IPTU 4 de 6". */
export const iptuLabel = (n: number, parcels: number, sharePct = 100): string => `${sharePct !== 100 ? `${String(sharePct).replace('.', ',')}% ` : ''}IPTU ${n} de ${parcels}`;

/** Área que ninguém ocupa (a Nação absorve). */
export const commonArea = (cfg: Pick<IptuYear, 'totalAreaM2'>, areas: number[]): number => Math.round((cfg.totalAreaM2 - areas.reduce((s, a) => s + a, 0)) * 100) / 100;
