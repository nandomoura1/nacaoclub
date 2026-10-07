/**
 * Taxonomia do Relatório Financeiro: categorias padrão (configuráveis em
 * fin_categories), datasets das linhas e chaves fixas do PDV. Puro.
 */

export type Dataset =
  | 'RECEITA' | 'DESPESA' | 'MODALIDADE' | 'ALUNOS'
  | 'PDV_RESUMO' | 'PDV_PAGAMENTO' | 'PDV_PRODUTO'
  | 'CAIXA' | 'INVESTIMENTO' | 'FINANCIAMENTO' | 'INDICADOR';
export const DATASETS: { id: Dataset; label: string }[] = [
  { id: 'RECEITA', label: 'Recebimentos' },
  { id: 'DESPESA', label: 'Pagamentos' },
  { id: 'MODALIDADE', label: 'Receita por modalidade' },
  { id: 'ALUNOS', label: 'Base de alunos' },
  { id: 'PDV_RESUMO', label: 'Lanchonete (PDV)' },
  { id: 'PDV_PAGAMENTO', label: 'Formas de pagamento (PDV)' },
  { id: 'PDV_PRODUTO', label: 'Produtos vendidos (PDV)' },
  { id: 'CAIXA', label: 'Posição de caixa' },
  { id: 'INVESTIMENTO', label: 'Investimentos' },
  { id: 'FINANCIAMENTO', label: 'Financiamentos e aportes' },
  { id: 'INDICADOR', label: 'Indicadores de relatório anterior' },
];

export type Classification = 'RECEITA' | 'OPEX' | 'CAPEX' | 'FINANCEIRO' | 'DISTRIBUICAO' | 'AJUSTE';
export const CLASSIFICATIONS: Classification[] = ['RECEITA', 'OPEX', 'CAPEX', 'FINANCEIRO', 'DISTRIBUICAO', 'AJUSTE'];

export interface CategoryDef {
  key: string;
  label: string;
  kind: 'RECEITA' | 'DESPESA';
  classification: Classification;
  /** Entra no custo econômico de pessoal. */
  personnel: boolean;
  /** Receita operacional (aporte/empréstimo não é). */
  operatingRevenue: boolean;
  sortOrder: number;
}

const r = (key: string, label: string, operatingRevenue = true, classification: Classification = 'RECEITA'): Omit<CategoryDef, 'sortOrder'> =>
  ({ key, label, kind: 'RECEITA', classification, personnel: false, operatingRevenue });
const d = (key: string, label: string, classification: Classification = 'OPEX', personnel = false): Omit<CategoryDef, 'sortOrder'> =>
  ({ key, label, kind: 'DESPESA', classification, personnel, operatingRevenue: false });

/** Categorias padrão (a migration grava as mesmas em fin_categories). */
export const DEFAULT_CATEGORIES: CategoryDef[] = [
  r('rec.servicos', 'Receitas de serviços'),
  r('rec.vendas', 'Receitas de vendas'),
  r('rec.aluguel_parceiros', 'Aluguel de parceiros'),
  r('rec.marketing', 'Marketing / patrocínios'),
  r('rec.rateio_condominio', 'Rateio de condomínio'),
  r('rec.eventos', 'Eventos'),
  r('rec.taxas', 'Taxas'),
  r('rec.outras', 'Outras receitas'),
  r('rec.estornos', 'Estornos / devoluções'),
  r('rec.aporte', 'Aporte de sócios', false, 'FINANCEIRO'),
  r('rec.emprestimo', 'Empréstimo / financiamento recebido', false, 'FINANCEIRO'),
  d('pessoal.salarios', 'Salários', 'OPEX', true),
  d('pessoal.funap', 'FUNAP', 'OPEX', true),
  d('pessoal.estagiarios', 'Estagiários', 'OPEX', true),
  d('pessoal.vale_transporte', 'Vale-transporte', 'OPEX', true),
  d('pessoal.fgts', 'FGTS', 'OPEX', true),
  d('pessoal.ferias', 'Férias', 'OPEX', true),
  d('pessoal.gratificacoes', 'Gratificações', 'OPEX', true),
  d('pessoal.rescisoes', 'Rescisões', 'OPEX', true),
  d('pessoal.decimo_terceiro', '13º salário', 'OPEX', true),
  d('pessoal.encargos', 'Encargos patronais', 'OPEX', true),
  d('pessoal.outros', 'Outros custos de folha', 'OPEX', true),
  d('pessoal.irrf', 'IRRF retido (recolhimento)', 'OPEX', false),
  d('pessoal.adiantamento', 'Adiantamento salarial', 'AJUSTE', false),
  d('parceria.tenis', 'Repasse parceria do Tênis', 'OPEX', false),
  d('desp.aluguel', 'Aluguel'),
  d('desp.energia', 'Energia'),
  d('desp.agua', 'Água'),
  d('desp.impostos', 'Impostos'),
  d('desp.materiais_revenda', 'Materiais para revenda (insumos)'),
  d('desp.prestadores', 'Prestadores de serviço'),
  d('desp.materiais_aplicados', 'Materiais aplicados'),
  d('desp.obras', 'Obras e reformas', 'CAPEX'),
  d('desp.equipamentos', 'Equipamentos', 'CAPEX'),
  d('desp.cartoes', 'Cartões / tarifas', 'FINANCEIRO'),
  d('desp.manutencao', 'Manutenção'),
  d('desp.marketing', 'Marketing'),
  d('desp.administrativo', 'Administrativo'),
  d('desp.emprestimo', 'Pagamento de empréstimo', 'FINANCEIRO'),
  d('desp.outras', 'Outras despesas'),
  d('payout.distribuicao', 'Distribuição de lucros', 'DISTRIBUICAO'),
  d('payout.antecipacao', 'Antecipação de lucros', 'DISTRIBUICAO'),
  d('payout.retiradas', 'Outras retiradas dos sócios', 'DISTRIBUICAO'),
].map((c, i) => ({ ...c, sortOrder: i }));

export const PAYOUT_KEYS = { distribuicao: 'payout.distribuicao', antecipacao: 'payout.antecipacao', retiradas: 'payout.retiradas' } as const;
export const CMV_PURCHASES_KEY = 'desp.materiais_revenda';
export const TENNIS_PARTNERSHIP_KEY = 'parceria.tenis';
export const SALES_REVENUE_KEY = 'rec.vendas';
export const SERVICES_REVENUE_KEY = 'rec.servicos';

/** PDV: resumo, formas de pagamento, grupos de produto, classes de Conta Assinada. */
export const PDV_SUMMARY_KEYS = ['faturamento', 'vendas', 'cancelamentos', 'estornos', 'estoque_inicial', 'estoque_final'] as const;
export const PAYMENT_METHODS: { key: string; label: string }[] = [
  { key: 'credito', label: 'Crédito' }, { key: 'debito', label: 'Débito' }, { key: 'pix', label: 'PIX' },
  { key: 'dinheiro', label: 'Dinheiro' }, { key: 'conta_assinada', label: 'Conta Assinada' }, { key: 'voucher', label: 'Voucher' },
  { key: 'ticket_funcionario', label: 'Ticket Funcionário' }, { key: 'outros', label: 'Outras formas' },
];
export const SIGNED_ACCOUNT_CLASSES = ['COMERCIAL', 'FUNCIONARIO', 'SOCIO', 'COMPENSACAO', 'INVESTIMENTO', 'AJUSTE', 'OUTROS'] as const;
export type SignedAccountClass = (typeof SIGNED_ACCOUNT_CLASSES)[number];
export const PRODUCT_GROUPS: { key: string; label: string }[] = [
  { key: 'refeicoes', label: 'Refeições' }, { key: 'bebidas_alcoolicas', label: 'Bebidas alcoólicas' },
  { key: 'bebidas_nao_alcoolicas', label: 'Bebidas não alcoólicas' }, { key: 'lanches', label: 'Lanches' },
  { key: 'acai', label: 'Açaí' }, { key: 'esportivos', label: 'Produtos esportivos' }, { key: 'day_use', label: 'Day Use' },
  { key: 'consumo_interno', label: 'Consumo interno' }, { key: 'outros', label: 'Outros' },
];
/** Caixa: disponível × previsto a receber (nunca somados). */
export const CASH_KINDS = [{ key: 'disponivel', label: 'Disponível' }, { key: 'a_receber', label: 'Previsto a receber' }] as const;

/** Indicadores que um relatório antigo pode trazer prontos (sem as linhas de detalhe). */
export const SUMMARY_INDICATORS: { key: string; label: string; unit: 'BRL' | 'PCT' | 'QTD' }[] = [
  { key: 'recebimentos', label: 'Recebimentos', unit: 'BRL' },
  { key: 'receita_servicos', label: 'Receita de serviços', unit: 'BRL' },
  { key: 'receita_vendas', label: 'Receita de vendas', unit: 'BRL' },
  { key: 'pagamentos', label: 'Pagamentos', unit: 'BRL' },
  { key: 'pessoal', label: 'Custo de pessoal', unit: 'BRL' },
  { key: 'payout', label: 'Payout (distribuição + antecipação)', unit: 'BRL' },
  { key: 'distribuicao', label: 'Distribuição de lucros', unit: 'BRL' },
  { key: 'lanchonete', label: 'Faturamento da lanchonete (PDV)', unit: 'BRL' },
  { key: 'cmv_pct', label: 'CMV (%)', unit: 'PCT' },
  { key: 'alunos', label: 'Base de alunos', unit: 'QTD' },
  { key: 'caixa', label: 'Caixa disponível', unit: 'BRL' },
  { key: 'investimentos', label: 'Investimentos', unit: 'BRL' },
];

/** Tipos de documento da Central de uploads. */
export type DocKind = 'DRE_RECEBIMENTOS' | 'DRE_PAGAMENTOS' | 'PDV' | 'PRODUTOS' | 'FORMAS_PAGAMENTO' | 'CAIXA' | 'ALUNOS' | 'OUTROS' | 'RELATORIO_ANTERIOR';
export const DOC_KINDS: { id: DocKind; label: string; hint: string }[] = [
  { id: 'DRE_RECEBIMENTOS', label: 'DRE / Recebimentos', hint: 'Conta Azul: recebimentos por categoria' },
  { id: 'DRE_PAGAMENTOS', label: 'DRE / Pagamentos', hint: 'Conta Azul: pagamentos por categoria' },
  { id: 'PDV', label: 'PDV Lanchonete', hint: 'Faturamento, vendas, cancelamentos' },
  { id: 'PRODUTOS', label: 'Produtos vendidos', hint: 'Ranking de produtos do PDV' },
  { id: 'FORMAS_PAGAMENTO', label: 'Formas de pagamento', hint: 'Crédito, PIX, Conta Assinada, Ticket…' },
  { id: 'CAIXA', label: 'Posição de caixa', hint: 'Saldos por banco/conta' },
  { id: 'ALUNOS', label: 'Base de alunos', hint: 'Alunos por modalidade' },
  { id: 'OUTROS', label: 'Outros documentos', hint: 'Investimentos, financiamentos, notas' },
];
