/**
 * Criativo de comunicado (puro), no padrão do story "Horário de funcionamento":
 * título em duas linhas, faixa com data e motivo, linhas horário × local e a
 * frase final. Aqui ficam as regras de texto e de tamanho — o desenho é do servidor.
 */

export const NOTICE_ART_FORMATS = [
  { id: 'story', label: 'Story (1080×1920)', width: 1080, height: 1920 },
  { id: 'feed', label: 'Feed (1080×1350)', width: 1080, height: 1350 },
] as const;
export type NoticeArtFormat = (typeof NOTICE_ART_FORMATS)[number]['id'];

/**
 * Cor de fundo do criativo: só a original ou o Azul Escuro do manual (1C2C3C).
 */
export const NOTICE_ART_BACKDROPS = [
  { id: 'original', label: 'Original', color: '#232427' },
  { id: 'azul-escuro', label: 'Azul Escuro', color: '#1C2C3C' },
] as const;
export type NoticeArtBackdrop = (typeof NOTICE_ART_BACKDROPS)[number]['id'];
export const noticeBackdrop = (id: string) => NOTICE_ART_BACKDROPS.find((t) => t.id === id) ?? NOTICE_ART_BACKDROPS[0];

/**
 * Cor dos elementos (coluna dos horários, selos, barra do topo), nas cores do
 * manual da marca. `onAccent` = texto em cima do destaque; `bar2` = 2ª parte da barra.
 */
export const NOTICE_ART_THEMES = [
  { id: 'original', label: 'Original', accent: '#3B5BFD', onAccent: '#FFFFFF', bar2: '#D6D6D6' },
  { id: 'azul-classico', label: 'Azul Clássico', accent: '#459EFF', onAccent: '#FFFFFF', bar2: '#BBE3FF' },
  { id: 'azul-claro', label: 'Azul Claro', accent: '#BBE3FF', onAccent: '#1C2C3C', bar2: '#459EFF' },
] as const;
export type NoticeArtTheme = (typeof NOTICE_ART_THEMES)[number]['id'];
export const noticeTheme = (id: string) => NOTICE_ART_THEMES.find((t) => t.id === id) ?? NOTICE_ART_THEMES[0];

/** Conteúdo do meio: tabela de horários ou texto livre (avisos que não são de funcionamento). */
export const NOTICE_ART_CONTENTS = [
  { id: 'horarios', label: 'Horários' },
  { id: 'texto', label: 'Texto livre' },
] as const;
export type NoticeArtContent = (typeof NOTICE_ART_CONTENTS)[number]['id'];
export const MAX_TEXT = 500;

/** Uma linha: horário × local; `badge` = selo opcional no canto (ex.: "R$25,00"). */
export interface NoticeArtRow { time: string; place: string; badge?: string }
export interface NoticeArtInput {
  format: NoticeArtFormat;
  titleTop: string;
  titleBottom: string;
  /** Ex.: "25/10 - ELEIÇÕES". */
  subtitle: string;
  /** O que vai no meio: tabela de horários ou texto livre. */
  content: NoticeArtContent;
  rows: NoticeArtRow[];
  /** Texto livre (parágrafos por quebra de linha; *palavra* sai em negrito). */
  text: string;
  /** Ex.: "Te esperamos!" — a 1ª palavra sai leve, o resto em negrito. */
  closing: string;
  /** Foto de fundo: 'nacao' (foto aérea padrão), 'propria' (enviada) ou 'nenhuma'. */
  background: 'nacao' | 'propria' | 'nenhuma';
  /** Quanto a foto aparece sobre o fundo escuro (0 a 0,3; padrão 0,05 = 5%). */
  photoOpacity: number;
  /** Cor de fundo: original ou Azul Escuro. */
  backdrop: NoticeArtBackdrop;
  /** Cor dos elementos (manual da marca). */
  theme: NoticeArtTheme;
}

export const NOTICE_ART_DEFAULTS: NoticeArtInput = {
  format: 'story',
  titleTop: 'Horário de',
  titleBottom: 'Funcionamento',
  subtitle: '',
  content: 'horarios',
  rows: [{ time: '8h - 12h', place: 'Academia' }],
  text: '',
  closing: 'Te esperamos!',
  background: 'nacao',
  photoOpacity: 0.05,
  backdrop: 'original',
  theme: 'original',
};

export const MAX_ROWS = 6;
const WEEKDAY_SHORT = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

/** "2026-10-25" + "Eleições" → "25/10 - ELEIÇÕES" (sem motivo: "25/10 - DOMINGO"). */
export function subtitleFrom(date: string, reason: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const dm = m ? `${m[3]}/${m[2]}` : '';
  const wd = m ? WEEKDAY_SHORT[new Date(`${date}T12:00:00Z`).getUTCDay()]! : '';
  const tail = reason.trim() || (m ? { DOM: 'Domingo', SEG: 'Segunda', TER: 'Terça', QUA: 'Quarta', QUI: 'Quinta', SEX: 'Sexta', 'SÁB': 'Sábado' }[wd]! : '');
  return [dm, tail].filter(Boolean).join(' - ').toUpperCase();
}

/** Limpa e limita o que vem do formulário; devolve erros em português. */
export function normalizeNoticeArt(raw: Partial<NoticeArtInput>): { ok: true; value: NoticeArtInput } | { ok: false; error: string } {
  const t = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  const format = NOTICE_ART_FORMATS.some((f) => f.id === raw.format) ? (raw.format as NoticeArtFormat) : 'story';
  const content: NoticeArtContent = raw.content === 'texto' ? 'texto' : 'horarios';
  const rows = (Array.isArray(raw.rows) ? raw.rows : [])
    .map((r) => ({ time: t(r?.time, 18), place: t(r?.place, 32), badge: t(r?.badge, 14) }))
    .filter((r) => r.time || r.place)
    .slice(0, MAX_ROWS);
  // Texto livre: mantém as quebras de linha (parágrafos), limpa espaços de cada linha.
  const text = String(raw.text ?? '').split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_TEXT);
  if (content === 'texto') {
    if (text.replace(/\*/g, '').trim().length < 3) return { ok: false, error: 'Escreva o texto do comunicado.' };
  } else {
    if (!rows.length) return { ok: false, error: 'Inclua pelo menos uma linha (horário e local/modalidade).' };
    const missing = rows.find((r) => !r.time || !r.place);
    if (missing) return { ok: false, error: 'Cada linha precisa do horário e do local/modalidade (ex.: "8h - 12h" e "Academia").' };
  }
  const titleBottom = t(raw.titleBottom, 22);
  if (!titleBottom) return { ok: false, error: 'Informe o título (ex.: Funcionamento).' };
  const background = raw.background === 'propria' || raw.background === 'nenhuma' ? raw.background : 'nacao';
  const op = Number(raw.photoOpacity);
  const photoOpacity = Number.isFinite(op) ? Math.min(0.3, Math.max(0, op)) : 0.05;
  const theme = noticeTheme(String(raw.theme ?? '')).id;
  const backdrop = noticeBackdrop(String(raw.backdrop ?? '')).id;
  return { ok: true, value: { backdrop, theme, format, titleTop: t(raw.titleTop, 30), titleBottom, subtitle: t(raw.subtitle, 34), content, rows, text, closing: t(raw.closing, 30), background, photoOpacity } };
}

/** Tamanho da letra para caber na largura (aprox. Montserrat: ~0,68 da altura por letra maiúscula). */
export function fitText(text: string, maxWidth: number, max: number, min: number, perChar = 0.68): number {
  const n = Math.max(1, text.length);
  return Math.max(min, Math.min(max, Math.floor(maxWidth / (n * perChar))));
}

/** Frase final: 1ª palavra leve, o resto em negrito ("TE" + "ESPERAMOS!"). */
export function splitClosing(s: string): [string, string] {
  const words = s.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return ['', words[0] ?? ''];
  return [words[0]!, words.slice(1).join(' ')];
}

/** Texto livre em parágrafos; cada parágrafo em trechos normais e *negrito*. */
export function textParagraphs(text: string): { bold: boolean; text: string }[][] {
  return text.split('\n').map((line) => line.split(/(\*[^*]+\*)/).filter(Boolean).map((part) => (
    /^\*[^*]+\*$/.test(part) ? { bold: true, text: part.slice(1, -1) } : { bold: false, text: part.replace(/\*/g, '') }
  )));
}

/**
 * Maior tamanho de letra em que o texto cabe na caixa (largura × altura máxima).
 * Estimativa para Montserrat: ~0,56 da altura por letra; linha = 1,32 × tamanho.
 */
export function fitParagraphs(text: string, boxW: number, maxH: number, max: number, min: number): { size: number; lines: number } {
  const paras = text.split('\n').map((p) => p.replace(/\*/g, ''));
  for (let size = max; size > min; size -= 2) {
    const perLine = Math.max(1, Math.floor(boxW / (size * 0.56)));
    const lines = paras.reduce((n, p) => n + (p.trim() ? Math.ceil(p.length / perLine) : 0.6), 0);
    if (lines * size * 1.32 <= maxH) return { size, lines };
  }
  const perLine = Math.max(1, Math.floor(boxW / (min * 0.56)));
  return { size: min, lines: paras.reduce((n, p) => n + (p.trim() ? Math.ceil(p.length / perLine) : 0.6), 0) };
}
