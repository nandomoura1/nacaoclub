import { formatDateBR, WEEKDAYS, type IsoDate } from '@/domain/dates';
import { CELL_LABEL, fmtHours, hhmm } from './labels';
import type { Cell, DayPlan } from './types';

/**
 * Mensagem de WhatsApp com a escala do mês de uma pessoa, semana a semana,
 * para ela se organizar. Puro (a tela monta a prévia; o servidor envia).
 */
export interface MemberScheduleMessage {
  sector: string;
  monthLabel: string;
  status: string;
  name: string;
  days: DayPlan[];
  cells: Record<IsoDate, Cell | undefined>;
  minutes: number;
  workDays: number;
  offs: number;
}

const firstName = (n: string) => n.trim().split(/\s+/)[0] ?? n;

function line(d: DayPlan, c: Cell | undefined): string {
  const w = WEEKDAYS[d.weekday - 1]!.short.charAt(0) + WEEKDAYS[d.weekday - 1]!.short.slice(1).toLowerCase();
  const date = formatDateBR(d.date).slice(0, 5);
  const tag = d.holiday && d.holiday.scope !== 'FACULTATIVO' ? ` (${d.holiday.name})` : '';
  if (!c) return `${w} ${date}${tag} — —`;
  if (c.kind === 'TRABALHO' && c.startMin != null && c.endMin != null) {
    const brk = c.breakMin ? ` · intervalo ${c.breakMin >= 60 ? fmtHours(c.breakMin) : `${c.breakMin} min`}` : '';
    return `${w} ${date}${tag} — *${hhmm(c.startMin)} às ${hhmm(c.endMin)}*${brk}`;
  }
  return `${w} ${date}${tag} — ${CELL_LABEL[c.kind]}`;
}

export function memberScheduleText(m: MemberScheduleMessage): string {
  const out: string[] = [];
  out.push(`📅 *Sua escala — ${m.monthLabel}*`);
  if (m.status === 'RASCUNHO') out.push('⚠️ _Prévia: a escala ainda pode mudar._');
  out.push('', `Olá, ${firstName(m.name)}! Segue a sua escala da *${m.sector}* para você se organizar:`);
  const days = [...m.days].sort((a, b) => a.date.localeCompare(b.date));
  let week: string | null = null;
  for (const d of days) {
    // Semana começa na segunda (ou no dia 1º).
    if (d.weekday === 1 || week === null) {
      const end = days.find((x) => x.date >= d.date && x.weekday === 7)?.date ?? days.at(-1)!.date;
      week = d.date;
      out.push('', `*Semana ${formatDateBR(d.date).slice(0, 5)} a ${formatDateBR(end).slice(0, 5)}*`);
    }
    out.push(line(d, m.cells[d.date]));
  }
  out.push('', `Resumo: ${m.workDays} dia(s) de trabalho · ${m.offs} folga(s) · ${fmtHours(m.minutes)} previstas.`);
  out.push('Qualquer dúvida ou troca, fale com a liderança. 💙 *Nação*');
  return out.join('\n');
}
