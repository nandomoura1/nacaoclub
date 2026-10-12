import { z } from 'zod/v4';
import { askModel, isFake } from '@/server/ai/workout-generator';
import { KEY_INDICATORS, compareMetrics, type FinLineData, type Ind, type Metrics } from '@/domain/financeiro/metrics';
import { exclusionsView, type Exclusion } from '@/domain/financeiro/adjustments';
import { ADJ_KINDS, type adjustmentEffects, type ContextPlan } from '@/domain/financeiro/context-adjust';
import { DATASETS, DEFAULT_CATEGORIES, DOC_KINDS } from '@/domain/financeiro/taxonomy';

/**
 * Análise executiva do Relatório Financeiro. A IA recebe os indicadores já
 * calculados pelo motor e escreve texto — nunca recalcula nem altera números,
 * nunca chama fluxo de caixa de lucro, e separa dado financeiro de observação
 * do gestor.
 */

export const SECTION_KEYS = [
  'recebimentos', 'alunos', 'pagamentos', 'pessoal', 'tenis', 'lanchonete', 'formasPagamento', 'ticketFuncionario',
  'topProdutos', 'cmv', 'investimentos', 'payout', 'fluxo', 'caixa',
] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export const AnalysisSchema = z.object({
  resumoExecutivo: z.string().describe('3 a 6 frases: o mês em uma leitura, só com números fornecidos.'),
  secoes: z.object(Object.fromEntries(SECTION_KEYS.map((k) => [k, z.string().describe('Comentário curto (1–3 frases) desta seção. "Dado não informado." se faltar base.')])) as Record<SectionKey, z.ZodString>),
  pontosPositivos: z.array(z.string()),
  pontosAtencao: z.array(z.string()),
  riscos: z.array(z.string()),
  resumoSocios: z.string().describe('Parágrafo curto para os sócios: receita, pagamentos, geração de caixa antes do payout, pessoal, payout, lanchonete/CMV, alunos, caixa, investimentos.'),
  conclusao: z.string().describe('Conclusão executiva em 2–4 frases.'),
});
export type Analysis = z.infer<typeof AnalysisSchema> & { model: string; generatedAt: string };

const SYSTEM = `Você é o analista financeiro da Nação Club (complexo esportivo em Brasília) e escreve a análise do relatório financeiro mensal para o gestor e os sócios, em português do Brasil, tom executivo, direto.

Regras absolutas:
- Use SOMENTE os números fornecidos no JSON (já ajustados pelo contexto dos sócios). Não recalcule, não arredonde de outro jeito, não invente valores, causas ou comparações. Copie os valores como vêm formatados.
- "Recebimentos − pagamentos" e "geração de caixa antes do payout" são indicadores de FLUXO FINANCEIRO: nunca chame de lucro ou prejuízo.
- Custo de pessoal é o custo econômico (sem IRRF retido, adiantamento, payout e a parceria do Tênis). A parceria do Tênis é custo direto da modalidade (repasse de 40%), não folha.
- Ticket Funcionário é consumo interno/benefício, não receita comercial. Conta Assinada só é venda quando classificada como comercial.
- CMV: diga qual metodologia foi usada ("estimado por compras" ou "real com estoques"). Estimativa é sempre chamada de estimativa.
- Base de alunos = matrículas/participações, não clientes únicos.
- Indicador "não informado" → escreva "Dado não informado." Quando houver dúvida, escreva "Dado requer validação."
- Observações do gestor e decisões dos sócios são CONTEXTO, não dado financeiro: cite como "segundo o gestor…" e não transforme em número nem em causa comprovada. Não transforme correlação em causalidade.
- Alertas (divergências, conciliações, metas) devem aparecer em pontos de atenção.
- CONTEXTO DOS SÓCIOS — É A LENTE DO RELATÓRIO, NÃO UM COMENTÁRIO: escreva o relatório inteiro sob o ponto de vista dos sócios. Os números que você recebe JÁ FORAM AJUSTADOS por esse contexto ("ajustesDoContexto": cada lançamento retirado, reclassificado, com valor ajustado ou incluído, com o motivo; "efeitoNosIndicadores": original → considerado). Então:
  • Analise os números considerados como os números do mês. Não volte aos valores originais na análise, exceto para explicar um ajuste relevante uma vez (ex.: "desconsiderando a obra do vestiário (R$ X), os pagamentos ficam em R$ Y").
  • Construa a leitura a partir das prioridades e explicações dos sócios: o que eles dizem ser pontual não é tendência nem risco; o que eles dizem ser estrutural pesa nas conclusões; o que eles pedem para observar ganha destaque no resumo, nos pontos de atenção e na conclusão.
  • Os pontos em "contextoSomenteLeitura" não mudam números, mas mudam a interpretação: use-os na construção de cada seção afetada.
  • O contexto é material de bastidor: NUNCA transcreva, resuma ou cite o texto dos sócios, e não use expressões como "segundo os sócios", "o contexto informa" ou "conforme o contexto". Escreva com voz própria de analista, como quem conhece o negócio.
  • Use o contexto para justificar resultados de forma leve e orgânica, dentro da frase que comenta o número (ex.: "os pagamentos recuam para R$ Y sem a obra pontual do vestiário"; "a folha sobe com as rescisões do mês, movimento que não se repete"). Uma menção curta basta; não repita a mesma justificativa em várias seções.
- ITENS DESCONSIDERADOS: os sócios retiraram estes itens deste relatório por estarem enviesados. Não analise, não cite valores, não compare e não use esses itens em resumo, pontos positivos, pontos de atenção, riscos, resumo dos sócios ou conclusão. Na seção correspondente escreva exatamente "Desconsiderado pelos sócios neste relatório: <motivo>."
- INFORMAÇÕES DO GESTOR ("informacoesDoGestor"): explicações escritas pelo gestor em contas específicas, lançamentos feitos à mão, correções com motivo, justificativas de conciliação e observações dos documentos. Considere TODAS ao comentar a seção correspondente (ex.: uma explicação numa conta de pessoal entra no comentário de pessoal) e nos pontos de atenção/riscos — elas explicam o número, não o alteram. Cite como "segundo o gestor…". Uma divergência justificada não deve ser tratada como problema em aberto.
- ESTOQUE: use a quantidade e o valor de cada produto (custo unitário, saldo, vendido no mês e cobertura em dias) para comentar capital parado em estoque, itens com cobertura alta ou sem venda e o efeito no CMV. Não some você mesmo: os totais já vêm prontos.
- CMV "ajustado pelo estoque" = compras − variação do estoque; o estoque cobre só os produtos controlados (produção própria e insumos indiretos ficam fora) e produtos com saldo negativo foram ignorados: sempre chame de estimativa.`;

const money = (c: number) => `R$ ${(c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmt = (i: Ind): string => {
  if (i.value === null) return 'não informado';
  const v = i.unit === 'BRL' ? money(i.value) : i.unit === 'PCT' ? `${(i.value * 100).toFixed(1).replace('.', ',')}%` : i.value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  return i.status === 'estimativa' ? `${v} (ESTIMATIVA)` : i.status === 'importado' ? `${v} (de relatório importado)` : v;
};

/** O que vai para a IA: só valores já formatados, com fórmula e estado. */
export function analysisInput(month: string, m: Metrics, prev: { month: string; m: Metrics } | null, notes: string | null, decisions: string | null, ctx: { partnerContext: string | null; exclusions: Exclusion[]; manual?: ManagerInputs; plan?: ContextPlan | null; effects?: ReturnType<typeof adjustmentEffects> } = { partnerContext: null, exclusions: [] }) {
  const pct = (r: number | null) => (r === null ? 'não informado' : `${(r * 100).toFixed(1).replace('.', ',')}%`);
  const ex = exclusionsView(ctx.exclusions);
  const est = m.estoque;
  const input = {
    competencia: month,
    indicadores: Object.fromEntries(KEY_INDICATORS.filter((k) => !ex.indicator(k.key)).map((k) => [k.label, fmt(k.get(m))])),
    recebimentosPorCategoria: m.revenueByCategory.map((r) => `${r.label}: ${money(r.cents)} (${pct(r.ratio)})`),
    pagamentosPorCategoria: m.expenseByCategory.slice(0, 15).map((r) => `${r.label} [${r.classification}]: ${money(r.cents)} (${pct(r.ratio)})`),
    pessoal: { total: fmt(m.pessoal), pctRecebimentos: fmt(m.pessoalPctRecebimentos), pctServicos: fmt(m.pessoalPctServicos), porAluno: fmt(m.custoPessoalPorAluno), foraDaFolha: m.pessoalExcluded.map((r) => `${r.label}: ${money(r.cents)}`) },
    tenis: { faturamento: fmt(m.tenis.faturamento), repasse: fmt(m.tenis.repasse), pctRepasse: fmt(m.tenis.pctRepasse), margem: fmt(m.tenis.margem) },
    lanchonete: {
      faturamento: fmt(m.lanchonete.faturamento), vendas: fmt(m.lanchonete.vendas), ticketMedio: fmt(m.lanchonete.ticketMedio),
      ticketFuncionario: fmt(m.lanchonete.ticketFuncionario), ticketFuncionarioPct: fmt(m.lanchonete.ticketFuncionarioPct),
      contaAssinadaNaoComercial: fmt(m.lanchonete.contaAssinadaNaoComercial), vendasEfetivas: fmt(m.lanchonete.vendasEfetivas),
      formas: m.lanchonete.payments.map((p) => `${p.label}: ${money(p.cents)} (${pct(p.ratio)})`),
      top5: m.topProdutos.slice(0, 5).map((p) => `${p.label}${p.interno ? ' [consumo interno]' : ''}: ${money(p.cents)}`),
    },
    cmv: {
      metodo: m.cmv.metodo === 'ajustado_estoque' ? 'ajustado pelo estoque (compras − variação do estoque; estimativa)' : m.cmv.metodo === 'real' ? 'real com estoques' : m.cmv.metodo === 'estimado_compras' ? 'estimado por compras' : 'não informado',
      valor: fmt(m.cmv.valor), pct: fmt(m.cmv.pct),
      estoque: est ? {
        inicial: fmt(est.inicial), final: fmt(est.final), variacao: fmt(est.variacao),
        fonteDoInicial: est.inicialFonte === 'mes_anterior' ? 'posição final do mês anterior' : est.inicialFonte === 'documento' ? 'posição do início do mês' : 'não informado',
        produtosComSaldoNegativoIgnorados: est.resumoFinal?.negative.count ?? 0,
        produtosValorizados: est.resumoFinal?.items ?? 0,
        unidadesEmEstoque: est.resumoFinal ? est.resumoFinal.units.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : 'não informado',
        produtosSemVendaNoMes: est.semVenda ? `${est.semVenda.count} produto(s), ${money(est.semVenda.cents)} parados` : 'sem ranking de produtos do PDV para comparar',
        porProduto: (est.itens ?? []).slice(0, 25).map((i) => `${i.label}: saldo ${i.qtyFinal ?? '—'} × custo ${i.unitCostCents === null ? '—' : money(i.unitCostCents)} = ${money(i.valueFinal)}${i.qtyInicial !== null ? ` (início do mês: ${i.qtyInicial})` : ''}${i.soldQty !== null ? ` · vendido no mês: ${i.soldQty}` : ''}${i.coverageDays !== null ? ` · cobertura ${i.coverageDays.toLocaleString('pt-BR')} dias` : ''}`),
      } : 'sem posição de estoque',
    },
    payout: { distribuicao: fmt(m.payout.distribuicao), antecipacao: fmt(m.payout.antecipacao), total: fmt(m.payout.total), totalPct: fmt(m.payout.totalPct) },
    fluxo: { diferenca: fmt(m.fluxo.diferenca), pagamentosAntesPayout: fmt(m.fluxo.pagamentosAntesPayout), geracaoAntesPayout: fmt(m.fluxo.geracaoAntesPayout) },
    caixa: { disponivel: fmt(m.caixa.disponivel), aReceber: fmt(m.caixa.aReceber), contas: m.caixa.accounts.map((a) => `${a.label} [${a.kind}]: ${money(a.cents)}`) },
    alunos: { total: fmt(m.alunos.total), porModalidade: m.alunos.byModality.map((a) => `${a.label}: ${a.qty}`) },
    investimentos: { total: fmt(m.investimentos.total), itens: m.investimentos.items.map((i) => `${i.label}: ${money(i.cents)}`) },
    alertas: m.checks.filter((c) => ex.keepCheck(c.key)).map((c) => `[${c.level}] ${c.message}`),
    comparacaoComMesAnterior: ex.has('comparacao') ? `Desconsiderada pelos sócios: ${ex.reason('comparacao')}` : prev ? {
      mesAnterior: prev.month,
      linhas: compareMetrics(prev.m, m).filter((r) => r.a !== null && r.b !== null && !ex.indicator(r.key)).map((r) => `${r.label}: ${r.unit === 'BRL' ? money(r.a!) : r.unit === 'PCT' ? pct(r.a) : r.a} → ${r.unit === 'BRL' ? money(r.b!) : r.unit === 'PCT' ? pct(r.b) : r.b}${r.deltaPct !== null ? ` (${r.deltaPct > 0 ? '+' : ''}${(r.deltaPct * 100).toFixed(1).replace('.', ',')}%)` : ''}`),
    } : 'sem mês anterior aprovado',
    observacoesDoGestor: notes || 'nenhuma',
    decisoesDosSocios: decisions || 'nenhuma',
    contextoDosSocios: ctx.partnerContext || 'nenhum',
    ajustesDoContexto: (ctx.plan?.items ?? []).filter((a) => a.active).map((a) => `${ADJ_KINDS.find((k) => k.id === a.kind)!.label}: ${a.label}${a.unit ? ` [${a.unit}]` : ''} — ${a.kind === 'EXCLUIR' ? `${a.fromCents === null ? '' : money(a.fromCents)} fora do mês` : a.kind === 'AJUSTAR_VALOR' ? `${a.fromCents === null ? '—' : money(a.fromCents)} → ${money(a.toCents ?? 0)}` : a.kind === 'RECLASSIFICAR' ? `${a.fromKey ?? 'sem categoria'} → ${a.toKey}` : `+ ${money(a.toCents ?? 0)}`}. Motivo: ${a.reason}`),
    efeitoNosIndicadores: (ctx.effects ?? []).map((e) => `${e.label}: ${e.unit === 'BRL' ? (e.from === null ? '—' : money(e.from)) : e.unit === 'PCT' ? pct(e.from) : e.from} → ${e.unit === 'BRL' ? (e.to === null ? '—' : money(e.to)) : e.unit === 'PCT' ? pct(e.to) : e.to}`),
    contextoSomenteLeitura: ctx.plan?.readingOnly.filter((r) => !r.startsWith('Ajuste não aplicado')) ?? [],
    informacoesDoGestor: ctx.manual && Object.values(ctx.manual).some((v) => v.length) ? ctx.manual : 'nenhuma',
    itensDesconsiderados: ex.list.map((e) => `${e.item.label} — motivo: ${e.reason}`),
  };
  // Os dados dos itens desconsiderados nem chegam à IA.
  const sectionData: Record<string, (keyof typeof input)[]> = {
    recebimentos: ['recebimentosPorCategoria'], pagamentos: ['pagamentosPorCategoria'], pessoal: ['pessoal'], tenis: ['tenis'], lanchonete: ['lanchonete'],
    cmv: ['cmv'], payout: ['payout'], fluxo: ['fluxo'], caixa: ['caixa'], alunos: ['alunos'], investimentos: ['investimentos'],
  };
  const out: Record<string, unknown> = { ...input };
  for (const e of ex.list) for (const k of sectionData[e.key] ?? []) out[k] = `DESCONSIDERADO pelos sócios: ${e.reason}`;
  return out as typeof input;
}

export async function generateAnalysis(input: ReturnType<typeof analysisInput>): Promise<Analysis> {
  const generatedAt = new Date().toISOString();
  if (isFake()) {
    return {
      resumoExecutivo: `Exemplo local (AI_FAKE): recebimentos ${input.indicadores['Recebimentos']}, pagamentos ${input.indicadores['Pagamentos']}.`,
      secoes: Object.fromEntries(SECTION_KEYS.map((k) => [k, 'Exemplo local.'])) as Record<SectionKey, string>,
      pontosPositivos: ['Exemplo local.'], pontosAtencao: input.alertas.length ? input.alertas : ['Sem alertas.'], riscos: ['Exemplo local.'],
      resumoSocios: 'Exemplo local.', conclusao: 'Exemplo local.', model: 'exemplo local', generatedAt,
    };
  }
  const out = await askModel(AnalysisSchema, SYSTEM, `Dados do mês (já calculados pelo sistema; não altere nenhum número):\n${JSON.stringify(input, null, 1)}`, 16000);
  return { ...out, model: 'claude-opus-5-5', generatedAt };
}

export interface ManagerInputs {
  explicacoesDeContas: string[];
  lancamentosManuais: string[];
  correcoes: string[];
  justificativasDeConciliacao: string[];
  observacoesDosDocumentos: string[];
}

/** Tudo o que o gestor escreveu à mão sobre os números do mês, em texto para a IA. */
export function managerInputs(
  lines: (FinLineData & { status: string })[], m: Metrics,
  recs: { key: string; justification: string }[], docs: { kind: string; filename: string; notes: string | null }[],
): ManagerInputs {
  const cat = new Map(DEFAULT_CATEGORIES.map((c) => [c.key, c.label]));
  const ds = (d: string) => DATASETS.find((x) => x.id === d)?.label ?? d;
  const val = (l: FinLineData) => [l.amountCents !== null ? money(l.amountCents) : null, l.quantity !== null ? `${l.quantity.toLocaleString('pt-BR')} un.` : null].filter(Boolean).join(' · ');
  const name = (l: FinLineData) => `${ds(l.dataset)} · ${l.key && cat.has(l.key) ? `${cat.get(l.key)} — ` : ''}${l.label}${l.unit ? ` (${l.unit})` : ''}: ${val(l)}`;
  const note = (l: FinLineData) => (typeof l.meta?.nota === 'string' ? l.meta.nota : null);
  const why = (l: FinLineData) => (typeof l.meta?.motivo === 'string' ? l.meta.motivo : null);
  const checkMsg = new Map(m.checks.map((c) => [c.key, c.message]));
  return {
    explicacoesDeContas: lines.filter((l) => note(l)).map((l) => `${name(l)} — explicação: ${note(l)}`),
    lancamentosManuais: lines.filter((l) => l.status === 'MANUAL').map((l) => `${name(l)}${why(l) ? ` — motivo: ${why(l)}` : ''}`),
    correcoes: lines.filter((l) => l.status === 'EDITED' && why(l)).map((l) => `${name(l)} — corrigido: ${why(l)}`),
    justificativasDeConciliacao: recs.map((r) => `${checkMsg.get(r.key) ?? r.key} — justificativa: ${r.justification}`),
    observacoesDosDocumentos: docs.filter((d) => d.notes).map((d) => `${DOC_KINDS.find((k) => k.id === d.kind)?.label ?? d.kind} (${d.filename}): ${d.notes}`),
  };
}
