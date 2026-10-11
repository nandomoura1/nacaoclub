import type { CategoryDef, Dataset } from './taxonomy';
import { KEY_INDICATORS, type FinLineData, type Metrics } from './metrics';

/**
 * Contexto dos sócios aplicado de forma ESTRUTURAL (puro): a IA lê o contexto
 * e propõe ajustes nos dados do mês (tirar um pagamento pontual, reclassificar
 * uma conta, corrigir um valor, incluir algo que falta). Os dados originais
 * ficam intactos; o relatório é calculado sobre os dados ajustados e mostra
 * cada ajuste (original → considerado) com o motivo. O gestor pode desligar
 * qualquer ajuste.
 */

export const ADJ_KINDS = [
  { id: 'EXCLUIR', label: 'Retirado do relatório' },
  { id: 'AJUSTAR_VALOR', label: 'Valor ajustado' },
  { id: 'RECLASSIFICAR', label: 'Reclassificado' },
  { id: 'INCLUIR', label: 'Incluído' },
] as const;
export type AdjKind = (typeof ADJ_KINDS)[number]['id'];

/** Conjuntos de dados que o contexto pode mexer (estoque e produtos ficam fora). */
export const ADJUSTABLE: Dataset[] = ['RECEITA', 'DESPESA', 'MODALIDADE', 'INVESTIMENTO', 'FINANCIAMENTO', 'CAIXA', 'PDV_RESUMO', 'INDICADOR'];
export const INCLUDABLE: Dataset[] = ['RECEITA', 'DESPESA', 'INVESTIMENTO', 'FINANCIAMENTO'];

export interface ContextAdjustment {
  id: string;
  kind: AdjKind;
  /** Linha original (FinLine.id); nulo em INCLUIR. */
  lineId: string | null;
  dataset: Dataset;
  label: string;
  unit: string | null;
  fromCents: number | null;
  toCents: number | null;
  fromKey: string | null;
  toKey: string | null;
  /** Por que, ligado ao ponto de vista dos sócios. */
  reason: string;
  /** Trecho do contexto que justifica. */
  quote: string;
  active: boolean;
}

export interface ContextPlan {
  /** Texto do contexto que gerou os ajustes (se mudar, os ajustes são refeitos). */
  context: string;
  generatedAt: string;
  model: string;
  items: ContextAdjustment[];
  /** Pontos do contexto que não viraram ajuste (só orientam a leitura). */
  readingOnly: string[];
}

export function parsePlan(v: unknown): ContextPlan | null {
  if (!v || typeof v !== 'object' || !Array.isArray((v as ContextPlan).items)) return null;
  const p = v as ContextPlan;
  return { context: String(p.context ?? ''), generatedAt: String(p.generatedAt ?? ''), model: String(p.model ?? ''), items: p.items, readingOnly: Array.isArray(p.readingOnly) ? p.readingOnly.map(String) : [] };
}

export type LineWithId = FinLineData & { id: string };

/** Aplica os ajustes ATIVOS: devolve as linhas que o relatório vai usar. */
export function applyContext(lines: LineWithId[], plan: ContextPlan | null): LineWithId[] {
  const active = (plan?.items ?? []).filter((a) => a.active);
  if (!active.length) return lines;
  const byLine = new Map<string, ContextAdjustment[]>();
  for (const a of active) if (a.lineId) byLine.set(a.lineId, [...(byLine.get(a.lineId) ?? []), a]);
  const out: LineWithId[] = [];
  for (const l of lines) {
    const adj = byLine.get(l.id);
    if (!adj) { out.push(l); continue; }
    if (adj.some((a) => a.kind === 'EXCLUIR')) continue;
    let n: LineWithId = { ...l, meta: { ...(l.meta ?? {}), ajusteContexto: true } };
    for (const a of adj) {
      if (a.kind === 'AJUSTAR_VALOR' && a.toCents !== null) n = { ...n, amountCents: a.toCents };
      if (a.kind === 'RECLASSIFICAR' && a.toKey) n = { ...n, key: a.toKey };
    }
    out.push(n);
  }
  for (const a of active.filter((x) => x.kind === 'INCLUIR' && x.toCents !== null)) {
    out.push({ id: `ctx:${a.id}`, dataset: a.dataset, key: a.toKey, label: a.label, unit: a.unit, amountCents: a.toCents, quantity: null, classification: null, meta: { ajusteContexto: true } });
  }
  return out;
}

/** O que a IA devolve, antes de validar. Valores em reais. */
export interface RawAdjustment {
  tipo: string;
  linha: string | null;
  conjunto: string | null;
  categoria: string | null;
  descricao: string | null;
  valor: number | null;
  motivo: string;
  trechoDoContexto: string;
}

/**
 * Valida o que a IA propôs contra os dados reais: a linha existe e pode ser
 * ajustada, a categoria existe e é do mesmo tipo, o valor é coerente.
 * O que não passa é descartado com o motivo (vira aviso, nunca número).
 */
export function validateAdjustments(raw: RawAdjustment[], refs: Map<string, LineWithId>, categories: Pick<CategoryDef, 'key' | 'label' | 'kind'>[]): { items: ContextAdjustment[]; rejected: string[] } {
  const items: ContextAdjustment[] = [];
  const rejected: string[] = [];
  const cat = new Map(categories.map((c) => [c.key, c]));
  const kindOf = (ds: Dataset) => (ds === 'RECEITA' ? 'RECEITA' : ds === 'DESPESA' ? 'DESPESA' : null);
  const cents = (v: number | null) => (v === null || !Number.isFinite(v) ? null : Math.round(v * 100));
  const used = new Set<string>();
  raw.forEach((r, i) => {
    const id = `a${i + 1}`;
    const reason = String(r.motivo ?? '').trim().slice(0, 400);
    const quote = String(r.trechoDoContexto ?? '').trim().slice(0, 300);
    const fail = (why: string) => rejected.push(`${r.descricao || r.linha || `ajuste ${i + 1}`}: ${why}`);
    if (!reason) return fail('sem motivo');
    if (r.tipo === 'INCLUIR') {
      const ds = r.conjunto as Dataset;
      const v = cents(r.valor);
      if (!INCLUDABLE.includes(ds)) return fail('conjunto de dados não permite inclusão');
      if (v === null || v <= 0) return fail('valor inválido');
      const k = r.categoria && cat.has(r.categoria) ? r.categoria : null;
      if (k && kindOf(ds) && cat.get(k)!.kind !== kindOf(ds)) return fail('categoria de outro tipo');
      if (!r.descricao?.trim()) return fail('sem descrição');
      items.push({ id, kind: 'INCLUIR', lineId: null, dataset: ds, label: r.descricao.trim().slice(0, 200), unit: null, fromCents: null, toCents: v, fromKey: null, toKey: k, reason, quote, active: true });
      return;
    }
    const l = r.linha ? refs.get(r.linha) : undefined;
    if (!l) return fail('linha não encontrada');
    if (!ADJUSTABLE.includes(l.dataset)) return fail('este dado não pode ser ajustado pelo contexto');
    const base = { id, lineId: l.id, dataset: l.dataset, label: l.label, unit: l.unit, fromCents: l.amountCents, fromKey: l.key, reason, quote, active: true };
    if (r.tipo === 'EXCLUIR') {
      if (used.has(l.id)) return fail('linha já ajustada');
      used.add(l.id);
      items.push({ ...base, kind: 'EXCLUIR', toCents: null, toKey: null });
    } else if (r.tipo === 'AJUSTAR_VALOR') {
      const v = cents(r.valor);
      if (v === null || v < 0) return fail('valor inválido');
      if (v === l.amountCents) return fail('valor igual ao original');
      if (l.amountCents !== null && l.amountCents > 0 && v > l.amountCents * 10) return fail('valor fora de proporção (mais de 10× o original)');
      items.push({ ...base, kind: 'AJUSTAR_VALOR', toCents: v, toKey: null });
    } else if (r.tipo === 'RECLASSIFICAR') {
      const c = r.categoria ? cat.get(r.categoria) : undefined;
      if (!c) return fail('categoria desconhecida');
      if (kindOf(l.dataset) !== c.kind) return fail('categoria de outro tipo');
      if (c.key === l.key) return fail('já está nessa categoria');
      items.push({ ...base, kind: 'RECLASSIFICAR', toCents: null, toKey: c.key });
    } else fail('tipo de ajuste desconhecido');
  });
  // Excluir anula os outros ajustes da mesma linha.
  const excluded = new Set(items.filter((a) => a.kind === 'EXCLUIR').map((a) => a.lineId));
  return { items: items.filter((a) => a.kind === 'EXCLUIR' || !a.lineId || !excluded.has(a.lineId)), rejected };
}

/** Efeito dos ajustes nos indicadores principais (original → considerado). */
export function adjustmentEffects(raw: Metrics, adjusted: Metrics): { key: string; label: string; unit: string; from: number | null; to: number | null }[] {
  return KEY_INDICATORS.map(({ key, label, get }) => ({ key, label, unit: get(adjusted).unit, from: get(raw).value, to: get(adjusted).value }))
    .filter((r) => r.from !== r.to && !(r.unit === 'PCT' && r.from !== null && r.to !== null && Math.abs(r.from - r.to) < 0.0005));
}
