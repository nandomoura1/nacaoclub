import { describe, expect, it } from 'vitest';
import { compareFileKpis, isPackage, parsePackage, productGroup, type Sheets } from '@/domain/financeiro/package';
import { computeMetrics, DEFAULT_TARGETS } from '@/domain/financeiro/metrics';
import { DEFAULT_CATEGORIES } from '@/domain/financeiro/taxonomy';

/** Pacote histórico fictício no layout nacao_financeiro_historico v1.0. */
const sheets = (): Sheets => ({
  MANIFESTO: [['Manifesto'], [], ['campo', 'valor'], ['schema_name', 'nacao_financeiro_historico'], ['schema_version', '1.0']],
  COMPETENCIAS: [['Competências'], [], ['competencia', 'status_importacao', 'relatorio_referencia', 'observacoes', 'fonte_principal', 'versao', 'aprovado'],
    ['2090-08', 'REFERENCIA', 'Relatório 08/2090', null, 'x', '1', true], ['2090-07', 'PENDENTE_VALIDACAO', null, 'Conferir com o original.', 'x', '1', false]],
  METRICAS: [['Métricas'], [], ['competencia', 'codigo_metrica', 'categoria', 'descricao', 'valor', 'unidade', 'classificacao', 'status', 'fonte', 'observacao', 'formula_metodologia'],
    ['2090-08', 'RECEBIMENTOS_TOTAL', 'RECEITA', 'Recebimentos totais', 1000000, 'BRL', null, 'APROVADO', 'Relatório'],
    ['2090-08', 'RECEITA_SERVICOS', 'RECEITA', 'Receita de Serviços', 700000, 'BRL'],
    ['2090-08', 'RECEITA_VENDAS', 'RECEITA', 'Receita de Vendas', 200000, 'BRL'],
    ['2090-08', 'PAGAMENTOS_TOTAL', 'DESPESA', 'Pagamentos totais', 900000, 'BRL'],
    ['2090-08', 'CUSTO_PESSOAL', 'PESSOAL', 'Custo econômico de pessoal', 250000, 'BRL'],
    ['2090-08', 'PESSOAL_RECEBIMENTOS', 'PESSOAL', 'Pessoal / recebimentos', 0.25, 'PERCENT'],
    ['2090-08', 'PESSOAL_SERVICOS', 'PESSOAL', 'Pessoal / serviços', 0.357, 'PERCENT'],
    ['2090-08', 'TENIS_PARCEIROS', 'PARCERIA', 'Repasse Tênis', 30000, 'BRL'],
    ['2090-08', 'PDV_FATURAMENTO', 'LANCHONETE', 'Faturamento PDV', 240000, 'BRL'],
    ['2090-08', 'MATERIAIS_REVENDA', 'LANCHONETE', 'Materiais para revenda', 120000, 'BRL'],
    ['2090-08', 'CMV_ESTIMADO_COMPRAS', 'LANCHONETE', 'CMV estimado', 0.5, 'PERCENT'],
    ['2090-08', 'DISTRIBUICAO_LUCROS', 'PAYOUT', 'Distribuição', 50000, 'BRL'],
    ['2090-08', 'ANTECIPACAO_LUCROS', 'PAYOUT', 'Antecipação', 10000, 'BRL'],
    ['2090-08', 'DIFERENCA_CAIXA', 'CAIXA', 'Rec - pag', 100000, 'BRL'],
    ['2090-08', 'GERACAO_ANTES_PAYOUT', 'CAIXA', 'Geração', 150000, 'BRL'],
    ['2090-08', 'PREVISTO_RECEBER', 'CAIXA', 'Previsto a receber', 80000, 'BRL'],
    ['2090-08', 'CODIGO_NOVO', 'X', 'Algo novo', 5, 'BRL'],
    ['2090-08', 'RECEITA_EVENTOS_VAZIA', 'RECEITA', 'Vazio', null, 'BRL'],
    ['2090-07', 'PDV_VENDAS', 'LANCHONETE', 'Vendas', 6000, 'QTD']],
  ALUNOS: [['Alunos'], [], ['competencia', 'modalidade', 'quantidade', 'status'],
    ['2090-08', 'Modalidade A', 600, 'INFORMADO'], ['2090-08', 'Modalidade B', 400, 'INFORMADO']],
  CAIXA: [['Caixa'], [], ['competencia_relatorio', 'data_posicao', 'conta', 'subconta', 'valor', 'percentual', 'status', 'observacao'],
    ['2090-08', '2090-09-21', 'Banco A', 'Conta Corrente', 300000, 0.6, 'INFORMADO'],
    ['2090-08', '2090-09-21', 'Banco B', 'Aplicação', 200000, 0.4, 'INFORMADO', 'Total informado R$ 500.000,00.'],
    ['2090-07', '2089-07-15', 'Banco A', 'Conta Corrente', 100000, 1, 'DATA_CONFERIR']],
  PRODUTOS_PDV: [['Produtos'], [], ['competencia', 'ranking', 'produto', 'grupo', 'numero_vendas', 'quantidade', 'faturamento', 'classificacao'],
    ['2090-08', 1, 'Prato do dia', 'Refeição', null, 300, 30000, 'COMERCIAL'],
    ['2090-08', 2, 'Almoço Funcionários', 'Refeição', null, 500, 12000, 'CONSUMO_INTERNO'],
    ['2090-08', 3, 'Cerveja 600', 'Cervejas', 450, 400, 8000, 'COMERCIAL']],
  REGRAS_NEGOCIO: [['Regras'], [], ['codigo', 'tema'], ['TENIS_FORA_FOLHA', 'x'], ['REGRA_INVENTADA', 'y']],
  OBS_GERENCIAIS: [['Obs'], [], ['competencia', 'tema', 'observacao', 'tipo', 'status', 'fonte'],
    ['2090-07', 'Payout', 'Reduzir repasse temporariamente.', 'DECISAO_SUGERIDA'], ['2090-07', 'Caixa', 'Investimento na sala nova.', 'CONTEXTO_GERENCIAL']],
  PENDENCIAS: [['Pendências'], [], ['competencia', 'area', 'dado_necessario'], ['2090-07', 'Financeiro', 'DRE completo']],
});

describe('Pacote histórico (planilha estruturada, sem IA)', () => {
  const pkg = parsePackage(sheets());
  const aug = pkg.months.find((m) => m.month === '2090-08')!;
  const jul = pkg.months.find((m) => m.month === '2090-07')!;

  it('reconhece o pacote pelo MANIFESTO e lê as competências', () => {
    expect(isPackage(sheets())).toBe(true);
    expect(isPackage({ X: [['campo', 'valor'], ['schema_name', 'outro']] })).toBe(false);
    expect(pkg.schemaVersion).toBe('1.0');
    expect(pkg.months.map((m) => m.month)).toEqual(['2090-07', '2090-08']);
    expect(aug).toMatchObject({ importStatus: 'REFERENCIA', approvedInFile: true });
  });

  it('valor vazio não vira zero; código desconhecido é avisado e não entra; % calculado não vira dado', () => {
    expect(aug.lines.some((l) => l.label === 'Vazio')).toBe(false);
    expect(aug.warnings.some((w) => w.includes('CODIGO_NOVO'))).toBe(true);
    expect(aug.lines.some((l) => l.label.includes('Pessoal /'))).toBe(false);
    expect(aug.fileKpis.map((k) => k.code)).toEqual(['PESSOAL_RECEBIMENTOS', 'PESSOAL_SERVICOS', 'CMV_ESTIMADO_COMPRAS', 'DIFERENCA_CAIXA', 'GERACAO_ANTES_PAYOUT']);
  });

  it('motor recalcula a partir do pacote e bate com os indicadores da planilha', () => {
    const m = computeMetrics(aug.lines, DEFAULT_CATEGORIES, DEFAULT_TARGETS);
    expect(m.recebimentos).toMatchObject({ value: 1_000_000_00, status: 'importado' });
    expect(m.pessoal.value).toBe(250_000_00);
    expect(m.tenis.repasse.value).toBe(30_000_00); // parceria, fora da folha
    expect(m.caixa.disponivel.value).toBe(500_000_00);
    expect(m.caixa.aReceber.value).toBe(80_000_00); // fora do caixa disponível
    expect(m.alunos.total.value).toBe(1000);
    expect(m.topProdutos.find((p) => p.label === 'Almoço Funcionários')!.interno).toBe(true);
    const cmp = compareFileKpis(m, aug.fileKpis);
    expect(cmp.filter((k) => !k.ok)).toEqual([]);
    // Geração antes do payout = rec − (pag − distribuição): 1.000 − (900 − 50) = 150 mil.
    expect(m.fluxo.geracaoAntesPayout.value).toBe(150_000_00);
  });

  it('caixa: total informado na observação, data de posição longe da competência vira aviso', () => {
    expect(aug.lines.find((l) => l.label === 'Banco B')!.meta).toMatchObject({ totalInformado: 500_000_00, dataPosicao: '2090-09-21' });
    expect(aug.warnings.some((w) => w.includes('Posição de caixa'))).toBe(false);
    expect(jul.warnings.some((w) => w.includes('15/07/2089'))).toBe(true);
  });

  it('observações: decisão vai para "decisões dos sócios", contexto para o gestor; pendências viram aviso; regras desconhecidas são apontadas', () => {
    expect(jul.partnerDecisions).toEqual(['[Payout] Reduzir repasse temporariamente.']);
    expect(jul.managerNotes).toEqual(['[Caixa] Investimento na sala nova.']);
    expect(jul.warnings).toContain('Pendência (Financeiro): DRE completo.');
    expect(pkg.rules).toEqual([{ code: 'TENIS_FORA_FOLHA', known: true }, { code: 'REGRA_INVENTADA', known: false }]);
    expect(pkg.warnings.some((w) => w.includes('REGRA_INVENTADA'))).toBe(true);
  });

  it('grupos de produto', () => {
    expect(productGroup('Refeição', 'COMERCIAL')).toBe('refeicoes');
    expect(productGroup('Refeição', 'CONSUMO_INTERNO')).toBe('consumo_interno');
    expect(productGroup('Cervejas', null)).toBe('bebidas_alcoolicas');
    expect(productGroup('Bebidas', null)).toBe('bebidas_nao_alcoolicas');
    expect(productGroup('Day Use', null)).toBe('day_use');
    expect(productGroup('Sobremesa', null)).toBe('lanches');
    expect(productGroup(null, null)).toBe('outros');
  });
});
