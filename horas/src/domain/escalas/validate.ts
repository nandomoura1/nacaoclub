import { addDays, formatClock, formatDateBR, weekdayOf, type IsoDate } from '@/domain/dates';
import { cyclePhase, type MonthInfo } from './calendar';
import { absenceOn, availableOn, covers, fiveByTwo, hasFunction, inCompensatedRotation, isRealHoliday, isScheduled, OFF_KINDS, postsOn } from './engine';
import type { RuleParams } from './rules';
import type { Absence, Alert, Cell, DayPlan, Grid, LegalParams, Member, Post, Rule } from './types';

/**
 * Validação e análise (determinísticas). Roda depois de gerar e a cada edição
 * manual. Classifica: SEM CONFLITOS só quando a cobertura e as regras
 * obrigatórias fecham E os parâmetros legais estão cadastrados e validados.
 */

export type Classification = 'SEM_CONFLITOS' | 'AJUSTES' | 'COM_CONFLITO';
export const CLASSIFICATION_LABEL: Record<Classification, string> = {
  SEM_CONFLITOS: 'Sem conflitos identificados',
  AJUSTES: 'Ajustes necessários',
  COM_CONFLITO: 'Com conflito',
};

export interface MemberStats {
  memberId: string;
  name: string;
  bond: string;
  minutes: number;
  days: number;
  offs: number;
  saturdays: number;
  sundays: number;
  holidays: number;
  absenceDays: number;
  /** Folgas compensadas com o banco de horas. */
  bankDays: number;
  /** Banco de horas previsto: horas da escala − referência (carga semanal × dias do mês ÷ 7, sem as ausências abonadas e os feriados). */
  expectedMin: number | null;
  balanceMin: number | null;
  /** Saldo trazido dos meses anteriores e o acumulado (anterior + este mês). */
  carryMin: number | null;
  totalBankMin: number | null;
}

export interface Uncovered { date: IsoDate; post: string; kind: string | null; missing: number; mandatory: boolean; suggestions: string[] }

export interface Analysis {
  classification: Classification;
  alerts: Alert[];
  members: MemberStats[];
  totals: {
    people: number;
    minutes: number;
    offs: number;
    vacationDays: number;
    absenceDays: number;
    opening: { covered: number; total: number };
    closing: { covered: number; total: number };
    coverageShifts: number;
    uncovered: number;
    rulesUnmet: number;
  };
  uncovered: Uncovered[];
}

export interface ValidateInput {
  month: MonthInfo;
  days: Map<IsoDate, DayPlan>;
  members: Member[];
  posts: Post[];
  rules: Rule[];
  absences: Absence[];
  cycleRef: IsoDate;
  /** Grade com o mês e, quando houver, os dias vizinhos (semana inteira). */
  grid: Grid;
  legal: Partial<Record<string, LegalParams>>;
  /** A mesma pessoa em outro setor no mesmo dia (para "não trabalha em dois setores ao mesmo tempo"). */
  elsewhere?: { memberId: string; date: IsoDate; startMin: number; endMin: number; sector: string }[];
  /** Saldo do banco de horas dos meses anteriores, por pessoa. */
  bankCarry?: Record<string, number>;
}

export const workedMin = (c: Cell | undefined) =>
  c && c.kind === 'TRABALHO' && c.startMin != null && c.endMin != null ? Math.max(0, c.endMin - c.startMin - (c.breakMin ?? 0)) : 0;
const hm = (min: number) => `${Math.floor(min / 60)}h${min % 60 ? String(min % 60).padStart(2, '0') : ''}`;
const br = (d: IsoDate) => formatDateBR(d).slice(0, 5);
const PAID_ABSENCE = new Set(['FERIAS', 'ATESTADO', 'AFASTAMENTO']);

export function validate(v: ValidateInput): Analysis {
  const { month, days, members, rules, absences, grid, legal, cycleRef } = v;
  const alerts: Alert[] = [];
  const push = (a: Alert) => alerts.push(a);
  const inMonth = (d: IsoDate) => d >= month.first && d <= month.last;
  const cell = (mid: string, d: IsoDate) => grid[mid]?.[d];
  const isWork = (mid: string, d: IsoDate) => cell(mid, d)?.kind === 'TRABALHO';
  const byId = new Map(members.map((m) => [m.id, m]));

  // Calendário: o que pede confirmação do gestor.
  for (const d of month.days) {
    const p = days.get(d)!;
    p.confirm.forEach((msg) => push({ level: 'AJUSTE', code: 'CALENDARIO', date: d, message: `${br(d)}: ${msg}` }));
  }

  // Pendências de cadastro.
  for (const m of members) {
    if (m.mode === 'FIXO' && m.autoSchedule && !m.hours.base && !m.hours.week) push({ level: 'AJUSTE', code: 'SEM_HORARIO', memberId: m.id, message: `${m.name}: horário habitual não cadastrado — fica fora da geração.` });
    if (!m.autoSchedule) push({ level: 'INFO', code: 'FORA_DA_GERACAO', memberId: m.id, message: `${m.name}: fora da geração automática (sem grade definida).` });
  }
  const bonds = new Set(members.filter((m) => isScheduled(m) || m.mode === 'COBERTURA').map((m) => m.bond));
  for (const b of bonds) {
    if (b === 'MEI' || b === 'FREELANCER') continue;
    const p = legal[b];
    if (!p) push({ level: 'AJUSTE', code: 'LEGAL_PENDENTE', message: `Parâmetros de jornada para ${b} não cadastrados: a escala não pode ser declarada regular. Cadastre em Parâmetros legais (validados pelo DP).` });
    else if (!p.validated) push({ level: 'AJUSTE', code: 'LEGAL_NAO_VALIDADO', message: `Parâmetros de jornada ${b} (vigência ${formatDateBR(p.validFrom)}) ainda não validados pelo Departamento Pessoal.` });
  }

  // Cobertura dos postos e mínimos.
  const uncovered: Uncovered[] = [];
  const opening = { covered: 0, total: 0 };
  const closing = { covered: 0, total: 0 };
  for (const date of month.days) {
    const d = days.get(date)!;
    for (const p of postsOn(d, v.posts, rules)) {
      const n = members.filter((m) => covers(cell(m.id, date), m, p)).length;
      const ok = n >= p.minPeople;
      if (p.kind === 'ABERTURA') { opening.total++; if (ok) opening.covered++; }
      if (p.kind === 'FECHAMENTO') { closing.total++; if (ok) closing.covered++; }
      if (ok) continue;
      const suggestions = members.filter((m) => !isWork(m.id, date) && !absenceOn(absences, m.id, date) && availableOn(m, d) && hasFunction(m, p.functionName) && (m.mode === 'COBERTURA' || isScheduled(m)))
        .map((m) => m.mode === 'COBERTURA' ? `${m.name} (cobertura ${m.bond === 'MEI' ? 'MEI' : 'freelancer'})` : `${m.name} (trocar a folga)`).slice(0, 4);
      uncovered.push({ date, post: p.name, kind: p.kind, missing: p.minPeople - n, mandatory: p.mandatory, suggestions });
      push({
        level: p.mandatory ? 'CONFLITO' : 'AJUSTE', code: 'DESCOBERTO', date,
        message: `${br(date)} ${p.name} (${formatClock(p.startMin)}–${formatClock(p.endMin)}): falta${p.minPeople - n > 1 ? 'm' : ''} ${p.minPeople - n} pessoa(s)${p.functionName ? ` com a função ${p.functionName}` : ''}.`,
        suggestions: suggestions.length ? suggestions : ['Ninguém disponível na equipe: avalie um freelancer ou ajuste o horário do posto.'],
      });
    }
    for (const e of d.events) {
      if (e.extraPeople <= 0) continue;
      const sug = members.filter((m) => !isWork(m.id, date) && !absenceOn(absences, m.id, date) && availableOn(m, d) && (m.mode === 'COBERTURA' || isScheduled(m))).map((m) => m.name).slice(0, 5);
      push({ level: 'AJUSTE', code: 'EVENTO', date, message: `${br(date)} ${e.name}: pede reforço de ${e.extraPeople} pessoa(s)${e.window ? ` (${formatClock(e.window[0])}–${formatClock(e.window[1])})` : ''}. A escala não muda sozinha.`, suggestions: sug.length ? sug.map((s) => `Reforço possível: ${s}`) : ['Sem ninguém livre na equipe nesta data.'] });
    }
  }

  // Por pessoa: ausências, disponibilidade, jornada, descanso, domingos.
  const statsOf: MemberStats[] = [];
  const sortedDates = Object.keys(Object.assign({}, ...Object.values(grid))).sort();
  for (const m of members) {
    const row = grid[m.id] ?? {};
    const L = legal[m.bond];
    const clt = fiveByTwo(m);
    for (const date of month.days) {
      const c = row[date];
      if (!c || c.kind !== 'TRABALHO') continue;
      const d = days.get(date)!;
      const abs = absenceOn(absences, m.id, date);
      if (abs) {
        const subs = members.filter((o) => o.id !== m.id && !isWork(o.id, date) && !absenceOn(absences, o.id, date) && availableOn(o, d) && hasFunction(o, m.functionName)).map((o) => o.name).slice(0, 4);
        push({ level: 'CONFLITO', code: 'AUSENTE_ESCALADO', date, memberId: m.id, message: `${br(date)}: ${m.name} tem ${abs.type.toLowerCase().replace('_', ' ')} e está escalado(a).`, suggestions: subs.length ? subs.map((s) => `Substituir por ${s}`) : ['Sem substituto livre na equipe.'] });
      }
      if (!d.open.length) push({ level: 'CONFLITO', code: 'DIA_FECHADO', date, memberId: m.id, message: `${br(date)}: ${m.name} escalado(a) com o setor fechado.` });
      if (!availableOn(m, d)) push({ level: 'CONFLITO', code: 'INDISPONIVEL', date, memberId: m.id, message: `${br(date)}: ${m.name} não está disponível neste dia (cadastro).` });
      if (m.fixedOff.includes(d.weekday)) push({ level: 'CONFLITO', code: 'FOLGA_FIXA', date, memberId: m.id, message: `${br(date)}: ${m.name} trabalha no dia da folga fixa.` });
      if (clt && isRealHoliday(d)) push({ level: 'INFO', code: 'FERIADO', date, memberId: m.id, message: `${br(date)} (${d.holiday!.name}): ${m.name} trabalha no feriado — pagar em dobro ou dar folga compensatória.` });
      if (!L || !clt) continue;
      const gross = c.endMin! - c.startMin!;
      const net = workedMin(c);
      if (L.maxDailyMin != null && net > L.maxDailyMin + (L.maxDailyExtraMin ?? 0)) push({ level: 'CONFLITO', code: 'JORNADA_DIA', date, memberId: m.id, message: `${br(date)}: ${m.name} com ${hm(net)} no dia (máximo ${hm(L.maxDailyMin + (L.maxDailyExtraMin ?? 0))} com extras).` });
      else if (L.maxDailyMin != null && net > L.maxDailyMin) push({ level: 'AJUSTE', code: 'HORA_EXTRA', date, memberId: m.id, message: `${br(date)}: ${m.name} com ${hm(net)} (acima de ${hm(L.maxDailyMin)}: hora extra).` });
      if (L.breakLongOverMin != null && L.breakLongMin != null && gross > L.breakLongOverMin && (c.breakMin ?? 0) < L.breakLongMin) push({ level: 'CONFLITO', code: 'INTERVALO', date, memberId: m.id, message: `${br(date)}: ${m.name} com jornada acima de ${hm(L.breakLongOverMin)} pede intervalo de ${hm(L.breakLongMin)}.` });
      else if (L.breakShortOverMin != null && L.breakShortMin != null && gross > L.breakShortOverMin && gross <= (L.breakLongOverMin ?? 1440) && (c.breakMin ?? 0) < L.breakShortMin) push({ level: 'CONFLITO', code: 'INTERVALO', date, memberId: m.id, message: `${br(date)}: ${m.name} pede intervalo de ${L.breakShortMin} min.` });
      if (L.maxBreakMin != null && (c.breakMin ?? 0) > L.maxBreakMin) push({ level: 'CONFLITO', code: 'INTERVALO_MAXIMO', date, memberId: m.id, message: `${br(date)}: ${m.name} com ${hm(c.breakMin ?? 0)} de intervalo (máximo ${hm(L.maxBreakMin)} no contrato ${m.bond}).` });
      const prev = row[addDays(date, -1)];
      if (L.minRestBetweenMin != null && prev?.kind === 'TRABALHO' && prev.endMin != null) {
        const rest = 1440 - prev.endMin + c.startMin!;
        if (rest < L.minRestBetweenMin) push({ level: 'CONFLITO', code: 'INTERJORNADA', date, memberId: m.id, message: `${br(date)}: ${m.name} descansa só ${hm(rest)} entre as jornadas (mínimo ${hm(L.minRestBetweenMin)}).` });
      }
    }
    if (L && clt) {
      for (const w of month.weeks) {
        const min = w.days.reduce((s, d) => s + workedMin(row[d]), 0);
        const label = `semana de ${br(w.days[0]!)} a ${br(w.days[6]!)}`;
        if (L.maxWeeklyMin != null && min > L.maxWeeklyMin) push({ level: 'CONFLITO', code: 'JORNADA_SEMANA', date: w.monday, memberId: m.id, message: `${m.name}: ${hm(min)} na ${label} (máximo ${hm(L.maxWeeklyMin)}).` });
        // No revezamento compensado a semana do fim de semana passa da referência e a outra fica abaixo: confere no banco de horas do mês.
        else if (min > m.weeklyMin && !inCompensatedRotation(m, rules)) push({ level: 'AJUSTE', code: 'ACIMA_REFERENCIA', date: w.monday, memberId: m.id, message: `${m.name}: ${hm(min)} na ${label} (referência ${hm(m.weeklyMin)}).` });
      }
      if (L.maxConsecutiveDays != null) {
        let run = 0;
        for (const d of sortedDates) {
          run = row[d]?.kind === 'TRABALHO' ? run + 1 : 0;
          if (run === L.maxConsecutiveDays + 1 && inMonth(d)) push({ level: 'CONFLITO', code: 'DIAS_SEGUIDOS', date: d, memberId: m.id, message: `${m.name}: ${run} dias seguidos de trabalho até ${br(d)} (máximo ${L.maxConsecutiveDays}, descanso semanal).` });
        }
      }
      if (L.sundayOffEveryWeeks != null && L.sundayOffEveryWeeks > 0) {
        const sundays = sortedDates.filter((d) => weekdayOf(d) === 7 && row[d]);
        let run = 0;
        for (const d of sundays) {
          run = row[d]!.kind === 'TRABALHO' ? run + 1 : 0;
          if (run === L.sundayOffEveryWeeks && inMonth(d)) push({ level: 'CONFLITO', code: 'DOMINGO', date: d, memberId: m.id, message: `${m.name}: ${run} domingos seguidos trabalhados até ${br(d)} — folga no domingo ao menos 1 vez a cada ${L.sundayOffEveryWeeks} semanas.` });
        }
      }
    }
    // Dois setores ao mesmo tempo.
    for (const e of v.elsewhere ?? []) {
      if (e.memberId !== m.id || !inMonth(e.date)) continue;
      const c = row[e.date];
      if (c?.kind === 'TRABALHO' && c.startMin! < e.endMin && e.startMin < c.endMin!) push({ level: 'CONFLITO', code: 'DOIS_SETORES', date: e.date, memberId: m.id, message: `${br(e.date)}: ${m.name} também está escalado(a) em ${e.sector} no mesmo horário.` });
    }

    const md = month.days.map((d) => row[d]).filter(Boolean) as Cell[];
    const absenceDays = md.filter((c) => c.kind !== 'TRABALHO' && c.kind !== 'FOLGA' && c.kind !== 'BANCO' && c.kind !== 'FECHADO' && c.kind !== 'SEM_GRADE').length;
    const bankDays = md.filter((c) => c.kind === 'BANCO').length;
    const paidAbsence = month.days.filter((d) => PAID_ABSENCE.has(row[d]?.kind ?? '')).length;
    const minutes = month.days.reduce((s, d) => s + workedMin(row[d]), 0);
    // Feriado em dia útil é descanso remunerado: sai da referência; quem trabalha nele ganha crédito no banco.
    const holidaysOff = month.days.filter((d) => isRealHoliday(days.get(d)!) && weekdayOf(d) <= 5 && !PAID_ABSENCE.has(row[d]?.kind ?? '')).length;
    const perDay = m.weeklyMin / (m.bond === 'FUNAP' ? 6 : 5);
    const expectedMin = clt && isScheduled(m) ? Math.max(0, Math.round(m.weeklyMin * (month.length - paidAbsence) / 7 - holidaysOff * perDay)) : null;
    const carryMin = expectedMin == null ? null : Math.round(v.bankCarry?.[m.id] ?? 0);
    statsOf.push({
      memberId: m.id, name: m.name, bond: m.bond, minutes,
      days: md.filter((c) => c.kind === 'TRABALHO').length,
      offs: md.filter((c) => c.kind === 'FOLGA' || c.kind === 'FECHADO').length,
      saturdays: month.days.filter((d) => weekdayOf(d) === 6 && row[d]?.kind === 'TRABALHO').length,
      sundays: month.days.filter((d) => weekdayOf(d) === 7 && row[d]?.kind === 'TRABALHO').length,
      holidays: month.days.filter((d) => isRealHoliday(days.get(d)!) && row[d]?.kind === 'TRABALHO').length,
      absenceDays, bankDays, expectedMin, balanceMin: expectedMin == null ? null : minutes - expectedMin,
      carryMin, totalBankMin: expectedMin == null ? null : carryMin! + minutes - expectedMin,
    });
  }

  // Regras do setor.
  let rulesUnmet = 0;
  const unmet = (r: Rule, date: IsoDate, msg: string, memberId?: string) => {
    rulesUnmet++;
    push({ level: r.mandatory ? 'CONFLITO' : 'AJUSTE', code: 'REGRA', date, memberId, message: `${br(date)}: ${msg} (${r.mandatory ? 'obrigatória' : 'preferencial'}: ${r.label})` });
  };
  const name = (id: string) => byId.get(id)?.name ?? 'pessoa removida';
  const offKind = (mid: string, d: IsoDate) => OFF_KINDS.has(cell(mid, d)?.kind ?? 'SEM_GRADE');
  for (const r of rules) {
    for (const date of month.days) {
      const d = days.get(date)!;
      if (!d.open.length) continue;
      const phase = cyclePhase(date, cycleRef);
      // Ausência registrada ou folga do banco de horas: dia justificado, não descumpre a regra.
      const absent = (mid: string) => !!absenceOn(absences, mid, date) || cell(mid, date)?.kind === 'BANCO';
      switch (r.kind) {
        case 'FOLGA_FIXA': {
          const p = r.params as RuleParams<'FOLGA_FIXA'>;
          if (p.weekdays.includes(d.weekday) && isWork(p.memberId, date)) unmet(r, date, `${name(p.memberId)} trabalha no dia de folga`, p.memberId);
          break;
        }
        case 'TRABALHA_SEMPRE': {
          const p = r.params as RuleParams<'TRABALHA_SEMPRE'>;
          if (p.weekdays.includes(d.weekday) && !isWork(p.memberId, date) && !absent(p.memberId)) unmet(r, date, `${name(p.memberId)} deveria trabalhar`, p.memberId);
          break;
        }
        case 'ALTERNAR_FIM_DE_SEMANA': {
          const p = r.params as RuleParams<'ALTERNAR_FIM_DE_SEMANA'>;
          if (!(p.weekdays as number[]).includes(d.weekday)) break;
          const on = phase === 'A' ? p.groupA : p.groupB;
          const off = phase === 'A' ? p.groupB : p.groupA;
          on.filter((x) => byId.has(x) && !isWork(x, date) && !absent(x)).forEach((x) => unmet(r, date, `${name(x)} deveria trabalhar (semana ${phase})`, x));
          off.filter((x) => isWork(x, date)).forEach((x) => unmet(r, date, `${name(x)} deveria folgar (semana ${phase})`, x));
          break;
        }
        case 'ALTERNAR_FOLGA': {
          const p = r.params as RuleParams<'ALTERNAR_FOLGA'>;
          const [d1, d2] = p.weekdays;
          const offA = phase === 'A' ? d1 : d2;
          const offB = phase === 'A' ? d2 : d1;
          if (d.weekday === offA && isWork(p.memberA, date)) unmet(r, date, `${name(p.memberA)} deveria folgar (semana ${phase})`, p.memberA);
          if (d.weekday === offB && isWork(p.memberB, date)) unmet(r, date, `${name(p.memberB)} deveria folgar (semana ${phase})`, p.memberB);
          break;
        }
        case 'EVITAR_FOLGA_JUNTA': {
          const p = r.params as RuleParams<'EVITAR_FOLGA_JUNTA'>;
          // Feriado que funciona como sábado/domingo não é "dia útil": folga coletiva é esperada.
          if (!p.weekdays.includes(d.asWeekday ?? d.weekday)) break;
          const off = p.memberIds.filter((x) => byId.has(x) && cell(x, date)?.kind === 'FOLGA');
          if (off.length > 1) unmet(r, date, `${off.map(name).join(' e ')} de folga no mesmo dia`);
          break;
        }
        case 'COBRE_FOLGA': {
          const p = r.params as RuleParams<'COBRE_FOLGA'>;
          if (offKind(p.coveredId, date) && cell(p.coveredId, date)?.kind !== 'FECHADO' && !isWork(p.coverId, date) && byId.has(p.coverId)) unmet(r, date, `${name(p.coveredId)} de folga e ${name(p.coverId)} não está cobrindo`);
          break;
        }
      }
    }
  }

  const has = (lvl: Alert['level']) => alerts.some((a) => a.level === lvl);
  const classification: Classification = has('CONFLITO') ? 'COM_CONFLITO' : has('AJUSTE') ? 'AJUSTES' : 'SEM_CONFLITOS';
  const order = { CONFLITO: 0, AJUSTE: 1, INFO: 2 } as const;
  alerts.sort((a, b) => order[a.level] - order[b.level] || (a.date ?? '').localeCompare(b.date ?? ''));
  return {
    classification,
    alerts,
    members: statsOf,
    totals: {
      people: statsOf.filter((s) => s.days > 0).length,
      minutes: statsOf.reduce((s, x) => s + x.minutes, 0),
      offs: statsOf.reduce((s, x) => s + x.offs, 0),
      vacationDays: members.reduce((s, m) => s + month.days.filter((d) => cell(m.id, d)?.kind === 'FERIAS').length, 0),
      absenceDays: statsOf.reduce((s, x) => s + x.absenceDays, 0),
      opening, closing,
      coverageShifts: members.filter((m) => m.mode === 'COBERTURA').reduce((s, m) => s + month.days.filter((d) => isWork(m.id, d)).length, 0),
      uncovered: uncovered.length,
      rulesUnmet,
    },
    uncovered,
  };
}
