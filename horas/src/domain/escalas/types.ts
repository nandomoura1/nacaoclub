import type { IsoDate } from '@/domain/dates';

/**
 * Escalas de Trabalho 5x2 — tipos puros. O motor não conhece banco nem tela:
 * recebe o calendário já resolvido, a equipe, os postos e as regras, e devolve
 * a grade + a análise. Tudo determinístico (mesma entrada → mesma escala).
 */

export type Bond = 'CLT' | 'FUNAP' | 'MEI' | 'FREELANCER';
export type Mode = 'FIXO' | 'COBERTURA';
/** Janela [início, fim) em minutos desde a meia-noite. */
export type Window = [number, number];
/** Chave de dia: '1' = segunda … '7' = domingo; 'F' = feriado. */
export type DayKey = '1' | '2' | '3' | '4' | '5' | '6' | '7' | 'F';
/** Horário de funcionamento: sem a chave = não definido; [] = fechado. */
export type HoursMap = Partial<Record<DayKey, Window[]>>;
/** [entrada, saída, intervalo] em minutos. */
export type Shift3 = [number, number, number];
/** Semana-modelo: 7 posições (segunda … domingo); null = folga. */
export type WeekPattern = (Shift3 | null)[];
/**
 * Horário do colaborador: `base` + exceções de sábado, domingo e feriado; ou
 * `week` = grade cíclica do setor (semana A e, se diferente, semana B), como
 * nos modelos do documento. Com `week`, a grade define dias e folgas.
 */
export type MemberHours = { base?: Shift3; week?: WeekCycle } & Partial<Record<'6' | '7' | 'F', Shift3>>;
/**
 * Grade cíclica: A (e B no revezamento quinzenal) ou `cycle` = N semanas em
 * sequência (rodízio, ex.: Recepção com 6 posições). Com `cycle`, a semana do
 * ciclo vem da data de referência do setor e A/B são ignorados.
 */
export type WeekCycle = { A: WeekPattern; B?: WeekPattern; cycle?: WeekPattern[] };

export type CellKind =
  | 'TRABALHO' | 'FOLGA' | 'BANCO' | 'FECHADO' | 'SEM_GRADE'
  | 'FERIAS' | 'ATESTADO' | 'FALTA' | 'AFASTAMENTO' | 'INDISPONIVEL';
export const ABSENCE_KINDS = ['FERIAS', 'ATESTADO', 'FALTA', 'AFASTAMENTO', 'INDISPONIVEL', 'FOLGA_EXTRA'] as const;

export interface Cell {
  kind: CellKind;
  startMin?: number | null;
  endMin?: number | null;
  breakMin?: number | null;
  note?: string | null;
  manual?: boolean;
}

export interface Member {
  id: string;
  name: string;
  bond: Bond;
  mode: Mode;
  functionName: string | null;
  altFunctions: string[];
  hours: MemberHours;
  weeklyMin: number;
  fixedOff: number[];
  availableDays: number[];
  saturday: boolean;
  sunday: boolean;
  holiday: boolean;
  autoSchedule: boolean;
}

export interface Post {
  id: string;
  name: string;
  kind: string | null;
  startMin: number;
  endMin: number;
  /** 1–7 e 8 = feriado. */
  weekdays: number[];
  minPeople: number;
  functionName: string | null;
  mandatory: boolean;
}

export interface Rule {
  id: string;
  kind: string;
  label: string;
  params: Record<string, unknown>;
  mandatory: boolean;
}

export interface Absence {
  memberId: string;
  start: IsoDate;
  end: IsoDate;
  /** FERIAS, ATESTADO, FALTA, AFASTAMENTO, INDISPONIVEL ou FOLGA (folga extraordinária). */
  type: string;
  substituteName?: string | null;
}

export interface DayEvent { name: string; extraPeople: number; window: Window | null }

/** Um dia já resolvido pelo calendário (ver calendar.ts). */
export interface DayPlan {
  date: IsoDate;
  weekday: number;
  holiday: { name: string; scope: string } | null;
  /** Feriado que funciona como sábado (6) ou domingo (7): equipe, turnos e postos desse dia. */
  asWeekday?: 6 | 7 | null;
  /** Janelas abertas do setor. Vazio = fechado. */
  open: Window[];
  /** De onde veio o horário (para mostrar na tela). */
  source: 'SETOR_EXCECAO' | 'NACAO_EXCECAO' | 'SETOR_FERIADO' | 'NACAO_FERIADO' | 'SETOR' | 'NACAO' | 'SEM_HORARIO';
  /** Observações (ex.: "Feriado: horário especial"). */
  notes: string[];
  /** Conflitos de calendário que pedem confirmação do gestor. */
  confirm: string[];
  events: DayEvent[];
}

export interface LegalParams {
  bond: Bond;
  validFrom: IsoDate;
  maxDailyMin: number | null;
  maxDailyExtraMin: number | null;
  maxWeeklyMin: number | null;
  minRestBetweenMin: number | null;
  maxConsecutiveDays: number | null;
  sundayOffEveryWeeks: number | null;
  breakLongOverMin: number | null;
  breakLongMin: number | null;
  breakShortOverMin: number | null;
  breakShortMin: number | null;
  /** Intervalo máximo por dia (ex.: FUNAP até 2h). */
  maxBreakMin?: number | null;
  validated: boolean;
}

export type AlertLevel = 'CONFLITO' | 'AJUSTE' | 'INFO';
export interface Alert {
  level: AlertLevel;
  code: string;
  message: string;
  date?: IsoDate;
  memberId?: string;
  suggestions?: string[];
}

export type Grid = Record<string, Record<IsoDate, Cell>>;
