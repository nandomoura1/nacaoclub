/**
 * Gestão de Processos (puro). Rotinas e checklists repetidos vivem no Nação
 * Task; aqui ficam as DEMANDAS que a gestão acompanha em cada setor e a
 * saúde de cada setor (semáforo).
 */

export const NACAO_TASK_URL = 'https://nacao-task-7f33b.web.app';

export const DEMAND_STATUSES = [
  { id: 'ABERTA', label: 'Aberta', tone: 'neutral' },
  { id: 'EM_ANDAMENTO', label: 'Em andamento', tone: 'blue' },
  { id: 'AGUARDANDO', label: 'Aguardando terceiros', tone: 'amber' },
  { id: 'CONCLUIDA', label: 'Concluída', tone: 'green' },
  { id: 'CANCELADA', label: 'Cancelada', tone: 'neutral' },
] as const;
export type DemandStatus = (typeof DEMAND_STATUSES)[number]['id'];
export const OPEN_STATUSES: DemandStatus[] = ['ABERTA', 'EM_ANDAMENTO', 'AGUARDANDO'];
export const isOpen = (s: string) => (OPEN_STATUSES as string[]).includes(s);

export const PRIORITIES = [
  { id: 'BAIXA', label: 'Baixa' },
  { id: 'MEDIA', label: 'Média' },
  { id: 'ALTA', label: 'Alta' },
  { id: 'URGENTE', label: 'Urgente' },
] as const;
export type Priority = (typeof PRIORITIES)[number]['id'];

export const ORIGINS = [
  { id: 'DIRETORIA', label: 'Diretoria' },
  { id: 'REUNIAO', label: 'Reunião de líderes' },
  { id: 'LIDER', label: 'Do próprio líder' },
  { id: 'ALERTA', label: 'Alerta do sistema' },
] as const;
export type Origin = (typeof ORIGINS)[number]['id'];

export interface DemandLite { status: string; dueDate: string | null; priority: string; doneAt: string | null }

/** Atrasada: aberta e com prazo antes de hoje. */
export const isLate = (d: DemandLite, today: string) => isOpen(d.status) && !!d.dueDate && d.dueDate < today;

export function addDaysIso(date: string, days: number) {
  const t = new Date(`${date}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}

export type Health = 'verde' | 'amarelo' | 'vermelho' | 'sem_demandas';

export interface SectorStats {
  open: number;
  late: number;
  dueSoon: number;
  urgent: number;
  doneMonth: number;
  health: Health;
}

/**
 * Semáforo do setor:
 *  vermelho — 2+ atrasadas ou qualquer urgente atrasada;
 *  amarelo  — 1 atrasada, urgente em aberto ou 3+ vencendo em 7 dias;
 *  verde    — o resto (com demandas); sem demandas abertas = neutro.
 */
export function sectorStats(demands: DemandLite[], today: string): SectorStats {
  const open = demands.filter((d) => isOpen(d.status));
  const late = open.filter((d) => isLate(d, today));
  const soonLimit = addDaysIso(today, 7);
  const dueSoon = open.filter((d) => d.dueDate && d.dueDate >= today && d.dueDate <= soonLimit).length;
  const urgent = open.filter((d) => d.priority === 'URGENTE').length;
  const month = today.slice(0, 7);
  const doneMonth = demands.filter((d) => d.status === 'CONCLUIDA' && d.doneAt?.slice(0, 7) === month).length;
  const health: Health = !open.length ? 'sem_demandas'
    : late.length >= 2 || late.some((d) => d.priority === 'URGENTE') ? 'vermelho'
      : late.length === 1 || urgent > 0 || dueSoon >= 3 ? 'amarelo' : 'verde';
  return { open: open.length, late: late.length, dueSoon, urgent, doneMonth, health };
}

/** Ordem de trabalho: atrasadas primeiro, depois prioridade e prazo. */
export function demandOrder(a: DemandLite & { createdAt?: string }, b: DemandLite & { createdAt?: string }, today: string) {
  const rank = (d: DemandLite) => (isOpen(d.status) ? (isLate(d, today) ? 0 : 1) : 2);
  const pr = (p: string) => ['URGENTE', 'ALTA', 'MEDIA', 'BAIXA'].indexOf(p);
  return rank(a) - rank(b) || pr(a.priority) - pr(b.priority) || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
}
