import { addDays, weekdayOf, type IsoDate } from '@/domain/dates';
import { cycleIndex, cyclePhase, intersect, type MonthInfo } from './calendar';
import type { RuleParams } from './rules';
import type { Absence, Alert, Cell, CellKind, DayPlan, Grid, Member, Post, Rule, Shift3, Window } from './types';

/**
 * Motor de geração (determinístico). Etapas:
 * 1. calendário já resolvido (DayPlan por dia, inclusive dias de outro mês na
 *    1ª e na última semana — a semana é sempre inteira, de segunda a domingo);
 * 2. ausências, folgas fixas, disponibilidade e revezamentos A/B (fase pela data
 *    de referência, sem reiniciar no dia 1º);
 * 3. folgas da semana (5x2 para CLT/FUNAP) onde a cobertura sobra mais;
 * 4. quem cobre a folga de quem (regra) e cobertura avulsa (MEI/freelancer nos
 *    dias disponíveis) só para postos descobertos.
 * Nunca inventa gente: o que não fecha vira alerta na validação.
 */

export interface EngineInput {
  month: MonthInfo;
  days: Map<IsoDate, DayPlan>;
  members: Member[];
  posts: Post[];
  rules: Rule[];
  absences: Absence[];
  cycleRef: IsoDate;
  /** Células já salvas antes do dia 1º (escala do mês anterior): ficam como estão. */
  prior: Grid;
  /** Rodízio de feriados: quem trabalhou menos feriados (histórico) trabalha o próximo. */
  holidayRotate?: boolean;
  /** Feriados já trabalhados por pessoa nos meses anteriores. */
  holidayHistory?: Record<string, number>;
  /** Último feriado trabalhado por pessoa (desempate: quem trabalhou há mais tempo vai antes). */
  holidayLast?: Record<string, IsoDate>;
  /** Quantas pessoas trabalham no feriado (vazio = a equipe do dia). */
  holidayStaff?: number | null;
}

export const OFF_KINDS: ReadonlySet<CellKind> = new Set(['FOLGA', 'BANCO', 'FECHADO', 'FERIAS', 'ATESTADO', 'FALTA', 'AFASTAMENTO', 'INDISPONIVEL']);
const ABSENCE_KIND: Record<string, CellKind> = { FERIAS: 'FERIAS', ATESTADO: 'ATESTADO', FALTA: 'FALTA', AFASTAMENTO: 'AFASTAMENTO', INDISPONIVEL: 'INDISPONIVEL', FOLGA: 'FOLGA' };

/** Quem entra na geração automática (com horário habitual definido). */
export const isScheduled = (m: Member) => m.mode === 'FIXO' && m.autoSchedule && (!!m.hours.base || !!m.hours.week);
export const hasPattern = (m: Member) => !!m.hours.week?.A?.length || !!m.hours.week?.cycle?.length;

/** Rótulo da semana da grade ("semana A" ou "semana 3/6 do rodízio"). */
export function patternWeekLabel(m: Member, date: IsoDate, cycleRef: IsoDate): string {
  const n = m.hours.week?.cycle?.length;
  return n ? `semana ${cycleIndex(date, cycleRef, n) + 1}/${n} do rodízio` : `semana ${cyclePhase(date, cycleRef)}`;
}

/** Turno da grade cíclica no dia: undefined = sem grade; null = folga da grade. */
export function patternShift(m: Member, d: DayPlan, cycleRef: IsoDate): Shift3 | null | undefined {
  const w = m.hours.week;
  const wd = d.asWeekday ?? d.weekday;
  if (w?.cycle?.length) return w.cycle[cycleIndex(d.date, cycleRef, w.cycle.length)]![wd - 1] ?? null;
  if (!w?.A?.length) return undefined;
  const week = cyclePhase(d.date, cycleRef) === 'B' && w.B?.length ? w.B : w.A;
  return week[wd - 1] ?? null;
}
/** Vínculos com meta semanal de dias (CLT 5x2, FUNAP 6x1); MEI e freelancer seguem a disponibilidade. */
export const fiveByTwo = (m: Member) => m.bond === 'CLT' || m.bond === 'FUNAP';
/** Folgas por semana do vínculo: CLT 2 (5x2), FUNAP 1 (contrato 6x1). */
export const weeklyOffs = (m: Member) => (m.bond === 'FUNAP' ? 1 : 2);

export function absenceOn(absences: Absence[], memberId: string, date: IsoDate): Absence | undefined {
  return absences.find((a) => a.memberId === memberId && a.start <= date && date <= a.end);
}

export const isRealHoliday = (d: DayPlan) => !!d.holiday && d.holiday.scope !== 'FACULTATIVO';

/** Horário do colaborador no dia (sábado/domingo/feriado têm exceção), recortado ao funcionamento. */
export function shiftFor(m: Member, d: DayPlan, cycleRef?: IsoDate): Shift3 | null {
  const pat = cycleRef ? patternShift(m, d, cycleRef) : undefined;
  const wd = d.asWeekday ?? d.weekday;
  const raw = (isRealHoliday(d) && m.hours.F) || pat || (pat === undefined && ((wd === 6 && m.hours['6']) || (wd === 7 && m.hours['7']) || m.hours.base));
  if (!raw || !d.open.length) return null;
  const [s, e, b] = raw;
  const piece = intersect([[s, e]], d.open)[0];
  if (!piece) return null;
  return [piece[0], piece[1], b];
}

/** Postos do dia (feriado usa os postos marcados "feriado"; sem nenhum, os do dia da semana) + mínimos por regra. */
export function postsOn(d: DayPlan, posts: Post[], rules: Rule[]): Post[] {
  if (!d.open.length) return [];
  const holiday = isRealHoliday(d);
  const hasHolidayPosts = posts.some((p) => p.weekdays.includes(8));
  // Feriado "como sábado/domingo" usa os postos desse dia (sem postos marcados para feriado).
  const wd = d.asWeekday ?? d.weekday;
  const fromPosts = posts.filter((p) => (holiday && hasHolidayPosts ? p.weekdays.includes(8) : p.weekdays.includes(wd)));
  const fromRules: Post[] = rules.filter((r) => r.kind === 'MINIMO_PESSOAS').flatMap((r) => {
    const p = r.params as RuleParams<'MINIMO_PESSOAS'>;
    if (!p.weekdays.includes(d.asWeekday ?? d.weekday)) return [];
    return [{ id: r.id, name: r.label, kind: null, startMin: p.startMin, endMin: p.endMin, weekdays: p.weekdays, minPeople: p.min, functionName: p.functionName, mandatory: r.mandatory }];
  });
  return [...fromPosts, ...fromRules].flatMap((p) => {
    const w = intersect([[p.startMin, p.endMin]], d.open)[0];
    return w ? [{ ...p, startMin: w[0], endMin: w[1] }] : [];
  });
}

export const hasFunction = (m: Member, fn: string | null) => !fn || [m.functionName, ...m.altFunctions].some((f) => f && f.trim().toLowerCase() === fn.trim().toLowerCase());

/** A célula cobre o posto? Precisa estar lá do início ao fim do posto (abertura: chegar até a hora; fechamento: ficar até o fim). */
export function covers(cell: Cell | undefined, m: Member, p: Post): boolean {
  if (!cell || cell.kind !== 'TRABALHO' || cell.startMin == null || cell.endMin == null) return false;
  return cell.startMin <= p.startMin && cell.endMin >= p.endMin && hasFunction(m, p.functionName);
}

export function availableOn(m: Member, d: DayPlan): boolean {
  if (m.availableDays.length && !m.availableDays.includes(d.weekday)) return false;
  if (d.weekday === 6 && !m.saturday) return false;
  if (d.weekday === 7 && !m.sunday) return false;
  if (isRealHoliday(d) && !m.holiday) return false;
  return true;
}

interface DayRule { off: string[]; work: { reason: string; mandatory: boolean }[] }

/** Folgas e dias obrigatórios que as regras e o cadastro impõem a cada pessoa num dia. */
export function dayRules(m: Member, d: DayPlan, rules: Rule[], cycleRef: IsoDate): DayRule {
  const off: string[] = [];
  const work: DayRule['work'] = [];
  if (m.fixedOff.includes(d.weekday)) off.push('folga fixa');
  if (!availableOn(m, d)) off.push('indisponível neste dia');
  const phase = cyclePhase(d.date, cycleRef);
  for (const r of rules) {
    switch (r.kind) {
      case 'FOLGA_FIXA': {
        const p = r.params as RuleParams<'FOLGA_FIXA'>;
        if (p.memberId === m.id && p.weekdays.includes(d.weekday)) off.push(r.label);
        break;
      }
      case 'TRABALHA_SEMPRE': {
        const p = r.params as RuleParams<'TRABALHA_SEMPRE'>;
        if (p.memberId === m.id && p.weekdays.includes(d.weekday)) work.push({ reason: r.label, mandatory: r.mandatory });
        break;
      }
      case 'ALTERNAR_FIM_DE_SEMANA': {
        const p = r.params as RuleParams<'ALTERNAR_FIM_DE_SEMANA'>;
        if (!(p.weekdays as number[]).includes(d.weekday)) break;
        const onDuty = phase === 'A' ? p.groupA : p.groupB;
        const offDuty = phase === 'A' ? p.groupB : p.groupA;
        if (onDuty.includes(m.id)) work.push({ reason: `${r.label} (semana ${phase})`, mandatory: r.mandatory });
        if (offDuty.includes(m.id)) off.push(`${r.label} (semana ${phase})`);
        break;
      }
      case 'ALTERNAR_FOLGA': {
        const p = r.params as RuleParams<'ALTERNAR_FOLGA'>;
        const [d1, d2] = p.weekdays;
        const offA = phase === 'A' ? d1 : d2;
        const offB = phase === 'A' ? d2 : d1;
        if (p.memberA === m.id && d.weekday === offA) off.push(`${r.label} (semana ${phase})`);
        if (p.memberB === m.id && d.weekday === offB) off.push(`${r.label} (semana ${phase})`);
        break;
      }
    }
  }
  return { off, work };
}

/** Na semana em que trabalha o fim de semana com compensação, a meta é 6 dias (média 5x2 na quinzena). */
export function inCompensatedRotation(m: Member, rules: Rule[]): boolean {
  return rules.some((r) => r.kind === 'ALTERNAR_FIM_DE_SEMANA' && (r.params as RuleParams<'ALTERNAR_FIM_DE_SEMANA'>).compensate
    && [...(r.params as RuleParams<'ALTERNAR_FIM_DE_SEMANA'>).groupA, ...(r.params as RuleParams<'ALTERNAR_FIM_DE_SEMANA'>).groupB].includes(m.id));
}

function compensatedWeek(m: Member, monday: IsoDate, rules: Rule[], cycleRef: IsoDate): boolean {
  const phase = cyclePhase(monday, cycleRef);
  return rules.some((r) => {
    if (r.kind !== 'ALTERNAR_FIM_DE_SEMANA') return false;
    const p = r.params as RuleParams<'ALTERNAR_FIM_DE_SEMANA'>;
    return p.compensate && (phase === 'A' ? p.groupA : p.groupB).includes(m.id);
  });
}

const workCell = (s: Shift3, note: string | null = null): Cell => ({ kind: 'TRABALHO', startMin: s[0], endMin: s[1], breakMin: s[2], note });

export function generate(input: EngineInput): { grid: Grid; alerts: Alert[] } {
  const { month, days, members, posts, rules, absences, cycleRef, prior } = input;
  const grid: Grid = {};
  const alerts: Alert[] = [];
  const forcedWork = new Map<string, Set<IsoDate>>();
  const dates = [...days.keys()].sort();
  const isPrior = (mid: string, date: IsoDate) => date < month.first && !!prior[mid]?.[date];

  // Etapa 2: o que já está decidido por ausência, calendário, cadastro e regras.
  for (const m of members) {
    const row: Record<IsoDate, Cell> = {};
    const must = new Set<IsoDate>();
    for (const date of dates) {
      const d = days.get(date)!;
      if (isPrior(m.id, date)) { row[date] = prior[m.id]![date]!; continue; }
      const abs = absenceOn(absences, m.id, date);
      if (abs) {
        row[date] = { kind: ABSENCE_KIND[abs.type] ?? 'INDISPONIVEL', note: abs.type === 'FOLGA' ? 'Folga extraordinária' : abs.substituteName ? `Substituto: ${abs.substituteName}` : null };
        continue;
      }
      if (!isScheduled(m)) { row[date] = { kind: 'SEM_GRADE' }; continue; }
      if (!d.open.length) { row[date] = { kind: 'FECHADO' }; continue; }
      const r = dayRules(m, d, rules, cycleRef);
      if (r.off.length) {
        row[date] = { kind: 'FOLGA', note: r.off[0]! };
        const clash = r.work.find((w) => w.mandatory) ?? r.work[0];
        if (clash && date >= month.first && date <= month.last) {
          alerts.push({ level: clash.mandatory ? 'CONFLITO' : 'AJUSTE', code: 'REGRA_CHOQUE', date, memberId: m.id, message: `${m.name}: "${clash.reason}" pede trabalho, mas é ${r.off[0]} — ficou de folga.` });
        }
        continue;
      }
      if (patternShift(m, d, cycleRef) === null) {
        row[date] = { kind: 'FOLGA', note: d.asWeekday ? `Feriado: ${d.holiday!.name}` : `Folga da grade (${patternWeekLabel(m, date, cycleRef)})` };
        continue;
      }
      const s = shiftFor(m, d, cycleRef);
      if (!s) { row[date] = { kind: 'FOLGA', note: 'Horário fora do funcionamento do setor' }; continue; }
      row[date] = workCell(s);
      if (r.work.length) must.add(date);
    }
    grid[m.id] = row;
    forcedWork.set(m.id, must);
  }

  // Etapa 2b: feriados com equipe reduzida e/ou rodízio. Os turnos do feriado são
  // os de sábado/domingo da semana (modo do setor) ou o horário de feriado; vão para
  // quem trabalhou menos feriados (histórico dos meses), depois quem trabalhou há
  // mais tempo, depois quem já estava escalado, depois a ordem da equipe. Quem não
  // foi escolhido folga ("Feriado").
  const staff = input.holidayStaff && input.holidayStaff > 0 ? input.holidayStaff : null;
  if (input.holidayRotate || staff) {
    const count = new Map(members.map((m) => [m.id, input.holidayHistory?.[m.id] ?? 0]));
    const last = new Map(members.map((m) => [m.id, input.holidayLast?.[m.id] ?? '']));
    const order = new Map(members.map((m, i) => [m.id, i]));
    for (const date of dates.filter((d) => d >= month.first && d <= month.last)) {
      const d = days.get(date)!;
      if (!isRealHoliday(d) || !d.open.length || (!d.asWeekday && !staff)) continue;
      const holders = members.filter((m) => grid[m.id]![date]!.kind === 'TRABALHO');
      const n = staff ?? holders.length;
      if (!n) continue;
      const window = d.open[0]!;
      const gross = window[1] - window[0];
      const templates: Cell[] = d.asWeekday && holders.length
        ? holders.map((m) => grid[m.id]![date]!)
        : [{ kind: 'TRABALHO', startMin: window[0], endMin: window[1], breakMin: gross > 360 ? 60 : gross > 240 ? 15 : 0 }];
      const eligible = members.filter((m) => isScheduled(m) && !absenceOn(absences, m.id, date) && availableOn(m, d) && grid[m.id]![date]!.kind !== 'FECHADO');
      const rank = (a: Member, b: Member) => (input.holidayRotate ? count.get(a.id)! - count.get(b.id)! || last.get(a.id)!.localeCompare(last.get(b.id)!) : 0)
        || Number(holders.includes(b)) - Number(holders.includes(a)) || order.get(a.id)! - order.get(b.id)!;
      const chosen = [...eligible].sort(rank).slice(0, n);
      for (const m of eligible) {
        if (grid[m.id]![date]!.kind === 'TRABALHO') grid[m.id]![date] = { kind: 'FOLGA', note: `Feriado: ${d.holiday!.name}` };
      }
      chosen.forEach((m, i) => {
        const t = templates[i % templates.length]!;
        grid[m.id]![date] = workCell([t.startMin!, t.endMin!, t.breakMin ?? 0], `Feriado${input.holidayRotate ? ' (rodízio)' : ''}: ${d.holiday!.name}`);
        forcedWork.get(m.id)?.add(date);
        count.set(m.id, count.get(m.id)! + 1);
        last.set(m.id, date);
      });
    }
  }

  // Etapa 3: folgas da semana (5x2) onde a cobertura sobra mais.
  const dayPosts = new Map(dates.map((date) => [date, postsOn(days.get(date)!, posts, rules)]));
  const avoidGroups = rules.filter((r) => r.kind === 'EVITAR_FOLGA_JUNTA').map((r) => r.params as RuleParams<'EVITAR_FOLGA_JUNTA'>);
  const byId = new Map(members.map((m) => [m.id, m]));
  const slack = (m: Member, date: IsoDate) => {
    let min = 99;
    for (const p of dayPosts.get(date)!) {
      if (!covers(grid[m.id]![date], m, p)) continue;
      const n = members.filter((x) => covers(grid[x.id]![date], x, p)).length;
      min = Math.min(min, n - p.minPeople);
    }
    return min;
  };
  for (const week of month.weeks) {
    for (const m of members) {
      // A grade cíclica já define as folgas da semana.
      if (!isScheduled(m) || !fiveByTwo(m) || hasPattern(m)) continue;
      const row = grid[m.id]!;
      const target = compensatedWeek(m, week.monday, rules, cycleRef) ? 1 : weeklyOffs(m);
      let offs = week.days.filter((d) => row[d]!.kind !== 'TRABALHO').length;
      while (offs < target) {
        const cands = week.days.filter((d) => row[d]!.kind === 'TRABALHO' && !isPrior(m.id, d) && !forcedWork.get(m.id)!.has(d));
        if (!cands.length) break;
        const score = (d: IsoDate) => {
          const s = slack(m, d);
          const wd = weekdayOf(d);
          const together = avoidGroups.filter((g) => g.memberIds.includes(m.id) && g.weekdays.includes(wd))
            .reduce((n, g) => n + g.memberIds.filter((o) => o !== m.id && byId.has(o) && grid[o]?.[d]?.kind === 'FOLGA').length, 0);
          const adjacent = [addDays(d, -1), addDays(d, 1)].some((x) => row[x] && row[x]!.kind !== 'TRABALHO');
          return (s >= 1 ? 0 : 1000) - Math.min(s, 20) * 10 + together * 50 + (adjacent ? 0 : 3);
        };
        const best = cands.reduce((a, b) => (score(b) < score(a) ? b : a));
        row[best] = { kind: 'FOLGA', note: 'Folga da semana (5x2)' };
        offs++;
      }
    }
  }

  // Etapa 4a: quem cobre a folga de quem.
  const monthDates = dates.filter((d) => d >= month.first && d <= month.last);
  for (const r of rules.filter((x) => x.kind === 'COBRE_FOLGA')) {
    const p = r.params as RuleParams<'COBRE_FOLGA'>;
    const cover = byId.get(p.coverId);
    const covered = byId.get(p.coveredId);
    if (!cover || !covered) continue;
    for (const date of monthDates) {
      const d = days.get(date)!;
      const c = grid[covered.id]![date]!;
      if (!d.open.length || c.kind === 'TRABALHO' || c.kind === 'SEM_GRADE' || c.kind === 'FECHADO') continue;
      // Se já trabalharia no dia, passa a fazer o horário de quem folga (ex.: Caio assume a abertura).
      if (absenceOn(absences, cover.id, date) || !availableOn(cover, d) || grid[cover.id]![date]!.note?.startsWith('Cobre')) continue;
      const base = p.startMin != null && p.endMin != null ? ([p.startMin, p.endMin, 0] as Shift3) : shiftFor({ ...covered, hours: { ...covered.hours, week: undefined } }, d);
      if (!base) continue;
      const w = intersect([[base[0], base[1]]], d.open)[0];
      if (!w) continue;
      grid[cover.id]![date] = workCell([w[0], w[1], base[2]], `Cobre a folga de ${covered.name}`);
    }
  }

  // Etapa 4b: cobertura avulsa (MEI/freelancer nos dias disponíveis) só onde falta gente.
  const coverCount = new Map<string, number>();
  for (const date of monthDates) {
    const d = days.get(date)!;
    for (const p of dayPosts.get(date)!) {
      let n = members.filter((x) => covers(grid[x.id]![date], x, p)).length;
      while (n < p.minPeople) {
        const pool = members.filter((x) => x.mode === 'COBERTURA' && x.autoSchedule && grid[x.id]![date]!.kind !== 'TRABALHO'
          && !absenceOn(absences, x.id, date) && availableOn(x, d) && hasFunction(x, p.functionName))
          .sort((a, b) => (coverCount.get(a.id) ?? 0) - (coverCount.get(b.id) ?? 0) || a.name.localeCompare(b.name, 'pt-BR'));
        const pick = pool[0];
        if (!pick) break;
        const dur = p.endMin - p.startMin;
        grid[pick.id]![date] = workCell([p.startMin, p.endMin, dur > 360 ? 60 : 0], `Cobertura: ${p.name}`);
        coverCount.set(pick.id, (coverCount.get(pick.id) ?? 0) + 1);
        n++;
      }
    }
  }
  return { grid, alerts };
}

export const windowOf = (c: Cell): Window | null => (c.kind === 'TRABALHO' && c.startMin != null && c.endMin != null ? [c.startMin, c.endMin] : null);
