import { addDays, type IsoDate } from '@/domain/dates';
import { availableOn, shiftFor, weeklyOffs } from './engine';
import type { DayPlan, Member } from './types';

/**
 * Benefícios da escala 5x2 (passagem e alimentação) — puro.
 * Alimentação = dias de trabalho do mês × valor diário (sem desconto do mês anterior; vazio = sem direito).
 * Dias a pagar no mês = dias de trabalho do mês − faltas e atestados do mês anterior
 * (só os que caíram em dia de trabalho). Valor = dias a pagar × valor diário (ida e volta).
 */

/** Vínculos que recebem passagem (decisão de 12/11): CLT e FUNAP. */
export const TRANSPORT_BONDS = ['CLT', 'FUNAP'] as const;
export const receivesTransport = (bond: string) => (TRANSPORT_BONDS as readonly string[]).includes(bond);

/** Ausências que descontam no mês seguinte. */
export const DISCOUNT_TYPES = ['FALTA', 'ATESTADO'] as const;

export interface Leave { id?: string; start: IsoDate; end: IsoDate; type: string }

const covered = (leaves: Leave[], d: IsoDate) => leaves.some((l) => l.start <= d && d <= l.end);

/**
 * Dias de trabalho estimados pelo padrão da pessoa (sem escala gerada): dias em que ela tem
 * horário e o setor está aberto, fora da folga fixa e de qualquer ausência; no máximo
 * 5 por semana (CLT) ou 6 (FUNAP) — quem não tem grade fixa não ganha 7 dias.
 */
export function estimateWorkDays(m: Member, days: DayPlan[], cycleRef: IsoDate, leaves: Leave[]): IsoDate[] {
  const cap = 7 - weeklyOffs(m);
  const byWeek = new Map<IsoDate, IsoDate[]>();
  for (const d of days) {
    if (m.fixedOff.includes(d.weekday) || !availableOn(m, d) || !shiftFor(m, d, cycleRef) || covered(leaves, d.date)) continue;
    const monday = addDays(d.date, 1 - d.weekday);
    byWeek.set(monday, [...(byWeek.get(monday) ?? []), d.date]);
  }
  return [...byWeek.values()].flatMap((w) => w.slice(0, cap));
}

/** Faltas e atestados do mês anterior que caíram em dia de trabalho. */
export function discountDays(prevWorkDays: Set<IsoDate>, leaves: Leave[]): IsoDate[] {
  const disc = leaves.filter((l) => (DISCOUNT_TYPES as readonly string[]).includes(l.type));
  return [...prevWorkDays].filter((d) => covered(disc, d)).sort();
}

export interface TransportInput {
  teacherId: string;
  name: string;
  bond: string;
  sector: string;
  /** Dias de trabalho no mês (datas) e se vieram da escala gerada ou do padrão. */
  workDays: IsoDate[];
  source: 'escala' | 'estimado';
  /** Dias de trabalho do mês anterior (para saber quais faltas/atestados descontam). */
  prevWorkDays: IsoDate[];
  prevLeaves: Leave[];
  dailyCents: number | null;
  /** Alimentação por dia trabalhado (vazio = sem direito). */
  mealDailyCents?: number | null;
  /** Onde a pessoa está (para lançar falta/atestado pela tela). */
  ref?: { sectorId: string; memberId: string };
}

export interface TransportRow {
  teacherId: string;
  name: string;
  bond: string;
  sectors: string[];
  source: 'escala' | 'estimado' | 'misto';
  workDays: number;
  discount: number;
  discountDates: IsoDate[];
  payDays: number;
  dailyCents: number | null;
  totalCents: number | null;
  mealDailyCents: number | null;
  mealCents: number | null;
  /** Passagem + alimentação (vazio = nenhum valor informado). */
  depositCents: number | null;
  refs: { sectorId: string; memberId: string }[];
  /** Faltas e atestados do mês anterior já lançados (podem cair em dia de folga e não descontar). */
  leaves: Required<Leave>[];
}

function meal(daily: number | null, workDays: number, transport: number | null) {
  const mealCents = daily == null ? null : workDays * daily;
  return { mealDailyCents: daily, mealCents, depositCents: transport == null && mealCents == null ? null : (transport ?? 0) + (mealCents ?? 0) };
}

/** Junta a mesma pessoa em vários setores (dias sem repetir) e calcula os dias a pagar e o valor. */
export function transportRows(inputs: TransportInput[]): TransportRow[] {
  const byPerson = new Map<string, TransportInput[]>();
  for (const i of inputs) if (receivesTransport(i.bond)) byPerson.set(i.teacherId, [...(byPerson.get(i.teacherId) ?? []), i]);
  return [...byPerson.values()].map((list): TransportRow => {
    const work = new Set(list.flatMap((i) => i.workDays));
    const prev = new Set(list.flatMap((i) => i.prevWorkDays));
    const disc = discountDays(prev, list.flatMap((i) => i.prevLeaves));
    const payDays = Math.max(0, work.size - disc.length);
    const daily = list.find((i) => i.dailyCents != null)?.dailyCents ?? null;
    const sources = new Set(list.map((i) => i.source));
    return {
      teacherId: list[0]!.teacherId, name: list[0]!.name, bond: list[0]!.bond,
      sectors: [...new Set(list.map((i) => i.sector))],
      source: sources.size > 1 ? 'misto' : list[0]!.source,
      workDays: work.size, discount: disc.length, discountDates: disc, payDays,
      dailyCents: daily, totalCents: daily == null ? null : payDays * daily,
      ...meal(list.find((i) => i.mealDailyCents != null)?.mealDailyCents ?? null, work.size, daily == null ? null : payDays * daily),
      refs: list.flatMap((i) => (i.ref ? [i.ref] : [])),
      leaves: [...new Map(list.flatMap((i) => i.prevLeaves).filter((l): l is Required<Leave> => !!l.id && (DISCOUNT_TYPES as readonly string[]).includes(l.type)).map((l) => [l.id, l])).values()].sort((a, b) => a.start.localeCompare(b.start)),
    };
  }).sort((a, b) => a.sectors[0]!.localeCompare(b.sectors[0]!, 'pt-BR') || a.name.localeCompare(b.name, 'pt-BR'));
}
