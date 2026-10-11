import { addDays, toUtc } from '@/domain/dates';
import { isCommercial, isDone, isInternalChannel, type AreaKey } from './constants';

/**
 * Marketing Readiness Score, trava comercial e marcos de antecedência
 * (D-30 … D+7). Determinístico e testado: a IA recebe isto pronto. Puro.
 */

export interface CampaignFacts {
  type: string;
  status: string;
  objective: string | null;
  audience: string | null;
  offer: string | null;
  message: string | null;
  cta: string | null;
  channels: string[];
  conversionChannel: string | null;
  conversionUrl: string | null;
  leadOwnerId: string | null;
  measurement: string | null;
  ownerId: string | null;
  startDate: string;
  endDate: string | null;
}
export interface TaskFacts {
  area: AreaKey | null;
  column: string;
  dueDate: string | null;
  title: string;
  milestone?: string | null;
}

const filled = (v: string | null | undefined) => !!v && v.trim().length > 1;
export const daysBetween = (from: string, to: string) => Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000);

export interface ReadinessItem { key: string; label: string; weight: number; ok: boolean; hint: string }
export interface Readiness { score: number; items: ReadinessItem[]; missing: ReadinessItem[] }

/**
 * Score 0–100 = pesos dos itens atendidos ÷ pesos dos itens que se aplicam.
 * Itens comerciais (oferta, conversão, lead, medição) só valem para
 * campanhas de aquisição, renovação, vendas e lançamento.
 */
export function readiness(c: CampaignFacts, tasks: TaskFacts[], today: string): Readiness {
  const commercial = isCommercial(c.type);
  const byArea = (a: AreaKey) => tasks.filter((t) => t.area === a);
  const overdue = tasks.filter((t) => t.dueDate && t.dueDate < today && !isDone(t.column));
  const internal = c.channels.some(isInternalChannel);
  const items: (ReadinessItem & { applies: boolean })[] = [
    { key: 'objetivo', label: 'Objetivo', weight: 8, applies: true, ok: filled(c.objective), hint: 'Defina o objetivo da campanha.' },
    { key: 'publico', label: 'Público', weight: 8, applies: true, ok: filled(c.audience), hint: 'Defina para quem é a campanha.' },
    { key: 'oferta', label: 'Oferta', weight: 6, applies: commercial, ok: filled(c.offer), hint: 'Campanha comercial precisa de oferta.' },
    { key: 'mensagem', label: 'Mensagem principal', weight: 8, applies: true, ok: filled(c.message), hint: 'Escreva a mensagem principal.' },
    { key: 'cta', label: 'CTA', weight: 8, applies: true, ok: filled(c.cta), hint: 'Defina a chamada para ação.' },
    { key: 'responsavel', label: 'Responsável', weight: 6, applies: true, ok: !!c.ownerId, hint: 'Defina o responsável pela campanha.' },
    { key: 'canais', label: 'Canais de comunicação', weight: 8, applies: true, ok: c.channels.length > 0, hint: 'Escolha onde a campanha vai ser comunicada.' },
    { key: 'interna', label: 'Comunicação interna', weight: 8, applies: true, ok: internal, hint: 'Inclua ao menos um canal interno (Tecnofit, WhatsApp, TV Nação, recepção…).' },
    { key: 'conversao', label: 'Canal de conversão', weight: 10, applies: commercial, ok: !!c.conversionChannel && filled(c.conversionUrl), hint: 'Informe onde o cliente realiza a ação (canal e link).' },
    { key: 'lead', label: 'Responsável pelo lead', weight: 8, applies: commercial, ok: !!c.leadOwnerId, hint: 'Defina quem recebe e atende os leads.' },
    { key: 'medicao', label: 'Forma de medir', weight: 6, applies: commercial, ok: filled(c.measurement), hint: 'Defina como o resultado será medido (UTM, código, formulário…).' },
    { key: 'criativos', label: 'Criativos (design)', weight: 8, applies: true, ok: byArea('DESIGN').length > 0, hint: 'Crie as tarefas de design.' },
    { key: 'conteudo', label: 'Conteúdo', weight: 8, applies: true, ok: byArea('CONTEUDO').length > 0, hint: 'Crie as tarefas de conteúdo.' },
    { key: 'prazo', label: 'Prazos em dia', weight: 6, applies: true, ok: overdue.length === 0, hint: overdue.length ? `${overdue.length} tarefa(s) atrasada(s).` : '' },
  ];
  const applicable = items.filter((i) => i.applies).map(({ applies: _a, ...i }) => i);
  const total = applicable.reduce((s, i) => s + i.weight, 0);
  const got = applicable.filter((i) => i.ok).reduce((s, i) => s + i.weight, 0);
  return { score: total ? Math.round((got / total) * 100) : 0, items: applicable, missing: applicable.filter((i) => !i.ok) };
}

/**
 * Trava comercial: campanha de aquisição/renovação/vendas/lançamento não vai
 * para ATIVA sem CTA, canal de conversão, responsável pelo lead e medição.
 */
export function commercialGate(c: CampaignFacts): string[] {
  if (!isCommercial(c.type)) return [];
  const miss: string[] = [];
  if (!filled(c.cta)) miss.push('CTA');
  if (!c.conversionChannel || !filled(c.conversionUrl)) miss.push('canal de conversão (com link)');
  if (!c.leadOwnerId) miss.push('responsável pelo lead');
  if (!filled(c.measurement)) miss.push('forma de medir o resultado');
  return miss;
}

// ── Antecedência ─────────────────────────────────────────────

export const MILESTONES = [-30, -21, -14, -7, -1, 0, 1, 7] as const;
export const milestoneLabel = (d: number) => (d === 0 ? 'Dia D' : d < 0 ? `D${d}` : `D+${d}`);

export interface MilestoneAlert {
  milestone: string;
  key: string;
  message: string;
  severity: 'critico' | 'atencao';
  /** Tarefa sugerida para resolver (vira sugestão pendente, nunca tarefa direta). */
  suggestion?: { title: string; area: AreaKey; offset: number };
}

/**
 * Checklist de cada marco já alcançado (data do marco ≤ hoje) que ainda está
 * pendente. Campanha finalizada/em análise só confere o D+7.
 */
export function milestoneAlerts(c: CampaignFacts, tasks: TaskFacts[], today: string): { current: string | null; next: { label: string; date: string } | null; alerts: MilestoneAlert[] } {
  const commercial = isCommercial(c.type);
  const reached = MILESTONES.filter((d) => addDays(c.startDate, d) <= today);
  const upcoming = MILESTONES.find((d) => addDays(c.startDate, d) > today);
  const closed = c.status === 'FINALIZADA' || c.status === 'ANALISE';
  const area = (a: AreaKey) => tasks.filter((t) => t.area === a);
  const early = (t: TaskFacts) => t.column === 'BACKLOG' || t.column === 'PROXIMAS';
  const alerts: MilestoneAlert[] = [];
  const add = (d: number, key: string, ok: boolean, message: string, severity: MilestoneAlert['severity'], suggestion?: MilestoneAlert['suggestion']) => {
    if (!ok) alerts.push({ milestone: milestoneLabel(d), key, message, severity, suggestion });
  };
  for (const d of reached) {
    if (closed && d !== 7) continue;
    if (d === -30) {
      add(d, 'conceito', filled(c.objective) && filled(c.audience) && filled(c.message), 'Objetivo, público e mensagem ainda não estão definidos.', 'critico', { title: 'Definir conceito, público e mensagem da campanha', area: 'PLANEJAMENTO', offset: -28 });
      add(d, 'responsavel', !!c.ownerId, 'Campanha sem responsável.', 'critico');
      if (commercial) add(d, 'oferta', filled(c.offer), 'Oferta comercial não definida.', 'critico', { title: 'Definir oferta com o Comercial', area: 'COMERCIAL', offset: -28 });
    }
    if (d === -21) {
      add(d, 'canais', c.channels.length > 0, 'Canais de comunicação não definidos.', 'critico', { title: 'Definir canais da campanha', area: 'PLANEJAMENTO', offset: -20 });
      if (commercial) add(d, 'conversao', !!c.conversionChannel && filled(c.conversionUrl), 'Sem landing page / formulário / canal de conversão.', 'critico', { title: 'Criar landing page ou formulário de conversão', area: 'COMERCIAL', offset: -18 });
      add(d, 'design_tarefas', area('DESIGN').length > 0, 'Nenhuma tarefa de design criada.', 'atencao', { title: 'Briefing de criativos (feed, stories, banner)', area: 'DESIGN', offset: -18 });
      add(d, 'conteudo_tarefas', area('CONTEUDO').length > 0, 'Nenhuma tarefa de conteúdo criada.', 'atencao', { title: 'Roteiros de Reels e Stories', area: 'CONTEUDO', offset: -18 });
    }
    if (d === -14) {
      add(d, 'producao', ![...area('DESIGN'), ...area('CONTEUDO')].some(early), 'Há criativos/conteúdos que ainda nem entraram em produção.', 'atencao');
    }
    if (d === -7) {
      add(d, 'programada', ['PROGRAMADA', 'ATIVA'].includes(c.status), 'A campanha ainda não está programada nem ativa.', 'critico');
      add(d, 'interna', c.channels.some(isInternalChannel) && area('COMUNICACAO').length > 0, 'Comunicação interna não preparada (canal interno + tarefa).', 'critico', { title: 'Comunicar equipe, professores e recepção', area: 'COMUNICACAO', offset: -5 });
      if (commercial) add(d, 'lead', !!c.leadOwnerId, 'Ninguém definido para receber os leads.', 'critico', { title: 'Definir fluxo de atendimento dos leads', area: 'COMERCIAL', offset: -5 });
    }
    if (d === -1) {
      const open = tasks.filter((t) => t.dueDate && t.dueDate <= c.startDate && !isDone(t.column));
      add(d, 'checklist_final', open.length === 0, `${open.length} tarefa(s) com prazo até o início ainda em aberto.`, 'critico');
    }
    if (d === 0) add(d, 'cobertura', area('CONTEUDO').some((t) => /cobertura|tempo real|ao vivo/i.test(t.title)), 'Sem tarefa de cobertura no dia.', 'atencao', { title: 'Cobertura em tempo real (stories e fotos)', area: 'CONTEUDO', offset: 0 });
    if (d === 1) add(d, 'pos', tasks.some((t) => t.milestone === 'D+1' || /p[óo]s[- ]?(evento|campanha)|melhores momentos|agradecimento/i.test(t.title)), 'Conteúdo pós ainda não planejado.', 'atencao', { title: 'Conteúdo pós: melhores momentos e agradecimento', area: 'CONTEUDO', offset: 1 });
    if (d === 7) add(d, 'analise', closed, 'Hora de analisar os resultados.', 'atencao', { title: 'Análise de resultados da campanha', area: 'PLANEJAMENTO', offset: 7 });
  }
  return {
    current: reached.length ? milestoneLabel(reached[reached.length - 1]!) : null,
    next: upcoming === undefined ? null : { label: milestoneLabel(upcoming), date: addDays(c.startDate, upcoming) },
    alerts,
  };
}
