import { roundCents } from './money';
import type { Month } from './months';
import { computePeriod, type ChargeLine, type LineKind, type PeriodInput } from './period';

/**
 * Leitura da planilha "Condomínio Nação Club" (abas ENERGIA, IPTU e as abas
 * mensais "Agosto 26", "Julho 26"…). Puro: recebe as abas já lidas (valor +
 * fórmula de cada célula) e devolve o pacote a importar. Layout das abas mensais:
 *   A/B  Tabela 1 — despesas (grupos em MAIÚSCULAS, linha TOTAL)
 *   D/F/G Tabela 2 — centro de custo, nº de alunos, valor
 *   J/K/L/M Tabela 3 — parceiro, descrição, valor, total da cobrança
 */

export interface SheetCell { value: number | string | Date | null; formula: string | null }
export interface Sheet { name: string; rows: number; cell(row: number, col: number): SheetCell }

export interface ImportCenter { key: string; name: string; displayName: string | null; kind: 'INTERNAL' | 'PARTNER'; isSnackBar: boolean; areaM2: number; iptuSharePct: number; firstMonth: Month; lastMonth: Month }
export interface ImportMeter { centerKey: string; name: string; readings: { month: Month; reading: number; estimated: boolean }[] }
export interface ImportItem { centerKey: string; description: string; amountCents: number; unitCents: number | null; qty: number | null }
export interface ImportPeriod {
  month: Month;
  tab: string;
  expenses: { group: string; description: string; amountCents: number; kind: 'FIXED' | 'VARIABLE'; memo: string | null }[];
  headcounts: Record<string, number>;
  snackBarPct: number;
  items: ImportItem[];
  charges: { centerKey: string; originalKey?: string; name: string; lines: ChargeLine[]; totalCents: number }[];
}
export interface ImportBundle {
  centers: ImportCenter[];
  meters: ImportMeter[];
  iptu: { year: number; totalCents: number; totalAreaM2: number; firstMonth: number; parcels: number } | null;
  recurring: ImportItem[];
  periods: ImportPeriod[];
  warnings: string[];
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const text = (c: SheetCell) => (c.value === null || c.value instanceof Date ? '' : String(c.value).trim());
const numberOf = (c: SheetCell): number | null => {
  if (typeof c.value === 'number' && Number.isFinite(c.value)) return c.value;
  if (typeof c.value === 'string' && /^-?[\d.,]+$/.test(c.value.trim())) {
    const n = Number(c.value.trim().replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

/** Mesmo centro de custo com nomes diferentes nas tabelas ("Beach Tênis" × "Beach Tennis", "Futebol Society" × "Society"). */
export function centerKey(name: string): string {
  const f = fold(name);
  if (/beach/.test(f)) return 'beach';
  if (/society|futebol/.test(f)) return 'society';
  if (/pilates/.test(f)) return 'pilates';
  if (/beauty/.test(f)) return 'beauty';
  if (/triade/.test(f)) return 'triade';
  if (/recovery/.test(f)) return 'recovery';
  if (/kids|casa/.test(f)) return 'kids';
  if (/lanchonete|bar\b/.test(f)) return 'lanchonete';
  if (/nacao fit/.test(f)) return 'nacao-fit';
  if (/tenis saibro|saibro/.test(f)) return 'tenis';
  if (/cross/.test(f)) return 'crossfit';
  if (/futev/.test(f)) return 'futevolei';
  return f.replace(/[^a-z0-9]+/g, '-');
}

const MONTHS: Record<string, number> = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };
/** "Agosto 26", "Mar 25", "Fev 25" → "2026-08"… (abas de 2024 e "Outubro " ficam de fora). */
export function monthOfTab(name: string): Month | null {
  const m = fold(name).match(/^(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*\s+(\d{2})$/);
  if (!m) return null;
  return `20${m[2]}-${String(MONTHS[m[1]!]).padStart(2, '0')}` as Month;
}
const monthOfDate = (d: Date): Month => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}` as Month;

/** "=(1200+800+99.5)" → "1.200 + 800 + 99,5"; "=(1500.5*2)" → "1.500,5 × 2". Fórmula com referência: null. */
export function memoOf(formula: string | null): string | null {
  if (!formula) return null;
  const f = formula.replace(/^=/, '').replace(/[()\s]/g, '');
  if (!/^[\d.]+([+*][\d.]+)+$/.test(f)) return null;
  return f.split(/([+*])/).map((t) => (t === '+' ? ' + ' : t === '*' ? ' × ' : Number(t).toLocaleString('pt-BR', { maximumFractionDigits: 2 }))).join('');
}

const FIXED = /sal[aá]rio|inss|fgts|passagem|alimenta|seguro|manuten[cç][aã]o \(50/i;
const UPPER = 'A-ZÇÃÕÁÉÍÓÚÂÊÔ';
/** Cabeçalho de grupo sem valor: "SEGURANÇA", "JARDINEIRO (2)" (INSS/FGTS são linhas, não grupos). */
const isGroupLabel = (s: string) => new RegExp(`[${UPPER}]{5}`).test(s) && s === s.toUpperCase();
/** Linha com valor que abre grupo: "MANUTENÇÃO (50% do salário)" → "MANUTENÇÃO". */
const groupPrefix = (s: string) => s.match(new RegExp(`^([${UPPER}]{5,}(?:\\s+[${UPPER}]{2,})*)(?=\\s|$)`))?.[1] ?? null;

function lineKind(desc: string): LineKind {
  const f = fold(desc);
  if (/energia/.test(f)) return 'ENERGIA';
  if (/condom/.test(f)) return 'CONDOMINIO';
  if (/iptu/.test(f)) return 'IPTU';
  return 'ITEM';
}

/** "=25*(28)" ou "=25*28" → { unit: 25, qty: 28 }. */
function qtyFormula(formula: string | null): { unit: number; qty: number } | null {
  const m = formula?.replace(/\s/g, '').match(/^=\(?([\d.]+)\)?\*\(?([\d.]+)\)?$/);
  return m ? { unit: Number(m[1]), qty: Number(m[2]) } : null;
}

function parseMonthTab(s: Sheet, month: Month, warnings: string[]): ImportPeriod | null {
  // Tabela 1: A/B até a linha TOTAL.
  let totalRow = 0;
  for (let r = 1; r <= Math.min(s.rows, 80); r++) if (fold(text(s.cell(r, 1))) === 'total') { totalRow = r; break; }
  if (!totalRow) { warnings.push(`Aba "${s.name}": não achei a linha TOTAL das despesas — aba ignorada.`); return null; }
  const expenses: ImportPeriod['expenses'] = [];
  let group = 'DESPESAS GERAIS';
  for (let r = 3; r < totalRow; r++) {
    const label = text(s.cell(r, 1)).replace(/\s+/g, ' ');
    if (!label) continue;
    const v = numberOf(s.cell(r, 2));
    if (v === null) { if (isGroupLabel(label)) group = label; continue; }
    const prefix = groupPrefix(label);
    if (prefix) group = prefix;
    expenses.push({ group, description: label, amountCents: roundCents(v * 100), kind: FIXED.test(label) ? 'FIXED' : 'VARIABLE', memo: memoOf(s.cell(r, 2).formula) });
  }
  const sheetTotal = numberOf(s.cell(totalRow, 2));
  const sum = expenses.reduce((t, e) => t + e.amountCents, 0);
  if (sheetTotal !== null && roundCents(sheetTotal * 100) !== sum) warnings.push(`Aba "${s.name}": soma das despesas (${sum / 100}) difere do TOTAL da planilha (${sheetTotal}).`);

  // Tabela 2: D (centro), F (alunos), G (valor) até "Total".
  const headcounts: Record<string, number> = {};
  let snackCents = 0;
  for (let r = 3; r <= 30; r++) {
    const name = text(s.cell(r, 4));
    if (!name) continue;
    if (/^total/.test(fold(name))) break;
    if (/area comum/.test(fold(name))) continue;
    const key = centerKey(name);
    headcounts[key] = (headcounts[key] ?? 0) + Math.max(0, Math.round(numberOf(s.cell(r, 6)) ?? 0));
    if (key === 'lanchonete') snackCents = roundCents((numberOf(s.cell(r, 7)) ?? 0) * 100);
  }
  const snackBarPct = sum > 0 && snackCents > 0 ? Math.round((snackCents / sum) * 1000) / 10 : 30;

  // Tabela 3: J (parceiro), K (descrição), L (valor), M (total) até "ALUGUEL PARCEIROS".
  const charges: ImportPeriod['charges'] = [];
  const items: ImportItem[] = [];
  let cur: ImportPeriod['charges'][number] | null = null;
  const totalFormula = new Map<ImportPeriod['charges'][number], string>();
  for (let r = 3; r <= 40; r++) {
    const partner = text(s.cell(r, 10));
    if (/aluguel parceiros|^parceiro$/.test(fold(partner))) break;
    if (partner) {
      cur = { centerKey: centerKey(partner), originalKey: centerKey(partner), name: partner.replace(/\s+/g, ' ').trim(), lines: [], totalCents: 0 };
      const total = numberOf(s.cell(r, 13));
      if (total !== null) cur.totalCents = roundCents(total * 100);
      totalFormula.set(cur, s.cell(r, 13).formula ?? '');
      charges.push(cur);
    }
    const desc = text(s.cell(r, 11)).replace(/\s+/g, ' ');
    const val = numberOf(s.cell(r, 12));
    if (!cur || !desc || val === null) continue;
    const kind = lineKind(desc);
    cur.lines.push({ kind, description: kind === 'ENERGIA' ? 'Energia' : desc, cents: roundCents(val * 100) });
    if (kind === 'ITEM') {
      const q = qtyFormula(s.cell(r, 12).formula);
      items.push(q
        ? { centerKey: cur.centerKey, description: desc.replace(/\s*\(\d+\)\s*$/, ''), amountCents: 0, unitCents: roundCents(q.unit * 100), qty: q.qty }
        : { centerKey: cur.centerKey, description: desc, amountCents: roundCents(val * 100), unitCents: null, qty: null });
    }
  }
  for (const c of charges) {
    const lineSum = c.lines.reduce((t, l) => t + l.cents, 0);
    const diff = c.totalCents - lineSum;
    if (c.totalCents && Math.abs(diff) > 1) {
      // 2025: o IPTU entrava direto na fórmula do total (=SUM(L3:L8)+IPTU!F5), sem linha própria.
      const iptu = /iptu/i.test(totalFormula.get(c) ?? '');
      c.lines.push({ kind: iptu ? 'IPTU' : 'AVULSO', description: iptu ? 'IPTU' : 'Ajuste (conforme a planilha)', cents: diff });
      if (!iptu) warnings.push(`Aba "${s.name}": total de ${c.name} (${c.totalCents / 100}) difere da soma das linhas (${lineSum / 100}) — diferença lançada como ajuste.`);
    } else c.totalCents = lineSum; // arredondamento por linha: a cobrança é a soma do que aparece
  }
  return { month, tab: s.name, expenses, headcounts, snackBarPct, items, charges: charges.filter((c) => c.lines.length) };
}

/** Nome do parceiro na Tabela 3 a partir da chave original (para casar os itens fixos). */
const b3Name = (p: ImportPeriod, key: string) => p.charges.find((c) => c.originalKey === key)?.name ?? null;

export function parseCondoWorkbook(sheets: Sheet[]): ImportBundle {
  const warnings: string[] = [];
  const by = (re: RegExp) => sheets.find((s) => re.test(fold(s.name)));

  // Abas mensais (mais recente primeiro).
  const periods = sheets
    .map((s) => ({ s, month: monthOfTab(s.name) }))
    .filter((x): x is { s: Sheet; month: Month } => !!x.month)
    .sort((a, b) => b.month.localeCompare(a.month))
    .filter((x, i, all) => all.findIndex((y) => y.month === x.month) === i)
    .map((x) => parseMonthTab(x.s, x.month, warnings))
    .filter((p): p is ImportPeriod => !!p);
  if (!periods.length) throw new Error('Não encontrei nenhuma aba mensal ("Agosto 26", "Julho 26"…).');
  const latest = periods[0]!;

  // IPTU: C2 total do ano, F2 área total; linhas: B área, E centro de custo.
  const iptuSheet = by(/^iptu$/);
  const areas: Record<string, { area: number; name: string }> = {};
  let iptu: ImportBundle['iptu'] = null;
  if (iptuSheet) {
    const year = Number(text(iptuSheet.cell(2, 2)).match(/\d{4}/)?.[0] ?? latest.month.slice(0, 4));
    const total = numberOf(iptuSheet.cell(2, 3));
    const area = numberOf(iptuSheet.cell(2, 6));
    if (total && area) iptu = { year, totalCents: roundCents(total * 100), totalAreaM2: area, firstMonth: 5, parcels: 6 };
    for (let r = 5; r <= Math.min(iptuSheet.rows, 40); r++) {
      const name = text(iptuSheet.cell(r, 5));
      if (!name || /^total/.test(fold(name))) continue;
      if (/area comum/.test(fold(name))) continue;
      const a = numberOf(iptuSheet.cell(r, 2));
      if (a !== null) areas[centerKey(name)] = { area: a, name };
    }
  } else warnings.push('Aba IPTU não encontrada: cadastre as áreas e o IPTU do ano à mão.');

  // Centros de custo: todos os que aparecem na Tabela 2 de algum mês.
  const centers = new Map<string, ImportCenter>();
  const t2Names = new Map<string, string>();
  for (const p of [...periods].reverse()) {
    for (const key of Object.keys(p.headcounts)) {
      const c = centers.get(key);
      if (c) { c.lastMonth = p.month; continue; }
      centers.set(key, { key, name: '', displayName: null, kind: 'INTERNAL', isSnackBar: key === 'lanchonete', areaM2: areas[key]?.area ?? 0, iptuSharePct: 100, firstMonth: p.month, lastMonth: p.month });
    }
  }
  // Nome: o da Tabela 2 do mês mais recente em que aparece.
  for (const s of sheets) {
    const m = monthOfTab(s.name);
    if (!m) continue;
    for (let r = 3; r <= 30; r++) {
      const name = text(s.cell(r, 4));
      if (!name || /^total|area comum/.test(fold(name))) continue;
      const key = centerKey(name);
      if (!t2Names.has(key) || m === centers.get(key)?.lastMonth) t2Names.set(key, name.replace(/\s+/g, ' ').trim());
    }
  }
  for (const c of centers.values()) c.name = t2Names.get(c.key) ?? areas[c.key]?.name ?? c.key;
  // Nome da Tabela 3 diferente do da Tabela 2 ("Parceiro X Ltda" × "Parceiro X"): casa pelo nome contido.
  const resolve = (key: string, name: string) => {
    if (centers.has(key)) return key;
    const f = fold(name);
    const hit = [...centers.values()].filter((c) => f.includes(fold(c.name)) || fold(c.name).includes(f)).sort((a, b) => b.name.length - a.name.length)[0];
    return hit?.key ?? key;
  };
  for (const p of periods) {
    for (const ch of p.charges) ch.centerKey = resolve(ch.centerKey, ch.name);
    for (const it of p.items) it.centerKey = resolve(it.centerKey, b3Name(p, it.centerKey) ?? it.centerKey);
  }
  // Parceiros: quem tem cobrança na Tabela 3 do mês mais recente; nome do documento = o da Tabela 3.
  for (const ch of latest.charges) {
    const c = centers.get(ch.centerKey);
    if (!c) { warnings.push(`Tabela 3 de ${latest.tab}: "${ch.name}" não está na Tabela 2 — cobrança importada, mas cadastre o centro de custo.`); continue; }
    c.kind = 'PARTNER';
    if (fold(ch.name) !== fold(c.name)) c.displayName = ch.name;
    const iptuLine = ch.lines.find((l) => l.kind === 'IPTU');
    const pct = iptuLine?.description.match(/(\d+(?:[.,]\d+)?)\s*%/);
    if (pct) c.iptuSharePct = Number(pct[1]!.replace(',', '.'));
  }

  // Quem só aparece na Tabela 3 de meses antigos (Lotus, Poderoso Película…): parceiro que já saiu.
  for (const p of periods) {
    for (const ch of p.charges) {
      const c = centers.get(ch.centerKey);
      if (c) {
        c.kind = 'PARTNER';
        if (!c.displayName && fold(ch.name) !== fold(c.name)) c.displayName = ch.name;
        if (p.month < c.firstMonth) c.firstMonth = p.month;
        if (p.month > c.lastMonth) c.lastMonth = p.month;
        continue;
      }
      centers.set(ch.centerKey, { key: ch.centerKey, name: ch.name, displayName: null, kind: 'PARTNER', isSnackBar: false, areaM2: areas[ch.centerKey]?.area ?? 0, iptuSharePct: 100, firstMonth: p.month, lastMonth: p.month });
    }
  }

  // Relógios: aba ENERGIA, uma coluna de leitura a cada 2 (B, D, F…), datas na A.
  const meters: ImportMeter[] = [];
  const energy = by(/^energia$/);
  if (energy) {
    for (let col = 2; col <= 30; col += 2) {
      const head = text(energy.cell(1, col));
      if (!head) continue;
      const key = centerKey(head);
      const readings: ImportMeter['readings'] = [];
      for (let r = 2; r <= Math.min(energy.rows, 400); r++) {
        const d = energy.cell(r, 1).value;
        if (!(d instanceof Date)) continue;
        const v = numberOf(energy.cell(r, col));
        if (v === null) continue;
        readings.push({ month: monthOfDate(d), reading: Math.round(v * 10) / 10, estimated: !!energy.cell(r, col).formula });
      }
      if (!readings.length) continue;
      if (!centers.has(key)) warnings.push(`Relógio "${head}" sem centro de custo correspondente — ignorado.`);
      else meters.push({ centerKey: key, name: centers.get(key)!.displayName ?? centers.get(key)!.name, readings });
    }
  } else warnings.push('Aba ENERGIA não encontrada: cadastre os relógios à mão.');

  return { centers: [...centers.values()], meters, iptu, recurring: latest.items, periods: periods.reverse(), warnings };
}

/** Conferência: o motor recalcula a competência importada e compara com o que a planilha cobrou. */
export function importCheck(b: ImportBundle, month: Month, tariff: number, flagFactor: number) {
  const p = b.periods.find((x) => x.month === month);
  if (!p) return [];
  const input: PeriodInput = {
    month, tariff, flagFactor, snackBarPct: p.snackBarPct,
    expenses: p.expenses.map((e) => ({ amountCents: e.amountCents, confirmed: true, description: e.description })),
    centers: b.centers.filter((c) => c.key in p.headcounts).map((c) => ({
      id: c.key, name: c.displayName ?? c.name, kind: c.kind, isSnackBar: c.isSnackBar, chargesCondo: true, areaM2: c.areaM2, iptuSharePct: c.iptuSharePct,
      headcount: p.headcounts[c.key] ?? 0, billing: 'FULL', activeFrom: '2000-01-01', activeTo: null,
    })),
    meters: b.meters.filter((m) => m.centerKey in p.headcounts).map((m) => {
      const before = m.readings.filter((r) => r.month < month);
      const cur = m.readings.find((r) => r.month === month);
      return { id: m.centerKey, centerId: m.centerKey, name: m.name, previous: before.at(-1)?.reading ?? cur?.reading ?? 0, current: cur?.reading ?? null, estimated: !!cur?.estimated, reset: null, history: [] };
    }),
    iptu: b.iptu,
    items: p.items.map((it, i) => ({ id: String(i), centerId: it.centerKey, description: it.description, qty: it.qty, unitCents: it.unitCents, amountCents: it.amountCents, adhoc: false })),
  };
  const r = computePeriod(input);
  return p.charges.map((billed) => {
    const mine = r.charges.find((c) => c.centerId === billed.centerKey);
    return { name: billed.name, billedCents: billed.totalCents, computedCents: mine?.totalCents ?? null, ok: mine?.totalCents === billed.totalCents };
  });
}
