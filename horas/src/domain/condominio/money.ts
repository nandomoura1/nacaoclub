/**
 * Dinheiro do Condomínio em centavos (inteiros). Arredonda meio para cima, só no
 * fim de cada linha da cobrança — como a planilha, que arredonda cada célula.
 */

/** Arredonda para o centavo, meio para cima (o épsilon absorve o ruído do ponto flutuante: 0,5 vira 1). */
export const roundCents = (value: number): number => (value < 0 ? -1 : 1) * Math.floor(Math.abs(value) + 0.5 + 1e-9);

export const reaisToCents = (reais: number): number => roundCents(reais * 100);

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
/** 213675 → "R$ 2.136,75" (espaço normal, não o NBSP do Intl: sai igual no PDF). */
export const formatBRL = (cents: number): string => BRL.format(cents / 100).replace(/ /g, ' ');

/** "2.136,75", "2136.75", "R$ 2.136,75" → 213675. Vazio/ inválido → null. */
export function parseBRL(text: string): number | null {
  const t = text.replace(/R\$|\s/g, '').trim();
  if (!t) return null;
  const normalized = /,\d{1,2}$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  const n = Number(normalized);
  return Number.isFinite(n) ? reaisToCents(n) : null;
}

/** Percentual com 2 casas: 0.09619... → "9,62%". */
export const formatPct = (ratio: number): string => `${(ratio * 100).toFixed(2).replace('.', ',')}%`;
