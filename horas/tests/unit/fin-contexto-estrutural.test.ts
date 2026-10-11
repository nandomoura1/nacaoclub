import { describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORIES } from '@/domain/financeiro/taxonomy';
import { computeMetrics, type FinLineData } from '@/domain/financeiro/metrics';
import { adjustmentEffects, applyContext, validateAdjustments, type ContextPlan, type LineWithId, type RawAdjustment } from '@/domain/financeiro/context-adjust';
import { analysisInput } from '@/server/financeiro/analysis';

/** Números fictícios. Contexto dos sócios mudando os dados do relatório. */
const L = (id: string, dataset: FinLineData['dataset'], key: string | null, cents: number, label = key ?? ''): LineWithId =>
  ({ id, dataset, key, label, unit: null, amountCents: cents, quantity: null, classification: null, meta: null });
const lines = (): LineWithId[] => [
  L('r1', 'RECEITA', 'rec.servicos', 400_000_00, 'Mensalidades'),
  L('r2', 'RECEITA', 'rec.eventos', 60_000_00, 'Evento corrida'),
  L('d1', 'DESPESA', 'pessoal.salarios', 100_000_00, 'Folha'),
  L('d2', 'DESPESA', 'desp.manutencao', 18_000_00, 'Obra vestiário'),
  L('d3', 'DESPESA', 'desp.energia', 9_000_00, 'Energia'),
  L('e1', 'ESTOQUE', 'final', 5_000_00, 'Refrigerante'),
];
const refs = () => new Map(lines().map((l, i) => [`L${i + 1}`, l]));
const R = (r: Partial<RawAdjustment>): RawAdjustment => ({ tipo: 'EXCLUIR', linha: null, conjunto: null, categoria: null, descricao: null, valor: null, motivo: 'segundo os sócios', trechoDoContexto: '', ...r });

describe('contexto dos sócios aplicado aos números (puro)', () => {
  it('valida contra os dados reais: linha, categoria do mesmo tipo, valor coerente, estoque fora', () => {
    const { items, rejected } = validateAdjustments([
      R({ tipo: 'EXCLUIR', linha: 'L2' }),
      R({ tipo: 'RECLASSIFICAR', linha: 'L4', categoria: 'desp.obras' }),
      R({ tipo: 'AJUSTAR_VALOR', linha: 'L5', valor: 6000 }),
      R({ tipo: 'INCLUIR', conjunto: 'DESPESA', categoria: 'parceria.tenis', descricao: 'Repasse do tênis pago em dinheiro', valor: 4000 }),
      R({ tipo: 'EXCLUIR', linha: 'L99' }),
      R({ tipo: 'RECLASSIFICAR', linha: 'L3', categoria: 'rec.servicos' }),
      R({ tipo: 'AJUSTAR_VALOR', linha: 'L5', valor: 900_000 }),
      R({ tipo: 'EXCLUIR', linha: 'L6' }),
      R({ tipo: 'INCLUIR', conjunto: 'ESTOQUE', descricao: 'x', valor: 1 }),
      R({ tipo: 'EXCLUIR', linha: 'L1', motivo: ' ' }),
    ], refs(), DEFAULT_CATEGORIES);
    expect(items.map((a) => [a.kind, a.lineId, a.toCents, a.toKey])).toEqual([
      ['EXCLUIR', 'r2', null, null], ['RECLASSIFICAR', 'd2', null, 'desp.obras'], ['AJUSTAR_VALOR', 'd3', 6_000_00, null], ['INCLUIR', null, 4_000_00, 'parceria.tenis'],
    ]);
    expect(rejected).toHaveLength(6);
  });

  it('o relatório é calculado sobre os dados ajustados; desligar um ajuste volta ao original', () => {
    const { items } = validateAdjustments([R({ tipo: 'EXCLUIR', linha: 'L2' }), R({ tipo: 'RECLASSIFICAR', linha: 'L4', categoria: 'desp.obras' })], refs(), DEFAULT_CATEGORIES);
    const plan: ContextPlan = { context: 'c', generatedAt: '', model: '', items, readingOnly: [] };
    const raw = computeMetrics(lines(), DEFAULT_CATEGORIES);
    const adj = computeMetrics(applyContext(lines(), plan), DEFAULT_CATEGORIES);
    expect(raw.recebimentos.value).toBe(460_000_00);
    expect(adj.recebimentos.value).toBe(400_000_00);
    expect(adj.investimentos.total.value).toBeGreaterThanOrEqual(18_000_00);
    const effects = adjustmentEffects(raw, adj);
    expect(effects.find((e) => e.key === 'recebimentos')).toMatchObject({ from: 460_000_00, to: 400_000_00 });
    // Originais intactos.
    expect(lines()[1]!.amountCents).toBe(60_000_00);
    plan.items.forEach((a) => (a.active = false));
    expect(computeMetrics(applyContext(lines(), plan), DEFAULT_CATEGORIES).recebimentos.value).toBe(460_000_00);
  });

  it('a análise recebe os ajustes, o efeito nos indicadores e os pontos só de leitura', () => {
    const { items } = validateAdjustments([R({ tipo: 'EXCLUIR', linha: 'L2', motivo: 'evento pontual' })], refs(), DEFAULT_CATEGORIES);
    const plan: ContextPlan = { context: 'O evento foi pontual.', generatedAt: '', model: '', items, readingOnly: ['Foco em retenção', 'Ajuste não aplicado — x'] };
    const raw = computeMetrics(lines(), DEFAULT_CATEGORIES);
    const adj = computeMetrics(applyContext(lines(), plan), DEFAULT_CATEGORIES);
    const input = analysisInput('2026-09', adj, null, null, null, { partnerContext: plan.context, exclusions: [], plan, effects: adjustmentEffects(raw, adj) });
    expect(input.ajustesDoContexto[0]).toContain('Evento corrida');
    expect(input.ajustesDoContexto[0]).toContain('evento pontual');
    expect(input.efeitoNosIndicadores.some((e) => e.startsWith('Recebimentos:'))).toBe(true);
    expect(input.contextoSomenteLeitura).toEqual(['Foco em retenção']);
    expect(input.indicadores['Recebimentos']).toContain('400.000');
  });
});
