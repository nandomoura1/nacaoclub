import type { z } from 'zod/v4';
import { askModel, isFake } from '@/server/ai/workout-generator';
import { baseTemplate } from '@/domain/marketing/tasks';
import type { AgendaSection, AttentionItem } from '@/domain/marketing/agenda';
import type { AreaKey } from '@/domain/marketing/constants';
import { TASKS_PROMPT_VERSION, TASKS_SYSTEM, TasksSchema } from './prompts/tasks';
import { MEETING_PROMPT_VERSION, MEETING_SYSTEM, MeetingSchema } from './prompts/meeting';
import { RECO_PROMPT_VERSION, RECO_SYSTEM, RecoSchema } from './prompts/recommendations';

/**
 * MarketingAIService: o único lugar que fala com o modelo no Marketing.
 * Recebe contexto já enxuto (sem dado pessoal), devolve sugestões tipadas;
 * quem decide e grava é o humano (via mkt_ai_suggestions).
 */

export const MKT_MODEL = 'claude-opus-5-5';

export interface CampaignBrief {
  nome: string; tipo: string; objetivo: string | null; publico: string | null; produto: string | null; oferta: string | null;
  mensagem: string | null; cta: string | null; canais: string[]; inicio: string; fim: string | null; modalidade: string | null;
  evento: { nome: string; data: string; local: string | null; inscricao: string | null } | null;
}

export type TasksOut = z.infer<typeof TasksSchema>;
export type MeetingOut = z.infer<typeof MeetingSchema>;
export type RecoOut = z.infer<typeof RecoSchema>;

export async function generateTasks(brief: CampaignBrief, existing: string[], today: string): Promise<{ out: TasksOut; version: string; model: string }> {
  const template = baseTemplate(brief.tipo, !!brief.evento);
  if (isFake()) {
    const out: TasksOut = {
      tarefas: template.filter((t) => !existing.some((e) => e.toLowerCase() === t.title.toLowerCase())).map((t) => ({ area: t.area, titulo: t.title, descricao: `Exemplo local para ${brief.nome}.`, offsetDias: t.offset, prioridade: t.priority })),
      observacoes: brief.oferta || !['AQUISICAO', 'RENOVACAO', 'VENDAS', 'LANCAMENTO'].includes(brief.tipo) ? 'Exemplo local (AI_FAKE).' : 'Exemplo local (AI_FAKE): falta definir a oferta.',
    };
    return { out, version: TASKS_PROMPT_VERSION, model: 'exemplo local' };
  }
  const input = { hoje: today, campanha: brief, tarefasExistentes: existing, modeloBase: template.map((t) => ({ area: t.area, titulo: t.title, offsetDias: t.offset })) };
  const out = await askModel(TasksSchema, TASKS_SYSTEM, `Monte as tarefas desta campanha.\n${JSON.stringify(input, null, 1)}`, 12000);
  return { out, version: TASKS_PROMPT_VERSION, model: MKT_MODEL };
}

export async function generateMeetingMinutes(agenda: AgendaSection[], notes: string | null, date: string): Promise<{ out: MeetingOut; version: string; model: string }> {
  if (isFake()) {
    const pend = agenda.find((s) => s.key === 'pendencias')?.items ?? [];
    const out: MeetingOut = {
      ata: agenda.filter((s) => s.items.length).map((s) => `${s.title}:\n${s.items.slice(0, 5).map((i) => `- ${i}`).join('\n')}`).join('\n\n') + (notes ? `\n\nAnotações:\n${notes}` : ''),
      decisoes: pend.filter((p) => p.startsWith('🔴')).slice(0, 5).map((p) => ({ titulo: `Resolver: ${p.replace(/^🔴\s*/, '').slice(0, 90)}`, area: 'PLANEJAMENTO' as const, prazoDias: 3, prioridade: 'ALTA' as const })),
    };
    return { out, version: MEETING_PROMPT_VERSION, model: 'exemplo local' };
  }
  const out = await askModel(MeetingSchema, MEETING_SYSTEM, `Reunião de ${date}.\nPauta (fatos do sistema):\n${JSON.stringify(agenda, null, 1)}\n\nAnotações da equipe:\n${notes || '(sem anotações)'}`, 8000);
  return { out, version: MEETING_PROMPT_VERSION, model: MKT_MODEL };
}

export interface RecoContext {
  hoje: string;
  alertas: string[];
  campanhas: { nome: string; status: string; diasParaInicio: number; readiness: number; faltando: string[] }[];
  tarefasAtrasadas: number;
}

export async function recommendActions(ctx: RecoContext, attention: AttentionItem[]): Promise<{ out: RecoOut; version: string; model: string }> {
  if (isFake() || (!ctx.alertas.length && !ctx.campanhas.length)) {
    const out: RecoOut = {
      recomendacoes: attention.slice(0, 5).map((a) => ({
        titulo: a.suggestion?.title ?? a.text.split(':').slice(-1)[0]!.trim(),
        porque: a.text,
        campanha: null,
        tarefa: a.suggestion ? { titulo: a.suggestion.title, area: a.suggestion.area as AreaKey, prazoDias: 2 } : null,
      })),
    };
    return { out, version: RECO_PROMPT_VERSION, model: isFake() ? 'exemplo local' : 'regras' };
  }
  const out = await askModel(RecoSchema, RECO_SYSTEM, `Fatos de hoje:\n${JSON.stringify(ctx, null, 1)}`, 4000);
  return { out, version: RECO_PROMPT_VERSION, model: MKT_MODEL };
}
