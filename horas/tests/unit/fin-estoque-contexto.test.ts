import { describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORIES } from '@/domain/financeiro/taxonomy';
import { computeMetrics, type FinLineData } from '@/domain/financeiro/metrics';
import { parseNumber, parseStockTable, stockSummary } from '@/domain/financeiro/stock';
import { exclusionsView, parseExclusions } from '@/domain/financeiro/adjustments';
import { analysisInput } from '@/server/financeiro/analysis';

/** Números fictícios. Estoque no CMV e ajustes dos sócios no relatório. */
const L = (dataset: FinLineData['dataset'], key: string | null, cents: number | null, extra: Partial<FinLineData> = {}): FinLineData =>
  ({ dataset, key, label: key ?? '', unit: null, amountCents: cents, quantity: null, classification: null, meta: null, ...extra });
const S = (moment: 'final' | 'inicial', label: string, qty: number, cents: number | null) => L('ESTOQUE', moment, cents, { label, quantity: qty });

const base = (): FinLineData[] => [
  L('RECEITA', 'rec.servicos', 500_000_00),
  L('DESPESA', 'pessoal.salarios', 100_000_00),
  L('DESPESA', 'desp.materiais_revenda', 70_000_00),
  L('PDV_RESUMO', 'faturamento', 175_000_00),
];

describe('posição de estoque (puro)', () => {
  it('números em formato brasileiro e internacional', () => {
    expect(['1.234,56', '1234.56', '1,234.56', 'R$ 12,00', '-3', '(5,5)', '1.000', '', 'abc'].map(parseNumber)).toEqual([1234.56, 1234.56, 1234.56, 12, -3, -5.5, 1000, null, null]);
    expect(parseNumber(7)).toBe(7);
  });

  it('lê a planilha pelo cabeçalho: saldo × custo quando não há total; ignora linha de total', () => {
    const rows = [
      ['Relatório de estoque — 31/10'],
      ['Código', 'Descrição', 'Un', 'Saldo atual', 'Custo médio', 'Valor total'],
      ['001', 'Refrigerante lata', 'UN', '300', '3,00', '900,00'],
      ['002', 'Água 500ml', 'UN', '400', '1,00', ''],
      ['003', 'Picolé', 'UN', '-12', '5,00', '-60,00'],
      ['004', 'Copo descartável', 'PCT', '10', '', ''],
      ['', 'TOTAL', '', '698', '', '1.240,00'],
    ].map((cells, i) => ({ ref: `linha ${i + 1}`, cells }));
    const p = parseStockTable(rows)!;
    expect(p.items.map((i) => [i.label, i.quantity, i.totalCents, i.unit])).toEqual([
      ['Refrigerante lata', 300, 900_00, 'UN'], ['Água 500ml', 400, 400_00, 'UN'], ['Picolé', -12, -60_00, 'UN'], ['Copo descartável', 10, null, 'PCT'],
    ]);
    expect(p.items[0]!.ref).toBe('linha 3');
    expect(p.warnings[0]).toMatch(/1 produto\(s\) sem custo/);
    expect(parseStockTable([{ ref: 'l1', cells: ['nada', 'aqui'] }])).toBeNull();
  });

  it('resumo ignora saldo negativo e item sem custo', () => {
    const s = stockSummary([
      { label: 'A', quantity: 300, amountCents: 900_00 }, { label: 'B', quantity: -12, amountCents: -60_00 },
      { label: 'C', quantity: 10, amountCents: null }, { label: 'D', quantity: 0, amountCents: 0 },
    ])!;
    expect(s).toMatchObject({ valueCents: 900_00, items: 1, negative: { count: 1, cents: 60_00 }, noCost: 1 });
    expect(stockSummary([])).toBeNull();
  });
});

describe('CMV ajustado pelo estoque', () => {
  it('compras − (final − inicial), negativos ignorados, sempre estimativa', () => {
    const m = computeMetrics([...base(), S('inicial', 'A', 100, 20_000_00), S('final', 'A', 150, 30_000_00), S('final', 'B', -5, -1_000_00)], DEFAULT_CATEGORIES);
    expect(m.cmv.metodo).toBe('ajustado_estoque');
    expect(m.cmv.valor.value).toBe(60_000_00); // 70 mil − (30 − 20) mil
    expect(m.cmv.valor.status).toBe('estimativa');
    expect(m.cmv.pct.value).toBeCloseTo(60_000 / 175_000);
    expect(m.estoque).toMatchObject({ inicialFonte: 'documento', final: { value: 30_000_00 }, variacao: { value: 10_000_00 } });
    expect(m.estoque!.resumoFinal!.negative.count).toBe(1);
  });

  it('estoque inicial vem do mês anterior quando não há posição de início', () => {
    const m = computeMetrics([...base(), S('final', 'A', 150, 30_000_00)], DEFAULT_CATEGORIES, undefined, null, { openingStockCents: 40_000_00 });
    expect(m.cmv.valor.value).toBe(80_000_00); // consumiu estoque: 70 + 10
    expect(m.estoque!.inicialFonte).toBe('mes_anterior');
  });

  it('sem estoque inicial: CMV continua por compras e avisa', () => {
    const m = computeMetrics([...base(), S('final', 'A', 150, 30_000_00)], DEFAULT_CATEGORIES);
    expect(m.cmv.metodo).toBe('estimado_compras');
    expect(m.cmv.valor.value).toBe(70_000_00);
    expect(m.checks.some((c) => c.key === 'estoque_inicial')).toBe(true);
  });

  it('estoque cresceu mais que as compras: divergência', () => {
    const m = computeMetrics([...base(), S('inicial', 'A', 1, 1_000_00), S('final', 'A', 9, 90_000_00)], DEFAULT_CATEGORIES);
    expect(m.cmv.valor.value).toBe(-19_000_00);
    expect(m.checks.find((c) => c.key === 'estoque_variacao')?.level).toBe('divergencia');
  });

  it('sem posição de estoque o motor fica como antes (sem bloco de estoque)', () => {
    const m = computeMetrics(base(), DEFAULT_CATEGORIES);
    expect(m.estoque).toBeUndefined();
    expect(m.cmv.metodo).toBe('estimado_compras');
  });
});

describe('ajustes dos sócios', () => {
  it('só aceita itens do catálogo e devolve consultas por seção, indicador e alerta', () => {
    const ex = parseExclusions([{ key: 'cmv', reason: ' compra para estoque do evento ' }, { key: 'xyz', reason: 'x' }, 'lixo']);
    expect(ex).toEqual([{ key: 'cmv', reason: 'compra para estoque do evento' }]);
    const v = exclusionsView(ex);
    expect(v.section('cmv')).toBe('compra para estoque do evento');
    expect(v.indicator('cmv_pct')).toBe('compra para estoque do evento');
    expect(v.keepCheck('cmv_meta')).toBe(false);
    expect(v.keepCheck('folha_var')).toBe(true);
    expect(v.section('pessoal')).toBeNull();
  });

  it('a IA não recebe os dados do item desconsiderado, recebe o contexto e o motivo', () => {
    const m = computeMetrics(base(), DEFAULT_CATEGORIES, { cmvMaxPct: 30, personnelMaxPct: 28, cashMinCents: null, payrollVarAlertPct: 15, cmvVarAlertPp: 5, tennisSharePct: 40, payoutInFlow: 'distribuicao' });
    expect(m.checks.some((c) => c.key === 'cmv_meta')).toBe(true);
    const input = analysisInput('2030-10', m, null, null, null, { partnerContext: 'Compramos estoque para o evento.', exclusions: [{ key: 'cmv', reason: 'compra para estoque do evento' }, { key: 'comparacao', reason: 'mês anterior atípico' }] });
    expect(input.cmv).toBe('DESCONSIDERADO pelos sócios: compra para estoque do evento');
    expect(Object.keys(input.indicadores)).not.toContain('CMV');
    expect(input.alertas.some((a) => a.includes('CMV'))).toBe(false);
    expect(input.contextoDosSocios).toBe('Compramos estoque para o evento.');
    expect(input.itensDesconsiderados).toEqual(['CMV — motivo: compra para estoque do evento', 'Comparação com o mês anterior — motivo: mês anterior atípico']);
    expect(input.comparacaoComMesAnterior).toMatch(/Desconsiderada/);
    // Sem ajustes, tudo segue para a IA.
    expect(Object.keys(analysisInput('2030-10', m, null, null, null).indicadores)).toContain('CMV');
  });
});
