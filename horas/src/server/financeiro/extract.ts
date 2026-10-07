import type Anthropic from '@anthropic-ai/sdk';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { z } from 'zod/v4';
import { AppError } from '@/server/errors';
import { askModel, isFake } from '@/server/ai/workout-generator';
import {
  DATASETS, DEFAULT_CATEGORIES, PAYMENT_METHODS, PDV_SUMMARY_KEYS, PRODUCT_GROUPS, SIGNED_ACCOUNT_CLASSES, SUMMARY_INDICATORS,
  type Dataset, type DocKind,
} from '@/domain/financeiro/taxonomy';

/**
 * Extração dos documentos do Relatório Financeiro pela IA. A IA só LÊ e
 * classifica: devolve linhas com a origem (página/linha/célula, valor
 * original, regra). Nada vira definitivo sem a conferência humana, e os
 * cálculos são todos do motor (domain/financeiro/metrics).
 */

export const MAX_FILE_BYTES = 6 * 1024 * 1024;
export const ACCEPTED = /\.(pdf|xlsx|csv|png|jpe?g|webp|docx|txt|md|markdown|html?)$/i;
const MAX_TEXT = 300_000;

type Block = Anthropic.Beta.BetaContentBlockParam;

const strip = (html: string) => html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, '\n').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/[ \t]+/g, ' ').replace(/\n\s+/g, '\n').trim();

async function xlsxText(bytes: Buffer): Promise<string> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes as unknown as ArrayBuffer);
  const out: string[] = [];
  for (const ws of wb.worksheets) {
    out.push(`### Aba "${ws.name}"`);
    ws.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: false }, (c) => {
        const v = c.value as unknown;
        const val = v && typeof v === 'object' && 'result' in (v as object) ? (v as { result: unknown }).result
          : v && typeof v === 'object' && 'richText' in (v as object) ? (v as { richText: { text: string }[] }).richText.map((t) => t.text).join('')
          : v instanceof Date ? v.toISOString().slice(0, 10) : v;
        if (val !== null && val !== undefined && String(val).trim() !== '') cells.push(`${c.address}=${String(val).trim()}`);
      });
      if (cells.length) out.push(cells.join(' | '));
    });
  }
  return out.join('\n');
}

async function docxText(bytes: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file('word/document.xml')?.async('string');
  if (!xml) throw new AppError('DOCX sem conteúdo legível.');
  return xml.replace(/<w:tab\/>/g, '\t').replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\n{3,}/g, '\n\n').trim();
}

/** Arquivo → blocos para o modelo. PDF e imagem vão como estão; o resto vira texto com referência de linha/célula. */
export async function fileToBlocks(f: { bytes: Buffer; mimeType: string; filename: string }): Promise<Block[]> {
  const name = f.filename.toLowerCase();
  const text = (t: string, how: string): Block[] => {
    if (!t.trim()) throw new AppError(`Não encontrei texto em ${f.filename}.`);
    if (t.length > MAX_TEXT) throw new AppError(`${f.filename} tem texto demais para ler de uma vez (${Math.round(t.length / 1000)} mil caracteres). Envie em partes.`);
    return [{ type: 'text', text: `Arquivo: ${f.filename} (${how})\n\n${t}` }];
  };
  if (name.endsWith('.pdf') || f.mimeType === 'application/pdf') {
    return [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: f.bytes.toString('base64') }, title: f.filename }];
  }
  if (/\.(png|jpe?g|webp)$/.test(name)) {
    const media = name.endsWith('.png') ? 'image/png' : name.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    return [{ type: 'image', source: { type: 'base64', media_type: media, data: f.bytes.toString('base64') } }, { type: 'text', text: `Imagem: ${f.filename}` }];
  }
  if (name.endsWith('.xlsx')) return text(await xlsxText(f.bytes), 'planilha; cada valor vem com a célula, ex.: B12=1500');
  if (name.endsWith('.csv')) return text(f.bytes.toString('utf8').split(/\r?\n/).map((l, i) => `L${i + 1}: ${l}`).join('\n'), 'CSV; cada linha vem com o número, ex.: L12');
  if (name.endsWith('.docx')) return text(await docxText(f.bytes), 'documento Word');
  if (/\.html?$/.test(name)) return text(strip(f.bytes.toString('utf8')), 'HTML convertido em texto');
  return text(f.bytes.toString('utf8').split(/\r?\n/).map((l, i) => `L${i + 1}: ${l}`).join('\n'), 'texto; cada linha vem com o número');
}

const DATASET_IDS = DATASETS.map((d) => d.id) as [Dataset, ...Dataset[]];
export const ExtractionSchema = z.object({
  competencia: z.string().nullable().describe('Competência AAAA-MM que o documento indica (ou null se não indicar).'),
  tipoIdentificado: z.string().describe('Que documento é este, em poucas palavras (ex.: "DRE de pagamentos do Conta Azul, agosto/2026").'),
  linhas: z.array(z.object({
    dataset: z.enum(DATASET_IDS),
    chave: z.string().nullable().describe('Categoria/chave conforme as listas do sistema; null quando não se aplica.'),
    rotulo: z.string().describe('Descrição como aparece no documento (ou o nome do produto/conta/modalidade).'),
    unidade: z.string().nullable().describe('Modalidade (ALUNOS/MODALIDADE), banco/conta (CAIXA) ou null.'),
    valorReais: z.number().nullable().describe('Valor em reais (positivo; estorno de receita negativo). null quando o dado é quantidade.'),
    quantidade: z.number().nullable().describe('Quantidade (alunos, nº de vendas, unidades vendidas, percentuais de relatório). null se não houver.'),
    classificacao: z.string().nullable().describe('OPEX, CAPEX, FINANCEIRO, DISTRIBUICAO, AJUSTE ou RECEITA quando fizer sentido; senão null.'),
    contaAssinadaClasse: z.enum(SIGNED_ACCOUNT_CLASSES).nullable().describe('Só para Conta Assinada: classe do lançamento, se o documento permitir saber; senão null.'),
    vendas: z.number().nullable().describe('Só para produtos: nº de vendas (tickets) do produto, se houver.'),
    origem: z.string().describe('Onde está: "página 2", "linha 14", "célula C12", "seção Receitas".'),
    valorOriginal: z.string().describe('O texto/valor exatamente como aparece no documento.'),
    regra: z.string().describe('Por que foi classificado assim (1 frase).'),
  })),
  avisos: z.array(z.string()).describe('Inconsistências ou dúvidas encontradas (totais que não batem, valores ilegíveis, categorias ambíguas).'),
  observacoes: z.string().nullable().describe('Só em relatório anterior: conclusões/observações escritas no relatório, resumidas. Senão null.'),
});
export type Extraction = z.infer<typeof ExtractionSchema>;

const categories = DEFAULT_CATEGORIES.map((c) => `- ${c.key}: ${c.label} (${c.kind}${c.personnel ? ', custo de pessoal' : ''}${c.operatingRevenue || c.kind === 'DESPESA' ? '' : ', NÃO é receita operacional'})`).join('\n');

export const EXTRACTION_SYSTEM = `Você extrai dados de documentos financeiros e operacionais da Nação Club (complexo esportivo em Brasília) para a base histórica do sistema Nação ADM. Você só LÊ e CLASSIFICA: nunca calcula indicadores, nunca estima, nunca completa lacunas e nunca usa dados de outros meses. Se um valor não estiver no documento, não crie a linha. Todo valor precisa da origem (página/linha/célula) e do texto original.

# Datasets
- RECEITA: recebimentos por categoria (DRE de recebimentos). chave = categoria de receita.
- DESPESA: pagamentos por categoria (DRE de pagamentos). chave = categoria de despesa.
- MODALIDADE: faturamento por modalidade (unidade = nome da modalidade, ex.: "Nação Fit", "Tênis Saibro").
- ALUNOS: alunos/matrículas por modalidade (unidade = modalidade, quantidade = nº).
- PDV_RESUMO: resumo da lanchonete. chave ∈ {${PDV_SUMMARY_KEYS.join(', ')}}. faturamento/cancelamentos/estornos/estoques em valorReais; vendas = nº de vendas em quantidade.
- PDV_PAGAMENTO: formas de pagamento do PDV. chave ∈ {${PAYMENT_METHODS.map((p) => p.key).join(', ')}}.
- PDV_PRODUTO: produtos vendidos (rotulo = produto; chave = grupo ∈ {${PRODUCT_GROUPS.map((g) => g.key).join(', ')}}; quantidade = unidades; vendas = nº de vendas; valorReais = faturamento do produto).
- CAIXA: saldos (rotulo = banco, unidade = conta). chave = "disponivel" para saldo em conta/aplicação; "a_receber" para recebíveis/previsto a receber (NUNCA misture).
- INVESTIMENTO: investimentos (estacionamento, sala HYROX, equipamentos, vestiário, obras, máquinas…), classificacao CAPEX ou OPEX.
- FINANCIAMENTO: empréstimos, aportes, financiamentos, crédito de sócios (chave = emprestimo | aporte | financiamento | credito_socio).
- INDICADOR: só para RELATÓRIOS ANTERIORES já prontos: indicadores consolidados. chave ∈ {${SUMMARY_INDICATORS.map((i) => i.key).join(', ')}} (cmv_pct em quantidade = número do percentual, ex.: 38.5; alunos em quantidade; o resto em valorReais).

# Categorias de receita e despesa (use exatamente estas chaves)
${categories}

# Regras da Nação (obrigatórias)
- Pagamento aos professores/parceiros do Tênis é PARCERIA (40% do faturamento bruto da modalidade): chave parceria.tenis — nunca pessoal.*.
- IRRF retido de funcionário: pessoal.irrf (recolhimento, não é custo adicional). Adiantamento salarial: pessoal.adiantamento.
- Distribuição de lucros: payout.distribuicao; antecipação de lucros: payout.antecipacao; outras retiradas de sócios: payout.retiradas. Nunca OPEX.
- Compras de insumos da lanchonete / mercadorias para revenda: desp.materiais_revenda.
- Aporte de sócio e empréstimo/financiamento recebido NÃO são receita operacional: rec.aporte / rec.emprestimo.
- Ticket Funcionário é consumo interno (forma de pagamento ticket_funcionario), não venda comercial. "Almoço Funcionários" é produto do grupo consumo_interno.
- Conta Assinada: se o documento mostrar de quem é o consumo (funcionário, sócio, compensação…), preencha contaAssinadaClasse; se não der para saber, deixe null (o gestor classifica).
- Valores monetários em reais com até 2 casas, sem arredondar o que está escrito. Se houver subtotais e linhas de detalhe, extraia as linhas de detalhe (não some você mesmo) — e cite o total do documento em "avisos" se ele não bater com a soma.
- Em relatório anterior, extraia também detalhes que estejam escritos (alunos por modalidade, contas de caixa, formas de pagamento, top produtos) nos datasets próprios; e os totais prontos como INDICADOR.`;

const KIND_HINT: Record<DocKind, string> = {
  DRE_RECEBIMENTOS: 'DRE / recebimentos do mês (Conta Azul): extraia RECEITA por categoria; faturamento por modalidade, se houver, em MODALIDADE.',
  DRE_PAGAMENTOS: 'DRE / pagamentos do mês (Conta Azul): extraia DESPESA por categoria; investimentos identificáveis também em INVESTIMENTO.',
  PDV: 'Relatório do PDV da lanchonete: PDV_RESUMO (faturamento, nº de vendas, cancelamentos, estornos, estoques se houver).',
  PRODUTOS: 'Produtos vendidos no PDV: PDV_PRODUTO, um por produto, com grupo.',
  FORMAS_PAGAMENTO: 'Formas de pagamento do PDV: PDV_PAGAMENTO, uma por forma (Conta Assinada separada por classe quando possível).',
  CAIXA: 'Posição de caixa: CAIXA, uma linha por conta (disponível × a receber).',
  ALUNOS: 'Base de alunos: ALUNOS, uma linha por modalidade.',
  OUTROS: 'Documento diverso: extraia o que se encaixar nos datasets (investimentos, financiamentos, receitas, despesas…).',
  RELATORIO_ANTERIOR: 'Relatório financeiro mensal já produzido: extraia a competência, os indicadores consolidados (INDICADOR) e os detalhes escritos; resuma conclusões em observacoes.',
};

export async function extractDocument(kind: DocKind, blocks: Block[], monthHint: string | null): Promise<Extraction> {
  if (isFake()) return fakeExtraction(kind, monthHint);
  const user: Block[] = [
    ...blocks,
    { type: 'text', text: `Tipo informado pelo usuário: ${kind} — ${KIND_HINT[kind]}\n${monthHint ? `Competência informada: ${monthHint} (confira com o documento; se divergir, avise).` : 'Identifique a competência no documento.'}\nExtraia as linhas.` },
  ];
  return askModel(ExtractionSchema, EXTRACTION_SYSTEM, user, 32000);
}

/** Extração de exemplo (AI_FAKE=1): números fictícios por tipo, para desenvolvimento e testes. */
export function fakeExtraction(kind: DocKind, month: string | null): Extraction {
  const l = (dataset: Dataset, chave: string | null, rotulo: string, valorReais: number | null, extra: Partial<Extraction['linhas'][number]> = {}): Extraction['linhas'][number] => ({
    dataset, chave, rotulo, unidade: null, valorReais, quantidade: null, classificacao: null, contaAssinadaClasse: null, vendas: null,
    origem: 'exemplo local', valorOriginal: valorReais === null ? '' : String(valorReais), regra: 'exemplo (AI_FAKE)', ...extra,
  });
  const linhas: Extraction['linhas'] = {
    DRE_RECEBIMENTOS: [l('RECEITA', 'rec.servicos', 'Receitas de serviços', 50000), l('RECEITA', 'rec.vendas', 'Receitas de vendas', 15000), l('MODALIDADE', null, 'Tênis', 4000, { unidade: 'Tênis' })],
    DRE_PAGAMENTOS: [l('DESPESA', 'pessoal.salarios', 'Salários', 12000), l('DESPESA', 'pessoal.irrf', 'IRRF', 800), l('DESPESA', 'parceria.tenis', 'Parceria Tênis', 1600), l('DESPESA', 'payout.distribuicao', 'Distribuição de lucros', 6000), l('DESPESA', 'desp.materiais_revenda', 'Mercadorias para revenda', 6500)],
    PDV: [l('PDV_RESUMO', 'faturamento', 'Faturamento', 17000), l('PDV_RESUMO', 'vendas', 'Vendas', null, { quantidade: 700 })],
    PRODUTOS: [l('PDV_PRODUTO', 'refeicoes', 'Prato executivo', 3000, { quantidade: 100, vendas: 95 }), l('PDV_PRODUTO', 'consumo_interno', 'Almoço Funcionários', 1800, { quantidade: 90 })],
    FORMAS_PAGAMENTO: [l('PDV_PAGAMENTO', 'pix', 'PIX', 10000), l('PDV_PAGAMENTO', 'credito', 'Crédito', 5200), l('PDV_PAGAMENTO', 'ticket_funcionario', 'Ticket Funcionário', 1800)],
    CAIXA: [l('CAIXA', 'disponivel', 'Banco Exemplo', 30000, { unidade: 'Conta corrente' })],
    ALUNOS: [l('ALUNOS', null, 'Modalidade A', null, { unidade: 'Modalidade A', quantidade: 90 }), l('ALUNOS', null, 'Tênis', null, { unidade: 'Tênis', quantidade: 12 })],
    OUTROS: [l('INVESTIMENTO', 'equipamentos', 'Equipamentos', 2000, { classificacao: 'CAPEX' })],
    RELATORIO_ANTERIOR: [l('INDICADOR', 'recebimentos', 'Recebimentos', 60000), l('INDICADOR', 'pagamentos', 'Pagamentos', 55000), l('INDICADOR', 'alunos', 'Base de alunos', null, { quantidade: 210 })],
  }[kind];
  return { competencia: month, tipoIdentificado: `Exemplo local (${kind})`, linhas, avisos: [], observacoes: kind === 'RELATORIO_ANTERIOR' ? 'Exemplo local de conclusões.' : null };
}

/** Linha extraída → linha do banco (centavos; meta com Conta Assinada e nº de vendas). */
export function toLineInput(x: Extraction['linhas'][number]) {
  const meta: Record<string, unknown> = {};
  if (x.contaAssinadaClasse) meta.contaAssinadaClasse = x.contaAssinadaClasse;
  if (x.vendas !== null && x.vendas !== undefined) meta.vendas = x.vendas;
  return {
    dataset: x.dataset, key: x.chave?.trim() || null, label: x.rotulo.trim().slice(0, 200) || '(sem rótulo)', unit: x.unidade?.trim().slice(0, 120) || null,
    amountCents: x.valorReais === null ? null : Math.round(x.valorReais * 100), quantity: x.quantidade,
    classification: x.classificacao?.trim() || null, meta: Object.keys(meta).length ? meta : null,
    sourceRef: x.origem.slice(0, 200), sourceValue: x.valorOriginal.slice(0, 300), rule: x.regra.slice(0, 300),
  };
}
