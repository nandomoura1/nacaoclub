/**
 * Leads e links rastreáveis (puro): etapas do funil, origens, leitura de
 * formulários de qualquer formato (Wix, landing page, Zapier…), link com UTM
 * e números de conversão.
 */

export const LEAD_STAGES = [
  { id: 'NOVO', label: 'Novo', tone: 'neutral' },
  { id: 'CONTATO', label: 'Em contato', tone: 'blue' },
  { id: 'EXPERIMENTAL', label: 'Aula experimental', tone: 'cyan' },
  { id: 'NEGOCIACAO', label: 'Negociação', tone: 'amber' },
  { id: 'MATRICULADO', label: 'Matriculado', tone: 'green' },
  { id: 'PERDIDO', label: 'Perdido', tone: 'red' },
] as const;
export type LeadStage = (typeof LEAD_STAGES)[number]['id'];
export const OPEN_STAGES: LeadStage[] = ['NOVO', 'CONTATO', 'EXPERIMENTAL', 'NEGOCIACAO'];

export const LEAD_SOURCES = [
  { id: 'SITE', label: 'Site (formulário)' },
  { id: 'WHATSAPP', label: 'WhatsApp' },
  { id: 'INSTAGRAM', label: 'Instagram' },
  { id: 'META_ADS', label: 'Anúncio Meta' },
  { id: 'GOOGLE', label: 'Google' },
  { id: 'INDICACAO', label: 'Indicação' },
  { id: 'EVENTO', label: 'Evento' },
  { id: 'PRESENCIAL', label: 'Presencial (recepção)' },
  { id: 'LINK', label: 'Link de campanha' },
  { id: 'OUTRO', label: 'Outro' },
] as const;

export const LINK_CHANNELS = [
  { id: 'INSTAGRAM', label: 'Instagram (bio/stories)', source: 'instagram', medium: 'social' },
  { id: 'WHATSAPP', label: 'WhatsApp', source: 'whatsapp', medium: 'mensagem' },
  { id: 'META_ADS', label: 'Anúncio Meta', source: 'meta', medium: 'cpc' },
  { id: 'GOOGLE', label: 'Google Ads', source: 'google', medium: 'cpc' },
  { id: 'EMAIL', label: 'E-mail', source: 'email', medium: 'email' },
  { id: 'QRCODE', label: 'QR Code (impresso)', source: 'qrcode', medium: 'offline' },
  { id: 'SITE', label: 'Site', source: 'site', medium: 'referral' },
  { id: 'OUTRO', label: 'Outro', source: 'outro', medium: 'outro' },
] as const;

export const labelOf = <T extends { id: string; label: string }>(list: readonly T[], id: string | null | undefined) => list.find((x) => x.id === id)?.label ?? id ?? '—';

// ── Formulário → lead ──────────────────────────────────────

export interface ParsedLead { name: string | null; phone: string | null; email: string | null; interest: string | null; message: string | null; utm: { source?: string; medium?: string; campaign?: string }; ref: string | null }

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_');

/** Achata { a: { b: 1 }, c: [{ label: 'x', value: 'y' }] } em pares chave → valor. */
function flatten(v: unknown, prefix = '', out: [string, string][] = []): [string, string][] {
  if (v === null || v === undefined) return out;
  if (Array.isArray(v)) {
    for (const item of v) {
      // Formato "lista de campos": [{ label|name|key, value }]
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const o = item as Record<string, unknown>;
        const k = o.label ?? o.name ?? o.key ?? o.fieldName ?? o.title;
        const val = o.value ?? o.answer ?? o.text;
        if (typeof k === 'string' && (typeof val === 'string' || typeof val === 'number')) { out.push([fold(k), String(val)]); continue; }
      }
      flatten(item, prefix, out);
    }
    return out;
  }
  if (typeof v === 'object') {
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) flatten(val, prefix ? `${prefix}_${fold(k)}` : fold(k), out);
    return out;
  }
  if (typeof v === 'string' || typeof v === 'number') out.push([prefix, String(v).trim()]);
  return out;
}

const pick = (pairs: [string, string][], ...patterns: RegExp[]) => {
  for (const re of patterns) {
    const hit = pairs.find(([k, v]) => v && re.test(k));
    if (hit) return hit[1].slice(0, 300);
  }
  return null;
};

/** Lê o envio de um formulário em qualquer formato razoável. */
export function parseLeadPayload(payload: unknown): ParsedLead {
  const pairs = flatten(payload);
  const first = pick(pairs, /(^|_)(first_?name|primeiro_nome|nome_?proprio)$/);
  const last = pick(pairs, /(^|_)(last_?name|sobrenome|ultimo_nome)$/);
  const full = pick(pairs, /(^|_)(full_?name|nome_?completo|name|nome|seu_nome|contact_name)$/, /nome/);
  const email = pick(pairs, /(^|_)(e_?mail|email_?address)$/, /mail/);
  const phone = pick(pairs, /(^|_)(phone|telefone|celular|whats_?app|whatsapp|fone|tel)(_?number)?$/, /(phone|telefone|celular|whats)/);
  return {
    // "Primeiro nome" + "Sobrenome" ganha do campo genérico "nome".
    name: first && last ? `${first} ${last}` : full ?? first ?? null,
    email: email && /@/.test(email) ? email.toLowerCase() : null,
    phone: phone && phone.replace(/\D/g, '').length >= 10 ? phone : null,
    interest: pick(pairs, /(modalidade|interesse|esporte|interest|plano|servico|curso|aula)/),
    message: pick(pairs, /(mensagem|message|duvida|comentario|observ|obs$)/),
    utm: { source: pick(pairs, /utm_?source$/) ?? undefined, medium: pick(pairs, /utm_?medium$/) ?? undefined, campaign: pick(pairs, /utm_?campaign$/) ?? undefined },
    ref: pick(pairs, /(^|_)(submission_?id|submissionid|entry_?id|response_?id)$/, /(^|_)id$/),
  };
}

/** Origem do lead pela UTM (quando veio de link de campanha). */
export function sourceFromUtm(utm: { source?: string | null; medium?: string | null }, fallback = 'SITE'): string {
  const s = (utm.source ?? '').toLowerCase();
  const m = (utm.medium ?? '').toLowerCase();
  if (/meta|facebook|fb|instagram|ig/.test(s) && /cpc|paid|ads/.test(m)) return 'META_ADS';
  if (/instagram|ig/.test(s)) return 'INSTAGRAM';
  if (/google/.test(s)) return 'GOOGLE';
  if (/whats/.test(s)) return 'WHATSAPP';
  return s ? 'LINK' : fallback;
}

// ── Links ─────────────────────────────────────────────────

export function slugify(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'link';
}

/** Destino com as UTMs (mantém o que já existir na URL). */
export function withUtm(destination: string, utm: { source?: string | null; medium?: string | null; campaign?: string | null; content?: string | null }): string {
  let u: URL;
  try { u = new URL(destination); } catch { return destination; }
  const set = (k: string, v?: string | null) => { if (v && !u.searchParams.has(k)) u.searchParams.set(k, v); };
  set('utm_source', utm.source); set('utm_medium', utm.medium); set('utm_campaign', utm.campaign); set('utm_content', utm.content);
  return u.toString();
}

// ── Números ───────────────────────────────────────────────

export interface LeadLite { stage: string; source: string; createdAt: string; convertedAt: string | null }

/** Funil do período: quantos chegaram, em cada etapa, conversão e tempo médio até matrícula. */
export function funnel(leads: LeadLite[]) {
  const total = leads.length;
  const by = Object.fromEntries(LEAD_STAGES.map((s) => [s.id, leads.filter((l) => l.stage === s.id).length])) as Record<LeadStage, number>;
  const won = by.MATRICULADO;
  const closed = won + by.PERDIDO;
  const days = leads.filter((l) => l.convertedAt).map((l) => (Date.parse(l.convertedAt!) - Date.parse(l.createdAt)) / 86_400_000);
  const bySource = LEAD_SOURCES.map((s) => {
    const list = leads.filter((l) => l.source === s.id);
    const w = list.filter((l) => l.stage === 'MATRICULADO').length;
    return { id: s.id, label: s.label, total: list.length, won: w, rate: list.length ? w / list.length : null };
  }).filter((s) => s.total > 0).sort((a, b) => b.total - a.total);
  return {
    total, by, won,
    conversion: total ? won / total : null,
    winRate: closed ? won / closed : null,
    avgDaysToWin: days.length ? Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10 : null,
    bySource,
  };
}
