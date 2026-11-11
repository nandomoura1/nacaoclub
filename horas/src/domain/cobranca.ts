/**
 * Cobrança e CRM (puro, sem banco): classifica débitos vindos da Tecnofit,
 * escolhe o celular do aluno, ordena a fila e diz em que passo da régua o caso está.
 * Decisões do gestor (11/11/2026): o sistema NÃO fala com o aluno — cada passo da régua
 * (D-3, D0, D+3, D+5, D+7, D+15) vira TAREFA do consultor, enviada todo dia às 07h30.
 * O consultor registra o contato na Tecnofit (Ligações do CRM); a ligação concluída dá
 * baixa na tarefa e o retorno agendado lá (promessa) pausa a régua até a data.
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

/** Passos da régua (dias em relação ao vencimento mais antigo em aberto): cada um vira tarefa do consultor. */
export const CADENCE = [
  { offset: -3, kind: 'D-3', label: 'D-3 · lembrar o vencimento', todo: 'Lembrar com gentileza que vence em {venc} e as formas de pagamento (app da Tecnofit, Pix ou recepção).' },
  { offset: 0, kind: 'D0', label: 'D0 · vence hoje', todo: 'Vence hoje: confirmar se já pagou e oferecer as formas de pagamento.' },
  { offset: 3, kind: 'D+3', label: 'D+3 · primeiro contato de cobrança', todo: 'Entender o motivo do atraso e combinar uma data. Combinou? Agende o retorno na Tecnofit com essa data.' },
  { offset: 5, kind: 'D+5', label: 'D+5 · segundo contato', todo: 'Reforçar a pendência e combinar a data de pagamento (agende o retorno na Tecnofit).' },
  { offset: 7, kind: 'D+7', label: 'D+7 · último contato antes de escalar', todo: 'Propor a regularização. Sem acordo até o D+15, o caso vai para o líder.' },
  { offset: 15, kind: 'D+15', label: 'D+15 · escalado para o líder', todo: 'Caso escalado: líder decide negociação ou próximos passos com o aluno.' },
] as const;

export const TASK_KINDS = {
  ...Object.fromEntries(CADENCE.map((c) => [c.kind, { label: c.label, todo: c.todo }])),
  PENDENCIA: { label: 'Pendência na recepção', todo: 'Aluno bloqueado/restrito na Tecnofit: pedir que passe na recepção ou resolver por WhatsApp.' },
  RETORNO: { label: 'Retorno / promessa agendada', todo: 'Retorno agendado na Tecnofit para {ref}: conferir se pagou e falar com o aluno.' },
  MANUAL: { label: 'Tarefa do líder', todo: '' },
} as Record<string, { label: string; todo: string }>;

/** Tipos que o líder liga/desliga por consultor (vazio = recebe todos). Tarefa manual do líder sempre entra. */
export const FILTERABLE_KINDS = [...CADENCE.map((c) => c.kind), 'PENDENCIA', 'RETORNO'] as string[];
export const kindAllowed = (kind: string, allowed: readonly string[]) => kind === 'MANUAL' || !allowed.length || allowed.includes(kind);

/** Envio do WhatsApp de tarefas: de hora em hora, das 6h às 14h (Brasília). */
export const SEND_HOURS = [6, 7, 8, 9, 10, 11, 12, 13, 14] as const;
export const DEFAULT_SEND = { hour: 8, days: [1, 2, 3, 4, 5, 6] } as const;

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
