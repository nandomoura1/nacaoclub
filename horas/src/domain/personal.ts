import { WEEKDAYS, formatDateBR, weekdayOf } from './dates';
import { KIND, type BlockKind, type WorkoutBlockData } from './workout';

/** Blocos que fazem sentido num treino de Personal. */
export const PERSONAL_KINDS = ['MOBILIDADE', 'AQUECIMENTO', 'ESPECIFICO', 'FORCA', 'CORE', 'WOD', 'OUTRO'] as const satisfies readonly BlockKind[];
export const PERSONAL_LABEL: Record<(typeof PERSONAL_KINDS)[number], string> = {
  MOBILIDADE: 'Mobilidade', AQUECIMENTO: 'Aquecimento', ESPECIFICO: 'Técnica / específico', FORCA: 'Força', CORE: 'Core', WOD: 'Circuito / condicionamento', OUTRO: 'Outro',
};

export interface PersonalBlockData { kind: string; title: string; durationMin: number | null; format: string; content: string; notes: string }

/** Bloco com algo escrito (bloco só com o tipo escolhido não vai para o aluno nem é salvo). */
export const hasContent = (b: Pick<PersonalBlockData, 'title' | 'format' | 'content' | 'notes'>) => !!(b.title || b.format || b.content || b.notes);

/** Texto para mandar ao aluno no WhatsApp. */
export function personalWhatsapp(w: { title: string; student: string; date: string; goal: string; blocks: PersonalBlockData[] }): string {
  const label = (k: string) => PERSONAL_LABEL[k as keyof typeof PERSONAL_LABEL] ?? KIND[k as BlockKind]?.label ?? k;
  const out = [`*${w.title}*`, `${w.student ? `${w.student} · ` : ''}${WEEKDAYS[weekdayOf(w.date) - 1]!.long}, ${formatDateBR(w.date)}`];
  if (w.goal) out.push('', `🎯 ${w.goal}`);
  for (const b of w.blocks.filter(hasContent)) {
    out.push('', `*${label(b.kind)}${b.durationMin ? ` · ${b.durationMin}'` : ''}${b.title ? ` · ${b.title}` : ''}*`);
    if (b.format) out.push(b.format);
    if (b.content) out.push(b.content);
    if (b.notes) out.push(`_${b.notes}_`);
  }
  return out.join('\n');
}

/** Tipos do Cadastro de Treino que não existem no Personal. */
const TO_PERSONAL: Partial<Record<BlockKind, (typeof PERSONAL_KINDS)[number]>> = { SKILL: 'ESPECIFICO', FUNDAMENTO: 'ESPECIFICO', JOGO: 'OUTRO' };

/** Blocos do Cadastro de Treino (ex.: aula gerada pela IA) → blocos de um treino Personal (aulão). */
export function toPersonalBlocks(blocks: WorkoutBlockData[]): PersonalBlockData[] {
  return blocks.map((b) => {
    const kind = (PERSONAL_KINDS as readonly string[]).includes(b.kind) ? b.kind : TO_PERSONAL[b.kind] ?? 'OUTRO';
    const title = b.kind === 'JOGO' ? ['Jogo', b.title].filter(Boolean).join(': ') : b.title ?? '';
    return {
      kind,
      title: title.slice(0, 120),
      durationMin: b.durationMin,
      format: [b.format, b.timeCapMin && `cap ${b.timeCapMin}'`].filter(Boolean).join(' · ').slice(0, 160),
      content: (b.content ?? '').slice(0, 2000),
      notes: [b.notes, b.coachNotes && `Professor: ${b.coachNotes}`].filter(Boolean).join('\n\n').slice(0, 600),
    };
  }).filter(hasContent);
}
