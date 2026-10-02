import { WEEKDAYS, formatClock, formatDateBR, weekdayOf, type IsoDate } from './dates';

/**
 * Texto da grade de um professor para mandar no WhatsApp: aulas fixas da
 * semana, escalas dos próximos dias e as orientações (gerais da Nação e as
 * dele). Negrito do WhatsApp com *asteriscos*.
 */

export interface ShareSlot { weekday: number; startMin: number; durationMin: number; modality: string; label: string | null; space: string | null; role: string; counts: boolean }
export interface ShareDuty { date: IsoDate; startMin: number; endMin: number; sector: string }

const ROLE: Record<string, string> = { AUXILIAR: 'auxiliar', ESTAGIARIO: 'estagiário' };

/**
 * Dois gêneros de professor, cada um com a sua mensagem geral: Musculação
 * (Nação Fit) e Aulas Coletivas (CrossFit, Futevôlei, Funcional, HYROX, lutas…).
 */
export type GuidelineGroup = 'musculacao' | 'coletivas';
export const GROUP_LABEL: Record<GuidelineGroup, string> = { musculacao: 'Musculação (Nação Fit)', coletivas: 'Aulas Coletivas' };
export const isMusculacao = (modality: string) => /muscula/i.test(modality);

/** Gêneros de um professor pelas modalidades que ele dá (grade + habilitadas). Musculação primeiro só se for a principal. */
export function groupsOf(modalities: string[], primary?: string | null): GuidelineGroup[] {
  const set = new Set(modalities.map((m): GuidelineGroup => (isMusculacao(m) ? 'musculacao' : 'coletivas')));
  const order: GuidelineGroup[] = primary && isMusculacao(primary) ? ['musculacao', 'coletivas'] : ['coletivas', 'musculacao'];
  return order.filter((g) => set.has(g));
}

export interface ShareGroup { id: GuidelineGroup; name: string; guidelines: string }

/** Sugestão para o primeiro uso: o coordenador edita e salva. */
export function guidelinesTemplate(group: GuidelineGroup): string {
  return group === 'musculacao' ? MUSCULACAO_TEMPLATE : GUIDELINES_TEMPLATE;
}

const MUSCULACAO_TEMPLATE = `Conduta
- Chegar 10 min antes do turno, uniformizado.
- Ficar no salão, disponível: abordar os alunos pelo nome; celular só para o trabalho.
- Avisar a coordenação com antecedência sobre falta ou troca de turno.

Tarefas
- Montar e revisar fichas de treino; acompanhar alunos novos nas primeiras semanas.
- Corrigir execução e orientar carga com segurança.
- Organizar anilhas, halteres e acessórios durante e no fim do turno.

Rotina
- Ronda no salão a cada 15 min.
- Registrar ocorrências (aluno machucado, equipamento quebrado).
- Trocas de turno só com aprovação da coordenação.`;

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
  name: string; date: IsoDate; slots: ShareSlot[]; duties: ShareDuty[]; groups: Pick<ShareGroup, 'name' | 'guidelines'>[]; specific: string;
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
  // Uma mensagem por gênero do professor (quem dá Musculação e Coletivas recebe as duas).
  // Texto já formatado para o WhatsApp (com *negrito*) vai como está; texto simples ganha título.
  const specific = input.specific.trim();
  for (const g of input.groups.filter((x) => x.guidelines.trim())) {
    const t = g.guidelines.trim();
    out.push('', ...(t.includes('*') ? [t] : [`*Atribuições e orientações — ${g.name}*`, boldTitles(t)]));
  }
  if (specific) out.push('', `*Para você, ${name.split(' ')[0]}*`, specific);
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
