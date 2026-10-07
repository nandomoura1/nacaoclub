import {
  CMV_PURCHASES_KEY, PAYMENT_METHODS, PAYOUT_KEYS, PRODUCT_GROUPS, SALES_REVENUE_KEY, SERVICES_REVENUE_KEY, TENNIS_PARTNERSHIP_KEY,
  type CategoryDef, type Dataset, type SignedAccountClass,
} from './taxonomy';

/**
 * Motor de regras do Relatório Financeiro — determinístico e puro. A IA nunca
 * calcula: recebe estes indicadores prontos. Cada indicador traz valor,
 * fórmula e estado; dado ausente é "não informado" (nunca inventado nem
 * copiado do mês anterior).
 */

export interface FinLineData {
  dataset: Dataset;
  key: string | null;
  label: string;
  /** Modalidade, conta bancária ou grupo de produto. */
  unit: string | null;
  amountCents: number | null;
  quantity: number | null;
  classification: string | null;
  meta?: Record<string, unknown> | null;
}

export interface Targets {
  /** Meta de CMV (%): acima dela, alerta. */
  cmvMaxPct: number | null;
  /** Meta de pessoal ÷ recebimentos (%). */
  personnelMaxPct: number | null;
  cashMinCents: number | null;
  /** Variação da folha (mês a mês) que gera atenção (%). */
  payrollVarAlertPct: number;
  /** Variação do CMV (pontos percentuais) que gera atenção. */
  cmvVarAlertPp: number;
  /** Repasse contratual da parceria do Tênis (%). */
  tennisSharePct: number;
  /**
   * O que sai dos pagamentos na "geração de caixa antes do payout":
   * só a distribuição de lucros (metodologia do relatório de agosto/2026) ou
   * todo o payout (distribuição + antecipação + retiradas).
   */
  payoutInFlow: 'distribuicao' | 'total';
}
export const DEFAULT_TARGETS: Targets = { cmvMaxPct: 40, personnelMaxPct: 28, cashMinCents: null, payrollVarAlertPct: 15, cmvVarAlertPp: 5, tennisSharePct: 40, payoutInFlow: 'distribuicao' };

export type IndStatus = 'informado' | 'nao_informado' | 'estimativa' | 'importado';
export interface Ind { value: number | null; unit: 'BRL' | 'PCT' | 'QTD'; formula: string; status: IndStatus }
const NA = (unit: Ind['unit'], formula: string): Ind => ({ value: null, unit, formula, status: 'nao_informado' });
const ind = (value: number | null, unit: Ind['unit'], formula: string, status: IndStatus = 'informado'): Ind => (value === null || !Number.isFinite(value) ? NA(unit, formula) : { value, unit, formula, status });
const ratio = (a: Ind, b: Ind, formula: string): Ind => (a.value === null || !b.value ? NA('PCT', formula) : ind(a.value / b.value, 'PCT', formula, a.status === 'estimativa' || b.status === 'estimativa' ? 'estimativa' : a.status === 'importado' || b.status === 'importado' ? 'importado' : 'informado'));
const minus = (a: Ind, b: Ind, formula: string): Ind => (a.value === null || b.value === null ? NA('BRL', formula) : ind(a.value - b.value, 'BRL', formula, a.status === 'importado' || b.status === 'importado' ? 'importado' : 'informado'));

export interface Row { key: string; label: string; cents: number; ratio: number | null }
export interface Check { level: 'divergencia' | 'conciliacao' | 'atencao' | 'meta'; key: string; message: string }

export interface Metrics {
  recebimentos: Ind;
  receitaOperacional: Ind;
  receitaServicos: Ind;
  receitaVendas: Ind;
  entradasFinanceiras: Ind;
  revenueByCategory: Row[];
  pagamentos: Ind;
  expenseByCategory: (Row & { classification: string })[];
  capex: Ind;
  pessoal: Ind;
  pessoalComponents: Row[];
  /** Fora do custo de pessoal, mostrados à parte: IRRF, adiantamento, parceria do Tênis. */
  pessoalExcluded: Row[];
  pessoalPctRecebimentos: Ind;
  pessoalPctServicos: Ind;
  servicosPorPessoal: Ind;
  custoPessoalPorAluno: Ind;
  tenis: { faturamento: Ind; repasse: Ind; pctRepasse: Ind; margem: Ind; esperado: Ind };
  lanchonete: {
    faturamento: Ind; vendas: Ind; ticketMedio: Ind; cancelamentos: Ind; estornos: Ind; compras: Ind;
    ticketFuncionario: Ind; ticketFuncionarioPct: Ind;
    contaAssinada: Ind; contaAssinadaPorClasse: Row[]; contaAssinadaNaoComercial: Ind;
    vendasEfetivas: Ind; payments: Row[]; paymentsSum: Ind;
  };
  topProdutos: { rank: number; label: string; group: string; groupLabel: string; vendas: number | null; quantidade: number | null; cents: number; ratio: number | null; interno: boolean }[];
  productGroups: Row[];
  cmv: { metodo: 'real' | 'estimado_compras' | null; valor: Ind; pct: Ind };
  payout: { distribuicao: Ind; antecipacao: Ind; retiradas: Ind; total: Ind; distribuicaoPct: Ind; totalPct: Ind };
  fluxo: { diferenca: Ind; pagamentosAntesPayout: Ind; geracaoAntesPayout: Ind };
  caixa: { disponivel: Ind; aReceber: Ind; accounts: (Row & { kind: string })[] };
  alunos: { total: Ind; byModality: { label: string; qty: number; ratio: number | null }[] };
  modalidades: { label: string; cents: number | null; alunos: number | null; ticket: Ind; ratio: number | null }[];
  investimentos: { total: Ind; items: { label: string; key: string | null; cents: number; classification: string | null; meta: Record<string, unknown> | null }[] };
  financiamentos: { label: string; key: string | null; cents: number | null; meta: Record<string, unknown> | null }[];
  checks: Check[];
  /** De onde vieram os números: linhas de detalhe, indicadores de relatório antigo, ou os dois. */
  source: 'detalhado' | 'importado' | 'misto' | 'vazio';
}

const sum = (xs: (number | null)[]) => xs.reduce<number>((s, v) => s + (v ?? 0), 0);
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const BRL = (c: number) => `R$ ${(c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const PCT = (r: number) => `${(r * 100).toFixed(1).replace('.', ',')}%`;

export function computeMetrics(lines: FinLineData[], categories: CategoryDef[], targets: Targets = DEFAULT_TARGETS, previous?: Metrics | null): Metrics {
  const cat = new Map(categories.map((c) => [c.key, c]));
  const of = (ds: Dataset) => lines.filter((l) => l.dataset === ds);
  const indicator = (key: string) => of('INDICADOR').find((l) => l.key === key) ?? null;
  const fromIndicator = (key: string, unit: Ind['unit'], formula: string): Ind | null => {
    const l = indicator(key);
    if (!l) return null;
    const v = unit === 'BRL' ? l.amountCents : l.quantity;
    return v === null ? null : { value: unit === 'PCT' ? v / 100 : v, unit, formula: `${formula} (relatório importado)`, status: 'importado' };
  };
  /** Valor das linhas de detalhe; sem detalhe, o indicador do relatório importado; sem nenhum, "não informado". */
  const pick = (detail: number | null, key: string, unit: Ind['unit'], formula: string): Ind => (detail !== null ? ind(detail, unit, formula) : fromIndicator(key, unit, formula) ?? NA(unit, formula));
  /**
   * Totais (recebimentos, pagamentos, pessoal, caixa): o total informado no
   * relatório vale mesmo que o detalhe seja parcial — o detalhe é só a parte
   * conhecida. Detalhe maior que o total é divergência (só aponta).
   */
  const totalChecks: Check[] = [];
  const total = (detail: number | null, key: string, label: string, formula: string): Ind => {
    const declared = fromIndicator(key, 'BRL', formula);
    if (!declared) return ind(detail, 'BRL', formula);
    if (detail !== null && declared.value !== null && detail - declared.value > 100) {
      totalChecks.push({ level: 'divergencia', key: `total_${key}`, message: `${label}: o detalhe soma ${BRL(detail)}, acima do total informado (${BRL(declared.value)}).` });
    }
    return declared;
  };
  /** Parte do total sem detalhe por categoria (relatórios antigos trazem só os principais itens). */
  const undetailed = (rows: Row[], t: Ind): Row[] => {
    const known = sum(rows.map((r) => r.cents));
    return t.value !== null && rows.length && t.value - known > 100 ? [...rows, { key: 'nao_detalhado', label: 'Não detalhado no documento', cents: t.value - known, ratio: t.value ? (t.value - known) / t.value : null }] : rows;
  };

  // ── Recebimentos ───────────────────────────────────────────
  const rec = of('RECEITA');
  const recBy = (pred: (c: CategoryDef | undefined, l: FinLineData) => boolean) => rec.filter((l) => pred(cat.get(l.key ?? ''), l));
  const recTotal = rec.length ? sum(rec.map((l) => l.amountCents)) : null;
  const recebimentos = total(recTotal, 'recebimentos', 'Recebimentos', 'Σ recebimentos do mês (todas as categorias, estornos negativos)');
  const operating = rec.length ? sum(recBy((c) => c?.operatingRevenue !== false).map((l) => l.amountCents)) : null;
  const receitaOperacional = ind(operating, 'BRL', 'Recebimentos − aportes/empréstimos (entradas financeiras não são receita operacional)');
  const entradasFinanceiras = ind(rec.length ? sum(recBy((c) => c?.operatingRevenue === false).map((l) => l.amountCents)) : null, 'BRL', 'Σ aportes + empréstimos + financiamentos recebidos');
  const servicosD = rec.some((l) => l.key === SERVICES_REVENUE_KEY) ? sum(recBy((_, l) => l.key === SERVICES_REVENUE_KEY).map((l) => l.amountCents)) : null;
  const vendasD = rec.some((l) => l.key === SALES_REVENUE_KEY) ? sum(recBy((_, l) => l.key === SALES_REVENUE_KEY).map((l) => l.amountCents)) : null;
  const receitaServicos = pick(servicosD, 'receita_servicos', 'BRL', 'Σ categoria "Receitas de serviços"');
  const receitaVendas = pick(vendasD, 'receita_vendas', 'BRL', 'Σ categoria "Receitas de vendas"');
  const group = (ls: FinLineData[], total: number | null) => {
    const m = new Map<string, number>();
    for (const l of ls) m.set(l.key ?? 'sem_categoria', (m.get(l.key ?? 'sem_categoria') ?? 0) + (l.amountCents ?? 0));
    return [...m.entries()].map(([key, cents]) => ({ key, label: cat.get(key)?.label ?? (key === 'sem_categoria' ? 'Sem categoria' : key), cents, ratio: total ? cents / total : null }))
      .sort((a, b) => b.cents - a.cents);
  };
  const revenueByCategory = undetailed(group(rec, recebimentos.value), recebimentos);

  // ── Pagamentos ─────────────────────────────────────────────
  const desp = of('DESPESA');
  const despTotal = desp.length ? sum(desp.map((l) => l.amountCents)) : null;
  const pagamentos = total(despTotal, 'pagamentos', 'Pagamentos', 'Σ pagamentos do mês (todas as categorias)');
  const expenseByCategory = undetailed(group(desp, pagamentos.value), pagamentos).map((r) => ({ ...r, classification: r.key === 'nao_detalhado' ? '—' : cat.get(r.key)?.classification ?? 'OPEX' }));
  const byKey = (k: string) => (desp.some((l) => l.key === k) ? sum(desp.filter((l) => l.key === k).map((l) => l.amountCents)) : null);
  const capexD = desp.length ? sum(desp.filter((l) => cat.get(l.key ?? '')?.classification === 'CAPEX' || l.classification === 'CAPEX').map((l) => l.amountCents)) : null;

  // ── Pessoal (custo econômico) ──────────────────────────────
  // Entra só o que a categoria marca como pessoal: IRRF retido, adiantamento,
  // payout e a parceria do Tênis ficam de fora por definição.
  const pessoalLines = desp.filter((l) => cat.get(l.key ?? '')?.personnel === true);
  const pessoal = total(pessoalLines.length ? sum(pessoalLines.map((l) => l.amountCents)) : null, 'pessoal', 'Custo de pessoal', 'Σ salários, FUNAP, estagiários, VT, FGTS, férias, gratificações, rescisões, 13º, encargos (sem IRRF retido, adiantamento, payout e parceria do Tênis)');
  const pessoalComponents = group(pessoalLines, pessoal.value);
  const pessoalExcluded = group(desp.filter((l) => ['pessoal.irrf', 'pessoal.adiantamento', TENNIS_PARTNERSHIP_KEY].includes(l.key ?? '')), null);

  // ── Alunos e modalidades ───────────────────────────────────
  const alunosLines = of('ALUNOS');
  const alunosTotal = pick(alunosLines.length ? sum(alunosLines.map((l) => l.quantity)) : null, 'alunos', 'QTD', 'Σ alunos/matrículas por modalidade (não são pessoas únicas)');
  const byModality = alunosLines.map((l) => ({ label: l.unit || l.label, qty: l.quantity ?? 0, ratio: alunosTotal.value ? (l.quantity ?? 0) / alunosTotal.value : null })).sort((a, b) => b.qty - a.qty);
  const modRev = of('MODALIDADE');
  const modNames = [...new Set([...modRev.map((l) => l.unit || l.label), ...byModality.map((m) => m.label)])];
  const revTotalMods = modRev.length ? sum(modRev.map((l) => l.amountCents)) : null;
  const modalidades = modNames.map((name) => {
    const cents = modRev.some((l) => fold(l.unit || l.label) === fold(name)) ? sum(modRev.filter((l) => fold(l.unit || l.label) === fold(name)).map((l) => l.amountCents)) : null;
    const al = byModality.find((m) => fold(m.label) === fold(name))?.qty ?? null;
    return {
      label: name, cents, alunos: al,
      ticket: cents !== null && al ? ind(cents / al, 'BRL', `Receita da modalidade ÷ alunos (${name})`, 'estimativa') : NA('BRL', `Receita da modalidade ÷ alunos (${name})`),
      ratio: cents !== null && revTotalMods ? cents / revTotalMods : null,
    };
  }).sort((a, b) => (b.cents ?? -1) - (a.cents ?? -1));

  // ── Tênis: parceria, nunca folha ───────────────────────────
  const tennisRev = modRev.filter((l) => /tenis/.test(fold(l.unit || l.label)));
  const tFat = ind(tennisRev.length ? sum(tennisRev.map((l) => l.amountCents)) : null, 'BRL', 'Faturamento bruto da modalidade Tênis');
  const tRep = ind(byKey(TENNIS_PARTNERSHIP_KEY), 'BRL', 'Σ repasse aos parceiros do Tênis (custo direto da modalidade, fora da folha)');
  const tenis = {
    faturamento: tFat,
    repasse: tRep,
    pctRepasse: ratio(tRep, tFat, 'Repasse ÷ faturamento do Tênis'),
    margem: minus(tFat, tRep, 'Faturamento do Tênis − repasse (antes dos demais custos)'),
    esperado: tFat.value === null ? NA('BRL', `${targets.tennisSharePct}% × faturamento do Tênis`) : ind(Math.round(tFat.value * targets.tennisSharePct / 100), 'BRL', `${targets.tennisSharePct}% × faturamento do Tênis (acordo de parceria)`, 'estimativa'),
  };

  // ── Lanchonete ─────────────────────────────────────────────
  const pdv = (k: string) => of('PDV_RESUMO').find((l) => l.key === k) ?? null;
  const fat = pick(pdv('faturamento')?.amountCents ?? null, 'lanchonete', 'BRL', 'Faturamento do PDV no mês');
  const vendas = ind(pdv('vendas')?.quantity ?? null, 'QTD', 'Nº de vendas no PDV');
  const pays = of('PDV_PAGAMENTO');
  const payTotal = pays.length ? sum(pays.map((l) => l.amountCents)) : null;
  const payments = PAYMENT_METHODS.map((m) => {
    const cents = sum(pays.filter((l) => (l.key ?? 'outros') === m.key).map((l) => l.amountCents));
    return { key: m.key, label: m.label, cents, ratio: fat.value ? cents / fat.value : payTotal ? cents / payTotal : null };
  }).filter((p) => pays.some((l) => (l.key ?? 'outros') === p.key));
  const tfCents = pays.some((l) => l.key === 'ticket_funcionario') ? sum(pays.filter((l) => l.key === 'ticket_funcionario').map((l) => l.amountCents)) : null;
  const ticketFuncionario = ind(tfCents, 'BRL', 'Ticket Funcionário (consumo interno/benefício, não é receita comercial)');
  const ca = pays.filter((l) => l.key === 'conta_assinada');
  const caByClass = new Map<string, number>();
  for (const l of ca) {
    const k = (String(l.meta?.contaAssinadaClasse ?? '') || 'NAO_CLASSIFICADO') as SignedAccountClass | 'NAO_CLASSIFICADO';
    caByClass.set(k, (caByClass.get(k) ?? 0) + (l.amountCents ?? 0));
  }
  const caTotal = ca.length ? sum(ca.map((l) => l.amountCents)) : null;
  // Conta Assinada só é comercial quando classificada como COMERCIAL.
  const caNonCommercial = ca.length ? sum(ca.filter((l) => String(l.meta?.contaAssinadaClasse ?? '') !== 'COMERCIAL').map((l) => l.amountCents)) : null;
  const compras = ind(byKey(CMV_PURCHASES_KEY), 'BRL', 'Σ "Materiais para revenda" (compras de insumos)');
  const lanchonete = {
    faturamento: fat,
    vendas,
    ticketMedio: fat.value !== null && vendas.value ? ind(fat.value / vendas.value, 'BRL', 'Faturamento do PDV ÷ nº de vendas') : NA('BRL', 'Faturamento do PDV ÷ nº de vendas'),
    cancelamentos: ind(pdv('cancelamentos')?.amountCents ?? null, 'BRL', 'Cancelamentos no PDV'),
    estornos: ind(pdv('estornos')?.amountCents ?? null, 'BRL', 'Estornos no PDV'),
    compras,
    ticketFuncionario,
    ticketFuncionarioPct: ratio(ticketFuncionario, fat, 'Ticket Funcionário ÷ faturamento do PDV'),
    contaAssinada: ind(caTotal, 'BRL', 'Σ Conta Assinada'),
    contaAssinadaPorClasse: [...caByClass.entries()].map(([key, cents]) => ({ key, label: key, cents, ratio: caTotal ? cents / caTotal : null })),
    contaAssinadaNaoComercial: ind(caNonCommercial, 'BRL', 'Conta Assinada não classificada como COMERCIAL'),
    vendasEfetivas: fat.value === null ? NA('BRL', 'Faturamento PDV − Ticket Funcionário − Conta Assinada não comercial')
      : ind(fat.value - (tfCents ?? 0) - (caNonCommercial ?? 0), 'BRL', 'Faturamento PDV − Ticket Funcionário − Conta Assinada não comercial'),
    payments,
    paymentsSum: ind(payTotal, 'BRL', 'Σ formas de pagamento'),
  };

  // ── Top produtos ───────────────────────────────────────────
  const prods = of('PDV_PRODUTO');
  const groupLabel = (k: string) => PRODUCT_GROUPS.find((g) => g.key === k)?.label ?? k;
  const topProdutos = [...prods].sort((a, b) => (b.amountCents ?? 0) - (a.amountCents ?? 0)).slice(0, 20).map((p, i) => {
    const g = p.key ?? 'outros';
    return {
      rank: i + 1, label: p.label, group: g, groupLabel: groupLabel(g),
      vendas: typeof p.meta?.vendas === 'number' ? (p.meta.vendas as number) : null, quantidade: p.quantity, cents: p.amountCents ?? 0,
      ratio: fat.value ? (p.amountCents ?? 0) / fat.value : null,
      interno: g === 'consumo_interno' || /almo[cç]o\s+funcion/i.test(p.label),
    };
  });
  const pg = new Map<string, number>();
  for (const p of prods) pg.set(p.key ?? 'outros', (pg.get(p.key ?? 'outros') ?? 0) + (p.amountCents ?? 0));
  const productGroups = [...pg.entries()].map(([key, cents]) => ({ key, label: groupLabel(key), cents, ratio: fat.value ? cents / fat.value : null })).sort((a, b) => b.cents - a.cents);

  // ── CMV ────────────────────────────────────────────────────
  const ei = pdv('estoque_inicial')?.amountCents ?? null;
  const ef = pdv('estoque_final')?.amountCents ?? null;
  let cmv: Metrics['cmv'];
  if (ei !== null && ef !== null && compras.value !== null) {
    const real = ind(ei + compras.value - ef, 'BRL', 'CMV real = estoque inicial + compras − estoque final');
    cmv = { metodo: 'real', valor: real, pct: ratio(real, fat, 'CMV real ÷ faturamento do PDV') };
  } else if (compras.value !== null) {
    const est = { ...compras, formula: 'CMV estimado por compras = compras de insumos (sem estoques)', status: 'estimativa' as const };
    cmv = { metodo: 'estimado_compras', valor: est, pct: ratio(est, fat, 'CMV estimado por compras = compras de insumos ÷ faturamento do PDV') };
  } else {
    const imp = fromIndicator('cmv_pct', 'PCT', 'CMV (%)');
    cmv = { metodo: null, valor: NA('BRL', 'CMV'), pct: imp ?? NA('PCT', 'Compras de insumos ÷ faturamento do PDV') };
  }

  // ── Payout ─────────────────────────────────────────────────
  const dist = pick(byKey(PAYOUT_KEYS.distribuicao), 'distribuicao', 'BRL', 'Σ distribuição de lucros');
  const ant = ind(byKey(PAYOUT_KEYS.antecipacao), 'BRL', 'Σ antecipação de lucros');
  const ret = ind(byKey(PAYOUT_KEYS.retiradas), 'BRL', 'Σ outras retiradas dos sócios');
  const payoutParts = [dist.status === 'informado' ? dist.value : null, ant.value, ret.value];
  const payoutTotalD = payoutParts.some((v) => v !== null) ? sum(payoutParts) : null;
  const payoutTotal = pick(payoutTotalD, 'payout', 'BRL', 'Distribuição + antecipação + retiradas (nunca é OPEX)');
  const payout = {
    distribuicao: dist, antecipacao: ant, retiradas: ret, total: payoutTotal,
    distribuicaoPct: ratio(dist, recebimentos, 'Distribuição de lucros ÷ recebimentos'),
    totalPct: ratio(payoutTotal, recebimentos, 'Payout total ÷ recebimentos'),
  };

  // ── Fluxo (não é lucro) ────────────────────────────────────
  const diferenca = minus(recebimentos, pagamentos, 'Recebimentos − pagamentos (diferença de caixa, não é lucro)');
  const inFlow = targets.payoutInFlow === 'total'
    ? { ind: payoutTotal, label: 'payout total (distribuição + antecipação + retiradas)' }
    : { ind: dist, label: 'distribuição de lucros (antecipações e retiradas continuam nos pagamentos)' };
  const pagamentosAntesPayout = minus(pagamentos, { ...inFlow.ind, value: inFlow.ind.value ?? 0 }, `Pagamentos − ${inFlow.label}`);
  const geracaoAntesPayout = minus(recebimentos, pagamentosAntesPayout, 'Recebimentos − pagamentos antes do payout (geração/consumo de caixa, não é lucro)');

  // ── Caixa: disponível ≠ a receber ──────────────────────────
  const cashLines = of('CAIXA');
  const avail = cashLines.filter((l) => (l.key ?? 'disponivel') === 'disponivel');
  const recv = cashLines.filter((l) => l.key === 'a_receber');
  const disponivel = total(avail.length ? sum(avail.map((l) => l.amountCents)) : null, 'caixa', 'Caixa disponível', 'Σ saldos das contas (só o disponível; recebíveis ficam fora)');
  const caixa = {
    disponivel,
    aReceber: ind(recv.length ? sum(recv.map((l) => l.amountCents)) : null, 'BRL', 'Σ previsto a receber (não entra no caixa disponível)'),
    accounts: cashLines.map((l) => ({ key: l.key ?? 'disponivel', kind: l.key ?? 'disponivel', label: [l.label, l.unit].filter(Boolean).join(' · '), cents: l.amountCents ?? 0, ratio: (l.key ?? 'disponivel') === 'disponivel' && disponivel.value ? (l.amountCents ?? 0) / disponivel.value : null })).sort((a, b) => b.cents - a.cents),
  };

  // ── Investimentos e financiamentos ─────────────────────────
  const inv = of('INVESTIMENTO');
  const investimentos = {
    total: pick(inv.length ? sum(inv.map((l) => l.amountCents)) : capexD || null, 'investimentos', 'BRL', inv.length ? 'Σ investimentos registrados' : 'Σ pagamentos classificados como CAPEX (obras, equipamentos)'),
    items: inv.map((l) => ({ label: l.label, key: l.key, cents: l.amountCents ?? 0, classification: l.classification, meta: l.meta ?? null })),
  };
  const financiamentos = of('FINANCIAMENTO').map((l) => ({ label: l.label, key: l.key, cents: l.amountCents, meta: l.meta ?? null }));

  const pessoalPctRecebimentos = ratio(pessoal, recebimentos, 'Custo de pessoal ÷ recebimentos');
  const m: Metrics = {
    recebimentos, receitaOperacional, receitaServicos, receitaVendas, entradasFinanceiras, revenueByCategory,
    pagamentos, expenseByCategory, capex: ind(capexD, 'BRL', 'Σ pagamentos CAPEX'),
    pessoal, pessoalComponents, pessoalExcluded,
    pessoalPctRecebimentos,
    pessoalPctServicos: ratio(pessoal, receitaServicos, 'Custo de pessoal ÷ receita de serviços'),
    servicosPorPessoal: receitaServicos.value !== null && pessoal.value ? ind(receitaServicos.value / pessoal.value, 'QTD', 'Receita de serviços ÷ custo de pessoal') : NA('QTD', 'Receita de serviços ÷ custo de pessoal'),
    custoPessoalPorAluno: pessoal.value !== null && alunosTotal.value ? ind(pessoal.value / alunosTotal.value, 'BRL', 'Custo de pessoal ÷ base de alunos') : NA('BRL', 'Custo de pessoal ÷ base de alunos'),
    tenis, lanchonete, topProdutos, productGroups, cmv, payout,
    fluxo: { diferenca, pagamentosAntesPayout, geracaoAntesPayout },
    caixa, alunos: { total: alunosTotal, byModality }, modalidades, investimentos, financiamentos,
    checks: [],
    source: lines.length === 0 ? 'vazio' : of('INDICADOR').length === 0 ? 'detalhado' : of('INDICADOR').length === lines.length ? 'importado' : 'misto',
  };
  m.checks = [...totalChecks, ...checks(m, targets, previous ?? null, cashLines)];
  return m;
}

/** Validações: só apontam o problema, nunca corrigem. */
function checks(m: Metrics, t: Targets, prev: Metrics | null, cashLines: FinLineData[]): Check[] {
  const out: Check[] = [];
  const L = m.lanchonete;
  if (L.paymentsSum.value !== null && L.faturamento.value !== null && Math.abs(L.paymentsSum.value - L.faturamento.value) > Math.max(100, L.faturamento.value * 0.005)) {
    out.push({ level: 'divergencia', key: 'pdv_formas', message: `Soma das formas de pagamento (${BRL(L.paymentsSum.value)}) ≠ faturamento do PDV (${BRL(L.faturamento.value)}).` });
  }
  const declared = cashLines.find((l) => l.meta?.totalInformado !== undefined);
  if (declared && m.caixa.disponivel.value !== null) {
    const total = Number(declared.meta!.totalInformado);
    if (Number.isFinite(total) && Math.abs(total - m.caixa.disponivel.value) > 100) out.push({ level: 'divergencia', key: 'caixa_soma', message: `Soma das contas (${BRL(m.caixa.disponivel.value)}) ≠ caixa consolidado informado (${BRL(total)}).` });
  }
  if (L.faturamento.value !== null && m.receitaVendas.value !== null && m.receitaVendas.status !== 'importado' && Math.abs(L.faturamento.value - m.receitaVendas.value) > Math.max(100, L.faturamento.value * 0.01)) {
    out.push({ level: 'conciliacao', key: 'pdv_vs_vendas', message: `PDV (${BRL(L.faturamento.value)}) × receita de vendas no financeiro (${BRL(m.receitaVendas.value)}): diferença de ${BRL(L.faturamento.value - m.receitaVendas.value)}.` });
  }
  if (m.tenis.repasse.value !== null && m.tenis.esperado.value !== null && Math.abs(m.tenis.repasse.value - m.tenis.esperado.value) > Math.max(100, m.tenis.esperado.value * 0.02)) {
    out.push({ level: 'atencao', key: 'tenis_repasse', message: `Repasse do Tênis (${BRL(m.tenis.repasse.value)}) difere de ${t.tennisSharePct}% do faturamento (${BRL(m.tenis.esperado.value)}).` });
  }
  if (prev && prev.pessoal.value && m.pessoal.value !== null) {
    const v = (m.pessoal.value - prev.pessoal.value) / prev.pessoal.value;
    if (Math.abs(v) * 100 > t.payrollVarAlertPct) out.push({ level: 'atencao', key: 'folha_var', message: `Custo de pessoal variou ${PCT(v)} em relação ao mês anterior.` });
  }
  if (prev && prev.cmv.pct.value !== null && m.cmv.pct.value !== null && Math.abs(m.cmv.pct.value - prev.cmv.pct.value) * 100 > t.cmvVarAlertPp) {
    out.push({ level: 'atencao', key: 'cmv_var', message: `CMV variou ${((m.cmv.pct.value - prev.cmv.pct.value) * 100).toFixed(1).replace('.', ',')} p.p. em relação ao mês anterior.` });
  }
  if (t.cmvMaxPct !== null && m.cmv.pct.value !== null && m.cmv.pct.value * 100 > t.cmvMaxPct) out.push({ level: 'meta', key: 'cmv_meta', message: `CMV ${PCT(m.cmv.pct.value)} acima da meta de ${t.cmvMaxPct}%.` });
  if (t.personnelMaxPct !== null && m.pessoalPctRecebimentos.value !== null && m.pessoalPctRecebimentos.value * 100 > t.personnelMaxPct) out.push({ level: 'meta', key: 'pessoal_meta', message: `Pessoal ${PCT(m.pessoalPctRecebimentos.value)} dos recebimentos, acima da meta de ${t.personnelMaxPct}%.` });
  if (t.cashMinCents !== null && m.caixa.disponivel.value !== null && m.caixa.disponivel.value < t.cashMinCents) out.push({ level: 'meta', key: 'caixa_meta', message: `Caixa disponível (${BRL(m.caixa.disponivel.value)}) abaixo do mínimo de ${BRL(t.cashMinCents)}.` });
  return out;
}

/** Indicadores comparáveis (cards, comparação e painel). */
export const KEY_INDICATORS: { key: string; label: string; get: (m: Metrics) => Ind }[] = [
  { key: 'recebimentos', label: 'Recebimentos', get: (m) => m.recebimentos },
  { key: 'receita_servicos', label: 'Receita de serviços', get: (m) => m.receitaServicos },
  { key: 'receita_vendas', label: 'Receita de vendas', get: (m) => m.receitaVendas },
  { key: 'pagamentos', label: 'Pagamentos', get: (m) => m.pagamentos },
  { key: 'geracao', label: 'Geração de caixa antes do payout', get: (m) => m.fluxo.geracaoAntesPayout },
  { key: 'diferenca', label: 'Recebimentos − pagamentos', get: (m) => m.fluxo.diferenca },
  { key: 'pessoal', label: 'Custo de pessoal', get: (m) => m.pessoal },
  { key: 'pessoal_pct', label: 'Pessoal ÷ recebimentos', get: (m) => m.pessoalPctRecebimentos },
  { key: 'payout', label: 'Payout total', get: (m) => m.payout.total },
  { key: 'lanchonete', label: 'Faturamento lanchonete', get: (m) => m.lanchonete.faturamento },
  { key: 'cmv_pct', label: 'CMV', get: (m) => m.cmv.pct },
  { key: 'alunos', label: 'Base de alunos', get: (m) => m.alunos.total },
  { key: 'caixa', label: 'Caixa disponível', get: (m) => m.caixa.disponivel },
  { key: 'investimentos', label: 'Investimentos', get: (m) => m.investimentos.total },
];

export interface CompareRow { key: string; label: string; unit: Ind['unit']; a: number | null; b: number | null; delta: number | null; deltaPct: number | null }
/** Mês A (anterior) × mês B (atual): variação absoluta e % (em p.p. para percentuais). */
export function compareMetrics(a: Metrics, b: Metrics): CompareRow[] {
  return KEY_INDICATORS.map(({ key, label, get }) => {
    const x = get(a); const y = get(b);
    const delta = x.value !== null && y.value !== null ? y.value - x.value : null;
    return { key, label, unit: y.unit, a: x.value, b: y.value, delta, deltaPct: delta !== null && x.value && x.unit !== 'PCT' ? delta / Math.abs(x.value) : null };
  });
}

/** Acumulado do ano só com os meses que existem (sem projetar os faltantes). */
export function yearToDate(months: { month: string; m: Metrics }[]) {
  const s = (get: (m: Metrics) => Ind) => {
    const vals = months.map(({ m }) => get(m).value).filter((v): v is number => v !== null);
    return { value: vals.length ? vals.reduce((a, b) => a + b, 0) : null, months: vals.length };
  };
  const last = <T,>(get: (m: Metrics) => T) => (months.length ? get(months[months.length - 1]!.m) : null);
  const cmvs = months.map(({ m }) => m.cmv.pct.value).filter((v): v is number => v !== null);
  const rec = s((m) => m.recebimentos);
  return {
    months: months.map((x) => x.month),
    recebimentos: rec,
    mediaMensal: rec.value !== null && rec.months ? rec.value / rec.months : null,
    receitaServicos: s((m) => m.receitaServicos),
    receitaVendas: s((m) => m.receitaVendas),
    pagamentos: s((m) => m.pagamentos),
    pessoal: s((m) => m.pessoal),
    payout: s((m) => m.payout.total),
    investimentos: s((m) => m.investimentos.total),
    lanchonete: s((m) => m.lanchonete.faturamento),
    cmvMedio: cmvs.length ? cmvs.reduce((a, b) => a + b, 0) / cmvs.length : null,
    caixaAtual: last((m) => m.caixa.disponivel.value),
    alunosAtual: last((m) => m.alunos.total.value),
  };
}
