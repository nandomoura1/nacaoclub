import { CAMPAIGN_TYPES, type CalendarKind } from './constants';

/**
 * Importação de um cronograma de marketing (documento → base do sistema). Puro.
 * A IA lê o documento e devolve itens datados; aqui cada tipo ganha destino
 * (evento, campanha ou data do calendário), status padrão e checagem de
 * duplicados. Nada é gravado sem a revisão humana.
 */

export const IMPORT_KINDS = [
  { id: 'EVENTO', label: 'Evento da Nação', target: 'evento', on: true },
  { id: 'CAMPANHA', label: 'Campanha / ação', target: 'campanha', on: true },
  { id: 'TEMA_DO_MES', label: 'Tema do mês', target: 'item', calendar: 'TEMA_DO_MES', on: true },
  { id: 'DATA_COMEMORATIVA', label: 'Data comemorativa', target: 'item', calendar: 'DATA_COMEMORATIVA', on: true },
  { id: 'SAUDE', label: 'Campanha de saúde (mês)', target: 'item', calendar: 'SAUDE', on: true },
  { id: 'ACAO_COMERCIAL', label: 'Oportunidade comercial', target: 'item', calendar: 'ACAO_COMERCIAL', on: true },
  { id: 'CONTEUDO', label: 'Pauta de conteúdo', target: 'item', calendar: 'CONTEUDO', on: true },
  { id: 'FUNCIONAMENTO', label: 'Aviso de funcionamento', target: 'item', calendar: 'AVISO', on: true },
  { id: 'INTERNO', label: 'Interno da equipe', target: 'item', calendar: 'ENDOMARKETING', on: true },
  // Já existem no sistema (feriados da Gestão de Horas) ou têm dado pessoal: fora por padrão.
  { id: 'FERIADO', label: 'Feriado', target: 'item', calendar: 'DATA_COMEMORATIVA', on: false },
  { id: 'PRIVADO', label: 'Evento privado (locação)', target: 'item', calendar: 'OUTRO', on: false },
] as const satisfies readonly { id: string; label: string; target: 'evento' | 'campanha' | 'item'; calendar?: CalendarKind; on: boolean }[];
export type ImportKind = (typeof IMPORT_KINDS)[number]['id'];
export const importKind = (id: string) => IMPORT_KINDS.find((k) => k.id === id) ?? IMPORT_KINDS.find((k) => k.id === 'DATA_COMEMORATIVA')!;

export interface ScheduleItem {
  data: string;
  dataFim: string | null;
  titulo: string;
  tipo: ImportKind;
  detalhes: string | null;
  parceiro: string | null;
  aConfirmar: boolean;
  campanhaTipo: string | null;
  origem: string;
}

export interface PlannedRow {
  index: number;
  include: boolean;
  kind: ImportKind;
  target: 'evento' | 'campanha' | 'item';
  title: string;
  startDate: string;
  endDate: string | null;
  /** Evento: PLANEJADO/CONFIRMADO/REALIZADO. Campanha: IDEIA/FINALIZADA. */
  status: string;
  campaignType: string;
  notes: string | null;
  duplicate: boolean;
  aConfirmar: boolean;
  origem: string;
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export const dupKey = (title: string, date: string) => `${date}|${fold(title)}`;
const CAMPAIGN_IDS = new Set<string>(CAMPAIGN_TYPES.map((t) => t.id));

export function defaultStatus(target: PlannedRow['target'], date: string, today: string, aConfirmar: boolean): string {
  if (target === 'evento') return date < today ? 'REALIZADO' : aConfirmar ? 'PLANEJADO' : 'CONFIRMADO';
  if (target === 'campanha') return date < today && !aConfirmar ? 'FINALIZADA' : 'IDEIA';
  return '';
}

export function notesOf(i: Pick<ScheduleItem, 'detalhes' | 'parceiro' | 'aConfirmar'>, source: string) {
  return [i.detalhes, i.parceiro ? `Parceiro/patrocínio: ${i.parceiro}` : null, i.aConfirmar ? 'A confirmar (no cronograma).' : null, `Importado de: ${source}`]
    .filter(Boolean).join('\n').slice(0, 2000);
}

/** Linhas da revisão: destino, status padrão, duplicados (no banco e no próprio arquivo). */
export function planScheduleImport(items: ScheduleItem[], today: string, existing: ReadonlySet<string>, source: string): PlannedRow[] {
  const seen = new Set<string>();
  return items.map((i, index) => {
    const k = importKind(i.tipo);
    const key = dupKey(i.titulo, i.data);
    const duplicate = existing.has(key) || seen.has(key);
    seen.add(key);
    return {
      index, include: k.on && !duplicate, kind: k.id, target: k.target, title: i.titulo.slice(0, 140), startDate: i.data,
      endDate: i.dataFim && i.dataFim > i.data ? i.dataFim : null,
      status: defaultStatus(k.target, i.data, today, i.aConfirmar),
      campaignType: i.campanhaTipo && CAMPAIGN_IDS.has(i.campanhaTipo) ? i.campanhaTipo : 'INSTITUCIONAL',
      notes: notesOf(i, source), duplicate, aConfirmar: i.aConfirmar, origem: i.origem.slice(0, 200),
    };
  }).sort((a, b) => a.startDate.localeCompare(b.startDate) || a.index - b.index);
}

/** Mesmo dia da semana um ano depois (+364 dias): o "modelo" para repetir um evento. */
export function nextYearSameWeekday(date: string) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 364);
  return d.toISOString().slice(0, 10);
}
