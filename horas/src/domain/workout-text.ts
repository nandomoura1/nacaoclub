import { addDays, formatDateBR, type IsoDate } from './dates';
import type { BlockKind, WorkoutBlockData, WorkoutDayData } from './workout';

/**
 * Semana escrita em texto livre → dias e blocos do Cadastro de Treino. Puro.
 *
 *   FUTEVÔLEI
 *   INTENÇÃO DO MÊS - LEVANTADA
 *   SEGUNDA ( Levantada de chapa ) - 05/10/2026
 *   Mobilidade : 4 exercícios
 *   Aquecimento / Dinâmica de jogo com enquadramento :
 *   - Quadrinha / enquadrar a primeira bola de chapa
 *   Fundamento :
 *   - Executar a chapa em todos os sentidos
 *   Dinâmica de jogo com regras :
 *   - Joguinho só vale levantada de chapa
 *
 * O texto do professor é mantido como está: nada é inventado (sem minutos, se
 * o texto não trouxer). Sem nenhum dia escrito, quem organiza é a IA.
 */

export interface ParsedWeek {
  /** "Intenção do mês", "Ideia central", "Tema"… */
  theme: string | null;
  days: WorkoutDayData[];
  warnings: string[];
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const WEEKDAY: [RegExp, number][] = [
  [/^segunda/, 1], [/^terca/, 2], [/^quarta/, 3], [/^quinta/, 4], [/^sexta/, 5], [/^sabado/, 6], [/^domingo/, 7],
];
/** "SEGUNDA ( Levantada de chapa ) - 05/10/2026", "Terça-feira 06/10", "QUARTA: Levantada coxa e cabeça". */
// Depois do dia só vale "-feira", "(", ":", traço ou data: "Segunda bola de chapa" não é um dia.
const DAY_LINE = /^(segunda|terca|quarta|quinta|sexta|sabado|domingo)(?:[\s-]*feira)?\s*((?:[(:\-–—\d]).*)?$/;
const THEME_LINE = /^(?:inten[cç][aã]o(?:\s+d[oa]\s+(?:m[eê]s|semana))?|ideia\s+central|tema(?:\s+d[ao]\s+(?:m[eê]s|semana))?|foco\s+d[ao]\s+(?:m[eê]s|semana))\s*[:\-–—]\s*(.+)$/i;

/** Rótulo da seção → tipo de bloco. Ordem importa: "Aquecimento / Dinâmica de jogo…" é aquecimento. */
const SECTIONS: [RegExp, BlockKind][] = [
  [/^mobilidade/, 'MOBILIDADE'],
  [/^(aquecimento|warm[\s-]?up|ativacao)/, 'AQUECIMENTO'],
  [/^fundamento/, 'FUNDAMENTO'],
  [/^(dinamica|jogo|situacao de jogo|joguinho|mini[\s-]?jogo)/, 'JOGO'],
  [/^(skill|tecnica)/, 'SKILL'],
  [/^especifico/, 'ESPECIFICO'],
  [/^(forca|strength)/, 'FORCA'],
  [/^(wod|metcon|condicionamento)/, 'WOD'],
  [/^(core|abdomen)/, 'CORE'],
  [/^(volta a calma|alongamento|desaquecimento)/, 'OUTRO'],
];
/** Tipos que, na arte do aluno, saem só com o tempo: o texto curto da linha vira o título. */
const SHORT: ReadonlySet<BlockKind> = new Set(['MOBILIDADE', 'AQUECIMENTO', 'CORE']);

const MIN = /\(?\s*(\d{1,3})\s*(?:'|’|′|min(?:utos)?\b)\s*\)?/i;
const clean = (s: string) => s.replace(/\s+/g, ' ').replace(/\s+([,.;:)])/g, '$1').replace(/\(\s+/g, '(').trim();
const bullet = (s: string) => clean(s.replace(/^[-–—•*·]\s*/, ''));

/** "Aquecimento / Dinâmica de jogo com enquadramento : texto" → seção, se o começo for um rótulo conhecido. */
function sectionOf(line: string): { kind: BlockKind; title: string | null; minutes: number | null; rest: string } | null {
  const m = line.match(/^([^:]{2,80}?)\s*:\s*(.*)$/);
  if (!m) return null;
  let label = clean(m[1]!);
  const rest = clean(m[2]!);
  const kind = SECTIONS.find(([re]) => re.test(fold(label)))?.[1];
  if (!kind) return null;
  const min = label.match(MIN);
  if (min) label = clean(label.replace(min[0], '').replace(/[–—-]\s*$/, ''));
  // "Aquecimento / Dinâmica de jogo com enquadramento" → título "Dinâmica de jogo com enquadramento".
  const slash = label.split(/\s*\/\s*/);
  const title = slash.length > 1 ? slash.slice(1).join(' / ') : kind === 'JOGO' || kind === 'OUTRO' ? label : null;
  return { kind, title: title ? title.slice(0, 80) : null, minutes: min ? Number(min[1]) : null, rest };
}

function parseDayLine(line: string, weekStart: IsoDate, warnings: string[]): { date: IsoDate; title: string | null } | null {
  const m = fold(line).match(DAY_LINE);
  if (!m) return null;
  const wd = WEEKDAY.find(([re]) => re.test(m[1]!))![1];
  const date = addDays(weekStart, wd - 1);
  // Resto da linha no texto original (com acentos): mesmo comprimento depois do dia.
  let rest = m[2] ? line.slice(line.length - m[2].length) : '';
  const dm = rest.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (dm) {
    const written = `${dm[1]!.padStart(2, '0')}/${dm[2]!.padStart(2, '0')}`;
    if (written !== formatDateBR(date).slice(0, 5)) warnings.push(`${line.split(/[\s(]/)[0]} ${written}: a data não é ${formatDateBR(date).slice(0, 5)} desta semana — usei ${formatDateBR(date).slice(0, 5)}.`);
    rest = rest.replace(dm[0], '');
  }
  const paren = rest.match(/\(([^)]*)\)/);
  const raw = paren ? paren[1]! : rest;
  const title = clean(raw.replace(/^[\s:–—-]+|[\s:–—-]+$/g, ''));
  return { date, title: title ? title.slice(0, 40) : null };
}

export function parseWeekText(text: string, weekStart: IsoDate): ParsedWeek {
  const warnings: string[] = [];
  let theme: string | null = null;
  const days = new Map<IsoDate, WorkoutDayData>();
  let day: WorkoutDayData | null = null;
  let block: WorkoutBlockData | null = null;
  const push = (l: string) => { block!.content = block!.content ? `${block!.content}\n${l}` : l; };

  for (const raw of text.split(/\r?\n/)) {
    const line = clean(raw);
    if (!line) continue;
    const th = line.match(THEME_LINE);
    if (th && !day) { theme = clean(th[1]!).slice(0, 120); continue; }
    const d = parseDayLine(line, weekStart, warnings);
    if (d) {
      if (days.has(d.date)) warnings.push(`${formatDateBR(d.date).slice(0, 5)} apareceu duas vezes: juntei os blocos no mesmo dia.`);
      day = days.get(d.date) ?? { date: d.date, title: d.title, blocks: [] };
      days.set(d.date, day);
      block = null;
      continue;
    }
    if (!day) continue; // nome da modalidade, cabeçalhos soltos antes do 1º dia
    const s = sectionOf(line);
    if (s) {
      const short = SHORT.has(s.kind) && s.rest.length <= 80 && !s.title;
      block = {
        kind: s.kind, title: short && s.rest ? s.rest : s.title, durationMin: s.minutes, format: null, timeCapMin: null,
        content: short ? null : s.rest ? bullet(s.rest) : null, notes: null, coachNotes: null,
      };
      day.blocks.push(block);
      continue;
    }
    if (!block) { // texto do dia antes da 1ª seção
      block = { kind: 'OUTRO', title: null, durationMin: null, format: null, timeCapMin: null, content: null, notes: null, coachNotes: null };
      day.blocks.push(block);
    }
    push(bullet(line));
  }

  for (const d of days.values()) {
    if (d.blocks.length > 12) { warnings.push(`${formatDateBR(d.date).slice(0, 5)} tem ${d.blocks.length} blocos: ficaram os 12 primeiros.`); d.blocks = d.blocks.slice(0, 12); }
    for (const b of d.blocks) b.content = b.content?.slice(0, 2000) ?? null;
  }
  return { theme, days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)), warnings };
}

/** Tem pelo menos um dia escrito ("SEGUNDA…")? Senão, a IA monta a semana a partir da ideia. */
export const hasWrittenDays = (text: string) => text.split(/\r?\n/).some((l) => DAY_LINE.test(fold(clean(l))));
