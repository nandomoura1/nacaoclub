import type { z } from 'zod/v4';
import { askModel, isFake } from '@/server/ai/workout-generator';
import { baseTemplate } from '@/domain/marketing/tasks';
import type { AgendaSection, AttentionItem } from '@/domain/marketing/agenda';
import type { AreaKey } from '@/domain/marketing/constants';
import { TASKS_PROMPT_VERSION, TASKS_SYSTEM, TasksSchema } from './prompts/tasks';
import { MEETING_PROMPT_VERSION, MEETING_SYSTEM, MeetingSchema } from './prompts/meeting';
import { RECO_PROMPT_VERSION, RECO_SYSTEM, RecoSchema } from './prompts/recommendations';
import { SCHEDULE_PROMPT_VERSION, SCHEDULE_SYSTEM, ScheduleSchema } from './prompts/schedule';
import { MEMORY_PROMPT_VERSION, MEMORY_SYSTEM, MemorySchema } from './prompts/memory';
import type Anthropic from '@anthropic-ai/sdk';
import type { ScheduleItem } from '@/domain/marketing/schedule-import';

type Block = Anthropic.Beta.BetaContentBlockParam;

/** Memória da Nação + histórico do mesmo período do ano anterior (vai junto em sugestões). */
export interface MemoryContext { memoria: string | null; historico: string[] }

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

export async function generateTasks(brief: CampaignBrief, existing: string[], today: string, memory: MemoryContext | null = null): Promise<{ out: TasksOut; version: string; model: string }> {
  const template = baseTemplate(brief.tipo, !!brief.evento);
  if (isFake()) {
    const out: TasksOut = {
      tarefas: template.filter((t) => !existing.some((e) => e.toLowerCase() === t.title.toLowerCase())).map((t) => ({ area: t.area, titulo: t.title, descricao: `Exemplo local para ${brief.nome}.`, offsetDias: t.offset, prioridade: t.priority })),
      observacoes: brief.oferta || !['AQUISICAO', 'RENOVACAO', 'VENDAS', 'LANCAMENTO'].includes(brief.tipo) ? 'Exemplo local (AI_FAKE).' : 'Exemplo local (AI_FAKE): falta definir a oferta.',
    };
    return { out, version: TASKS_PROMPT_VERSION, model: 'exemplo local' };
  }
  const input = { hoje: today, campanha: brief, tarefasExistentes: existing, modeloBase: template.map((t) => ({ area: t.area, titulo: t.title, offsetDias: t.offset })), memoriaDaNacao: memory?.memoria ?? 'nenhuma', historicoMesmoPeriodoAnoAnterior: memory?.historico ?? [] };
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

export async function recommendActions(ctx: RecoContext, attention: AttentionItem[], memory: MemoryContext | null = null): Promise<{ out: RecoOut; version: string; model: string }> {
  if (isFake() || (!ctx.alertas.length && !ctx.campanhas.length)) {
    const out: RecoOut = {
      recomendacoes: attention.slice(0, 5).map((a) => ({
        titulo: a.suggestion?.title ?? (a.campaignName && a.text.startsWith(a.campaignName) ? `${a.campaignName}: ${a.text.includes('): ') ? a.text.split('): ').slice(1).join('): ') : 'revisar readiness'}` : a.text).slice(0, 140),
        porque: a.text,
        campanha: a.campaignName ?? null,
        tarefa: a.suggestion ? { titulo: a.suggestion.title, area: a.suggestion.area as AreaKey, prazoDias: 2 } : null,
      })),
    };
    return { out, version: RECO_PROMPT_VERSION, model: isFake() ? 'exemplo local' : 'regras' };
  }
  const out = await askModel(RecoSchema, RECO_SYSTEM, `Fatos de hoje:\n${JSON.stringify({ ...ctx, memoriaDaNacao: memory?.memoria ?? 'nenhuma', historicoMesmoPeriodoAnoAnterior: memory?.historico ?? [] }, null, 1)}`, 4000);
  return { out, version: RECO_PROMPT_VERSION, model: MKT_MODEL };
}

export type ScheduleOut = { itens: ScheduleItem[]; avisos: string[] };

/** Cronograma (documento) → itens datados para revisão. */
export async function extractSchedule(blocks: Block[], today: string): Promise<{ out: ScheduleOut; version: string; model: string }> {
  if (isFake()) {
    const y = today.slice(0, 4);
    const out: ScheduleOut = {
      itens: [
        { data: `${y}-03-14`, dataFim: null, titulo: 'Nação Celebration — Etapa 1', tipo: 'EVENTO', detalhes: 'Evento patrocinado com camisetas da temporada.', parceiro: 'Brasal', aConfirmar: false, campanhaTipo: null, origem: 'exemplo local' },
        { data: `${y}-08-01`, dataFim: `${y}-08-31`, titulo: 'Pai Treina Grátis', tipo: 'CAMPANHA', detalhes: 'Voucher de 5 dias para pais.', parceiro: null, aConfirmar: false, campanhaTipo: 'AQUISICAO', origem: 'exemplo local' },
        { data: `${y}-09-01`, dataFim: `${y}-09-30`, titulo: 'Tema do mês: Superação', tipo: 'TEMA_DO_MES', detalhes: null, parceiro: null, aConfirmar: false, campanhaTipo: null, origem: 'exemplo local' },
        { data: `${y}-12-19`, dataFim: null, titulo: 'Murph de Natal', tipo: 'EVENTO', detalhes: 'Camiseta 30 dias antes para venda.', parceiro: 'Brasal', aConfirmar: true, campanhaTipo: null, origem: 'exemplo local' },
        { data: `${y}-12-25`, dataFim: null, titulo: 'Natal', tipo: 'FERIADO', detalhes: null, parceiro: null, aConfirmar: false, campanhaTipo: null, origem: 'exemplo local' },
        { data: `${y}-09-27`, dataFim: null, titulo: 'Evento privado (locação)', tipo: 'PRIVADO', detalhes: '9h–12h', parceiro: null, aConfirmar: false, campanhaTipo: null, origem: 'exemplo local' },
      ],
      avisos: [],
    };
    return { out, version: SCHEDULE_PROMPT_VERSION, model: 'exemplo local' };
  }
  const out = await askModel(ScheduleSchema, SCHEDULE_SYSTEM, [...blocks, { type: 'text', text: `Hoje é ${today}. Liste todos os itens datados do cronograma.` }], 32000);
  return { out: out as ScheduleOut, version: SCHEDULE_PROMPT_VERSION, model: MKT_MODEL };
}

/** Documento → rascunho de memória (o humano revisa antes de salvar). */
export async function draftMemory(blocks: Block[]): Promise<{ titulo: string; aprendizados: string; version: string; model: string }> {
  if (isFake()) return { titulo: 'Memória de exemplo', aprendizados: '- Exemplo local (AI_FAKE): Nação Celebration acontece em etapas ao longo do ano.', version: MEMORY_PROMPT_VERSION, model: 'exemplo local' };
  const out = await askModel(MemorySchema, MEMORY_SYSTEM, [...blocks, { type: 'text', text: 'Escreva a memória de marketing deste documento.' }], 6000);
  return { ...out, version: MEMORY_PROMPT_VERSION, model: MKT_MODEL };
}
