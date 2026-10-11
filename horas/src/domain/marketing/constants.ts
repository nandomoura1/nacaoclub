/**
 * Marketing Nação — vocabulário do módulo (tipos, status, colunas, áreas,
 * canais). Rótulos ficam aqui; banco guarda as chaves. Puro.
 */

export const CAMPAIGN_TYPES = [
  { id: 'AQUISICAO', label: 'Aquisição', commercial: true },
  { id: 'RENOVACAO', label: 'Renovação', commercial: true },
  { id: 'RETENCAO', label: 'Retenção', commercial: false },
  { id: 'EVENTO', label: 'Evento', commercial: false },
  { id: 'INSTITUCIONAL', label: 'Institucional', commercial: false },
  { id: 'ENDOMARKETING', label: 'Endomarketing', commercial: false },
  { id: 'AWARENESS', label: 'Awareness', commercial: false },
  { id: 'PARCERIA', label: 'Parceria', commercial: false },
  { id: 'VENDAS', label: 'Vendas', commercial: true },
  { id: 'LANCAMENTO', label: 'Lançamento', commercial: true },
] as const;
export type CampaignType = (typeof CAMPAIGN_TYPES)[number]['id'];
export const isCommercial = (t: string) => CAMPAIGN_TYPES.some((c) => c.id === t && c.commercial);

export const CAMPAIGN_STATUSES = [
  { id: 'IDEIA', label: 'Ideia', tone: 'neutral' },
  { id: 'PLANEJAMENTO', label: 'Planejamento', tone: 'blue' },
  { id: 'PRODUCAO', label: 'Produção', tone: 'blue' },
  { id: 'AGUARDANDO_APROVACAO', label: 'Aguardando aprovação', tone: 'amber' },
  { id: 'PROGRAMADA', label: 'Programada', tone: 'cyan' },
  { id: 'ATIVA', label: 'Ativa', tone: 'green' },
  { id: 'FINALIZADA', label: 'Finalizada', tone: 'navy' },
  { id: 'ANALISE', label: 'Análise', tone: 'neutral' },
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number]['id'];
/** Status que exigem a permissão de aprovar. */
export const APPROVAL_STATUSES: CampaignStatus[] = ['PROGRAMADA', 'ATIVA'];

export const TASK_COLUMNS = [
  { id: 'BACKLOG', label: 'Backlog' },
  { id: 'PROXIMAS', label: 'Próximas campanhas' },
  { id: 'SEMANA', label: 'Esta semana' },
  { id: 'PRODUCAO', label: 'Em produção' },
  { id: 'APROVACAO', label: 'Aguardando aprovação' },
  { id: 'PROGRAMADO', label: 'Programado' },
  { id: 'EXECUTADO', label: 'Publicado / executado' },
  { id: 'RESULTADOS', label: 'Resultados' },
] as const;
export type TaskColumn = (typeof TASK_COLUMNS)[number]['id'];
/** Colunas que contam como "feito". */
export const DONE_COLUMNS: TaskColumn[] = ['EXECUTADO', 'RESULTADOS'];
export const isDone = (c: string) => (DONE_COLUMNS as string[]).includes(c);

export const PRIORITIES = [
  { id: 'BAIXA', label: 'Baixa' },
  { id: 'MEDIA', label: 'Média' },
  { id: 'ALTA', label: 'Alta' },
  { id: 'URGENTE', label: 'Urgente' },
] as const;
export type Priority = (typeof PRIORITIES)[number]['id'];

/** Áreas do marketing (responsável padrão fica no banco, editável). */
export const AREAS = [
  { key: 'PLANEJAMENTO', name: 'Planejamento & Campanhas', color: '#0169E9', question: 'O que vamos comunicar, para quem, quando e com qual objetivo?' },
  { key: 'COMUNICACAO', name: 'Comunicação Interna & Ativações', color: '#20C4FA', question: 'Todo mundo que precisava saber disso ficou sabendo?' },
  { key: 'CONTEUDO', name: 'Conteúdo & Social Media', color: '#3A86FF', question: 'Como transformamos isso em conteúdo que as pessoas querem assistir?' },
  { key: 'DESIGN', name: 'Design de Marca & Campanhas', color: '#022B57', question: 'Como transformar essa mensagem numa comunicação visual forte e coerente com a marca?' },
  { key: 'COMERCIAL', name: 'Comercial', color: '#16a34a', question: 'O que precisamos vender e o que está impedindo a venda?' },
] as const;
export type AreaKey = (typeof AREAS)[number]['key'];

/** Canais (Fase 1: escolhidos na campanha; Fase 2 ganham URL/UTM próprios). */
export const CHANNELS = [
  { key: 'ig_feed', label: 'Instagram Feed', group: 'EXTERNO' },
  { key: 'ig_stories', label: 'Instagram Stories', group: 'EXTERNO' },
  { key: 'ig_reels', label: 'Instagram Reels', group: 'EXTERNO' },
  { key: 'meta_ads', label: 'Meta Ads', group: 'EXTERNO' },
  { key: 'google_ads', label: 'Google Ads', group: 'EXTERNO' },
  { key: 'site', label: 'Site', group: 'EXTERNO' },
  { key: 'parceiros', label: 'Parceiros', group: 'EXTERNO' },
  { key: 'tecnofit', label: 'Tecnofit', group: 'INTERNO' },
  { key: 'whatsapp', label: 'WhatsApp', group: 'INTERNO' },
  { key: 'tv_nacao', label: 'TV Nação', group: 'INTERNO' },
  { key: 'professores', label: 'Professores', group: 'INTERNO' },
  { key: 'recepcao', label: 'Recepção', group: 'INTERNO' },
  { key: 'fisico', label: 'Comunicação física / banners', group: 'INTERNO' },
  { key: 'qrcode', label: 'QR Code', group: 'INTERNO' },
  { key: 'equipe', label: 'Equipe Nação', group: 'INTERNO' },
] as const;
export const CONVERSION_CHANNELS = [
  { key: 'forms', label: 'Formulário (Forms)' },
  { key: 'landing', label: 'Landing page' },
  { key: 'site_vendas', label: 'Site de vendas' },
  { key: 'whatsapp', label: 'WhatsApp comercial' },
  { key: 'tecnofit', label: 'Tecnofit' },
  { key: 'crm', label: 'CRM' },
  { key: 'outro', label: 'Outro' },
] as const;
export const channelLabel = (k: string) => CHANNELS.find((c) => c.key === k)?.label ?? k;
export const isInternalChannel = (k: string) => CHANNELS.some((c) => c.key === k && c.group === 'INTERNO');

export const CALENDAR_KINDS = [
  { id: 'DATA_COMEMORATIVA', label: 'Data comemorativa' },
  { id: 'ACAO_COMERCIAL', label: 'Ação comercial' },
  { id: 'PARCERIA', label: 'Parceria' },
  { id: 'ATIVACAO', label: 'Ativação' },
  { id: 'LANCAMENTO', label: 'Lançamento' },
  { id: 'SAUDE', label: 'Campanha de saúde' },
  { id: 'ENDOMARKETING', label: 'Endomarketing' },
  { id: 'AVISO', label: 'Aviso / mudança de horário' },
  { id: 'OUTRO', label: 'Outro' },
] as const;
export type CalendarKind = (typeof CALENDAR_KINDS)[number]['id'];

export const EVENT_STATUSES = [
  { id: 'PLANEJADO', label: 'Planejado' },
  { id: 'CONFIRMADO', label: 'Confirmado' },
  { id: 'REALIZADO', label: 'Realizado' },
  { id: 'CANCELADO', label: 'Cancelado' },
] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number]['id'];

export const labelOf = <T extends { id: string; label: string }>(list: readonly T[], id: string) => list.find((x) => x.id === id)?.label ?? id;
