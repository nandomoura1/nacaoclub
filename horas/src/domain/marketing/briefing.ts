/**
 * Briefing da campanha (puro): o texto de WhatsApp que explica para o time de
 * Marketing e para o Comercial como a campanha/evento vai funcionar — resumo,
 * o que o Comercial precisa saber e quem faz o quê, até quando.
 */
import { weekdayOf, WEEKDAYS, type IsoDate } from '@/domain/dates';
import { CAMPAIGN_TYPES, CONVERSION_CHANNELS, TASK_COLUMNS, channelLabel, isDone } from './constants';

export interface BriefingTask { title: string; assignee: string | null; dueDate: string | null; column: string; columnName?: string | null; with?: string[] }
export interface BriefingInput {
  id: string; name: string; type: string;
  startDate: string; endDate: string | null;
  objective: string | null; audience: string | null; product: string | null; offer: string | null; message: string | null; cta: string | null;
  channels: string[]; conversionChannel: string | null; conversionUrl: string | null; goal: string | null;
  owner: string | null; leadOwner: string | null;
  event: { name: string; startDate: string; endDate: string | null; location: string | null; registrationUrl: string | null } | null;
  tasks: BriefingTask[];
}
export type BriefingTasks = 'pendentes' | 'todas' | 'nenhuma';
export interface BriefingOptions { tasks: BriefingTasks; commercial: boolean; link: string | null }

const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const dmw = (iso: string) => `${dm(iso)} (${WEEKDAYS[weekdayOf(iso as IsoDate) - 1]!.short.toLowerCase()})`;
const range = (a: string, b: string | null) => (b && b !== a ? `${dmw(a)} a ${dmw(b)}` : dmw(a));
const clean = (s: string | null | undefined) => (s ?? '').trim();

/** Tem o que dizer ao Comercial? */
export const hasCommercial = (c: BriefingInput) => !!(clean(c.offer) || clean(c.cta) || c.conversionChannel || clean(c.conversionUrl) || c.leadOwner);

export function briefingText(c: BriefingInput, opt: BriefingOptions, today: IsoDate): string {
  const type = CAMPAIGN_TYPES.find((t) => t.id === c.type)?.label;
  const blocks: string[] = [];

  blocks.push([`📋 *BRIEFING — ${c.name.trim()}*`, type && `_Campanha de ${type.toLowerCase()}_`].filter(Boolean).join('\n'));
  blocks.push('Fala, time! 👋 Segue o resumo de como vai funcionar:');

  const when = [`📅 *Campanha:* ${range(c.startDate, c.endDate)}`];
  if (c.event) {
    when.push(`🎉 *Evento:* ${c.event.name.trim()} — ${range(c.event.startDate, c.event.endDate)}`);
    if (clean(c.event.location)) when.push(`📍 *Local:* ${clean(c.event.location)}`);
    if (clean(c.event.registrationUrl)) when.push(`📝 *Inscrições:* ${clean(c.event.registrationUrl)}`);
  }
  blocks.push(when.join('\n'));

  const what = [
    clean(c.objective) && `🎯 *Objetivo:* ${clean(c.objective)}`,
    clean(c.audience) && `👥 *Público:* ${clean(c.audience)}`,
    clean(c.product) && `🛍️ *Produto/serviço:* ${clean(c.product)}`,
    clean(c.message) && `💬 *Mensagem principal:* ${clean(c.message)}`,
    c.channels.length > 0 && `📣 *Onde vai aparecer:* ${c.channels.map(channelLabel).join(', ')}`,
    clean(c.goal) && `🏁 *Meta:* ${clean(c.goal)}`,
  ].filter(Boolean);
  if (what.length) blocks.push(what.join('\n'));

  if (opt.commercial && hasCommercial(c)) {
    const conv = c.conversionChannel ? CONVERSION_CHANNELS.find((x) => x.key === c.conversionChannel)?.label ?? c.conversionChannel : null;
    blocks.push([
      '💼 *PARA O COMERCIAL*',
      clean(c.offer) && `• *Oferta:* ${clean(c.offer)}`,
      clean(c.cta) && `• *O que falar pro aluno/lead:* ${clean(c.cta)}`,
      (conv || clean(c.conversionUrl)) && `• *Onde fecha:* ${[conv, clean(c.conversionUrl)].filter(Boolean).join(' — ')}`,
      c.leadOwner && `• *Quem atende os leads:* ${c.leadOwner}`,
      '• Os leads da campanha aparecem em Marketing → Leads & Conversão.',
    ].filter(Boolean).join('\n'));
  }

  if (opt.tasks !== 'nenhuma' && c.tasks.length) {
    const done = c.tasks.filter((t) => isDone(t.column));
    const list = opt.tasks === 'todas' ? c.tasks : c.tasks.filter((t) => !isDone(t.column));
    const lines = ['✅ *QUEM FAZ O QUÊ*'];
    if (!list.length) lines.push('Todas as tarefas já foram feitas. 🙌');
    const groups = new Map<string, BriefingTask[]>();
    for (const t of list) groups.set(t.assignee ?? '', [...(groups.get(t.assignee ?? '') ?? []), t]);
    const names = [...groups.keys()].sort((a, b) => (a ? (b ? a.localeCompare(b, 'pt-BR') : -1) : 1));
    for (const n of names) {
      lines.push('', `👤 *${n || 'Sem responsável definido'}*`);
      const ts = groups.get(n)!.sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
      for (const t of ts) {
        const finished = isDone(t.column);
        const late = !finished && t.dueDate && t.dueDate < today;
        const col = t.columnName ?? TASK_COLUMNS.find((x) => x.id === t.column)?.label;
        const due = t.dueDate ? ` — até ${dmw(t.dueDate)}` : '';
        const co = t.with?.length ? ` (com ${t.with.join(', ')})` : '';
        lines.push(`${finished ? '✔️' : late ? '⚠️' : '•'} ${t.title.trim()}${co}${due}${finished ? ' · feito' : late ? ' · *atrasada*' : col ? ` · ${col.toLowerCase()}` : ''}`);
      }
    }
    if (opt.tasks === 'pendentes' && done.length) lines.push('', `✔️ ${done.length} tarefa${done.length === 1 ? '' : 's'} já feita${done.length === 1 ? '' : 's'}.`);
    blocks.push(lines.join('\n'));
  }

  const close = [c.owner && `🙋 Dúvidas? Fale com *${c.owner}*, responsável pela campanha.`, opt.link && `🔗 Detalhes no sistema: ${opt.link}`].filter(Boolean);
  if (close.length) blocks.push(close.join('\n'));
  blocks.push('_Muitos esportes, muitas paixões, uma Nação!_ 💙');
  return blocks.join('\n\n');
}
