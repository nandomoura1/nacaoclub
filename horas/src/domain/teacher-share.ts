import { WEEKDAYS, formatClock, formatDateBR, weekdayOf, type IsoDate } from './dates';

/**
 * Texto da grade de um professor para mandar no WhatsApp: aulas fixas da
 * semana, escalas dos próximos dias e as orientações (gerais da Nação e as
 * dele). Negrito do WhatsApp com *asteriscos*.
 */

export interface ShareSlot { weekday: number; startMin: number; durationMin: number; modality: string; label: string | null; space: string | null; role: string; counts: boolean }
export interface ShareDuty { date: IsoDate; startMin: number; endMin: number; sector: string }

const ROLE: Record<string, string> = { AUXILIAR: 'auxiliar', ESTAGIARIO: 'estagiário' };

/** Sugestão para o primeiro uso: o coordenador edita e salva. */
export const GUIDELINES_TEMPLATE = `Conduta
- Chegar 10 min antes da aula, uniformizado.
- Receber os alunos pelo nome; celular só para a aula.
- Avisar a coordenação com antecedência sobre falta ou troca.

Tarefas
- Conferir o treino do dia no grupo antes da aula.
- Organizar e guardar o material ao final.
- Registrar ocorrências (aluno machucado, equipamento quebrado).

Rotina
- Briefing de 2 min no início; desaquecimento no final.
- Trocas de horário só com aprovação da coordenação.`;

export function teacherGradeText(input: {
  name: string; date: IsoDate; slots: ShareSlot[]; duties: ShareDuty[]; general: string; specific: string;
}): string {
  const { name, date, slots, duties } = input;
  const out = [`*Sua grade na Nação — ${name}*`, `Valendo a partir de ${formatDateBR(date)}`];
  const sorted = [...slots].sort((a, b) => a.weekday - b.weekday || a.startMin - b.startMin);
  if (!sorted.length) out.push('', 'Sem aulas fixas na grade.');
  for (const w of WEEKDAYS) {
    const day = sorted.filter((s) => s.weekday === w.n);
    if (!day.length) continue;
    out.push('', `*${w.long}*`);
    for (const s of day) {
      const extra = [s.label, s.space, ROLE[s.role]].filter(Boolean).join(' · ');
      out.push(`• ${formatClock(s.startMin)}–${formatClock(s.startMin + s.durationMin)} ${s.modality}${extra ? ` (${extra})` : ''}`);
    }
  }
  if (sorted.length) {
    const min = sorted.filter((s) => s.counts).reduce((t, s) => t + s.durationMin, 0);
    const h = Math.floor(min / 60), m = min % 60;
    out.push('', `Total: ${sorted.length} aula(s) · ${h}h${m ? String(m).padStart(2, '0') : ''} por semana`);
  }
  if (duties.length) {
    out.push('', '*Escalas (fim de semana e feriados)*');
    for (const d of [...duties].sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin)) {
      out.push(`• ${WEEKDAYS[weekdayOf(d.date) - 1]!.short.toLowerCase()} ${formatDateBR(d.date).slice(0, 5)} ${formatClock(d.startMin)}–${formatClock(d.endMin)} ${d.sector}`);
    }
  }
  const general = input.general.trim(), specific = input.specific.trim();
  if (general || specific) {
    out.push('', '*Atribuições e orientações*');
    if (general) out.push(boldTitles(general));
    if (specific) out.push(...(general ? [''] : []), `*Para você, ${name.split(' ')[0]}*`, specific);
  }
  return out.join('\n');
}

/** Linhas curtas sem marcador ("Conduta", "Rotina:") viram títulos em negrito. */
function boldTitles(text: string): string {
  return text.split('\n').map((l) => {
    const t = l.trim();
    return t && t.length <= 40 && !/^[-•*\d]/.test(t) && !t.includes('*') ? `*${t.replace(/:$/, '')}*` : l;
  }).join('\n');
}

/** Link do WhatsApp: direto para o número do professor quando houver (DDD + número, Brasil). */
export function whatsappLink(phone: string | null | undefined, text: string): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  const number = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits.length >= 12 ? digits : '';
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}
