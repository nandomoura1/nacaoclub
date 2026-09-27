import { isIsoDate, type IsoDate } from '../dates';
import { normalizeName } from '../names';
import type { Grid } from './types';

/**
 * Planilha de professores — pura. Uma pessoa por linha; célula vazia
 * significa "não mexer" (nunca apaga o que já está no sistema).
 * Não há coluna de CPF, banco ou salário: o sistema não guarda esses dados.
 */
export const TEACHER_COLUMNS = [
  'Nome completo', 'Como aparece na grade', 'E-mail', 'Telefone', 'Cargo', 'Contrato', 'Nível',
  'Modalidade principal', 'Outras modalidades', 'Admissão', 'Desligamento', 'Ativo', 'Outros nomes na planilha', 'Observações',
] as const;

export interface TeacherImportRow {
  line: number;
  name: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  position: string | null;
  contractType: string | null;
  level: string | null;
  primaryModality: string | null;
  modalities: string[] | null;
  admissionDate: IsoDate | null;
  terminationDate: IsoDate | null;
  active: boolean | null;
  aliases: string[] | null;
  notes: string | null;
}

const clean = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
const EMPTY = new Set(['', '-', '—', '–']);
const blank = (s: string) => EMPTY.has(s);
const list = (s: string) => (blank(s) ? null : s.split(/[/;,+]/).map(clean).filter((v) => !blank(v)));

/** "01/03/2024", "1/3/24", "2024-03-01" → "2024-03-01". */
export function parseDateBR(value: string): IsoDate | null {
  const v = clean(value);
  if (isIsoDate(v)) return v;
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(v);
  if (!m) return null;
  const year = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const iso = `${year}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  return isIsoDate(iso) ? iso : null;
}

export function teacherHeaderRow(g: Grid): number {
  for (let r = 0; r < Math.min(g.length, 10); r++) {
    const cells = (g[r] ?? []).map((c) => normalizeName(c.text));
    if (cells.includes('nome completo') && cells.some((c) => c.startsWith('cargo'))) return r;
  }
  return -1;
}

export function parseTeacherSheet(g: Grid): { rows: TeacherImportRow[]; warnings: string[] } | null {
  const h = teacherHeaderRow(g);
  if (h < 0) return null;
  const header = (g[h] ?? []).map((c) => normalizeName(c.text));
  const col = (name: string) => header.findIndex((c) => c.startsWith(normalizeName(name)));
  const idx = Object.fromEntries(TEACHER_COLUMNS.map((c) => [c, col(c)])) as Record<(typeof TEACHER_COLUMNS)[number], number>;
  const rows: TeacherImportRow[] = [];
  const warnings: string[] = [];
  const seen = new Map<string, number>();

  for (let r = h + 1; r < g.length; r++) {
    const get = (c: (typeof TEACHER_COLUMNS)[number]) => (idx[c] >= 0 ? clean(g[r]?.[idx[c]]?.text) : '');
    const line = r + 1;
    const name = get('Nome completo');
    const rest = TEACHER_COLUMNS.slice(1).map(get).filter((v) => !blank(v));
    if (blank(name)) {
      if (rest.length) warnings.push(`linha ${line}: sem nome — ignorada.`);
      continue;
    }
    if (name.length < 2 || name.length > 120) { warnings.push(`linha ${line}: nome "${name}" inválido.`); continue; }
    const key = normalizeName(name);
    if (seen.has(key)) { warnings.push(`linha ${line}: "${name}" repete a linha ${seen.get(key)} — ignorada.`); continue; }
    seen.set(key, line);

    const email = get('E-mail').toLowerCase();
    if (!blank(email) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { warnings.push(`linha ${line}: e-mail "${email}" inválido — ${name} ignorado(a).`); continue; }
    const dates: Record<'Admissão' | 'Desligamento', IsoDate | null> = { Admissão: null, Desligamento: null };
    let bad = false;
    for (const k of ['Admissão', 'Desligamento'] as const) {
      const v = get(k);
      if (blank(v)) continue;
      dates[k] = parseDateBR(v);
      if (!dates[k]) { warnings.push(`linha ${line}: ${k.toLowerCase()} "${v}" inválida — use 01/03/2024.`); bad = true; }
    }
    if (bad) continue;
    const ativo = normalizeName(get('Ativo'));
    const active = blank(ativo) ? null : /^(s|sim|x|ativo|1|true)$/.test(ativo) ? true : /^(n|nao|inativo|0|false)$/.test(ativo) ? false : undefined;
    if (active === undefined) { warnings.push(`linha ${line}: Ativo "${get('Ativo')}" — use Sim ou Não.`); continue; }
    const text = (c: (typeof TEACHER_COLUMNS)[number], max: number) => { const v = get(c); return blank(v) ? null : v.slice(0, max); };

    rows.push({
      line, name,
      displayName: text('Como aparece na grade', 40),
      email: blank(email) ? null : email,
      phone: text('Telefone', 30),
      position: text('Cargo', 80),
      contractType: text('Contrato', 80),
      level: text('Nível', 20),
      primaryModality: text('Modalidade principal', 80),
      modalities: list(get('Outras modalidades')),
      admissionDate: dates.Admissão,
      terminationDate: dates.Desligamento,
      active,
      aliases: list(get('Outros nomes na planilha')),
      notes: text('Observações', 1000),
    });
  }
  return { rows, warnings };
}
