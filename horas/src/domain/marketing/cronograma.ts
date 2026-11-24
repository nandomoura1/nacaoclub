import { addDays, type IsoDate } from '@/domain/dates';

/**
 * Cronograma do mês (Marketing) — puro. Um plano por mês ("AAAA-MM") com objetivos e posts planejados.
 * O texto no formato do Google Docs da equipe sai daqui (`planText`) e também volta (`parsePlanText`):
 * dá para circular no Docs e colar de volta sem redigitar.
 */

export const CHANNELS = [
  { id: 'INSTAGRAM', label: 'Instagram' },
  { id: 'TIKTOK', label: 'TikTok' },
  { id: 'YOUTUBE', label: 'YouTube' },
  { id: 'WHATSAPP', label: 'WhatsApp (comunicado)' },
  { id: 'EMAIL', label: 'E-mail' },
  { id: 'SITE', label: 'Site' },
  { id: 'TV_NACAO', label: 'TV Nação' },
] as const;
export type Channel = (typeof CHANNELS)[number]['id'];

export const FORMATS = [
  { id: 'REELS', label: 'Reels' },
  { id: 'CARROSSEL', label: 'Carrossel' },
  { id: 'ESTATICO', label: 'Post estático' },
  { id: 'STORIES', label: 'Só stories' },
  { id: 'VIDEO', label: 'Vídeo' },
  { id: 'TEXTO', label: 'Texto / comunicado' },
  { id: 'OUTRO', label: 'Outro' },
] as const;
export type Format = (typeof FORMATS)[number]['id'];

export const POST_STATUSES = [
  { id: 'PLANEJADO', label: 'Planejado' },
  { id: 'PUBLICADO', label: 'Publicado' },
  { id: 'NAO_PUBLICADO', label: 'Não publicado' },
] as const;

export const channelLabel = (id: string) => CHANNELS.find((c) => c.id === id)?.label ?? id;
export const formatLabel = (id: string) => FORMATS.find((f) => f.id === id)?.label ?? id;

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const WEEKDAYS = ['DOMINGO', 'SEGUNDA', 'TERÇA', 'QUARTA', 'QUINTA', 'SEXTA', 'SÁBADO'];

export const isMonth = (s: string | null | undefined): s is string => !!s && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
export const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
export const shiftMonth = (m: string, n: number) => {
  const d = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};
export function monthDays(m: string): IsoDate[] {
  const out: IsoDate[] = [];
  for (let d = `${m}-01` as IsoDate; d.startsWith(m); d = addDays(d, 1)) out.push(d);
  return out;
}
export const weekdayOf = (d: IsoDate) => WEEKDAYS[new Date(`${d}T12:00:00Z`).getUTCDay()]!;
/** "01/12, TERÇA" */
export const dayHeader = (d: IsoDate) => `${d.slice(8, 10)}/${d.slice(5, 7)}, ${weekdayOf(d)}`;

/** Prazo da tarefa de produção: 2 dias antes de publicar, nunca no passado. */
export const taskDue = (date: IsoDate, today: IsoDate): IsoDate => { const d = addDays(date, -2); return d < today ? today : d; };

export interface PlanPost {
  date: IsoDate; channel: string; topic: string; format: string; title: string;
  body: string | null; cta: string | null; stories: string | null; pending: string | null;
}

/** Título/roteiro da tarefa do Kanban a partir do post. */
export function postTask(p: PlanPost): { title: string; description: string } {
  const parts = [
    `Publicar em ${p.date.slice(8, 10)}/${p.date.slice(5, 7)} (${weekdayOf(p.date).toLowerCase()}) · ${channelLabel(p.channel)} · ${p.topic}`,
    p.body, p.cta ? `CTA: ${p.cta}` : null, p.stories ? `Stories: ${p.stories}` : null, p.pending ? `A confirmar: ${p.pending}` : null,
    'Origem: Cronograma do mês.',
  ];
  return { title: `[${formatLabel(p.format)}] ${p.title}`.slice(0, 200), description: parts.filter(Boolean).join('\n\n') };
}

/** Texto no formato do Docs da equipe (para colar no Google Docs / WhatsApp). */
export function planText(month: string, objectives: string | null, posts: PlanPost[], holidays: Record<string, string> = {}): string {
  const out = [`Cronograma de ${monthLabel(month).replace(/^./, (c) => c.toUpperCase())} · Nação`, ''];
  if (objectives?.trim()) out.push(`Objetivos de ${MONTHS[Number(month.slice(5, 7)) - 1]}`, '', objectives.trim(), '');
  const byDay = new Map<string, PlanPost[]>();
  for (const p of posts) byDay.set(p.date, [...(byDay.get(p.date) ?? []), p]);
  for (const d of monthDays(month)) {
    const list = byDay.get(d);
    if (!list?.length) continue;
    out.push(`${dayHeader(d)}${holidays[d] ? ` (${holidays[d]})` : ''}`, '');
    for (const p of list) {
      out.push(p.topic.toUpperCase(), '');
      if (p.format === 'STORIES') out.push('STORIES', '', p.body?.trim() || 'Sem post no feed.', '');
      else {
        out.push(`${formatLabel(p.format)} | “${p.title}”${p.channel !== 'INSTAGRAM' ? ` · ${channelLabel(p.channel)}` : ''}`, '');
        if (p.body?.trim()) out.push(p.body.trim(), '');
        if (p.cta?.trim()) out.push(`CTA: ${p.cta.trim()}`, '');
        if (p.stories?.trim()) out.push(`Stories: ${p.stories.trim()}`, '');
      }
    }
  }
  const pend = posts.filter((p) => p.pending?.trim());
  if (pend.length) {
    out.push('A confirmar antes de aprovar', '');
    for (const p of pend) out.push(`☐ ${p.date.slice(8, 10)}/${p.date.slice(5, 7)} · ${p.title}: ${p.pending!.trim()}`);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ── Colar do Docs ─────────────────────────────────────────

const FORMAT_WORDS: [RegExp, Format][] = [
  [/^reels?/i, 'REELS'], [/^carross?el/i, 'CARROSSEL'], [/^post\s*est[aá]tico|^est[aá]tico|^post\b/i, 'ESTATICO'],
  [/^stories/i, 'STORIES'], [/^v[ií]deo/i, 'VIDEO'], [/^texto|^comunicado/i, 'TEXTO'],
];
const clean = (s: string) => s.replace(/^#+\s*/, '').replace(/\*\*/g, '').replace(/\\([[\]&*_#|])/g, '$1').replace(/\\/g, '').trim();
const DAY_RE = /^(\d{1,2})\/(\d{1,2})(?:\s*[,–-]\s*([A-ZÁÉÍÓÚÂÊÔÃÇa-záéíóúâêôãç\- ]+?))?\s*(?:\(([^)]*)\))?\s*$/;
const END_RE = /^a confirmar|^pend[eê]ncias/i;

export interface ParsedPlan { objectives: string | null; posts: PlanPost[]; skipped: string[] }

/**
 * Lê o cronograma colado do Google Docs no formato da equipe:
 * cabeçalho do dia ("01/12, TERÇA"), assunto em caixa alta ("PLANO DUO"), "Formato | “Título”", texto,
 * "CTA: …", "Stories: …"; "[…]" vira "a confirmar". O que vem antes do 1º dia (sem o título) vira objetivos.
 */
export function parsePlanText(text: string, month: string): ParsedPlan {
  const lines = text.split(/\r?\n/).map(clean);
  const year = month.slice(0, 4);
  const posts: PlanPost[] = [];
  const skipped: string[] = [];
  const intro: string[] = [];
  let day: IsoDate | null = null;
  let cur: (PlanPost & { lines: string[] }) | null = null;
  let ended = false;
  const flush = () => {
    if (!cur) return;
    const pending = [...cur.lines.join('\n').matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]!.trim());
    // Parágrafos do Docs viram linhas (sem linha em branco entre slides).
    const body = cur.lines.join('\n').replace(/\n{2,}/g, '\n').trim();
    posts.push({ ...cur, body: body || null, pending: pending.length ? [...new Set(pending)].join('; ') : null });
    cur = null;
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (ended) continue;
    const dm = DAY_RE.exec(line);
    if (dm && Number(dm[2]) === Number(month.slice(5, 7))) {
      flush();
      day = `${year}-${dm[2]!.padStart(2, '0')}-${dm[1]!.padStart(2, '0')}` as IsoDate;
      continue;
    }
    if (!day) { intro.push(raw); continue; }
    if (END_RE.test(line)) { flush(); ended = true; continue; }
    if (!line) { cur?.lines.push(''); continue; }
    // Assunto: linha curta toda em caixa alta, sem "|".
    const isTopic = line.length <= 40 && !line.includes('|') && line === line.toUpperCase() && /[A-ZÁÉÍÓÚÂÊÔÃÇ]/.test(line);
    if (isTopic) {
      if (line === 'STORIES' && cur && cur.format === 'STORIES' && !cur.lines.some((l) => l.trim())) continue;
      flush();
      cur = { date: day, channel: 'INSTAGRAM', topic: line, format: line === 'STORIES' ? 'STORIES' : 'OUTRO', title: line === 'STORIES' ? 'Só stories' : line, body: null, cta: null, stories: null, pending: null, lines: [] };
      continue;
    }
    if (!cur) { skipped.push(line); continue; }
    const fm = /^([^|]{2,40})\|\s*(.+)$/.exec(line);
    if (fm && cur.format === 'OUTRO' && !cur.lines.some((l) => l.trim())) {
      const f = FORMAT_WORDS.find(([re]) => re.test(fm[1]!.trim()));
      cur.format = f?.[1] ?? 'OUTRO';
      cur.title = fm[2]!.trim().replace(/^[“"]|[”"]$/g, '').trim() || cur.topic;
      continue;
    }
    const cta = /^CTA\s*:\s*(.*)$/i.exec(line);
    if (cta) { cur.cta = cta[1]!.trim() || null; continue; }
    const st = /^Stories\s*:\s*(.*)$/i.exec(line);
    if (st) { cur.stories = st[1]!.trim() || null; continue; }
    cur.lines.push(line);
  }
  flush();
  // Objetivos: o que vem antes do 1º dia, sem o título do documento.
  const introText = intro.join('\n').trim().split('\n').slice(1).filter((l) => !/^\s*\|/.test(l)).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return { objectives: introText || null, posts, skipped };
}

/** Normaliza para comparar nomes ("WOD “Árvore de Natal”" ≈ "WOD Árvore de Natal"). */
export const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Liga o post a um evento/campanha do mês pelo nome (no assunto, título ou texto). Só quando o nome aparece inteiro. */
export function matchByName<T extends { id: string; name: string }>(p: Pick<PlanPost, 'topic' | 'title' | 'body'>, list: T[]): T | null {
  const hay = ` ${norm(`${p.topic} ${p.title} ${p.body ?? ''}`)} `;
  const hits = list.filter((x) => norm(x.name).length >= 5 && hay.includes(` ${norm(x.name)} `));
  return hits.sort((a, b) => b.name.length - a.name.length)[0] ?? null;
}
