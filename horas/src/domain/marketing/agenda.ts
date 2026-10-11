import { addDays, formatDateBR } from '@/domain/dates';
import { isDone, labelOf, CAMPAIGN_STATUSES, type AreaKey } from './constants';
import { mondayOf, overlaps } from './calendar';
import { milestoneAlerts, readiness, type CampaignFacts, type MilestoneAlert, type TaskFacts } from './readiness';

/**
 * Pauta da reunião semanal e "o que precisa de atenção" do Command Center.
 * Determinístico: a IA só redige a ata a partir disto. Puro.
 */

export interface AgendaCampaign extends CampaignFacts { id: string; name: string }
export interface AgendaTask extends TaskFacts { id: string; campaignId: string | null; assignee: string | null }
export interface AgendaEvent { id: string; name: string; startDate: string; endDate: string | null; status: string }
export interface AgendaItem { id: string; title: string; startDate: string; endDate: string | null; kind: string }

export interface AttentionItem {
  level: 'critico' | 'atencao';
  text: string;
  campaignId?: string;
  campaignName?: string;
  taskId?: string;
  suggestion?: MilestoneAlert['suggestion'] & { campaignId: string };
}

/** O que precisa de atenção agora: marcos pendentes + tarefas atrasadas + readiness baixo perto do início. */
export function attention(campaigns: AgendaCampaign[], tasks: AgendaTask[], today: string): AttentionItem[] {
  const out: AttentionItem[] = [];
  for (const c of campaigns) {
    if (c.status === 'IDEIA') continue;
    const mine = tasks.filter((t) => t.campaignId === c.id);
    const m = milestoneAlerts(c, mine, today);
    for (const a of m.alerts) out.push({ level: a.severity, text: `${c.name} (${a.milestone}): ${a.message}`, campaignId: c.id, campaignName: c.name, suggestion: a.suggestion && { ...a.suggestion, campaignId: c.id } });
    const daysTo = Math.round((Date.parse(c.startDate) - Date.parse(today)) / 86_400_000);
    if (daysTo >= 0 && daysTo <= 14) {
      const r = readiness(c, mine, today);
      if (r.score < 70) out.push({ level: daysTo <= 7 ? 'critico' : 'atencao', text: `${c.name} começa em ${daysTo} dia(s) com readiness ${r.score}/100 (falta: ${r.missing.slice(0, 3).map((x) => x.label.toLowerCase()).join(', ')}).`, campaignId: c.id, campaignName: c.name });
    }
  }
  const late = tasks.filter((t) => t.dueDate && t.dueDate < today && !isDone(t.column));
  for (const t of late.slice(0, 20)) out.push({ level: 'atencao', text: `Tarefa atrasada: ${t.title} (prazo ${formatDateBR(t.dueDate!)}${t.assignee ? ` · ${t.assignee}` : ''}).`, taskId: t.id, campaignId: t.campaignId ?? undefined });
  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === 'critico' ? -1 : 1));
}

export interface AgendaSection { key: string; title: string; items: string[] }

/** Pauta automática da reunião semanal. */
export function weeklyAgenda(input: { today: string; campaigns: AgendaCampaign[]; tasks: AgendaTask[]; events: AgendaEvent[]; items: AgendaItem[]; areaNames: Record<string, string> }): AgendaSection[] {
  const { today, campaigns, tasks, events, items } = input;
  const mon = mondayOf(today);
  const weeks = [
    { key: 'semana', title: 'Semana atual', from: mon, to: addDays(mon, 6) },
    { key: 'proxima', title: 'Próxima semana', from: addDays(mon, 7), to: addDays(mon, 13) },
    { key: '30dias', title: 'Próximos 30 dias', from: addDays(mon, 14), to: addDays(today, 30) },
  ];
  const fmt = (s: string, e: string | null) => (e && e !== s ? `${formatDateBR(s)}–${formatDateBR(e)}` : formatDateBR(s));
  const sections: AgendaSection[] = weeks.map((w) => ({
    key: w.key, title: w.title,
    items: [
      ...events.filter((e) => overlaps({ start: e.startDate, end: e.endDate ?? e.startDate }, w.from, w.to)).map((e) => `Evento: ${e.name} (${fmt(e.startDate, e.endDate)})`),
      ...campaigns.filter((c) => overlaps({ start: c.startDate, end: c.endDate ?? c.startDate }, w.from, w.to)).map((c) => `Campanha: ${c.name} — ${labelOf(CAMPAIGN_STATUSES, c.status)} (${fmt(c.startDate, c.endDate)})`),
      ...items.filter((i) => overlaps({ start: i.startDate, end: i.endDate ?? i.startDate }, w.from, w.to)).map((i) => `${i.title} (${fmt(i.startDate, i.endDate)})`),
    ],
  }));
  const active = campaigns.filter((c) => !['FINALIZADA', 'ANALISE'].includes(c.status));
  sections.push({
    key: 'campanhas', title: 'Campanhas',
    items: active.map((c) => {
      const r = readiness(c, tasks.filter((t) => t.campaignId === c.id), today);
      return `${c.name}: ${labelOf(CAMPAIGN_STATUSES, c.status)}, readiness ${r.score}/100${r.missing.length ? ` — falta ${r.missing.slice(0, 4).map((x) => x.label.toLowerCase()).join(', ')}` : ''}`;
    }),
  });
  const openBy = (a: AreaKey) => tasks.filter((t) => t.area === a && !isDone(t.column));
  for (const [key, title] of [['COMERCIAL', 'Comercial'], ['COMUNICACAO', 'Comunicação interna'], ['CONTEUDO', 'Conteúdo'], ['DESIGN', 'Design']] as [AreaKey, string][]) {
    const open = openBy(key);
    sections.push({ key: key.toLowerCase(), title, items: open.slice(0, 12).map((t) => `${t.title}${t.dueDate ? ` (prazo ${formatDateBR(t.dueDate)})` : ''}${t.assignee ? ` · ${t.assignee}` : ''}${t.dueDate && t.dueDate < today ? ' · ATRASADA' : ''}`) });
  }
  const channelGaps = active.filter((c) => c.channels.length === 0).map((c) => `${c.name}: sem canais definidos`);
  const convGaps = active.filter((c) => ['AQUISICAO', 'RENOVACAO', 'VENDAS', 'LANCAMENTO'].includes(c.type) && (!c.conversionChannel || !c.conversionUrl)).map((c) => `${c.name}: sem canal/link de conversão`);
  sections.push({ key: 'canais', title: 'Canais', items: channelGaps });
  sections.push({ key: 'conversao', title: 'Conversão', items: convGaps });
  sections.push({ key: 'pendencias', title: 'Pendências', items: attention(campaigns, tasks, today).map((a) => `${a.level === 'critico' ? '🔴' : '🟡'} ${a.text}`) });
  return sections;
}
