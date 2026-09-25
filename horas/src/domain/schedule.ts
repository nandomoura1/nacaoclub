import { addDays, type IsoDate } from './dates';

/**
 * Vigência da grade — lógica pura.
 *
 * Uma aula (slot) tem versões [validFrom, validTo] que não se sobrepõem.
 * Alterar "a partir de D" nunca reescreve o passado: fecha a versão em D-1
 * e abre outra em D, preservando mudanças já agendadas para depois.
 */
export interface VersionSpan {
  id: string;
  validFrom: IsoDate;
  validTo: IsoDate | null;
}

export function covers(v: VersionSpan, date: IsoDate): boolean {
  return v.validFrom <= date && (v.validTo === null || date <= v.validTo);
}

export function versionAt<T extends VersionSpan>(versions: T[], date: IsoDate): T | null {
  return versions.find((v) => covers(v, date)) ?? null;
}

export type ChangePlan =
  /** A mudança começa no mesmo dia da versão: reescreve o conteúdo dela. */
  | { kind: 'replace'; versionId: string }
  /** Fecha a versão vigente em D-1 e cria outra de D até `newValidTo`. */
  | { kind: 'split'; closeVersionId: string; closeAt: IsoDate; newValidFrom: IsoDate; newValidTo: IsoDate | null };

export class ScheduleRuleError extends Error {}

/**
 * Planeja "alterar a aula a partir de `from`". A nova versão termina onde
 * começava a próxima mudança já agendada — ela não é atropelada.
 */
export function planChange(versions: VersionSpan[], from: IsoDate): ChangePlan {
  const current = versionAt(versions, from);
  if (!current) throw new ScheduleRuleError('Esta aula não está valendo nesta data.');
  if (current.validFrom === from) return { kind: 'replace', versionId: current.id };
  return { kind: 'split', closeVersionId: current.id, closeAt: addDays(from, -1), newValidFrom: from, newValidTo: current.validTo };
}

export type EndPlan =
  | { kind: 'close'; versionId: string; closeAt: IsoDate; dropVersionIds: string[] }
  | { kind: 'drop'; dropVersionIds: string[] };

/**
 * Planeja "encerrar a aula a partir de `from`" (última aula em D-1).
 * Versões que começariam depois disso deixam de existir.
 */
export function planEnd(versions: VersionSpan[], from: IsoDate): EndPlan {
  const later = versions.filter((v) => v.validFrom >= from).map((v) => v.id);
  const current = versions.find((v) => v.validFrom < from && (v.validTo === null || v.validTo >= from));
  if (current) return { kind: 'close', versionId: current.id, closeAt: addDays(from, -1), dropVersionIds: later };
  if (!later.length) throw new ScheduleRuleError('Esta aula já não está valendo a partir desta data.');
  return { kind: 'drop', dropVersionIds: later };
}
