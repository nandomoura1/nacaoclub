/**
 * Ajustes dos sócios no relatório do mês (puro): itens desconsiderados
 * (indicador enviesado, base incompleta, mês atípico…) com o motivo.
 * Os números continuam calculados e guardados; o relatório e a análise da IA
 * deixam de usá-los e mostram o motivo no lugar.
 */

export interface ReportItem {
  key: string;
  label: string;
  /** Seções da análise (secoes.*) que somem. */
  sections: string[];
  /** Indicadores (KEY_INDICATORS.key) que somem dos cards e da comparação. */
  indicators: string[];
  /** Alertas (Check.key) que deixam de aparecer. */
  checks: string[];
  hint: string;
}

export const REPORT_ITEMS: ReportItem[] = [
  { key: 'recebimentos', label: 'Recebimentos e receitas', sections: ['recebimentos'], indicators: ['recebimentos', 'receita_servicos', 'receita_vendas'], checks: ['total_recebimentos'], hint: 'ex.: receita de evento pontual distorce o mês' },
  { key: 'pagamentos', label: 'Pagamentos por categoria', sections: ['pagamentos'], indicators: ['pagamentos'], checks: ['total_pagamentos'], hint: 'ex.: pagamentos atrasados do mês anterior' },
  { key: 'fluxo', label: 'Recebimentos × pagamentos (geração de caixa)', sections: ['fluxo'], indicators: ['geracao', 'diferenca'], checks: [], hint: 'ex.: mês com aporte/obra fora do normal' },
  { key: 'pessoal', label: 'Custo de pessoal', sections: ['pessoal'], indicators: ['pessoal', 'pessoal_pct'], checks: ['folha_var', 'pessoal_meta', 'total_pessoal'], hint: 'ex.: rescisões ou 13º antecipado' },
  { key: 'alunos', label: 'Base de alunos e ticket por modalidade', sections: ['alunos'], indicators: ['alunos'], checks: [], hint: 'ex.: base do sistema desatualizada' },
  { key: 'tenis', label: 'Tênis — parceria', sections: ['tenis'], indicators: [], checks: ['tenis_repasse'], hint: 'ex.: repasse pago em outro mês' },
  { key: 'lanchonete', label: 'Lanchonete (PDV, formas de pagamento, produtos)', sections: ['lanchonete', 'formasPagamento', 'ticketFuncionario', 'topProdutos'], indicators: ['lanchonete'], checks: ['pdv_formas', 'pdv_vs_vendas'], hint: 'ex.: PDV fora do ar parte do mês' },
  { key: 'cmv', label: 'CMV', sections: ['cmv'], indicators: ['cmv_pct'], checks: ['cmv_var', 'cmv_meta', 'estoque_inicial', 'estoque_variacao'], hint: 'ex.: compra grande para estocar' },
  { key: 'investimentos', label: 'Reformas e investimentos', sections: ['investimentos'], indicators: ['investimentos'], checks: [], hint: '' },
  { key: 'payout', label: 'Payout', sections: ['payout'], indicators: ['payout'], checks: [], hint: '' },
  { key: 'caixa', label: 'Posição de caixa', sections: ['caixa'], indicators: ['caixa'], checks: ['caixa_soma', 'caixa_meta', 'total_caixa'], hint: 'ex.: extrato de uma conta faltando' },
  { key: 'comparacao', label: 'Comparação com o mês anterior', sections: [], indicators: [], checks: [], hint: 'ex.: mês anterior atípico' },
];

export interface Exclusion { key: string; reason: string }

export function parseExclusions(v: unknown): Exclusion[] {
  if (!Array.isArray(v)) return [];
  const keys = new Set(REPORT_ITEMS.map((i) => i.key));
  return v.filter((x): x is Exclusion => !!x && typeof x === 'object' && keys.has((x as Exclusion).key) && typeof (x as Exclusion).reason === 'string')
    .map((x) => ({ key: x.key, reason: x.reason.trim().slice(0, 300) }));
}

/** Consultas rápidas sobre o conjunto de exclusões do mês. */
export function exclusionsView(list: Exclusion[] | null | undefined) {
  const ex = list ?? [];
  const items = ex.map((e) => ({ ...e, item: REPORT_ITEMS.find((i) => i.key === e.key)! })).filter((e) => e.item);
  const bySection = new Map(items.flatMap((e) => e.item.sections.map((s) => [s, e.reason] as const)));
  const byIndicator = new Map(items.flatMap((e) => e.item.indicators.map((k) => [k, e.reason] as const)));
  const checks = new Set(items.flatMap((e) => e.item.checks));
  return {
    list: items,
    any: items.length > 0,
    has: (key: string) => items.some((e) => e.key === key),
    reason: (key: string) => items.find((e) => e.key === key)?.reason ?? null,
    section: (s: string) => bySection.get(s) ?? null,
    indicator: (k: string) => byIndicator.get(k) ?? null,
    keepCheck: (k: string) => !checks.has(k),
  };
}
export type ExclusionsView = ReturnType<typeof exclusionsView>;
