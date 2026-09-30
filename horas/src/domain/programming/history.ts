import { weekdayOf, type IsoDate } from '@/domain/dates';

/**
 * Leitor do histórico de programação (data/historico-crossfit/*.txt):
 *
 *   ## 2026-09-21
 *   FOR 10 | Back squat | a cada 2' 5 sets 10-8-8-6-6 @60-80%
 *   WOD 11 | AMRAP 11' #partner | 50 DU; 15m walking lunge; 10 BMU
 *
 * Uma sessão por data; blocos "TIPO minutos | título/formato | detalhe".
 */
export type SessionBlockKind = 'MOB' | 'WU' | 'TEC' | 'SKILL' | 'FOR' | 'ESP' | 'WOD' | 'ACC' | 'CARDIO';
const KINDS = new Set<SessionBlockKind>(['MOB', 'WU', 'TEC', 'SKILL', 'FOR', 'ESP', 'WOD', 'ACC', 'CARDIO']);
const ALIAS: Record<string, SessionBlockKind> = { STAMINA: 'CARDIO', CORE: 'ACC' };

export interface SessionBlock {
  kind: SessionBlockKind;
  minutes: number | null;
  /** Segundo campo: nome do levantamento (FOR) ou formato (WOD). */
  title: string;
  /** Terceiro campo: esquema de séries (FOR) ou movimentos (WOD). */
  detail: string;
  /** Itens do detalhe separados por ";". */
  items: string[];
  tags: string[];
}

export interface Session {
  date: IsoDate;
  weekday: number; // 1 = segunda … 7 = domingo
  blocks: SessionBlock[];
  tags: string[];
  /** Dia sem aula regular (feriado/evento). */
  special: boolean;
}

/** "#partner", "#open:23.1 adaptado" → "open:23.1", "#benchmark:Fight Gone Bad" → "benchmark:Fight Gone Bad". */
const TAG = /#([\p{L}]+):([^#|;]+)|#([\p{L}\d._-]+)/gu;
const tagsOf = (s: string) => [...s.matchAll(TAG)].map((x) => {
  if (x[3]) return x[3].toLowerCase();
  const key = x[1]!.toLowerCase();
  const value = x[2]!.trim();
  return `${key}:${key === 'open' || key === 'quarterfinals' ? value.split(/\s+/)[0] : value.replace(/\s+adaptado$/i, '')}`;
});

export function parseHistory(text: string): Session[] {
  const sessions = new Map<IsoDate, Session>();
  let current: Session | null = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || (line.startsWith('#') && !line.startsWith('## '))) {
      // Comentário de arquivo ("# Crossfit 21/09…") ou tag solta do dia (#feriado).
      if (current && /^#[\p{L}]/u.test(line)) {
        current.tags.push(...tagsOf(line));
        if (/#(feriado|evento)/i.test(line)) current.special = true;
      }
      continue;
    }
    const day = line.match(/^## (\d{4}-\d{2}-\d{2})/);
    if (day) {
      const date = day[1]!;
      current = sessions.get(date) ?? { date, weekday: weekdayOf(date), blocks: [], tags: [], special: false };
      sessions.set(date, current);
      continue;
    }
    if (!current) continue;
    const [head = '', title = '', ...rest] = line.split('|').map((s) => s.trim());
    const [kindRaw = '', minRaw] = head.split(/\s+/);
    const kind = (ALIAS[kindRaw.toUpperCase()] ?? kindRaw.toUpperCase()) as SessionBlockKind;
    if (!KINDS.has(kind)) continue;
    const detail = rest.join(' | ');
    const tags = [...tagsOf(title), ...tagsOf(detail)];
    if (kind === 'WOD' && !detail && tags.some((t) => t.startsWith('feriado') || t.startsWith('evento'))) current.special = true;
    current.blocks.push({
      kind,
      minutes: minRaw && /^\d+$/.test(minRaw) ? Number(minRaw) : null,
      title: title.replace(TAG, '').trim(),
      detail,
      items: detail.split(';').map((s) => s.trim()).filter(Boolean),
      tags,
    });
  }
  return [...sessions.values()].sort((a, b) => a.date.localeCompare(b.date));
}
