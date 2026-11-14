/**
 * Agenda de contatos (Administração → Contatos) — puro.
 * Equipe vem do cadastro de colaboradores; aqui só a formatação, a importação por texto colado
 * e o texto para copiar/WhatsApp.
 */

/** Grupos sugeridos (o campo é livre). */
export const CONTACT_GROUPS = [
  'Serviços terceirizados',
  'Fornecedores',
  'Monitoras Kids',
  'Administrativo',
  'Manutenção e serviços gerais',
  'Emergência e utilidade',
] as const;

const digits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');

/** "61984109276" → "(61) 98410-9276"; sem DDD ou estranho fica como veio. */
export function formatPhone(phone: string | null | undefined): string {
  const raw = (phone ?? '').trim();
  let d = digits(raw);
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return raw;
}

/** Número para wa.me ("5561984109276"); curto demais → null. */
export function waNumber(phone: string | null | undefined): string | null {
  let d = digits(phone);
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  return d.length === 10 || d.length === 11 ? `55${d}` : null;
}

/** Mesma pessoa/número? Compara os 8 últimos dígitos (com ou sem DDD/9). */
export const samePhone = (a: string | null | undefined, b: string | null | undefined) => {
  const x = digits(a), y = digits(b);
  return x.length >= 8 && y.length >= 8 && x.slice(-8) === y.slice(-8);
};

const PHONE_RE = /((?:\+|\()?\d[\d\s().-]{7,}\d)/g;

export interface ContactDraft { name: string; groupName: string; company: string | null; phone: string | null; phone2: string | null; note: string | null }

/**
 * Importação por texto colado (da planilha): uma linha por contato.
 * - Com TAB ou ";": colunas Nome | Telefone | Grupo | Empresa | Observação (telefone 2 pode vir junto, separado por "/").
 * - Sem separador: o(s) telefone(s) são achados na linha e o resto vira o nome.
 * - Linha sem telefone e sem separador = título de grupo para as linhas seguintes ("RECEPÇÃO").
 */
export function parseContactLines(text: string, defaultGroup: string): { rows: ContactDraft[]; skipped: string[] } {
  const rows: ContactDraft[] = [];
  const skipped: string[] = [];
  let group = defaultGroup.trim();
  for (const line0 of text.split(/\r?\n/)) {
    const line = line0.trim();
    if (!line) continue;
    const cols = line.includes('\t') ? line.split('\t') : line.includes(';') ? line.split(';') : null;
    if (cols) {
      const [name = '', tel = '', grp = '', company = '', note = ''] = cols.map((c) => c.trim());
      const phones = tel.match(PHONE_RE) ?? [];
      if (!name) { skipped.push(line); continue; }
      rows.push({ name, groupName: grp || group || 'Outros', company: company || null, phone: phones[0]?.trim() ?? null, phone2: phones[1]?.trim() ?? null, note: note || null });
      continue;
    }
    const phones = line.match(PHONE_RE) ?? [];
    if (phones.length === 0) {
      if (line.length <= 60) group = line.replace(/[:\-–]+$/, '').trim();
      else skipped.push(line);
      continue;
    }
    const name = line.replace(PHONE_RE, ' ').replace(/[\s\-–:|/]+$/g, '').replace(/^[\s\-–:|/]+/g, '').replace(/\s{2,}/g, ' ').trim();
    if (!name) { skipped.push(line); continue; }
    rows.push({ name, groupName: group || 'Outros', company: null, phone: phones[0]!.trim(), phone2: phones[1]?.trim() ?? null, note: null });
  }
  return { rows, skipped };
}

export interface ListedContact { name: string; group: string; phone: string | null; phone2?: string | null; company?: string | null; note?: string | null }

/** Lista em texto (copiar / WhatsApp), por grupo, na ordem recebida. */
export function contactsText(list: ListedContact[], title = 'Contatos — Nação Club'): string {
  const groups = new Map<string, ListedContact[]>();
  for (const c of list) groups.set(c.group, [...(groups.get(c.group) ?? []), c]);
  const out = [`*${title}*`];
  for (const [g, cs] of groups) {
    out.push('', `*${g}*`);
    for (const c of cs) {
      const who = [c.name, c.company && c.company !== c.name ? c.company : null].filter(Boolean).join(' — ');
      const tel = [c.phone, c.phone2].filter(Boolean).map((p) => formatPhone(p)).join(' / ') || 'sem telefone';
      out.push(`${who}: ${tel}${c.note ? ` (${c.note})` : ''}`);
    }
  }
  return out.join('\n');
}
