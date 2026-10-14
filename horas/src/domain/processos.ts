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

/** Mensagem de WhatsApp com as pendências de um setor (atrasadas, da semana e demais em aberto). */
export function sectorPendingMessage(input: { leader: string; sector: string; today: string; url: string; demands: (DemandLite & { title: string })[] }): string {
  const open = input.demands.filter((d) => isOpen(d.status)).sort((a, b) => demandOrder(a, b, input.today));
  const soon = addDaysIso(input.today, 7);
  const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  const line = (d: DemandLite & { title: string }) => `• ${d.priority === 'URGENTE' ? '🔴 ' : d.priority === 'ALTA' ? '🟠 ' : ''}${d.title}${d.dueDate ? ` — ${isLate(d, input.today) ? 'venceu' : 'prazo'} ${dm(d.dueDate)}` : ''}${d.status === 'EM_ANDAMENTO' ? ' _(em andamento)_' : d.status === 'AGUARDANDO' ? ' _(aguardando)_' : ''}`;
  const late = open.filter((d) => isLate(d, input.today));
  const week = open.filter((d) => !isLate(d, input.today) && d.dueDate && d.dueDate <= soon);
  const rest = open.filter((d) => !late.includes(d) && !week.includes(d));
  const out = [`*Oi, ${input.leader.split(' ')[0]}! Pendências do setor ${input.sector}* 📋`];
  if (!open.length) out.push('', 'Nenhuma demanda em aberto. 👏');
  if (late.length) out.push('', `*Atrasadas (${late.length})*`, ...late.map(line));
  if (week.length) out.push('', `*Próximos 7 dias (${week.length})*`, ...week.map(line));
  if (rest.length) out.push('', `*Demais em aberto (${rest.length})*`, ...rest.map(line));
  out.push('', `Atualize o andamento em: ${input.url}`, '', '_Muitos esportes, muitas paixões, uma Nação!_ 💙');
  return out.join('\n');
}
