import { WEEKDAYS, formatDateBR, weekdayOf, type IsoDate } from './dates';

/**
 * Treinos da semana — puro. Tipos de bloco, texto de WhatsApp e o cálculo de
 * escala da arte (nada pode sair cortado). Testado sem banco e sem navegador.
 */
export type BlockKind = 'MOBILIDADE' | 'AQUECIMENTO' | 'SKILL' | 'CORE' | 'FORCA' | 'ESPECIFICO' | 'WOD' | 'FUNDAMENTO' | 'JOGO' | 'OUTRO';

export const BLOCK_KINDS: { kind: BlockKind; label: string; detailed: boolean; emoji: string; icon: 'run' | 'target' | 'bar' | 'flame' | 'core' | 'ball' }[] = [
  { kind: 'MOBILIDADE', label: 'Mobilidade', detailed: false, emoji: '🧘', icon: 'run' },
  { kind: 'AQUECIMENTO', label: 'Warm-up', detailed: false, emoji: '🏃', icon: 'run' },
  { kind: 'SKILL', label: 'Skill / Técnica', detailed: true, emoji: '🎯', icon: 'target' },
  { kind: 'ESPECIFICO', label: 'Específico', detailed: true, emoji: '🎯', icon: 'target' },
  { kind: 'CORE', label: 'Core', detailed: false, emoji: '🧱', icon: 'core' },
  { kind: 'FORCA', label: 'Força', detailed: true, emoji: '🏋️', icon: 'bar' },
  { kind: 'WOD', label: 'WOD / Metcon', detailed: true, emoji: '🔥', icon: 'flame' },
  { kind: 'FUNDAMENTO', label: 'Fundamento', detailed: true, emoji: '🏐', icon: 'ball' },
  { kind: 'JOGO', label: 'Situação de jogo', detailed: true, emoji: '🏐', icon: 'ball' },
  { kind: 'OUTRO', label: 'Outro', detailed: true, emoji: '📌', icon: 'target' },
];
export const KIND = Object.fromEntries(BLOCK_KINDS.map((k) => [k.kind, k])) as Record<BlockKind, (typeof BLOCK_KINDS)[number]>;

/** Rótulo que vai na arte: "WARM-UP", "FORÇA", "WOD". */
export const ART_LABEL: Record<BlockKind, string> = {
  MOBILIDADE: 'MOBILIDADE', AQUECIMENTO: 'WARM-UP', SKILL: 'SKILL', ESPECIFICO: 'ESPECÍFICO', CORE: 'CORE',
  FORCA: 'FORÇA', WOD: 'WOD', FUNDAMENTO: 'FUNDAMENTO', JOGO: 'JOGO', OUTRO: '',
};

export interface WorkoutBlockData {
  kind: BlockKind;
  title: string | null;
  durationMin: number | null;
  format: string | null;
  timeCapMin: number | null;
  content: string | null;
  notes: string | null;
  /** Orientações ao professor: só no plano de aula. */
  coachNotes?: string | null;
}
export interface WorkoutDayData { date: IsoDate; title: string | null; blocks: WorkoutBlockData[] }
export interface WorkoutWeekData {
  modality: string;
  weekStart: IsoDate;
  days: WorkoutDayData[];
  footerTitle: string | null;
  footerText: string | null;
  footerChips: string | null;
}

export const lines = (text: string | null | undefined) => (text ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
export const dayName = (d: IsoDate) => WEEKDAYS[weekdayOf(d) - 1]!.long;
export const ddmm = (d: IsoDate) => formatDateBR(d).slice(0, 5);
const mins = (m: number | null) => (m ? `${m}'` : '');

/** Faixa da semana: "28/09 A 03/10" (do primeiro ao último dia com treino). */
export function weekRange(week: Pick<WorkoutWeekData, 'days' | 'weekStart'>): string {
  const withBlocks = week.days.filter((d) => d.blocks.length);
  const dates = (withBlocks.length ? withBlocks : week.days).map((d) => d.date).sort();
  if (!dates.length) return ddmm(week.weekStart);
  return dates.length === 1 ? ddmm(dates[0]!) : `${ddmm(dates[0]!)} A ${ddmm(dates.at(-1)!)}`;
}

/** Cabeçalho do bloco em uma linha: "WOD 15' · For time · O'CONNOR". */
export function blockHeadline(b: WorkoutBlockData): string {
  return [ART_LABEL[b.kind] || (b.title ?? 'BLOCO'), mins(b.durationMin)].filter(Boolean).join(' ');
}

/** Texto para os grupos de WhatsApp: negrito com *, emoji por fase, uma linha por movimento. */
export function whatsappText(week: WorkoutWeekData, onlyDate?: IsoDate): string {
  const days = week.days.filter((d) => d.blocks.length && (!onlyDate || d.date === onlyDate)).sort((a, b) => a.date.localeCompare(b.date));
  const out: string[] = [];
  out.push(onlyDate
    ? `*🔵 TREINO DO DIA · ${week.modality.toUpperCase()}*\n_${dayName(onlyDate)}, ${ddmm(onlyDate)}_`
    : `*🔵 PLANO SEMANAL DE TREINOS · ${week.modality.toUpperCase()}*\n_${weekRange({ ...week, days })}_`);
  for (const d of days) {
    out.push('');
    if (!onlyDate) out.push(`*${dayName(d.date).toUpperCase()} · ${ddmm(d.date)}*${d.title ? ` — ${d.title}` : ''}`);
    for (const b of d.blocks) {
      const k = KIND[b.kind];
      if (!k.detailed) {
        out.push(`${k.emoji} ${ART_LABEL[b.kind]}${b.durationMin ? ` — ${b.durationMin}'` : ''}${b.title ? ` · ${b.title}` : ''}`);
        continue;
      }
      const head = [ART_LABEL[b.kind] || b.title?.toUpperCase(), b.durationMin ? `${b.durationMin}'` : null].filter(Boolean).join(' ');
      out.push(`${k.emoji} *${head}*${b.title && ART_LABEL[b.kind] ? ` — ${b.title}` : ''}`);
      const meta = [b.format, b.timeCapMin ? `Time cap ${b.timeCapMin}'` : null].filter(Boolean).join(' · ');
      if (meta) out.push(`_${meta}_`);
      for (const l of lines(b.content)) out.push(l.startsWith('•') || l.startsWith('-') ? l.replace(/^[-•]\s*/, '• ') : `• ${l}`);
      if (b.notes) out.push(`_${b.notes}_`);
    }
  }
  if (week.footerTitle || week.footerText) {
    out.push('', '━━━━━━━━━━');
    if (week.footerTitle) out.push(`*📣 ${week.footerTitle}*`);
    if (week.footerText) out.push(week.footerText);
  }
  out.push('', '_Muitos esportes, muitas paixões, uma Nação!_ 💙');
  return out.join('\n');
}

/**
 * Altura estimada do conteúdo de um dia, em "linhas de corpo", para escolher
 * o tamanho da letra. Quebra de linha estimada pela largura da coluna.
 */
export function estimateDayLines(day: WorkoutDayData, charsPerLine: number): number {
  const wrap = (t: string) => Math.max(1, Math.ceil(t.length / Math.max(8, charsPerLine)));
  let n = 1.6; // cabeçalho do dia
  for (const b of day.blocks) {
    if (!KIND[b.kind].detailed) { n += 1.35; continue; }
    n += 1.5; // título do bloco
    if (b.title) n += 1.1;
    if (b.format) n += wrap(b.format);
    for (const l of lines(b.content)) n += wrap(l);
    if (b.notes) n += wrap(b.notes) * 0.9;
    if (b.timeCapMin) n += 1.3;
    n += 0.5;
  }
  return n;
}

/** Maior fonte (entre min e max) em que o dia mais cheio cabe na altura disponível. */
export function fitFontSize(days: WorkoutDayData[], opts: { columnWidth: number; height: number; max: number; min: number; lineHeight?: number }): number {
  const lh = opts.lineHeight ?? 1.28;
  for (let size = opts.max; size > opts.min; size -= 0.5) {
    const cpl = Math.floor(opts.columnWidth / (size * 0.5));
    const worst = Math.max(0, ...days.map((d) => estimateDayLines(d, cpl)));
    if (worst * size * lh <= opts.height) return size;
  }
  return opts.min;
}

/** Minutos somados do dia (blocos sem duração não contam). */
export const dayMinutes = (d: WorkoutDayData) => d.blocks.reduce((s, b) => s + (b.durationMin ?? 0), 0);

/**
 * Plano de aula (professor): cada bloco com a janela na linha do tempo da aula
 * ("0'–10'", "10'–20'"…). Sem duração, o bloco herda o ponto atual e não avança.
 */
export function lessonTimeline(d: WorkoutDayData): { block: WorkoutBlockData; from: number; to: number | null }[] {
  let t = 0;
  return d.blocks.map((block) => {
    const from = t;
    if (block.durationMin) t += block.durationMin;
    return { block, from, to: block.durationMin ? t : null };
  });
}

/**
 * Versão do aluno: fases genéricas (mobilidade, warm-up, core) só com o tempo;
 * força, técnica, WOD etc. detalhados. Orientações ao professor nunca saem.
 */
export function studentBlock(b: WorkoutBlockData): WorkoutBlockData {
  const out = { ...b, coachNotes: null };
  return KIND[b.kind].detailed ? out : { ...out, content: null, notes: null, format: null, timeCapMin: null };
}

/** Segunda-feira da semana de uma data. */
export function mondayOf(d: IsoDate): IsoDate {
  const wd = weekdayOf(d);
  const dt = new Date(`${d}T12:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() - (wd - 1));
  return dt.toISOString().slice(0, 10);
}

/** Estrutura inicial de um dia, pela metodologia de cada modalidade. */
export function dayTemplate(modality: string): WorkoutBlockData[] {
  const m = modality.toLowerCase();
  const b = (kind: BlockKind, durationMin: number | null): WorkoutBlockData => ({ kind, durationMin, title: null, format: null, timeCapMin: null, content: null, notes: null });
  if (/crossfit/.test(m)) return [b('AQUECIMENTO', 10), b('FORCA', 10), b('ESPECIFICO', 10), b('WOD', 15)];
  if (/hyrox/.test(m)) return [b('AQUECIMENTO', 8), b('SKILL', 7), b('WOD', 30)];
  if (/futev|base forte|saque|beach|v[oô]lei/.test(m)) return [b('AQUECIMENTO', 10), b('FUNDAMENTO', 20), b('JOGO', 20)];
  return [b('AQUECIMENTO', 8), b('SKILL', 8), b('WOD', 25)];
}
