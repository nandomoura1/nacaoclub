import { addDays, type IsoDate } from '@/domain/dates';
import { availableOn, shiftFor, weeklyOffs } from './engine';
import type { DayPlan, Member } from './types';

/**
 * Benefícios da escala 5x2 (passagem e alimentação) — puro.
 * Alimentação = (dias de trabalho do mês − faltas, atestados e home office do mês anterior) × valor diário (vazio = sem direito):
 * é benefício de quem trabalha no dia (decisão 15/11).
 * Dias a pagar no mês = dias de trabalho do mês − faltas e atestados do mês anterior
 * (só os que caíram em dia de trabalho). Valor = dias a pagar × valor diário (ida e volta).
 */

/** Vínculos que recebem passagem (decisão de 12/11): CLT e FUNAP; estágio = auxílio-transporte (Lei 11.788, art. 12). */
export const TRANSPORT_BONDS = ['CLT', 'FUNAP', 'ESTAGIO'] as const;
export const receivesTransport = (bond: string) => (TRANSPORT_BONDS as readonly string[]).includes(bond);

/** Ausências que descontam a passagem no mês seguinte (decisão 15/11: home office também). */
export const DISCOUNT_TYPES = ['FALTA', 'ATESTADO', 'HOME_OFFICE'] as const;
/** Ausências que descontam a alimentação no mês seguinte (decisão 15/11: as mesmas da passagem). */
export const MEAL_DISCOUNT_TYPES = DISCOUNT_TYPES;

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
export function discountDays(prevWorkDays: Set<IsoDate>, leaves: Leave[], types: readonly string[] = DISCOUNT_TYPES): IsoDate[] {
  const disc = leaves.filter((l) => types.includes(l.type));
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
  source: 'escala' | 'estimado' | 'misto' | 'fora';
  workDays: number;
  discount: number;
  discountDates: IsoDate[];
  /** Dias a pagar: os informados no mês (manualDays) ou os calculados (calcPayDays). */
  payDays: number;
  calcPayDays: number;
  manualDays: number | null;
  /** Valor fixo da passagem no mês (substitui dias × valor diário). */
  fixedCents: number | null;
  note: string | null;
  /** Fora das equipes da escala 5x2 (professores, Kids…): dias só informados. */
  external: boolean;
  dailyCents: number | null;
  totalCents: number | null;
  mealDailyCents: number | null;
  /** Dias de alimentação: dias de trabalho − faltas, atestados e home office do mês anterior. */
  mealDays: number;
  mealDiscount: number;
  mealCents: number | null;
  /** Alimentação de fim de semana (escala da Gestão de Horas, mês anterior): já somada em mealCents. */
  weekend: WeekendMeal | null;
  /** Passagem + alimentação (vazio = nenhum valor informado). */
  depositCents: number | null;
  refs: { sectorId: string; memberId: string }[];
  /** Faltas e atestados do mês anterior já lançados (podem cair em dia de folga e não descontar). */
  leaves: Required<Leave>[];
}

function meal(daily: number | null, mealDays: number, transport: number | null) {
  const mealCents = daily == null ? null : mealDays * daily;
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
    const mealDisc = discountDays(prev, list.flatMap((i) => i.prevLeaves), MEAL_DISCOUNT_TYPES).length;
    const mealDays = Math.max(0, work.size - mealDisc);
    const payDays = Math.max(0, work.size - disc.length);
    const daily = list.find((i) => i.dailyCents != null)?.dailyCents ?? null;
    const sources = new Set(list.map((i) => i.source));
    return {
      teacherId: list[0]!.teacherId, name: list[0]!.name, bond: list[0]!.bond,
      sectors: [...new Set(list.map((i) => i.sector))],
      source: sources.size > 1 ? 'misto' : list[0]!.source,
      workDays: work.size, discount: disc.length, discountDates: disc, payDays, calcPayDays: payDays,
      manualDays: null, fixedCents: null, note: null, external: false,
      dailyCents: daily, totalCents: daily == null ? null : payDays * daily,
      mealDays, mealDiscount: mealDisc, weekend: null,
      ...meal(list.find((i) => i.mealDailyCents != null)?.mealDailyCents ?? null, mealDays, daily == null ? null : payDays * daily),
      refs: list.flatMap((i) => (i.ref ? [i.ref] : [])),
      leaves: [...new Map(list.flatMap((i) => i.prevLeaves).filter((l): l is Required<Leave> => !!l.id && (DISCOUNT_TYPES as readonly string[]).includes(l.type)).map((l) => [l.id, l])).values()].sort((a, b) => a.start.localeCompare(b.start)),
    };
  }).sort((a, b) => a.sectors[0]!.localeCompare(b.sectors[0]!, 'pt-BR') || a.name.localeCompare(b.name, 'pt-BR'));
}

/** Ajuste do mês informado pelo DP (planilha de passagem). */
export interface MonthAdjust { teacherId: string; days: number | null; fixedCents: number | null; note: string | null }

/**
 * Aplica o ajuste do mês: dias informados substituem os calculados (passagem e, para quem está fora
 * das escalas, também a alimentação); valor fixo substitui dias × valor diário.
 */
export function applyAdjust(row: TransportRow, a: MonthAdjust | undefined): TransportRow {
  if (!a) return row;
  const payDays = a.days ?? row.calcPayDays;
  const transport = a.fixedCents ?? (row.dailyCents == null ? null : payDays * row.dailyCents);
  const mealDays = row.external ? payDays : row.mealDays;
  return {
    ...row, payDays, mealDays, manualDays: a.days, fixedCents: a.fixedCents, note: a.note, totalCents: transport,
    ...meal(row.mealDailyCents, mealDays, transport),
  };
}

export const OUTSIDE_GROUP = 'Fora das escalas (professores e outros)';

/** Linha de quem recebe benefício sem estar numa equipe da escala: dias só por ajuste do mês. */
export function externalRow(p: { teacherId: string; name: string; bond: string; dailyCents: number | null; mealDailyCents: number | null }): TransportRow {
  return {
    teacherId: p.teacherId, name: p.name, bond: p.bond, sectors: [OUTSIDE_GROUP], source: 'fora',
    workDays: 0, discount: 0, discountDates: [], payDays: 0, calcPayDays: 0, manualDays: null, fixedCents: null, note: null, external: true,
    dailyCents: p.dailyCents, totalCents: p.dailyCents == null ? null : 0, mealDays: 0, mealDiscount: 0, weekend: null,
    ...meal(p.mealDailyCents, 0, p.dailyCents == null ? null : 0),
    refs: [], leaves: [],
  };
}

/** Fim de semana trabalhado na escala (Gestão de Horas → Escalas) no mês anterior. */
export interface WeekendMeal { saturdays: number; sundays: number; cents: number }

/**
 * Alimentação de fim de semana (decisão 17/11): cada sábado e cada domingo trabalhado no setor da escala vale o
 * valor do setor (Academia: R$ 20 sábado, R$ 35 domingo), acumulativo. Mesmo dia em dois turnos/setores conta uma
 * vez (o maior valor). Só sábado e domingo — feriado em dia de semana não entra.
 */
export function weekendMeal(worked: { date: IsoDate; weekday: number; satCents: number | null; sunCents: number | null }[]): WeekendMeal {
  const byDay = new Map<IsoDate, number>();
  let saturdays = 0, sundays = 0;
  for (const w of worked) {
    const v = w.weekday === 6 ? w.satCents : w.weekday === 7 ? w.sunCents : null;
    if (v == null) continue;
    if (!byDay.has(w.date)) { if (w.weekday === 6) saturdays++; else sundays++; }
    byDay.set(w.date, Math.max(byDay.get(w.date) ?? 0, v));
  }
  return { saturdays, sundays, cents: [...byDay.values()].reduce((a, b) => a + b, 0) };
}

/** Soma a alimentação de fim de semana na linha (e no total a depositar). */
export function addWeekend(row: TransportRow, w: WeekendMeal | undefined): TransportRow {
  if (!w || w.cents === 0) return row;
  const mealCents = (row.mealCents ?? 0) + w.cents;
  return { ...row, weekend: w, mealCents, depositCents: (row.totalCents ?? 0) + mealCents };
}
