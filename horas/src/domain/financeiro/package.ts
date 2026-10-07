import { isMonth, monthLabel, type Month } from '@/domain/condominio/months';
import type { Ind, Metrics } from './metrics';
import type { Dataset } from './taxonomy';

/**
 * Pacote histórico "nacao_financeiro_historico" (planilha com MANIFESTO,
 * COMPETENCIAS, METRICAS, ALUNOS, CAIXA, PRODUTOS_PDV, OBS_GERENCIAIS…).
 * Leitura determinística, sem IA. Regras do próprio pacote:
 * - célula vazia = não informado (nunca zero);
 * - tudo entra como "para conferir" (aprovação humana obrigatória);
 * - indicadores calculados (%, diferenças) não são importados: o motor
 *   recalcula e a tela compara com o valor da planilha.
 * Puro.
 */

export type Cell = string | number | boolean | Date | null;
export type Sheets = Record<string, Cell[][]>;

export const PACKAGE_SCHEMA = 'nacao_financeiro_historico';

export interface PackageLine {
  dataset: Dataset;
  key: string | null;
  label: string;
  unit: string | null;
  amountCents: number | null;
  quantity: number | null;
  classification: string | null;
  meta: Record<string, unknown> | null;
  sourceRef: string;
  sourceValue: string;
  rule: string;
}
export interface FileKpi { code: string; label: string; unit: Ind['unit']; file: number }
export interface PackageMonth {
  month: Month;
  importStatus: string | null;
  reference: string | null;
  approvedInFile: boolean;
  lines: PackageLine[];
  managerNotes: string[];
  partnerDecisions: string[];
  warnings: string[];
  fileKpis: FileKpi[];
}
export interface PackageResult {
  schemaVersion: string | null;
  months: PackageMonth[];
  rules: { code: string; known: boolean }[];
  warnings: string[];
}

// ── Mapeamento dos códigos de METRICAS ─────────────────────

type Target = { dataset: Dataset; key: string | null; label?: string; unit?: 'BRL' | 'QTD' };
const R = (key: string): Target => ({ dataset: 'RECEITA', key });
const D = (key: string): Target => ({ dataset: 'DESPESA', key });
const I = (key: string, unit: 'BRL' | 'QTD' = 'BRL'): Target => ({ dataset: 'INDICADOR', key, unit });
const P = (key: string, unit: 'BRL' | 'QTD' = 'BRL'): Target => ({ dataset: 'PDV_RESUMO', key, unit });

/** Código da planilha → linha do motor. */
export const METRIC_MAP: Record<string, Target> = {
  RECEBIMENTOS_TOTAL: I('recebimentos'), PAGAMENTOS_TOTAL: I('pagamentos'), CUSTO_PESSOAL: I('pessoal'), CAIXA_TOTAL: I('caixa'),
  INVESTIMENTOS_TOTAL: I('investimentos'), ALUNOS_TOTAL: I('alunos', 'QTD'),
  RECEITA_SERVICOS: R('rec.servicos'), RECEITA_VENDAS: R('rec.vendas'), ALUGUEL_PARCEIROS: R('rec.aluguel_parceiros'),
  MARKETING_PARCEIROS: R('rec.marketing'), MARKETING_PATROCINIOS: R('rec.marketing'), RATEIO_CONDOMINIO: R('rec.rateio_condominio'),
  EVENTOS: R('rec.eventos'), TAXAS: R('rec.taxas'), OUTRAS_RECEITAS: R('rec.outras'), ESTORNOS: R('rec.estornos'),
  APORTE: R('rec.aporte'), APORTE_SOCIOS: R('rec.aporte'), EMPRESTIMO: R('rec.emprestimo'), EMPRESTIMO_RECEBIDO: R('rec.emprestimo'),
  SALARIOS: D('pessoal.salarios'), FUNAP: D('pessoal.funap'), ESTAGIARIOS: D('pessoal.estagiarios'), VALE_TRANSPORTE: D('pessoal.vale_transporte'),
  FGTS: D('pessoal.fgts'), FERIAS: D('pessoal.ferias'), GRATIFICACOES: D('pessoal.gratificacoes'), RESCISOES: D('pessoal.rescisoes'),
  DECIMO_TERCEIRO: D('pessoal.decimo_terceiro'), ENCARGOS: D('pessoal.encargos'), IRRF: D('pessoal.irrf'), ADIANTAMENTO: D('pessoal.adiantamento'),
  TENIS_PARCEIROS: D('parceria.tenis'), MATERIAIS_REVENDA: D('desp.materiais_revenda'), ALUGUEL: D('desp.aluguel'), ENERGIA: D('desp.energia'),
  AGUA: D('desp.agua'), IMPOSTOS: D('desp.impostos'), PRESTADORES: D('desp.prestadores'), MATERIAIS_APLICADOS: D('desp.materiais_aplicados'),
  OBRAS: D('desp.obras'), EQUIPAMENTOS: D('desp.equipamentos'), CARTOES: D('desp.cartoes'), MANUTENCAO: D('desp.manutencao'),
  MARKETING: D('desp.marketing'), ADMINISTRATIVO: D('desp.administrativo'), OUTRAS_DESPESAS: D('desp.outras'),
  DISTRIBUICAO_LUCROS: D('payout.distribuicao'), ANTECIPACAO_LUCROS: D('payout.antecipacao'), RETIRADAS_SOCIOS: D('payout.retiradas'),
  PDV_FATURAMENTO: P('faturamento'), PDV_VENDAS: P('vendas', 'QTD'), PDV_CANCELAMENTOS: P('cancelamentos'), PDV_ESTORNOS: P('estornos'),
  PDV_ESTOQUE_INICIAL: P('estoque_inicial'), PDV_ESTOQUE_FINAL: P('estoque_final'),
  PREVISTO_RECEBER: { dataset: 'CAIXA', key: 'a_receber', label: 'Previsto a receber' },
};

/** Indicadores calculados: não entram como dado; o motor recalcula e a tela compara. */
export const DERIVED_KPIS: Record<string, { label: string; unit: Ind['unit']; get: (m: Metrics) => Ind }> = {
  PESSOAL_RECEBIMENTOS: { label: 'Pessoal ÷ recebimentos', unit: 'PCT', get: (m) => m.pessoalPctRecebimentos },
  PESSOAL_SERVICOS: { label: 'Pessoal ÷ receita de serviços', unit: 'PCT', get: (m) => m.pessoalPctServicos },
  CMV_ESTIMADO_COMPRAS: { label: 'CMV estimado por compras', unit: 'PCT', get: (m) => m.cmv.pct },
  CMV_PCT: { label: 'CMV', unit: 'PCT', get: (m) => m.cmv.pct },
  DIFERENCA_CAIXA: { label: 'Recebimentos − pagamentos', unit: 'BRL', get: (m) => m.fluxo.diferenca },
  GERACAO_ANTES_PAYOUT: { label: 'Geração de caixa antes do payout', unit: 'BRL', get: (m) => m.fluxo.geracaoAntesPayout },
  PDV_TICKET_MEDIO: { label: 'Ticket médio do PDV', unit: 'BRL', get: (m) => m.lanchonete.ticketMedio },
  PAYOUT_RECEBIMENTOS: { label: 'Distribuição ÷ recebimentos', unit: 'PCT', get: (m) => m.payout.distribuicaoPct },
};

/** Regras de negócio que o motor já aplica (aba REGRAS_NEGOCIO). */
export const KNOWN_RULES = [
  'TENIS_FORA_FOLHA', 'TICKET_FUNCIONARIO', 'CMV_COMPRAS', 'PAYOUT_NAO_OPEX', 'IRRF_NAO_DUPLICAR', 'ADIANTAMENTO_NAO_DUPLICAR',
  'EMPRESTIMO_NAO_RECEITA', 'RECEBIVEL_NAO_CAIXA', 'FLUXO_NAO_LUCRO', 'CONTA_ASSINADA', 'REFORMA_PRESTADORES',
];

// ── Leitura ────────────────────────────────────────────────

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const str = (c: Cell | undefined): string | null => {
  if (c === null || c === undefined) return null;
  if (c instanceof Date) return c.toISOString().slice(0, 10);
  const t = String(c).trim();
  return t === '' ? null : t;
};
/** Número da célula; vazio → null (nunca zero). Aceita "1.234,56". */
export function num(c: Cell | undefined): number | null {
  if (c === null || c === undefined || typeof c === 'boolean' || c instanceof Date) return null;
  if (typeof c === 'number') return Number.isFinite(c) ? c : null;
  const t = c.replace(/R\$|\s|%/g, '');
  if (!t) return null;
  const n = Number(/,\d{1,2}$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}
const cents = (reais: number) => Math.round(reais * 100);
const BRL = (c: number) => `R$ ${(c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Linhas de dados de uma aba: acha a linha de cabeçalho pelo 1º campo e devolve objetos por nome de coluna. */
function table(sheets: Sheets, name: string, firstHeader: string): { row: number; get: (col: string) => Cell }[] {
  const rows = sheets[name];
  if (!rows) return [];
  const h = rows.findIndex((r) => fold(String(r[0] ?? '')) === firstHeader);
  if (h < 0) return [];
  const cols = rows[h]!.map((c) => fold(String(c ?? '')));
  return rows.slice(h + 1)
    .map((r, i) => ({ row: h + 2 + i, get: (col: string) => (cols.indexOf(col) >= 0 ? r[cols.indexOf(col)] ?? null : null) }))
    .filter((x) => str(x.get(firstHeader)) !== null);
}

export function isPackage(sheets: Sheets): boolean {
  return table(sheets, 'MANIFESTO', 'campo').some((r) => str(r.get('campo')) === 'schema_name' && str(r.get('valor')) === PACKAGE_SCHEMA);
}

const GROUPS: [RegExp, string][] = [
  [/refei|almoco|prato/, 'refeicoes'], [/cerveja|alcool|chopp|drink|vinho|destilad/, 'bebidas_alcoolicas'], [/bebida|refri|agua|suco|cafe/, 'bebidas_nao_alcoolicas'],
  [/acai/, 'acai'], [/lanche|salgad|sobremesa|doce/, 'lanches'], [/esport|suplement/, 'esportivos'], [/day ?use/, 'day_use'],
];
export const productGroup = (grupo: string | null, classificacao: string | null) =>
  fold(classificacao ?? '') === 'consumo_interno' ? 'consumo_interno' : GROUPS.find(([re]) => re.test(fold(grupo ?? '')))?.[1] ?? 'outros';

export function parsePackage(sheets: Sheets): PackageResult {
  const warnings: string[] = [];
  const manifest = new Map(table(sheets, 'MANIFESTO', 'campo').map((r) => [str(r.get('campo')), str(r.get('valor'))]));
  const months = new Map<string, PackageMonth>();
  const month = (raw: Cell, where: string): PackageMonth | null => {
    const m = str(raw);
    if (!m || !isMonth(m)) { warnings.push(`${where}: competência inválida "${m ?? ''}" (use AAAA-MM) — linha ignorada.`); return null; }
    if (!months.has(m)) months.set(m, { month: m, importStatus: null, reference: null, approvedInFile: false, lines: [], managerNotes: [], partnerDecisions: [], warnings: [], fileKpis: [] });
    return months.get(m)!;
  };

  for (const r of table(sheets, 'COMPETENCIAS', 'competencia')) {
    const pm = month(r.get('competencia'), `COMPETENCIAS linha ${r.row}`);
    if (!pm) continue;
    pm.importStatus = str(r.get('status_importacao'));
    pm.reference = str(r.get('relatorio_referencia'));
    pm.approvedInFile = r.get('aprovado') === true || fold(String(r.get('aprovado') ?? '')) === 'true';
    const obs = str(r.get('observacoes'));
    if (obs) pm.warnings.push(obs);
  }

  for (const r of table(sheets, 'METRICAS', 'competencia')) {
    const where = `METRICAS linha ${r.row}`;
    const pm = month(r.get('competencia'), where);
    if (!pm) continue;
    const code = (str(r.get('codigo_metrica')) ?? '').toUpperCase();
    const desc = str(r.get('descricao')) ?? code;
    const v = num(r.get('valor'));
    if (v === null) continue; // vazio = não informado
    const status = str(r.get('status'));
    const fonte = str(r.get('fonte'));
    const obs = [str(r.get('observacao')), str(r.get('formula_metodologia'))].filter(Boolean).join(' · ');
    const unitIn = fold(str(r.get('unidade')) ?? '');
    if (DERIVED_KPIS[code]) {
      // Percentual vem como fração (0,268); se vier 26,8, normaliza.
      const val = DERIVED_KPIS[code]!.unit === 'PCT' && Math.abs(v) > 1 ? v / 100 : v;
      pm.fileKpis.push({ code, label: DERIVED_KPIS[code]!.label, unit: DERIVED_KPIS[code]!.unit, file: DERIVED_KPIS[code]!.unit === 'BRL' ? cents(val) : val });
      continue;
    }
    const t = METRIC_MAP[code];
    if (!t) { pm.warnings.push(`Código "${code}" (${desc}) não é reconhecido pelo sistema — não foi importado (${where}).`); continue; }
    const isQty = t.unit === 'QTD' || unitIn === 'qtd';
    pm.lines.push({
      dataset: t.dataset, key: t.key, label: t.label ?? desc, unit: null,
      amountCents: isQty ? null : cents(v), quantity: isQty ? v : null, classification: null, meta: null,
      sourceRef: `Planilha · ${where}`, sourceValue: `${v}${status ? ` · ${status}` : ''}${fonte ? ` · ${fonte}` : ''}`.slice(0, 300),
      rule: `${code} → ${t.dataset}${t.key ? ` ${t.key}` : ''}${obs ? ` · ${obs}` : ''}`.slice(0, 300),
    });
  }

  for (const r of table(sheets, 'ALUNOS', 'competencia')) {
    const where = `ALUNOS linha ${r.row}`;
    const pm = month(r.get('competencia'), where);
    const mod = str(r.get('modalidade'));
    const q = num(r.get('quantidade'));
    if (!pm || !mod || q === null) continue;
    pm.lines.push({ dataset: 'ALUNOS', key: null, label: mod, unit: mod, amountCents: null, quantity: q, classification: null, meta: null,
      sourceRef: `Planilha · ${where}`, sourceValue: `${q}${str(r.get('status')) ? ` · ${str(r.get('status'))}` : ''}`, rule: 'Matrículas/participações da modalidade (não são clientes únicos)' });
  }

  for (const r of table(sheets, 'CAIXA', 'competencia_relatorio')) {
    const where = `CAIXA linha ${r.row}`;
    const pm = month(r.get('competencia_relatorio'), where);
    const conta = str(r.get('conta'));
    const v = num(r.get('valor'));
    if (!pm || !conta || v === null) continue;
    const pos = str(r.get('data_posicao'));
    const status = str(r.get('status'));
    const obs = str(r.get('observacao'));
    const meta: Record<string, unknown> = {};
    if (pos) meta.dataPosicao = pos;
    if (status) meta.status = status;
    const tot = obs?.match(/total(?:\s+informado)?\s*R\$\s*([\d.,]+)/i);
    if (tot && num(tot[1]!) !== null) meta.totalInformado = cents(num(tot[1]!)!);
    pm.lines.push({ dataset: 'CAIXA', key: 'disponivel', label: conta, unit: str(r.get('subconta')), amountCents: cents(v), quantity: null, classification: null,
      meta: Object.keys(meta).length ? meta : null, sourceRef: `Planilha · ${where}`, sourceValue: `${v}${status ? ` · ${status}` : ''}${pos ? ` · posição ${pos}` : ''}`,
      rule: `Saldo disponível${obs ? ` · ${obs}` : ''}`.slice(0, 300) });
  }

  for (const r of table(sheets, 'PRODUTOS_PDV', 'competencia')) {
    const where = `PRODUTOS_PDV linha ${r.row}`;
    const pm = month(r.get('competencia'), where);
    const prod = str(r.get('produto'));
    const fat = num(r.get('faturamento'));
    if (!pm || !prod || fat === null) continue;
    const grupo = str(r.get('grupo'));
    const cls = str(r.get('classificacao'));
    const vendas = num(r.get('numero_vendas'));
    pm.lines.push({ dataset: 'PDV_PRODUTO', key: productGroup(grupo, cls), label: prod, unit: grupo, amountCents: cents(fat), quantity: num(r.get('quantidade')),
      classification: cls, meta: vendas !== null ? { vendas } : null, sourceRef: `Planilha · ${where}`, sourceValue: `${fat}`,
      rule: `Produto do PDV${cls ? ` · ${cls}` : ''}` });
  }

  for (const r of table(sheets, 'OBS_GERENCIAIS', 'competencia')) {
    const pm = month(r.get('competencia'), `OBS_GERENCIAIS linha ${r.row}`);
    const text = str(r.get('observacao'));
    if (!pm || !text) continue;
    const tipo = (str(r.get('tipo')) ?? '').toUpperCase();
    const tema = str(r.get('tema'));
    const line = `${tema ? `[${tema}] ` : ''}${text}${tipo === 'AJUSTE_GERENCIAL' ? ' (ajuste gerencial — não lançado automaticamente)' : ''}`;
    (tipo.startsWith('DECISAO') ? pm.partnerDecisions : pm.managerNotes).push(line);
  }

  for (const r of table(sheets, 'PENDENCIAS', 'competencia')) {
    const pm = month(r.get('competencia'), `PENDENCIAS linha ${r.row}`);
    const dado = str(r.get('dado_necessario'));
    if (pm && dado) pm.warnings.push(`Pendência (${str(r.get('area')) ?? 'geral'}): ${dado}.`);
  }

  // Posição de caixa com data que não combina com a competência (ex.: ano digitado errado).
  for (const pm of months.values()) {
    const dates = [...new Set(pm.lines.filter((l) => l.dataset === 'CAIXA' && l.meta?.dataPosicao).map((l) => String(l.meta!.dataPosicao)))];
    for (const d of dates) {
      const diff = (Number(d.slice(0, 4)) - Number(pm.month.slice(0, 4))) * 12 + Number(d.slice(5, 7)) - Number(pm.month.slice(5, 7));
      if (/^\d{4}-\d{2}/.test(d) && (diff < 0 || diff > 2)) pm.warnings.push(`Posição de caixa datada de ${dateBR(d)}, longe da competência ${monthLabel(pm.month)} — confira a data (o ano pode estar errado).`);
    }
    const declared = pm.lines.find((l) => l.dataset === 'CAIXA' && typeof l.meta?.totalInformado === 'number');
    const soma = pm.lines.filter((l) => l.dataset === 'CAIXA' && l.key === 'disponivel').reduce((s, l) => s + (l.amountCents ?? 0), 0);
    if (declared && Math.abs((declared.meta!.totalInformado as number) - soma) > 100) pm.warnings.push(`Soma das contas (${BRL(soma)}) ≠ total informado na planilha (${BRL(declared.meta!.totalInformado as number)}).`);
    if (!pm.lines.length) pm.warnings.push('Nenhum valor numérico para este mês — só observações/pendências.');
  }

  const rules = table(sheets, 'REGRAS_NEGOCIO', 'codigo').map((r) => (str(r.get('codigo')) ?? '').toUpperCase()).filter(Boolean)
    .map((code) => ({ code, known: KNOWN_RULES.includes(code) }));
  for (const r of rules.filter((x) => !x.known)) warnings.push(`Regra "${r.code}" não existe no motor do sistema — revisar com a equipe (não foi aplicada).`);
  const version = manifest.get('schema_version') ?? null;
  if (version && version.split('.')[0] !== '1') warnings.push(`Versão do esquema ${version}: o sistema lê a versão 1.x; confira o resultado.`);

  return { schemaVersion: version, months: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)), rules, warnings };
}

/** Planilha × motor: o mesmo indicador calculado pelo sistema. */
export function compareFileKpis(m: Metrics, kpis: FileKpi[]) {
  return kpis.map((k) => {
    const engine = DERIVED_KPIS[k.code]!.get(m).value;
    const tol = k.unit === 'PCT' ? 0.0006 : 100; // 0,06 p.p. (arredondamento a 1 casa) / R$ 1
    return { ...k, engine, ok: engine !== null && Math.abs(engine - k.file) <= tol };
  });
}
