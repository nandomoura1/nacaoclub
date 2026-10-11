import { z } from 'zod/v4';
import { askModel, isFake } from '@/server/ai/workout-generator';
import { ADJUSTABLE, INCLUDABLE, validateAdjustments, type ContextPlan, type LineWithId, type RawAdjustment } from '@/domain/financeiro/context-adjust';
import { DATASETS, type CategoryDef } from '@/domain/financeiro/taxonomy';

/**
 * Passo 1 do relatório: a IA lê o contexto dos sócios e decide como ele muda
 * os DADOS do mês (não só o texto). O resultado é validado contra as linhas
 * reais antes de valer; os originais nunca são alterados.
 */

const PlanSchema = z.object({
  ajustes: z.array(z.object({
    tipo: z.enum(['EXCLUIR', 'AJUSTAR_VALOR', 'RECLASSIFICAR', 'INCLUIR']),
    linha: z.string().nullable().describe('Código da linha (ex.: "L12"). Nulo só em INCLUIR.'),
    conjunto: z.string().nullable().describe(`Só em INCLUIR: ${INCLUDABLE.join(', ')}.`),
    categoria: z.string().nullable().describe('Chave da categoria (RECLASSIFICAR; opcional em INCLUIR).'),
    descricao: z.string().nullable().describe('Só em INCLUIR: nome do lançamento.'),
    valor: z.number().nullable().describe('Em reais (ex.: 1234.56). AJUSTAR_VALOR: valor que deve ser considerado. INCLUIR: valor incluído.'),
    motivo: z.string().describe('Uma frase: por que, do ponto de vista dos sócios.'),
    trechoDoContexto: z.string().describe('Trecho do contexto que justifica.'),
  })),
  somenteLeitura: z.array(z.string()).describe('Pontos do contexto que não mudam números, só a interpretação.'),
});

const SYSTEM = `Você prepara os dados do relatório financeiro mensal da Nação Club a partir do CONTEXTO DOS SÓCIOS.
O contexto é o ponto de vista de quem conhece o negócio e deve mudar a ESTRUTURA do relatório, não só o texto. Para cada afirmação do contexto, decida se ela muda quais valores o relatório deve considerar:
- EXCLUIR: o lançamento não deve contar neste mês (pontual, de outro mês, aporte, transferência entre contas, valor duplicado, despesa de outra empresa…).
- AJUSTAR_VALOR: o lançamento conta, mas por outro valor (ex.: só parte pertence ao mês; o resto é pontual). Informe o valor a considerar.
- RECLASSIFICAR: o lançamento está na categoria errada para a leitura dos sócios (ex.: obra lançada como manutenção → reforma/investimento; retirada de sócio lançada como despesa → distribuição). Use só chaves de categoria da lista, do mesmo tipo (receita↔receita, despesa↔despesa).
- INCLUIR: algo que os sócios afirmam com valor explícito e que não está nos dados (ex.: "o repasse de R$ 4.000 do tênis foi pago em dinheiro e não aparece no extrato").
Regras:
- Só ajuste quando o contexto sustentar claramente; cite o trecho. Na dúvida, ponha o ponto em "somenteLeitura".
- Nunca invente valores: valores vêm do contexto ou dos próprios dados (ex.: excluir a linha inteira). Se o contexto fala de um valor que não bate com nenhuma linha, não force: explique em "somenteLeitura".
- Totais de relatório importado (conjunto INDICADOR) prevalecem sobre o detalhe: se o ajuste muda um total declarado, ajuste também essa linha.
- Não mexa em estoque nem em produtos do PDV.
- Responda em português do Brasil.`;

const money = (c: number | null) => (c === null ? '—' : `R$ ${(c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

export async function planContext(context: string, lines: LineWithId[], categories: (CategoryDef & { active?: boolean })[], extra: { managerNotes: string | null; partnerDecisions: string | null }): Promise<ContextPlan> {
  const usable = lines.filter((l) => ADJUSTABLE.includes(l.dataset));
  const refs = new Map(usable.map((l, i) => [`L${i + 1}`, l]));
  const generatedAt = new Date().toISOString();
  if (isFake()) return { context, generatedAt, model: 'exemplo local', items: [], readingOnly: ['Exemplo local (AI_FAKE): nenhum ajuste.'] };
  const ds = (d: string) => DATASETS.find((x) => x.id === d)?.label ?? d;
  const cat = new Map(categories.map((c) => [c.key, c.label]));
  const payload = {
    contextoDosSocios: context,
    observacoesDoGestor: extra.managerNotes || 'nenhuma',
    decisoesDosSocios: extra.partnerDecisions || 'nenhuma',
    categorias: categories.filter((c) => c.active !== false).map((c) => `${c.key} [${c.kind}] ${c.label}`),
    linhas: [...refs].map(([ref, l]) => `${ref} · ${ds(l.dataset)} · ${l.key ? `${cat.get(l.key) ?? l.key} (${l.key}) · ` : ''}${l.label}${l.unit ? ` [${l.unit}]` : ''}: ${money(l.amountCents)}${typeof l.meta?.nota === 'string' ? ` — explicação do gestor: ${l.meta.nota}` : ''}`),
  };
  const out = await askModel(PlanSchema, SYSTEM, `Dados do mês e contexto:\n${JSON.stringify(payload, null, 1)}`, 8000);
  const { items, rejected } = validateAdjustments(out.ajustes as RawAdjustment[], refs, categories);
  return { context, generatedAt, model: 'claude-opus-5-5', items, readingOnly: [...out.somenteLeitura, ...rejected.map((r) => `Ajuste não aplicado — ${r}`)] };
}
