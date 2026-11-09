import { addDays, weekdayOf } from '@/domain/dates';

/**
 * Calendário de marketing: uma VISÃO que une campanhas, eventos, tarefas,
 * itens avulsos e feriados (não há tabela única). Grades de mês/semana. Puro.
 */

export type CalKind = 'campanha' | 'evento' | 'tarefa' | 'item' | 'feriado';
export interface CalEntry {
  kind: CalKind;
  id: string;
  title: string;
  start: string;
  end: string;
  /** Rótulo curto (tipo, status, área). */
  tag?: string;
  color?: string;
  href?: string;
  ownerId?: string | null;
  areaKey?: string | null;
  modalityId?: string | null;
  status?: string | null;
  campaignId?: string | null;
}

export const mondayOf = (d: string) => addDays(d, 1 - weekdayOf(d));
export const monthStart = (month: string) => `${month}-01`;
export function monthEnd(month: string) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y!, m!, 0)).toISOString().slice(0, 10);
}

/** Semanas (seg–dom) que cobrem o mês. */
export function monthGrid(month: string): string[][] {
  const first = mondayOf(monthStart(month));
  const last = monthEnd(month);
  const weeks: string[][] = [];
  for (let w = first; w <= last; w = addDays(w, 7)) weeks.push(Array.from({ length: 7 }, (_, i) => addDays(w, i)));
  return weeks;
}

export const overlaps = (e: { start: string; end: string }, from: string, to: string) => e.start <= to && e.end >= from;
export const onDay = (entries: CalEntry[], day: string) => entries.filter((e) => e.start <= day && e.end >= day);

export function shiftMonth(month: string, n: number) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

/** Mover um item: mantém a duração. */
export function moveRange(start: string, end: string | null, newStart: string) {
  if (!end) return { start: newStart, end: null };
  const days = Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000);
  return { start: newStart, end: addDays(newStart, days) };
}

// ── Texto para WhatsApp ─────────────────────────────────────────

const WA_SECTIONS: { kind: CalKind; title: string }[] = [
  { kind: 'campanha', title: '🎯 *Campanhas*' },
  { kind: 'evento', title: '🎉 *Eventos*' },
  { kind: 'item', title: '📌 *Datas e avisos*' },
  { kind: 'feriado', title: '🏖️ *Feriados*' },
  { kind: 'tarefa', title: '✅ *Tarefas*' },
];
const WD = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
/** "sáb 15/11" ou "01/11 a 30/11". */
export function waWhen(start: string, end: string) {
  return end > start ? `${dm(start)} a ${dm(end)}` : `${WD[weekdayOf(start) - 1]} ${dm(start)}`;
}

/** Itens que não vão para o texto (cancelados). */
const hidden = (e: CalEntry) => e.status === 'CANCELADO' || e.status === 'CANCELADA';

/**
 * Texto pronto para colar no WhatsApp: agrupado por tipo, em ordem de data,
 * só o que cruza o período [from, to]. Usa *negrito* e _itálico_ do WhatsApp.
 */
export function calendarWhatsAppText(entries: CalEntry[], opts: { from: string; to: string; title: string; kinds: CalKind[]; tags?: boolean }): string {
  const lines = [`📅 *Calendário de Marketing — ${opts.title}*`];
  let any = false;
  for (const s of WA_SECTIONS) {
    if (!opts.kinds.includes(s.kind)) continue;
    const list = entries
      .filter((e) => e.kind === s.kind && !hidden(e) && e.start <= opts.to && e.end >= opts.from)
      .sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
    if (!list.length) continue;
    any = true;
    lines.push('', s.title);
    for (const e of list) {
      const tag = opts.tags !== false && e.tag && s.kind !== 'feriado' && s.kind !== 'evento' ? ` _(${e.tag})_` : '';
      lines.push(`• ${waWhen(e.start, e.end)} — ${e.title.trim()}${tag}`);
    }
  }
  if (!any) lines.push('', '_Nada marcado neste período._');
  return lines.join('\n');
}

// ── Barras de vários dias na grade (estilo agenda) ──────────────

export interface WeekBar { entry: CalEntry; col: number; span: number; lane: number; fromBefore: boolean; goesAfter: boolean }

/**
 * Corta os itens longos na semana (7 dias, seg→dom) e empilha em faixas sem
 * sobreposição: quem começa antes e dura mais fica em cima. Puro.
 */
export function weekBars(entries: CalEntry[], week: string[]): WeekBar[] {
  const ws = week[0]!, we = week[week.length - 1]!;
  const segs = entries.filter((e) => e.start <= we && e.end >= ws).map((e) => {
    const s = e.start < ws ? ws : e.start, f = e.end > we ? we : e.end;
    return { entry: e, col: week.indexOf(s), span: week.indexOf(f) - week.indexOf(s) + 1, fromBefore: e.start < ws, goesAfter: e.end > we };
  }).sort((a, b) => a.col - b.col || b.span - a.span || a.entry.title.localeCompare(b.entry.title));
  const lanesEnd: number[] = []; // última coluna ocupada em cada faixa
  return segs.map((s) => {
    let lane = lanesEnd.findIndex((end) => end < s.col);
    if (lane < 0) { lane = lanesEnd.length; lanesEnd.push(0); }
    lanesEnd[lane] = s.col + s.span - 1;
    return { ...s, lane };
  });
}
