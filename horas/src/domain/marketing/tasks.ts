import { addDays } from '@/domain/dates';
import { isCommercial, isDone, type AreaKey, type Priority } from './constants';

/**
 * Tarefas de marketing: modelo-base por tipo de campanha (referência para a
 * IA e plano B sem IA), ordem no Kanban e dependências. Puro.
 */

export interface TaskDraft { area: AreaKey; title: string; description?: string; offset: number; priority: Priority }

/** Modelo-base: prazos relativos ao início (D-n). A IA adapta ao briefing. */
export function baseTemplate(type: string, hasEvent: boolean): TaskDraft[] {
  const t = (area: AreaKey, title: string, offset: number, priority: Priority = 'MEDIA'): TaskDraft => ({ area, title, offset, priority });
  const out: TaskDraft[] = [
    t('PLANEJAMENTO', 'Definir conceito, objetivo e mensagem principal', -30, 'ALTA'),
    t('PLANEJAMENTO', 'Definir público e canais', -28, 'ALTA'),
    t('PLANEJAMENTO', 'Cronograma e responsáveis', -27),
    t('DESIGN', 'Identidade visual da campanha', -21, 'ALTA'),
    t('DESIGN', 'Peças de feed', -16),
    t('DESIGN', 'Peças de stories', -16),
    t('DESIGN', 'Banner / material físico', -14),
    t('DESIGN', 'Arte para TV Nação e WhatsApp', -12),
    t('CONTEUDO', 'Roteiro do teaser', -18),
    t('CONTEUDO', 'Gravação do vídeo convite', -14, 'ALTA'),
    t('CONTEUDO', 'Sequência de stories (contagem regressiva)', -7),
    t('COMUNICACAO', 'Aviso no Tecnofit e WhatsApp dos alunos', -10),
    t('COMUNICACAO', 'Briefing para professores e recepção', -7, 'ALTA'),
    t('COMUNICACAO', 'TV Nação e QR Codes no espaço', -7),
  ];
  if (isCommercial(type) || hasEvent) {
    out.push(
      t('COMERCIAL', hasEvent && !isCommercial(type) ? 'Formulário de inscrição' : 'Landing page / formulário de conversão', -18, 'ALTA'),
      t('COMERCIAL', 'Fluxo de atendimento no WhatsApp comercial', -10, 'ALTA'),
    );
  }
  if (hasEvent || type === 'EVENTO') {
    out.push(
      t('PLANEJAMENTO', 'Definir parceiros e patrocinadores', -25),
      t('DESIGN', 'Backdrop / sinalização do evento', -10),
      t('CONTEUDO', 'Cobertura em tempo real (stories e fotos)', 0, 'ALTA'),
      t('CONTEUDO', 'Pós-evento: melhores momentos e agradecimento', 1),
      t('PLANEJAMENTO', 'Agradecimento aos patrocinadores e resultados', 3),
    );
  }
  out.push(t('PLANEJAMENTO', 'Análise de resultados da campanha', 7));
  return out;
}

/** Prazo da sugestão: início + offset, nunca antes de hoje. */
export const dueFromOffset = (start: string, offset: number, today: string) => {
  const d = addDays(start, offset);
  return d < today ? today : d;
};

/** Posição entre dois cartões (ordem fracionária: mover não renumera a coluna). */
export function positionBetween(prev: number | null, next: number | null): number {
  if (prev === null && next === null) return 1000;
  if (prev === null) return next! - 1000;
  if (next === null) return prev + 1000;
  return (prev + next) / 2;
}

/** Dependências ainda abertas (impede concluir antes delas). */
export function openDependencies(deps: { title: string; column: string }[]): string[] {
  return deps.filter((d) => !isDone(d.column)).map((d) => d.title);
}

export const isOverdue = (t: { dueDate: string | null; column: string }, today: string) => !!t.dueDate && t.dueDate < today && !isDone(t.column);
