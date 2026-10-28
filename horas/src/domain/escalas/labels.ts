import { formatClock } from '@/domain/dates';
import type { Bond, Cell, CellKind } from './types';

/** Rótulos e cores da grade (puro; usado na tela, na impressão e na planilha). */

export const BOND_LABEL: Record<Bond, string> = { CLT: 'CLT', FUNAP: 'FUNAP', MEI: 'MEI', FREELANCER: 'Freelancer' };

export const CELL_LABEL: Record<CellKind, string> = {
  TRABALHO: 'Trabalho', FOLGA: 'Folga', BANCO: 'Folga (banco de horas)', FECHADO: 'Fechado', SEM_GRADE: 'Sem grade',
  FERIAS: 'Férias', ATESTADO: 'Atestado', FALTA: 'Falta', AFASTAMENTO: 'Afastamento', INDISPONIVEL: 'Indisponível',
};
export const CELL_SHORT: Record<CellKind, string> = {
  TRABALHO: '', FOLGA: 'FOLGA', BANCO: 'BANCO', FECHADO: 'FECH', SEM_GRADE: '—', FERIAS: 'FÉRIAS', ATESTADO: 'ATEST', FALTA: 'FALTA', AFASTAMENTO: 'AFAST', INDISPONIVEL: 'INDISP',
};
/** Classes Tailwind por situação (fundo + texto). */
export const CELL_TONE: Record<CellKind, string> = {
  TRABALHO: 'bg-white text-navy',
  FOLGA: 'bg-sucesso/10 text-sucesso',
  BANCO: 'bg-nacao/10 text-nacao',
  FECHADO: 'bg-fundo text-tinta-fraca',
  SEM_GRADE: 'bg-white text-tinta-fraca',
  FERIAS: 'bg-ciano/20 text-navy-700',
  ATESTADO: 'bg-atencao/15 text-atencao',
  FALTA: 'bg-critico/10 text-critico',
  AFASTAMENTO: 'bg-atencao/15 text-atencao',
  INDISPONIVEL: 'bg-fundo text-tinta-suave',
};
/** Cores para a planilha (ARGB). */
export const CELL_FILL: Record<CellKind, string> = {
  TRABALHO: 'FFFFFFFF', FOLGA: 'FFDDF5E6', BANCO: 'FFDDEBFF', FECHADO: 'FFEDEFF3', SEM_GRADE: 'FFFFFFFF', FERIAS: 'FFD2F3FB', ATESTADO: 'FFFFF0D6', FALTA: 'FFFDE0E0', AFASTAMENTO: 'FFFFF0D6', INDISPONIVEL: 'FFEDEFF3',
};

export const hhmm = (m: number | null | undefined) => (m == null ? '' : formatClock(m));
export const shortClock = (m: number) => (m % 60 ? formatClock(m) : `${Math.floor(m / 60)}h`);

/** Texto da célula: "07–15:20" no trabalho, sigla nos demais. */
export function cellText(c: Cell | undefined): string {
  if (!c) return '';
  if (c.kind === 'TRABALHO' && c.startMin != null && c.endMin != null) return `${shortClock(c.startMin)}–${shortClock(c.endMin)}`;
  return CELL_SHORT[c.kind];
}

export const fmtHours = (min: number) => {
  const sign = min < 0 ? '−' : '';
  const a = Math.abs(min);
  return `${sign}${Math.floor(a / 60)}h${a % 60 ? String(a % 60).padStart(2, '0') : ''}`;
};

export const POST_KIND_LABEL: Record<string, string> = { ABERTURA: 'Abertura', FECHAMENTO: 'Fechamento', ALMOCO: 'Almoço' };
export const STATUS_LABEL: Record<string, string> = { RASCUNHO: 'Rascunho', APROVADA: 'Aprovada', PUBLICADA: 'Publicada' };
export const SOURCE_LABEL: Record<string, string> = {
  SETOR_EXCECAO: 'exceção do setor', NACAO_EXCECAO: 'funcionamento especial da Nação', SETOR_FERIADO: 'horário de feriado do setor',
  NACAO_FERIADO: 'horário de feriado da Nação', SETOR: 'horário do setor', NACAO: 'horário geral da Nação', SEM_HORARIO: 'sem horário',
};
