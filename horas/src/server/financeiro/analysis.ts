import { z } from 'zod/v4';
import { askModel, isFake } from '@/server/ai/workout-generator';
import { KEY_INDICATORS, compareMetrics, type Ind, type Metrics } from '@/domain/financeiro/metrics';

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
- Use SOMENTE os números fornecidos no JSON. Não recalcule, não arredonde de outro jeito, não invente valores, causas ou comparações. Copie os valores como vêm formatados.
- "Recebimentos − pagamentos" e "geração de caixa antes do payout" são indicadores de FLUXO FINANCEIRO: nunca chame de lucro ou prejuízo.
- Custo de pessoal é o custo econômico (sem IRRF retido, adiantamento, payout e a parceria do Tênis). A parceria do Tênis é custo direto da modalidade (repasse de 40%), não folha.
- Ticket Funcionário é consumo interno/benefício, não receita comercial. Conta Assinada só é venda quando classificada como comercial.
- CMV: diga qual metodologia foi usada ("estimado por compras" ou "real com estoques"). Estimativa é sempre chamada de estimativa.
- Base de alunos = matrículas/participações, não clientes únicos.
- Indicador "não informado" → escreva "Dado não informado." Quando houver dúvida, escreva "Dado requer validação."
- Observações do gestor e decisões dos sócios são CONTEXTO, não dado financeiro: cite como "segundo o gestor…" e não transforme em número nem em causa comprovada. Não transforme correlação em causalidade.
- Alertas (divergências, conciliações, metas) devem aparecer em pontos de atenção.`;

const money = (c: number) => `R$ ${(c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmt = (i: Ind): string => {
  if (i.value === null) return 'não informado';
  const v = i.unit === 'BRL' ? money(i.value) : i.unit === 'PCT' ? `${(i.value * 100).toFixed(1).replace('.', ',')}%` : i.value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  return i.status === 'estimativa' ? `${v} (ESTIMATIVA)` : i.status === 'importado' ? `${v} (de relatório importado)` : v;
};

/** O que vai para a IA: só valores já formatados, com fórmula e estado. */
export function analysisInput(month: string, m: Metrics, prev: { month: string; m: Metrics } | null, notes: string | null, decisions: string | null) {
  const pct = (r: number | null) => (r === null ? 'não informado' : `${(r * 100).toFixed(1).replace('.', ',')}%`);
  return {
    competencia: month,
    indicadores: Object.fromEntries(KEY_INDICATORS.map((k) => [k.label, fmt(k.get(m))])),
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
    cmv: { metodo: m.cmv.metodo ?? 'não informado', pct: fmt(m.cmv.pct) },
    payout: { distribuicao: fmt(m.payout.distribuicao), antecipacao: fmt(m.payout.antecipacao), total: fmt(m.payout.total), totalPct: fmt(m.payout.totalPct) },
    fluxo: { diferenca: fmt(m.fluxo.diferenca), pagamentosAntesPayout: fmt(m.fluxo.pagamentosAntesPayout), geracaoAntesPayout: fmt(m.fluxo.geracaoAntesPayout) },
    caixa: { disponivel: fmt(m.caixa.disponivel), aReceber: fmt(m.caixa.aReceber), contas: m.caixa.accounts.map((a) => `${a.label} [${a.kind}]: ${money(a.cents)}`) },
    alunos: { total: fmt(m.alunos.total), porModalidade: m.alunos.byModality.map((a) => `${a.label}: ${a.qty}`) },
    investimentos: { total: fmt(m.investimentos.total), itens: m.investimentos.items.map((i) => `${i.label}: ${money(i.cents)}`) },
    alertas: m.checks.map((c) => `[${c.level}] ${c.message}`),
    comparacaoComMesAnterior: prev ? {
      mesAnterior: prev.month,
      linhas: compareMetrics(prev.m, m).filter((r) => r.a !== null && r.b !== null).map((r) => `${r.label}: ${r.unit === 'BRL' ? money(r.a!) : r.unit === 'PCT' ? pct(r.a) : r.a} → ${r.unit === 'BRL' ? money(r.b!) : r.unit === 'PCT' ? pct(r.b) : r.b}${r.deltaPct !== null ? ` (${r.deltaPct > 0 ? '+' : ''}${(r.deltaPct * 100).toFixed(1).replace('.', ',')}%)` : ''}`),
    } : 'sem mês anterior aprovado',
    observacoesDoGestor: notes || 'nenhuma',
    decisoesDosSocios: decisions || 'nenhuma',
  };
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
