/**
 * Reunião de líderes (puro): o rito ágil da Nação em versão simples.
 *  - Semanal (≈30 min): placar → atrasadas/impedidas → foco da semana → encerrar.
 *  - Daily (15 min): cada líder diz o que fechou, o que faz hoje e o que trava.
 * "Foco da semana" = as demandas que o líder se compromete a entregar na semana.
 */
import { isLate, isOpen, type DemandLite } from './processos';
import { isoWeek } from './wa-jobs';

export const MEETING_KINDS = [
  { id: 'SEMANAL', label: 'Reunião semanal', minutes: 30, hint: 'Placar da semana, atrasadas, foco da próxima semana.' },
  { id: 'DIARIA', label: 'Daily dos líderes', minutes: 15, hint: 'Rodada rápida: fechou, faz hoje, o que trava.' },
] as const;

export const WEEKLY_STEPS = [
  { id: 'placar', label: 'Placar', hint: 'Como foi a semana: foco entregue, concluídas, atrasos.' },
  { id: 'atrasadas', label: 'Atrasadas e travadas', hint: 'Para cada uma: concluir, novo prazo, novo dono ou destravar.' },
  { id: 'foco', label: 'Foco da semana', hint: 'Marque 🎯 o que cada líder se compromete a entregar até sexta. Menos é mais: 1 a 3 por líder.' },
  { id: 'encerrar', label: 'Encerrar', hint: 'Decisões e envio do foco de cada líder pelo WhatsApp.' },
] as const;

export { isoWeek };

/** Semana anterior (para o placar "foco entregue"). */
export function previousWeek(date: string): string {
  const t = new Date(`${date}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() - 7);
  return isoWeek(t.toISOString().slice(0, 10));
}

/** Segunda e domingo da semana da data. */
export function weekBounds(date: string): { start: string; end: string } {
  const t = new Date(`${date}T12:00:00Z`);
  const dow = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - dow);
  const start = t.toISOString().slice(0, 10);
  t.setUTCDate(t.getUTCDate() + 6);
  return { start, end: t.toISOString().slice(0, 10) };
}

export interface MeetingDemand extends DemandLite { focusWeek: string | null; blocker: string | null; ownerId: string | null }

export interface Scoreboard { focus: number; focusDone: number; doneWeek: number; late: number; blocked: number; noOwner: number; noDue: number; open: number }

/** Placar: foco da semana (combinado vs entregue), concluídas na semana e problemas em aberto. */
export function scoreboard(demands: MeetingDemand[], week: string, today: string): Scoreboard {
  const { start, end } = weekBounds(today);
  const open = demands.filter((d) => isOpen(d.status));
  const focus = demands.filter((d) => d.focusWeek === week && d.status !== 'CANCELADA');
  return {
    focus: focus.length,
    focusDone: focus.filter((d) => d.status === 'CONCLUIDA').length,
    doneWeek: demands.filter((d) => d.status === 'CONCLUIDA' && d.doneAt && d.doneAt.slice(0, 10) >= start && d.doneAt.slice(0, 10) <= end).length,
    late: open.filter((d) => isLate(d, today)).length,
    blocked: open.filter((d) => d.blocker || d.status === 'AGUARDANDO').length,
    noOwner: open.filter((d) => !d.ownerId).length,
    noDue: open.filter((d) => !d.dueDate).length,
    open: open.length,
  };
}

/** Precisa de atenção na semanal: atrasada, travada (impedimento/aguardando) ou sem prazo/dono. */
export function needsAttention(d: MeetingDemand, today: string): string[] {
  if (!isOpen(d.status)) return [];
  const why: string[] = [];
  if (isLate(d, today)) why.push('atrasada');
  if (d.blocker) why.push('impedida');
  else if (d.status === 'AGUARDANDO') why.push('aguardando terceiros');
  if (!d.dueDate) why.push('sem prazo');
  if (!d.ownerId) why.push('sem responsável');
  return why;
}

const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** WhatsApp do líder no encerramento: o foco combinado + decisões. */
export function focusMessage(leader: string, date: string, focus: { title: string; dueDate: string | null; sector: string }[], decisions: string | null): string {
  const first = leader.split(' ')[0];
  const items = focus.length
    ? focus.map((f) => `• ${f.title}${f.dueDate ? ` _(até ${dm(f.dueDate)})_` : ''}`).join('\n')
    : '• Nenhum foco combinado para o seu setor nesta semana.';
  return [
    `📋 *Reunião de líderes · ${dm(date)}*`,
    `Oi, ${first}! Seu *foco da semana* 🎯:`,
    items,
    decisions?.trim() ? `*Decisões:*\n${decisions.trim()}` : null,
    'Bora entregar! Qualquer impedimento, avise na daily. 💙',
  ].filter(Boolean).join('\n\n');
}
