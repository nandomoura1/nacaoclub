/**
 * Cobrança e CRM (puro, sem banco): classifica débitos vindos da Tecnofit,
 * escolhe o celular do aluno, ordena a fila e diz em que passo da régua o caso está.
 * Decisões do gestor (11/11/2026): régua automática em D-3, D0, D+3, D+5 e D+7;
 * a partir do D+3 o caso entra na fila do consultor; no D+15 escala para o líder.
 * Aluno `blocked`/`restricted` sem venda em atraso = "Pendência na recepção".
 */
import { addDays, toUtc, type IsoDate } from './dates';

export const CASE_KINDS = [
  { id: 'COBRANCA', label: 'Cobrança', hint: 'Venda com valor em aberto vencida ou vencendo.' },
  { id: 'PENDENCIA', label: 'Pendência na recepção', hint: 'Aluno bloqueado/restrito na Tecnofit sem venda em atraso: resolver na recepção ou por WhatsApp.' },
] as const;
export type CaseKind = (typeof CASE_KINDS)[number]['id'];

/** ABERTO → RESOLVIDO (o sync viu que não há mais débito/pendência) ou ENCERRADO (à mão, com motivo — F2). */
export const CASE_STATUS = [
  { id: 'ABERTO', label: 'Aberto' },
  { id: 'RESOLVIDO', label: 'Resolvido' },
  { id: 'ENCERRADO', label: 'Encerrado' },
] as const;
export type CaseStatus = (typeof CASE_STATUS)[number]['id'];

/** Passos da régua (dias em relação ao vencimento mais antigo em aberto). */
export const CADENCE = [
  { offset: -3, auto: true, task: false, label: 'D-3 · lembrete de vencimento' },
  { offset: 0, auto: true, task: false, label: 'D0 · vence hoje' },
  { offset: 3, auto: true, task: true, label: 'D+3 · aviso de pendência + contato do consultor' },
  { offset: 5, auto: true, task: true, label: 'D+5 · segundo aviso' },
  { offset: 7, auto: true, task: true, label: 'D+7 · último aviso automático' },
  { offset: 15, auto: false, task: true, label: 'D+15 · escala para o líder' },
] as const;

/** Janela de antecedência para trazer débitos que ainda vão vencer (D-3). */
export const UPCOMING_DAYS = 3;

export const daysBetween = (from: IsoDate, to: IsoDate) => Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000);

/** Dias de atraso (negativo = ainda vai vencer). */
export const daysLate = (dueDate: IsoDate, today: IsoDate) => daysBetween(dueDate, today);

/** Último passo da régua já alcançado (null = antes do D-3). */
export function cadenceStep(oldestDue: IsoDate | null, today: IsoDate) {
  if (!oldestDue) return null;
  const d = daysLate(oldestDue, today);
  let step: (typeof CADENCE)[number] | null = null;
  for (const s of CADENCE) if (d >= s.offset) step = s;
  return step;
}

export const AGING = [
  { id: 'A_VENCER', label: 'A vencer', min: -Infinity, max: 0 },
  { id: '1_7', label: '1–7 dias', min: 1, max: 7 },
  { id: '8_15', label: '8–15 dias', min: 8, max: 15 },
  { id: '16_30', label: '16–30 dias', min: 16, max: 30 },
  { id: '31_60', label: '31–60 dias', min: 31, max: 60 },
  { id: '60P', label: 'Mais de 60 dias', min: 61, max: Infinity },
] as const;
export type AgingId = (typeof AGING)[number]['id'];
export const agingOf = (late: number): AgingId => AGING.find((a) => late >= a.min && late <= a.max)!.id;

/** Débito da Tecnofit (venda do cliente) já normalizado. */
export interface DebtIn {
  saleId: string;
  dueDate: IsoDate | null;
  openValue: number;
  totalValue: number;
  description: string;
}

/** Só entra na cobrança venda com valor em aberto, vencida ou vencendo em até UPCOMING_DAYS. */
export function isCollectible(d: DebtIn, today: IsoDate): boolean {
  if (!(d.openValue > 0.004) || !d.dueDate) return false;
  return d.dueDate <= addDays(today, UPCOMING_DAYS);
}

export const isBlockedStatus = (status: string | null | undefined) => status === 'blocked' || status === 'restricted';

/** Contato da Tecnofit: { contact: "(61) 99999-8888", type: "TELEFONE CELULAR" | "WHATSAPP" | … }. */
export interface ContactIn { contact: string; type: string | null }

/**
 * Celular para WhatsApp: prefere o tipo WhatsApp, depois celular, depois qualquer
 * número com 11 dígitos começando com 9 após o DDD. Devolve só dígitos com DDD (sem 55).
 */
export function pickMobile(contacts: ContactIn[]): string | null {
  const norm = (raw: string) => {
    let d = raw.replace(/\D/g, '');
    if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
    return d.length === 11 && d[2] === '9' ? d : null;
  };
  const rank = (t: string | null) => {
    const s = (t ?? '').toUpperCase();
    return s.includes('WHATS') ? 0 : s.includes('CEL') ? 1 : 2;
  };
  const found = contacts
    .map((c) => ({ n: norm(c.contact ?? ''), r: rank(c.type) }))
    .filter((c): c is { n: string; r: number } => c.n !== null)
    .sort((a, b) => a.r - b.r);
  return found[0]?.n ?? null;
}

/** "61999998888" → "(61) 9••••-8888". */
export function maskMobile(d: string | null): string | null {
  if (!d) return null;
  return `(${d.slice(0, 2)}) ${d.slice(2, 3)}••••-${d.slice(-4)}`;
}
/** "61999998888" → "(61) 99999-8888". */
export function formatMobile(d: string | null): string | null {
  if (!d) return null;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Prioridade na fila: atraso × valor (pendência sem valor fica no fim, ordenada por antiguidade). */
export function priorityScore(c: { kind: CaseKind; openValue: number; oldestDue: IsoDate | null; openedOn: IsoDate }, today: IsoDate): number {
  if (c.kind === 'PENDENCIA') return daysBetween(c.openedOn, today);
  const late = c.oldestDue ? Math.max(daysLate(c.oldestDue, today), 0) : 0;
  return 1_000 + (late + 1) * Math.max(c.openValue, 1);
}

export const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Valores em reais vindos da API (número ou texto "123.45"). */
export function money(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(',', '.')) : NaN;
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

/** Datas da API ("2026-11-10", "2026-11-10 00:00:00", ISO) → IsoDate. */
export function isoFromApi(v: unknown): IsoDate | null {
  if (typeof v !== 'string') return null;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const br = v.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return br ? `${br[3]}-${br[2]}-${br[1]}` : null;
}
