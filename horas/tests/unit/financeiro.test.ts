import { describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORIES } from '@/domain/financeiro/taxonomy';
import { compareMetrics, computeMetrics, DEFAULT_TARGETS, yearToDate, type FinLineData } from '@/domain/financeiro/metrics';

/** Números fictícios. Regras críticas do Relatório Financeiro da Nação. */
const L = (dataset: FinLineData['dataset'], key: string | null, cents: number | null, extra: Partial<FinLineData> = {}): FinLineData =>
  ({ dataset, key, label: key ?? '', unit: null, amountCents: cents, quantity: null, classification: null, meta: null, ...extra });

const base = (): FinLineData[] => [
  L('RECEITA', 'rec.servicos', 500_000_00),
  L('RECEITA', 'rec.vendas', 150_000_00),
  L('RECEITA', 'rec.estornos', -10_000_00),
  L('RECEITA', 'rec.emprestimo', 200_000_00),
  L('DESPESA', 'pessoal.salarios', 100_000_00),
  L('DESPESA', 'pessoal.fgts', 8_000_00),
  L('DESPESA', 'pessoal.irrf', 5_000_00),
  L('DESPESA', 'pessoal.adiantamento', 30_000_00),
  L('DESPESA', 'parceria.tenis', 16_000_00),
  L('DESPESA', 'payout.distribuicao', 60_000_00),
  L('DESPESA', 'payout.antecipacao', 10_000_00),
  L('DESPESA', 'desp.materiais_revenda', 70_000_00),
  L('DESPESA', 'desp.obras', 50_000_00),
  L('DESPESA', 'desp.energia', 20_000_00),
  L('MODALIDADE', null, 40_000_00, { label: 'Tênis Saibro', unit: 'Tênis Saibro' }),
  L('MODALIDADE', null, 200_000_00, { label: 'Nação Fit', unit: 'Nação Fit' }),
  L('ALUNOS', null, null, { unit: 'Nação Fit', quantity: 900 }),
  L('ALUNOS', null, null, { unit: 'Tênis Saibro', quantity: 100 }),
  L('PDV_RESUMO', 'faturamento', 175_000_00),
  L('PDV_RESUMO', 'vendas', null, { quantity: 7000 }),
  L('PDV_PAGAMENTO', 'pix', 100_000_00),
  L('PDV_PAGAMENTO', 'credito', 40_000_00),
  L('PDV_PAGAMENTO', 'ticket_funcionario', 20_000_00),
  L('PDV_PAGAMENTO', 'conta_assinada', 10_000_00, { meta: { contaAssinadaClasse: 'COMERCIAL' } }),
  L('PDV_PAGAMENTO', 'conta_assinada', 5_000_00, { meta: { contaAssinadaClasse: 'SOCIO' } }),
  L('PDV_PRODUTO', 'consumo_interno', 18_000_00, { label: 'Almoço Funcionários', quantity: 900 }),
  L('PDV_PRODUTO', 'refeicoes', 30_000_00, { label: 'Prato executivo', quantity: 1000, meta: { vendas: 950 } }),
  L('CAIXA', 'disponivel', 300_000_00, { label: 'BB Nação Club' }),
  L('CAIXA', 'disponivel', 100_000_00, { label: 'Stone Lanchonete' }),
  L('CAIXA', 'a_receber', 250_000_00, { label: 'Stone Academia', unit: 'recebíveis' }),
];

describe('Relatório Financeiro — motor de regras', () => {
  const m = computeMetrics(base(), DEFAULT_CATEGORIES);

  it('recebimentos ≠ receita operacional: empréstimo/aporte não é receita operacional; estorno reduz', () => {
    expect(m.recebimentos.value).toBe(840_000_00);
    expect(m.receitaOperacional.value).toBe(640_000_00);
    expect(m.entradasFinanceiras.value).toBe(200_000_00);
    expect(m.receitaServicos.value).toBe(500_000_00);
    expect(m.revenueByCategory.find((r) => r.key === 'rec.servicos')!.ratio).toBeCloseTo(500 / 840);
  });

  it('custo de pessoal: sem IRRF retido, sem adiantamento, sem payout e sem a parceria do Tênis', () => {
    expect(m.pessoal.value).toBe(108_000_00);
    expect(m.pessoalExcluded.map((r) => r.key).sort()).toEqual(['parceria.tenis', 'pessoal.adiantamento', 'pessoal.irrf']);
    expect(m.pessoalPctRecebimentos.value).toBeCloseTo(108 / 840);
    expect(m.pessoalPctServicos.value).toBeCloseTo(108 / 500);
    expect(m.custoPessoalPorAluno.value).toBeCloseTo(108_000_00 / 1000);
  });

  it('Tênis: parceria de 40% do faturamento, mostrada à parte', () => {
    expect(m.tenis.faturamento.value).toBe(40_000_00);
    expect(m.tenis.repasse.value).toBe(16_000_00);
    expect(m.tenis.pctRepasse.value).toBeCloseTo(0.4);
    expect(m.tenis.margem.value).toBe(24_000_00);
    expect(m.checks.some((c) => c.key === 'tenis_repasse')).toBe(false);
  });

  it('lanchonete: Ticket Funcionário e Conta Assinada não comercial ficam fora das vendas efetivas', () => {
    const l = m.lanchonete;
    expect(l.ticketMedio.value).toBeCloseTo(175_000_00 / 7000);
    expect(l.ticketFuncionario.value).toBe(20_000_00);
    expect(l.ticketFuncionarioPct.value).toBeCloseTo(20 / 175);
    expect(l.contaAssinadaNaoComercial.value).toBe(5_000_00);
    expect(l.vendasEfetivas.value).toBe(175_000_00 - 20_000_00 - 5_000_00);
    expect(m.topProdutos[0]).toMatchObject({ label: 'Prato executivo', rank: 1, vendas: 950 });
    expect(m.topProdutos.find((p) => p.label === 'Almoço Funcionários')!.interno).toBe(true);
  });

  it('CMV: estimado por compras sem estoque; real quando há estoque inicial e final', () => {
    expect(m.cmv.metodo).toBe('estimado_compras');
    expect(m.cmv.pct.value).toBeCloseTo(70 / 175);
    expect(m.cmv.pct.status).toBe('estimativa');
    const real = computeMetrics([...base(), L('PDV_RESUMO', 'estoque_inicial', 20_000_00), L('PDV_RESUMO', 'estoque_final', 30_000_00)], DEFAULT_CATEGORIES);
    expect(real.cmv.metodo).toBe('real');
    expect(real.cmv.valor.value).toBe(60_000_00);
    expect(real.cmv.pct.value).toBeCloseTo(60 / 175);
  });

  it('payout fora do OPEX; fluxo antes do payout; nunca chamado de lucro', () => {
    expect(m.payout.total.value).toBe(70_000_00);
    expect(m.expenseByCategory.find((r) => r.key === 'payout.distribuicao')!.classification).toBe('DISTRIBUICAO');
    expect(m.payout.distribuicaoPct.value).toBeCloseTo(60 / 840);
    const pag = 100 + 8 + 5 + 30 + 16 + 60 + 10 + 70 + 50 + 20;
    expect(m.pagamentos.value).toBe(pag * 1_000_00);
    expect(m.fluxo.diferenca.value).toBe((840 - pag) * 1_000_00);
    expect(m.fluxo.pagamentosAntesPayout.value).toBe((pag - 70) * 1_000_00);
    expect(m.fluxo.geracaoAntesPayout.value).toBe((840 - pag + 70) * 1_000_00);
    expect(m.fluxo.geracaoAntesPayout.formula).toMatch(/não é lucro/);
    expect(m.investimentos.total.value).toBe(50_000_00); // obras = CAPEX
  });

  it('caixa disponível nunca soma recebíveis', () => {
    expect(m.caixa.disponivel.value).toBe(400_000_00);
    expect(m.caixa.aReceber.value).toBe(250_000_00);
  });

  it('base de alunos e modalidades: ticket médio é estimativa', () => {
    expect(m.alunos.total.value).toBe(1000);
    expect(m.alunos.total.formula).toMatch(/não são pessoas únicas/);
    const fit = m.modalidades.find((x) => x.label === 'Nação Fit')!;
    expect(fit.ticket).toMatchObject({ value: 200_000_00 / 900, status: 'estimativa' });
  });

  it('dado ausente é "não informado" — nada inventado', () => {
    const empty = computeMetrics([L('RECEITA', 'rec.servicos', 1000)], DEFAULT_CATEGORIES);
    expect(empty.pagamentos.status).toBe('nao_informado');
    expect(empty.lanchonete.faturamento.status).toBe('nao_informado');
    expect(empty.caixa.disponivel.value).toBeNull();
    expect(empty.cmv.pct.status).toBe('nao_informado');
  });

  it('validações: formas de pagamento × PDV, PDV × receita de vendas, metas e variações', () => {
    const keys = m.checks.map((c) => c.key);
    expect(keys).not.toContain('pdv_formas'); // 100 + 40 + 20 + 10 + 5 = 175 mil = faturamento do PDV
    const fixed = computeMetrics(base().filter((l) => !(l.dataset === 'PDV_PAGAMENTO' && l.key === 'pix')), DEFAULT_CATEGORIES);
    expect(fixed.checks.find((c) => c.key === 'pdv_formas')!.level).toBe('divergencia');
    expect(keys).toContain('pdv_vs_vendas');
    expect(keys).not.toContain('cmv_meta'); // 70/175 = 40,0%: igual à meta, não acima
    expect(computeMetrics(base(), DEFAULT_CATEGORIES, { ...DEFAULT_TARGETS, cmvMaxPct: 35 }).checks.some((c) => c.key === 'cmv_meta')).toBe(true);
    const prev = computeMetrics(base().map((l) => (l.key === 'pessoal.salarios' ? { ...l, amountCents: 50_000_00 } : l)), DEFAULT_CATEGORIES);
    expect(computeMetrics(base(), DEFAULT_CATEGORIES, DEFAULT_TARGETS, prev).checks.some((c) => c.key === 'folha_var')).toBe(true);
  });

  it('relatório antigo (só indicadores) alimenta o histórico marcado como importado; comparação e YTD', () => {
    const old = computeMetrics([
      L('INDICADOR', 'recebimentos', 700_000_00), L('INDICADOR', 'pagamentos', 650_000_00), L('INDICADOR', 'pessoal', 150_000_00),
      L('INDICADOR', 'alunos', null, { quantity: 2200 }), L('INDICADOR', 'cmv_pct', null, { quantity: 38.5 }),
    ], DEFAULT_CATEGORIES);
    expect(old.source).toBe('importado');
    expect(old.recebimentos).toMatchObject({ value: 700_000_00, status: 'importado' });
    expect(old.cmv.pct.value).toBeCloseTo(0.385);
    expect(old.fluxo.diferenca.value).toBe(50_000_00);
    expect(old.lanchonete.faturamento.status).toBe('nao_informado');
    const cmp = compareMetrics(old, m);
    expect(cmp.find((r) => r.key === 'recebimentos')).toMatchObject({ a: 700_000_00, b: 840_000_00, delta: 140_000_00 });
    expect(cmp.find((r) => r.key === 'recebimentos')!.deltaPct).toBeCloseTo(0.2);
    const ytd = yearToDate([{ month: '2090-07', m: old }, { month: '2090-08', m }]);
    expect(ytd.recebimentos).toEqual({ value: 1_540_000_00, months: 2 });
    expect(ytd.alunosAtual).toBe(1000);
    expect(ytd.lanchonete).toEqual({ value: 175_000_00, months: 1 });
  });
});
