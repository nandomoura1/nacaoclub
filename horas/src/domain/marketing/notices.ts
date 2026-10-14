/**
 * Comunicação Interna (puro): para quem vai o comunicado, como o texto sai no
 * WhatsApp e quando ele aparece no mural do app.
 */
import { renderTemplate, type VariableKey } from '@/domain/wa-automations';

export const NOTICE_AUDIENCES = [
  { id: 'TODOS', label: 'Toda a equipe', detail: 'Usuários ativos e professores ativos com WhatsApp (sem repetir quem é os dois).', filter: null },
  { id: 'LIDERES', label: 'Líderes de setor', detail: 'Líderes definidos em Gestão de Processos.', filter: null },
  { id: 'PROFESSORES', label: 'Professores', detail: 'Professores ativos — todos ou de uma modalidade.', filter: 'modality' },
  { id: 'PERFIL', label: 'Um perfil de acesso', detail: 'Ex.: Recepção, Coordenador, Marketing.', filter: 'role' },
  { id: 'NUMEROS', label: 'Grupos ou números', detail: 'IDs de grupo do WhatsApp (ex.: grupo da equipe) ou números, um por linha.', filter: 'numbers' },
] as const;
export type NoticeAudience = (typeof NOTICE_AUDIENCES)[number]['id'];

export const NOTICE_KINDS = [
  { id: 'AVISO', label: 'Aviso', emoji: '📣' },
  { id: 'CAMPANHA', label: 'Campanha', emoji: '🚀' },
  { id: 'EVENTO', label: 'Evento', emoji: '🎉' },
  { id: 'ROTINA', label: 'Rotina / processo', emoji: '📋' },
  { id: 'URGENTE', label: 'Urgente', emoji: '⚠️' },
] as const;
export const kindOf = (id: string) => NOTICE_KINDS.find((k) => k.id === id) ?? NOTICE_KINDS[0];

export const CONFIRM_LINE = 'Responda *OK* para confirmar que leu. 💙';

/** Texto do WhatsApp: título em negrito, corpo com variáveis ({primeiro_nome}…) e, se pedido, a linha de confirmação. */
export function noticeText(n: { kind: string; title: string; body: string; askConfirmation: boolean }, vars: Partial<Record<VariableKey, string>>): string {
  const body = renderTemplate(n.body, vars);
  return [`${kindOf(n.kind).emoji} *${n.title.trim()}*`, body, n.askConfirmation ? CONFIRM_LINE : null].filter(Boolean).join('\n\n');
}

/** Aparece no mural? Fixado (até a data limite, se houver) ou publicado nos últimos 7 dias. */
export function onBoard(n: { publishedAt: string | null; pinned: boolean; showUntil: string | null }, today: string): boolean {
  if (!n.publishedAt) return false;
  if (n.showUntil && today > n.showUntil) return false;
  if (n.pinned) return true;
  const days = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${n.publishedAt.slice(0, 10)}T00:00:00Z`)) / 86_400_000;
  return days <= 7;
}

/** Resumo de uma campanha para a equipe saber responder aos alunos. */
export function campaignNotice(c: { name: string; objective: string | null; audience: string | null; offer: string | null; message: string | null; cta: string | null; startDate: string; endDate: string | null }) {
  const d = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const quando = c.endDate && c.endDate !== c.startDate ? `de ${d(c.startDate)} a ${d(c.endDate)}` : `a partir de ${d(c.startDate)}`;
  const lines = [
    `Oi, {primeiro_nome}! Vem aí a campanha *${c.name}* (${quando}).`,
    c.objective && `🎯 Objetivo: ${c.objective}`,
    c.audience && `👥 Para quem: ${c.audience}`,
    c.offer && `🎁 Oferta: ${c.offer}`,
    c.message && `💬 Mensagem: ${c.message}`,
    c.cta && `👉 Se um aluno perguntar: ${c.cta}`,
    'Qualquer dúvida, fale com o Marketing.',
  ].filter(Boolean);
  return { title: `Campanha: ${c.name}`, body: lines.join('\n') };
}
