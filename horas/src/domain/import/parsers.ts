import { parseClock } from '../dates';
import { normalizeName } from '../names';
import type { Grid, ImportLayout, ImportRow, ParsedSheet, PersonRole } from './types';

/**
 * Leitura das grades da planilha atual da Nação (docs/06 §2). Puro: recebe
 * a grade de células e devolve aulas "cruas", sem tocar no banco.
 */

const WEEKDAY_BY_HEADER: Record<string, number> = {
  segunda: 1, 'segunda-feira': 1, seg: 1,
  terca: 2, 'terca-feira': 2, ter: 2,
  quarta: 3, 'quarta-feira': 3, qua: 3,
  quinta: 4, 'quinta-feira': 4, qui: 4,
  sexta: 5, 'sexta-feira': 5, sex: 5,
  sabado: 6, sab: 6,
  domingo: 7, dom: 7,
};

const EMPTY = new Set(['', '-', '—', '–']);

function clean(text: string | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

function isEmpty(text: string | undefined): boolean {
  return EMPTY.has(clean(text));
}

export function colName(index: number): string {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const ref = (row: number, col: number) => `${colName(col)}${row + 1}`;
const cell = (g: Grid, r: number, c: number) => g[r]?.[c];
const text = (g: Grid, r: number, c: number) => clean(cell(g, r, c)?.text);

/** Rótulo de linha que lista pessoas (e não uma sala com aula). */
function peopleListRole(label: string): PersonRole | null {
  const n = normalizeName(label);
  if (/estagiar/.test(n)) return 'ESTAGIARIO';
  if (/auxiliar|reserva/.test(n)) return 'AUXILIAR';
  return null;
}

/** "CROSSFIT 1" → "CROSSFIT"; "SALA FUNCIONAL" → "FUNCIONAL"; "SALA TATAME" → null. */
export function roomModalityHint(room: string): string | null {
  const n = normalizeName(room).replace(/\s+\d+$/, '').replace(/^sala\s+/, '');
  if (!n || ['tatame', 'areia', 'coordenador', 'coordenacao'].includes(n)) return null;
  return n;
}

function findHeader(g: Grid, predicate: (cells: string[]) => boolean, maxRow = 10): number {
  for (let r = 0; r < Math.min(g.length, maxRow); r++) {
    if (predicate((g[r] ?? []).map((c) => normalizeName(c.text)))) return r;
  }
  return -1;
}

export function detectLayout(g: Grid): ImportLayout | null {
  if (findHeader(g, (c) => c.includes('manha') && c.includes('professor') && c.includes('estagiario')) >= 0) return 'PLANTAO';
  const h = findHeader(g, (c) => c[0] === 'horario' && Object.keys(WEEKDAY_BY_HEADER).some((d) => c.includes(d)));
  if (h < 0) return null;
  const second = normalizeName(g[h]?.[1]?.text ?? '');
  if (second === 'quadra') return 'QUADRA';
  if (second === 'sala') return 'SALA';
  return null;
}

function dayColumns(g: Grid, headerRow: number): { col: number; weekday: number }[] {
  return (g[headerRow] ?? [])
    .map((c, col) => ({ col, weekday: WEEKDAY_BY_HEADER[normalizeName(c.text)] ?? 0 }))
    .filter((d) => d.weekday > 0);
}

/** Blocos de horário: a coluna A (mesclada) marca o início de cada bloco. */
function timeBlocks(g: Grid, headerRow: number, warnings: string[]) {
  const blocks: { startMin: number; from: number; to: number }[] = [];
  for (let r = headerRow + 1; r < g.length; r++) {
    const a = cell(g, r, 0);
    if (!a || a.slave || isEmpty(a.text)) continue;
    const startMin = parseClock(clean(a.text));
    if (startMin === null) {
      // Texto que não é horário na coluna A = fim da grade (há tabelas antigas embaixo).
      warnings.push(`${ref(r, 0)}: a grade termina aqui ("${clean(a.text).slice(0, 40)}"); o que vem abaixo foi ignorado.`);
      if (blocks.length) blocks[blocks.length - 1]!.to = r - 1;
      return blocks;
    }
    if (blocks.length) blocks[blocks.length - 1]!.to = r - 1;
    blocks.push({ startMin, from: r, to: g.length - 1 });
  }
  return blocks;
}

/** Grupos de sala dentro de um bloco: coluna B, respeitando mesclagens. */
function roomGroups(g: Grid, from: number, to: number) {
  const groups: { label: string; rows: number[] }[] = [];
  for (let r = from; r <= to; r++) {
    const b = cell(g, r, 1);
    const label = clean(b?.text);
    if (b && !b.slave && label) groups.push({ label, rows: [r] });
    else if (groups.length) groups[groups.length - 1]!.rows.push(r);
  }
  return groups;
}

export function parseSalaSheet(sheet: string, g: Grid): ParsedSheet {
  const warnings: string[] = [];
  const header = findHeader(g, (c) => c[0] === 'horario');
  const days = dayColumns(g, header);
  const rows: ImportRow[] = [];
  let sheetDefault: string | null = null;

  for (const block of timeBlocks(g, header, warnings)) {
    for (const group of roomGroups(g, block.from, block.to)) {
      const listRole = peopleListRole(group.label);
      const roomHint = roomModalityHint(group.label);
      sheetDefault ??= roomHint;
      if (/^coordena/.test(normalizeName(group.label))) continue;

      for (const { col, weekday } of days) {
        const base = { sheet, weekday, startMin: block.startMin, durationMin: null, kind: 'AULA' as const };

        if (listRole) {
          const people = group.rows.map((r) => text(g, r, col)).filter((t) => !isEmpty(t));
          if (people.length) {
            rows.push({
              ...base, ref: ref(group.rows[0]!, col), spaceHint: null,
              activityText: null, fallbackText: sheetDefault, labelHint: group.label,
              people: people.map((raw) => ({ raw, role: listRole })),
            });
          }
          continue;
        }

        if (group.rows.length === 1) {
          const v = text(g, group.rows[0]!, col);
          if (isEmpty(v)) continue;
          // Sala com modalidade implícita: a célula é o professor.
          // Sala sem modalidade (ex.: TATAME): a célula é a atividade.
          rows.push({
            ...base, ref: ref(group.rows[0]!, col), spaceHint: group.label,
            activityText: roomHint ? null : v, fallbackText: roomHint,
            people: roomHint ? [{ raw: v, role: 'TITULAR' }] : [],
          });
          continue;
        }

        // Linhas em pares: atividade na de cima, professor na de baixo.
        for (let i = 0; i < group.rows.length; i += 2) {
          const top = group.rows[i]!;
          const bottom = group.rows[i + 1];
          const act = text(g, top, col);
          const person = bottom === undefined ? '' : text(g, bottom, col);
          if (isEmpty(act) && isEmpty(person)) continue;
          rows.push({
            ...base, ref: ref(top, col), spaceHint: group.label,
            activityText: isEmpty(act) ? null : act, fallbackText: roomHint,
            people: isEmpty(person) ? [] : [{ raw: person, role: 'TITULAR' }],
          });
        }
      }
    }
  }
  return { sheet, layout: 'SALA', rows, warnings };
}

/** "SÉRIE D - RAMON" → ["SÉRIE D", "RAMON"]; "SÉRIE C -" → ["SÉRIE C", ""]; "FITVOLÊI ADULTO" → null. */
export function splitTurmaProfessor(value: string): [string, string] | null {
  const v = clean(value);
  const cut = v.lastIndexOf(' -');
  if (cut < 0) return null;
  return [v.slice(0, cut).trim(), v.slice(cut + 2).replace(/^-/, '').trim()];
}

export function parseQuadraSheet(sheet: string, g: Grid, defaultModality = 'futevolei'): ParsedSheet {
  const warnings: string[] = [];
  const header = findHeader(g, (c) => c[0] === 'horario');
  const days = dayColumns(g, header);
  const rows: ImportRow[] = [];

  for (const block of timeBlocks(g, header, warnings)) {
    for (const group of roomGroups(g, block.from, block.to)) {
      const room = normalizeName(group.label);
      const isCourt = room.startsWith('quadra');
      const isCoordination = /^coordena/.test(room);
      for (const { col, weekday } of days) {
        for (const r of group.rows) {
          const v = text(g, r, col);
          if (isEmpty(v)) continue;
          const base = { sheet, ref: ref(r, col), weekday, startMin: block.startMin, durationMin: null, fallbackText: defaultModality };

          const personal = /^personal\s+/i.exec(v);
          if (personal) {
            rows.push({ ...base, spaceHint: group.label, activityText: null, kind: 'PERSONAL', people: [{ raw: v.slice(personal[0].length).trim(), role: 'TITULAR' }] });
            continue;
          }
          const split = splitTurmaProfessor(v);
          if (split) {
            rows.push({
              ...base, spaceHint: isCourt ? group.label : null, activityText: split[0], kind: 'AULA',
              people: split[1] ? [{ raw: split[1], role: 'TITULAR' }] : [],
            });
          } else if (isCourt) {
            // Só a turma, sem professor (ex.: "FITVOLÊI ADULTO").
            rows.push({ ...base, spaceHint: group.label, activityText: v, kind: 'AULA', people: [] });
          } else {
            // Linha nomeada (COORDENADOR, ÁGUIA): a célula é a pessoa.
            rows.push({
              ...base, spaceHint: null, activityText: isCoordination ? null : group.label,
              labelHint: isCoordination ? 'Coordenação' : null,
              kind: isCoordination ? 'COORDENACAO' : 'AULA', people: [{ raw: v, role: 'TITULAR' }],
            });
          }
        }
      }
    }
  }
  return { sheet, layout: 'QUADRA', rows, warnings };
}

/** "5h - 6h" → [300, 360] */
export function parseRange(value: string): [number, number] | null {
  const m = /^(.+?)\s*[-–a]\s*(.+)$/i.exec(clean(value));
  if (!m) return null;
  const a = parseClock(m[1]!);
  const b = parseClock(m[2]!);
  return a !== null && b !== null && b > a ? [a, b] : null;
}

export function parsePlantaoSheet(sheet: string, g: Grid, modality = 'musculacao'): ParsedSheet {
  const warnings: string[] = [];
  const header = findHeader(g, (c) => c.includes('manha') && c.includes('professor'));
  const hdr = (g[header] ?? []).map((c) => normalizeName(c.text));
  // Trincas (FAIXA, PROFESSOR, ESTAGIÁRIO) lado a lado.
  const triples: number[] = [];
  hdr.forEach((h, i) => {
    if ((h === 'manha' || h === 'tarde' || h === 'noite') && hdr[i + 1] === 'professor') triples.push(i);
  });

  let last = g.length - 1;
  for (let r = header + 1; r < g.length; r++) {
    if (/final de semana/.test(normalizeName(g[r]?.[0]?.text ?? ''))) {
      last = r - 1;
      warnings.push(`${ref(r, 0)}: escala de fim de semana é por data — lance como atividades avulsas (etapa E5).`);
      break;
    }
  }

  const rows: ImportRow[] = [];
  for (const c0 of triples) {
    let current: { range: [number, number]; row: number; people: { raw: string; role: PersonRole }[] } | null = null;
    const flush = () => {
      if (!current) return;
      for (let weekday = 1; weekday <= 5; weekday++) {
        rows.push({
          sheet, ref: ref(current.row, c0), weekday, startMin: current.range[0], durationMin: current.range[1] - current.range[0],
          spaceHint: 'Sala de Musculação', activityText: null, fallbackText: modality, kind: 'PLANTAO', people: current.people,
        });
      }
    };
    for (let r = header + 1; r <= last; r++) {
      const rangeText = text(g, r, c0);
      if (!isEmpty(rangeText) && !cell(g, r, c0)?.slave) {
        const range = parseRange(rangeText);
        if (range) {
          flush();
          current = { range, row: r, people: [] };
        } else {
          warnings.push(`${ref(r, c0)}: faixa "${rangeText}" não reconhecida.`);
        }
      }
      if (!current) continue;
      const prof = text(g, r, c0 + 1);
      const est = text(g, r, c0 + 2);
      if (!isEmpty(prof)) current.people.push({ raw: prof, role: 'TITULAR' });
      if (!isEmpty(est)) current.people.push({ raw: est, role: 'ESTAGIARIO' });
    }
    flush();
  }
  return { sheet, layout: 'PLANTAO', rows, warnings };
}

export function parseSheet(sheet: string, g: Grid): ParsedSheet {
  const layout = detectLayout(g);
  if (layout === 'SALA') return parseSalaSheet(sheet, g);
  if (layout === 'QUADRA') return parseQuadraSheet(sheet, g);
  if (layout === 'PLANTAO') return parsePlantaoSheet(sheet, g);
  return { sheet, layout: null, rows: [], warnings: ['Formato não reconhecido: esperava HORÁRIO + SALA/QUADRA + dias, ou MANHÃ/PROFESSOR/ESTAGIÁRIO.'] };
}
