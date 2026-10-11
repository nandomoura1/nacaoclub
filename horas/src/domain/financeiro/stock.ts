/**
 * Posição de estoque (puro). Serve para ajustar o CMV:
 *   CMV ajustado = compras do mês − (estoque final − estoque inicial).
 * Produtos com saldo negativo são ignorados (erro de cadastro/baixa no PDV,
 * não é estoque de verdade). O estoque cobre só o que é controlado no sistema:
 * produção própria e insumos indiretos ficam de fora, então o resultado é
 * sempre uma ESTIMATIVA gerencial.
 */

export interface StockLine { label: string; quantity: number | null; amountCents: number | null; unit?: string | null }

export interface StockSummary {
  /** Valor do estoque considerado (só itens com saldo e valor positivos). */
  valueCents: number;
  items: number;
  /** Unidades em estoque (soma dos saldos positivos valorizados). */
  units: number;
  negative: { count: number; cents: number };
  /** Itens com saldo positivo mas sem custo (não entram no valor). */
  noCost: number;
  top: { label: string; quantity: number | null; cents: number }[];
}

export const isNegativeStock = (l: StockLine) => (l.quantity !== null && l.quantity < 0) || (l.amountCents !== null && l.amountCents < 0);

export function stockSummary(lines: StockLine[]): StockSummary | null {
  if (!lines.length) return null;
  const neg = lines.filter(isNegativeStock);
  const ok = lines.filter((l) => !isNegativeStock(l) && (l.quantity === null || l.quantity > 0));
  const valued = ok.filter((l) => l.amountCents !== null && l.amountCents > 0);
  return {
    valueCents: valued.reduce((s, l) => s + l.amountCents!, 0),
    items: valued.length,
    units: valued.reduce((s, l) => s + (l.quantity ?? 0), 0),
    negative: { count: neg.length, cents: neg.reduce((s, l) => s + Math.abs(l.amountCents ?? 0), 0) },
    noCost: ok.length - valued.length,
    top: [...valued].sort((a, b) => b.amountCents! - a.amountCents!).slice(0, 10).map((l) => ({ label: l.label, quantity: l.quantity, cents: l.amountCents! })),
  };
}

// ── Produto a produto: quantidade, custo, variação e giro ─────

export interface StockItemView {
  label: string;
  qtyFinal: number | null;
  unitCostCents: number | null;
  valueFinal: number;
  qtyInicial: number | null;
  valueInicial: number | null;
  /** Unidades vendidas no PDV no mês (mesmo produto pelo nome), se houver. */
  soldQty: number | null;
  /** Dias que o saldo final dura no ritmo de venda do mês. */
  coverageDays: number | null;
}

/** Nome comparável: sem acento, minúsculas, sem unidade de medida solta. */
export const productKey = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/\b(un|und|unid|unidade|cx|pct|kg|g|ml|l|lt)\b\.?/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Cruza a posição final com a inicial e com as vendas do PDV: quantidade,
 * custo unitário, valor, vendido no mês e cobertura em dias. Negativos fora.
 */
export function stockItems(finalLines: StockLine[], initialLines: StockLine[], sold: { label: string; quantity: number | null }[], daysInMonth: number): StockItemView[] {
  const ok = (l: StockLine) => !isNegativeStock(l) && (l.quantity === null || l.quantity > 0) && l.amountCents !== null && l.amountCents > 0;
  const init = new Map(initialLines.filter(ok).map((l) => [productKey(l.label), l]));
  const soldBy = new Map<string, number>();
  for (const s of sold) if (s.quantity !== null) soldBy.set(productKey(s.label), (soldBy.get(productKey(s.label)) ?? 0) + s.quantity);
  return finalLines.filter(ok).map((l) => {
    const k = productKey(l.label);
    const i = init.get(k);
    const soldQty = soldBy.has(k) ? soldBy.get(k)! : null;
    return {
      label: l.label, qtyFinal: l.quantity, unitCostCents: l.quantity ? Math.round(l.amountCents! / l.quantity) : null, valueFinal: l.amountCents!,
      qtyInicial: i ? i.quantity : null, valueInicial: i ? i.amountCents : null, soldQty,
      coverageDays: soldQty && soldQty > 0 && l.quantity ? Math.round((l.quantity / (soldQty / daysInMonth)) * 10) / 10 : null,
    };
  }).sort((a, b) => b.valueFinal - a.valueFinal);
}

// ── Leitura determinística de planilha (XLSX/CSV) ───────────────

export interface ParsedStockItem { label: string; quantity: number; unit: string | null; unitCostCents: number | null; totalCents: number | null; ref: string; raw: string }
export interface ParsedStock { items: ParsedStockItem[]; warnings: string[]; header: string }

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Número em formato brasileiro ou internacional: "1.234,56", "1234.56", "-3", "R$ 12,00". */
export function parseNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  let s = v.replace(/r\$|\s/gi, '').trim();
  if (!s || !/\d/.test(s)) return null;
  const neg = /^\(.*\)$/.test(s) || s.startsWith('-') || s.endsWith('-');
  s = s.replace(/[()\-+]/g, '');
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (s.includes(',')) s = s.replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}

const COLS = {
  product: /^(produto|descri|item|nome|mercadoria|insumo)/,
  code: /^(cod|sku|referencia|ref\b|ean|id\b)/,
  qty: /(saldo|estoque|quant|qtd|qtde|disponivel|atual)/,
  unit: /^(un\b|und|unid|unidade|medida|um\b)/,
  unitCost: /(custo\s*(unit|medio|médio)|preco\s*(de\s*)?custo|custo\s*un|vl\.?\s*unit|valor\s*unit|cmu|custo$)/,
  total: /(custo\s*total|valor\s*total|total\s*(em\s*)?(estoque|custo|r\$)|valor\s*(do\s*)?estoque|vl\.?\s*total|^total$|^valor$)/,
};

/**
 * Acha o cabeçalho (até a linha 30) e lê produto, saldo, custo unitário e valor total.
 * Retorna null se não reconhecer as colunas (aí a IA lê o documento).
 */
export function parseStockTable(rows: { ref: string; cells: unknown[] }[]): ParsedStock | null {
  for (let h = 0; h < Math.min(rows.length, 30); h++) {
    const head = rows[h]!.cells.map((c) => fold(String(c ?? '')));
    const find = (re: RegExp, skip: number[] = []) => head.findIndex((c, i) => c && !skip.includes(i) && re.test(c));
    const total = find(COLS.total);
    const unitCost = find(COLS.unitCost, [total]);
    const qty = find(COLS.qty, [total, unitCost]);
    const product = find(COLS.product, [qty, total, unitCost]);
    if (product < 0 || qty < 0 || (total < 0 && unitCost < 0)) continue;
    const unit = find(COLS.unit, [product, qty, total, unitCost]);
    const items: ParsedStockItem[] = [];
    const warnings: string[] = [];
    for (const r of rows.slice(h + 1)) {
      const label = String(r.cells[product] ?? '').trim();
      if (!label || /^(total|subtotal|soma)\b/i.test(fold(label))) continue;
      const q = parseNumber(r.cells[qty]);
      if (q === null) continue;
      const uc = unitCost >= 0 ? parseNumber(r.cells[unitCost]) : null;
      const tot = total >= 0 ? parseNumber(r.cells[total]) : null;
      // Valor total do documento; sem ele, saldo × custo unitário.
      const totalCents = tot !== null ? Math.round(tot * 100) : uc !== null ? Math.round(q * uc * 100) : null;
      items.push({
        label: label.slice(0, 200), quantity: q, unit: unit >= 0 ? String(r.cells[unit] ?? '').trim().slice(0, 20) || null : null,
        unitCostCents: uc !== null ? Math.round(uc * 100) : null, totalCents, ref: r.ref,
        raw: [q, uc, tot].filter((x) => x !== null).join(' | ').slice(0, 300),
      });
    }
    if (!items.length) continue;
    const noCost = items.filter((i) => i.totalCents === null).length;
    if (noCost) warnings.push(`${noCost} produto(s) sem custo: não entram no valor do estoque.`);
    return { items, warnings, header: rows[h]!.cells.map((c) => String(c ?? '')).filter(Boolean).join(' | ') };
  }
  return null;
}
