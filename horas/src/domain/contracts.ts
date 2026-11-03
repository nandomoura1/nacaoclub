/**
 * Contratos (puro): categorias, tipos de campo, variáveis {{campo}}, formatação dos
 * valores (moeda por extenso, data, CPF/CNPJ) e a estrutura do texto para PDF e tela.
 */

export const CONTRACT_CATEGORIES = [
  { id: 'PRESTADOR', label: 'Professor / prestador (PJ/MEI)' },
  { id: 'COLABORADOR', label: 'Colaborador CLT / estágio' },
  { id: 'FORNECEDOR', label: 'Fornecedor / parceiro' },
  { id: 'ESPACO_MARKETING', label: 'Espaço de marketing / patrocínio' },
  { id: 'OUTRO', label: 'Outro' },
] as const;
export type ContractCategory = (typeof CONTRACT_CATEGORIES)[number]['id'];

export const CONTRACT_STATUS = [
  { id: 'RASCUNHO', label: 'Rascunho', tone: 'neutral' },
  { id: 'AGUARDANDO', label: 'Aguardando assinaturas', tone: 'amber' },
  { id: 'ASSINADO', label: 'Assinado', tone: 'green' },
  { id: 'CANCELADO', label: 'Cancelado', tone: 'red' },
] as const;

export const SIGNER_ROLES = [
  { id: 'CONTRATANTE', label: 'Contratante' },
  { id: 'CONTRATADO', label: 'Contratado(a)' },
  { id: 'CEDENTE', label: 'Cedente' },
  { id: 'CESSIONARIO', label: 'Cessionário(a)' },
  { id: 'EMPREGADOR', label: 'Empregador' },
  { id: 'EMPREGADO', label: 'Empregado(a)' },
  { id: 'ESTAGIARIO', label: 'Estagiário(a)' },
  { id: 'INSTITUICAO_ENSINO', label: 'Instituição de ensino' },
  { id: 'TESTEMUNHA', label: 'Testemunha' },
] as const;
export const roleLabel = (id: string) => SIGNER_ROLES.find((r) => r.id === id)?.label ?? id;

export const FIELD_TYPES = [
  { id: 'texto', label: 'Texto' },
  { id: 'texto_longo', label: 'Texto longo' },
  { id: 'data', label: 'Data' },
  { id: 'moeda', label: 'Valor (R$)' },
  { id: 'numero', label: 'Número' },
  { id: 'cpf_cnpj', label: 'CPF/CNPJ' },
  { id: 'telefone', label: 'Telefone' },
  { id: 'email', label: 'E-mail' },
] as const;
export type FieldType = (typeof FIELD_TYPES)[number]['id'];

export interface TemplateField { key: string; label: string; type: FieldType; required: boolean; help?: string }

/** Variáveis preenchidas pelo sistema (não aparecem no formulário). */
export const BUILTIN_VARS = [
  { key: 'empresa_razao_social', label: 'Razão social da empresa (Administração → Empresas)' },
  { key: 'empresa_nome', label: 'Nome fantasia da empresa' },
  { key: 'empresa_cnpj', label: 'CNPJ da empresa' },
  { key: 'empresa_endereco', label: 'Endereço da empresa' },
  { key: 'empresa_representante', label: 'Representante legal da empresa' },
  { key: 'data_hoje', label: 'Data de hoje por extenso (ex.: 1º de novembro de 2026)' },
  { key: 'cidade', label: 'Cidade de assinatura (Brasília/DF)' },
  { key: 'codigo', label: 'Código do contrato (ex.: CT-2026-0001)' },
] as const;
const BUILTIN = new Set<string>(BUILTIN_VARS.map((b) => b.key));

const KEY_RE = /\{\{\s*([a-z0-9_]+)\s*\}\}/g;

/** Variáveis usadas no texto, na ordem em que aparecem (sem repetir). */
export function templateKeys(body: string): string[] {
  return [...new Set([...body.matchAll(KEY_RE)].map((m) => m[1]!))];
}

/** Confere o modelo: toda {{variável}} do texto precisa ser campo ou variável do sistema. */
export function checkTemplate(body: string, fields: TemplateField[]): string[] {
  const errors: string[] = [];
  const keys = new Set(fields.map((f) => f.key));
  if (fields.length !== keys.size) errors.push('Há dois campos com o mesmo nome (chave).');
  for (const f of fields) {
    if (!/^[a-z0-9_]{2,40}$/.test(f.key)) errors.push(`Chave inválida: "${f.key}" (use letras minúsculas, números e _).`);
    if (BUILTIN.has(f.key)) errors.push(`"${f.key}" é variável do sistema: escolha outra chave.`);
  }
  const bad = [...body.matchAll(/\{\{([^}]*)\}\}/g)].map((m) => m[1]!.trim()).filter((k) => !/^[a-z0-9_]+$/.test(k));
  if (bad.length) errors.push(`Entre {{ }} vai só o nome do campo (letras minúsculas, números e _), não o valor: ${[...new Set(bad)].slice(0, 3).map((k) => `{{${k.slice(0, 30)}}}`).join(', ')}. O valor é preenchido em cada contrato.`);
  const unknown = templateKeys(body).filter((k) => !keys.has(k) && !BUILTIN.has(k));
  if (unknown.length) errors.push(`Variáveis sem campo: ${unknown.map((k) => `{{${k}}}`).join(', ')}. Crie o campo ou corrija o texto.`);
  return errors;
}

/** Sugere a lista de campos a partir do texto (o que não é variável do sistema). */
export function suggestFields(body: string, current: TemplateField[] = []): TemplateField[] {
  const have = new Map(current.map((f) => [f.key, f]));
  return templateKeys(body).filter((k) => !BUILTIN.has(k)).map((k) => have.get(k) ?? {
    key: k,
    label: k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()),
    type: /valor|preco|remuneracao|mensalidade/.test(k) ? 'moeda' : /data|inicio|fim|vigencia_ate/.test(k) ? 'data' : /cpf|cnpj|documento/.test(k) ? 'cpf_cnpj' : 'texto',
    required: true,
  });
}

// ── Formatação ────────────────────────────────────────────────

const UNITS = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const TENS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const HUNDREDS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

function upTo999(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'cem';
  const h = Math.floor(n / 100), r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(HUNDREDS[h]!);
  if (r) parts.push(r < 20 ? UNITS[r]! : [TENS[Math.floor(r / 10)]!, UNITS[r % 10]!].filter(Boolean).join(' e '));
  return parts.join(' e ');
}

/** Número inteiro por extenso (até centenas de milhões). */
export function numberInWords(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return 'zero';
  const groups: [number, string, string][] = [[1_000_000_000, 'bilhão', 'bilhões'], [1_000_000, 'milhão', 'milhões'], [1000, 'mil', 'mil']];
  const parts: string[] = [];
  let rest = n;
  for (const [size, one, many] of groups) {
    const q = Math.floor(rest / size);
    if (!q) continue;
    rest %= size;
    parts.push(size === 1000 && q === 1 ? 'mil' : `${upTo999(q)} ${q === 1 ? one : many}`);
  }
  if (rest) parts.push(upTo999(rest));
  // "mil e quinhentos", "dois mil e trinta"; "mil, duzentos e cinquenta" vira "mil duzentos e cinquenta".
  if (parts.length > 1 && (rest < 100 || rest % 100 === 0)) return `${parts.slice(0, -1).join(' ')} e ${parts.at(-1)}`;
  return parts.join(' ');
}

/** 150050 centavos → "R$ 1.500,50 (mil e quinhentos reais e cinquenta centavos)". */
export function moneyText(cents: number): string {
  const reais = Math.floor(cents / 100), cent = Math.round(cents % 100);
  const fmt = (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' ');
  const words = [
    reais ? `${numberInWords(reais)}${reais >= 1_000_000 && reais % 1_000_000 === 0 ? ' de' : ''} ${reais === 1 ? 'real' : 'reais'}` : '',
    cent ? `${numberInWords(cent)} ${cent === 1 ? 'centavo' : 'centavos'}` : '',
  ].filter(Boolean).join(' e ') || 'zero reais';
  return `${fmt} (${words})`;
}

/** "1.500,50" / "1500.5" / "R$ 1.500" → centavos (null se não for valor). */
export function parseMoney(raw: string): number | null {
  const s = raw.replace(/[R$\s]/g, '');
  if (!s) return null;
  const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
/** "2026-11-01" → "1º de novembro de 2026". */
export function dateInWords(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = Number(m[3]);
  return `${d === 1 ? '1º' : d} de ${MONTHS[Number(m[2]) - 1]} de ${m[1]}`;
}

const digits = (s: string) => s.replace(/\D/g, '');

function cpfOk(c: string) {
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  const dv = (n: number) => { let s = 0; for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
}
function cnpjOk(c: string) {
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const dv = (n: number) => { const w = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; const s = w.reduce((a, x, i) => a + x * Number(c[i]), 0); const r = s % 11; return r < 2 ? 0 : 11 - r; };
  return dv(12) === Number(c[12]) && dv(13) === Number(c[13]);
}
/** CPF ou CNPJ válido (dígitos verificadores). */
export const documentOk = (raw: string) => { const d = digits(raw); return d.length === 11 ? cpfOk(d) : cnpjOk(d); };
export function formatDocument(raw: string): string {
  const d = digits(raw);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return raw.trim();
}
/** Documento mascarado para a trilha de evidências: "***.456.789-**". */
export function maskDocument(raw: string | null | undefined): string {
  const d = digits(raw ?? '');
  if (d.length === 11) return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
  if (d.length === 14) return formatDocument(d);
  return raw ? '***' : '—';
}
/** Telefone mascarado: "(61) *****-2806". */
export function maskPhone(raw: string | null | undefined): string {
  const d = digits(raw ?? '').replace(/^55(?=\d{10,11}$)/, '');
  return d.length >= 10 ? `(${d.slice(0, 2)}) *****-${d.slice(-4)}` : '—';
}

/** Valor do formulário → texto do contrato; erro em português quando inválido. */
export function formatField(f: TemplateField, raw: string): { ok: true; text: string } | { ok: false; error: string } {
  const v = (raw ?? '').trim();
  if (!v) return f.required ? { ok: false, error: `Preencha "${f.label}".` } : { ok: true, text: '' };
  switch (f.type) {
    case 'data': return /^\d{4}-\d{2}-\d{2}$/.test(v) ? { ok: true, text: `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}` } : { ok: false, error: `"${f.label}": data inválida.` };
    case 'moeda': { const c = parseMoney(v); return c === null ? { ok: false, error: `"${f.label}": valor inválido (ex.: 1.500,00).` } : { ok: true, text: moneyText(c) }; }
    case 'numero': return /^-?\d+([.,]\d+)?$/.test(v) ? { ok: true, text: v } : { ok: false, error: `"${f.label}": número inválido.` };
    case 'cpf_cnpj': return documentOk(v) ? { ok: true, text: formatDocument(v) } : { ok: false, error: `"${f.label}": CPF/CNPJ inválido.` };
    case 'email': return /^\S+@\S+\.\S+$/.test(v) ? { ok: true, text: v } : { ok: false, error: `"${f.label}": e-mail inválido.` };
    default: return { ok: true, text: v.replace(/\s+/g, f.type === 'texto_longo' ? ' ' : ' ') };
  }
}

/** Preenche o texto do modelo. Devolve os erros de preenchimento (campos obrigatórios/invalidos). */
export function renderContract(body: string, fields: TemplateField[], values: Record<string, string>, builtins: Record<string, string>) {
  const errors: string[] = [];
  const text: Record<string, string> = { ...builtins };
  for (const f of fields) {
    const r = formatField(f, values[f.key] ?? '');
    if (r.ok) text[f.key] = r.text; else errors.push(r.error);
  }
  const out = body.replace(KEY_RE, (_, k: string) => text[k] ?? `[${k}]`);
  return { text: out, errors };
}

// ── Estrutura do texto ────────────────────────────────────────

export type Run = { text: string; bold: boolean };
export type Block =
  | { kind: 'h1' | 'h2' | 'p' | 'li'; runs: Run[] }
  /** Tabela "| a | b |" — a 1ª linha é o cabeçalho; a linha "|---|---|" é ignorada. */
  | { kind: 'table'; runs: Run[]; rows: Run[][][] }
  /** Linha "---": separador. */
  | { kind: 'hr'; runs: Run[] };

/** Trechos normais e **negrito** (o *itálico* simples sai sem os asteriscos). */
function toRuns(s: string): Run[] {
  return s.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((p) => (/^\*\*[^*]+\*\*$/.test(p)
    ? { text: p.slice(2, -2), bold: true }
    : { text: p.replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1$2'), bold: false }));
}

/** "# Título", "## Cláusula", "- item", "| tabela |", "---", parágrafos (linha em branco) e **negrito**. */
export function contractBlocks(text: string): Block[] {
  const out: Block[] = [];
  let para: string[] = [];
  let table: Run[][][] | null = null;
  const flush = () => {
    if (para.length) { out.push({ kind: 'p', runs: toRuns(para.join(' ')) }); para = []; }
    if (table) { if (table.length) out.push({ kind: 'table', runs: [], rows: table }); table = null; }
  };
  for (const raw of text.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    if (/^\|.*\|$/.test(line)) {
      if (para.length) { out.push({ kind: 'p', runs: toRuns(para.join(' ')) }); para = []; }
      const cells = line.slice(1, -1).split('|').map((c) => c.trim());
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue; // |---|---|
      (table ??= []).push(cells.map(toRuns));
      continue;
    }
    if (table) flush();
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) { flush(); out.push({ kind: 'hr', runs: [] }); continue; }
    const h = /^(#{1,2})\s+(.*)$/.exec(line);
    if (h) { flush(); out.push({ kind: h[1]!.length === 1 ? 'h1' : 'h2', runs: toRuns(h[2]!) }); continue; }
    const li = /^[-•]\s+(.*)$/.exec(line);
    if (li) { flush(); out.push({ kind: 'li', runs: toRuns(li[1]!) }); continue; }
    para.push(line);
  }
  flush();
  return out;
}

// ── Dados da empresa escritos à mão no modelo ─────────────────

const fold = (c: string) => c.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Procura `needle` em `hay` ignorando acento e maiúscula; devolve [início, fim) no texto original. */
function findLoose(hay: string, needle: string): [number, number][] {
  const map: number[] = [];
  let norm = '';
  for (let i = 0; i < hay.length; i++) { const f = fold(hay[i]!); for (const ch of f) { norm += ch; map.push(i); } }
  const n = fold(needle).replace(/\s+/g, ' ').trim();
  if (n.length < 4) return [];
  const out: [number, number][] = [];
  const flat = norm.replace(/\s/g, ' ');
  for (let at = flat.indexOf(n); at >= 0; at = flat.indexOf(n, at + n.length)) out.push([map[at]!, map[at + n.length - 1]! + 1]);
  return out;
}

export interface CompanyLike { legalName: string; tradeName: string | null; cnpj: string | null }

/**
 * Nome/CNPJ de empresa cadastrada escrito à mão no texto do modelo: ao trocar a empresa no
 * contrato, esses trechos não mudariam. Devolve o que achou (para avisar na tela).
 */
export function companyLiterals(body: string, companies: CompanyLike[]): string[] {
  const found = new Set<string>();
  for (const c of companies) {
    if (findLoose(body, c.legalName).length) found.add(c.legalName);
    if (c.cnpj) { const d = c.cnpj.replace(/\D/g, ''); if (body.includes(formatDocument(d)) || body.includes(d)) found.add(`CNPJ ${formatDocument(d)}`); }
  }
  return [...found];
}

/** Troca nome e CNPJ das empresas cadastradas pelas variáveis {{empresa_razao_social}} e {{empresa_cnpj}}. */
export function replaceCompanyLiterals(body: string, companies: CompanyLike[]): string {
  let out = body;
  for (const c of companies) {
    if (c.cnpj) { const d = c.cnpj.replace(/\D/g, ''); out = out.split(formatDocument(d)).join('{{empresa_cnpj}}').split(d).join('{{empresa_cnpj}}'); }
    const hits = findLoose(out, c.legalName);
    for (const [a, b] of hits.reverse()) out = out.slice(0, a) + '{{empresa_razao_social}}' + out.slice(b);
  }
  return out;
}

/** Código do contrato: CT-AAAA-0001. */
export const contractCode = (year: number, seq: number) => `CT-${year}-${String(seq).padStart(4, '0')}`;

// ── Vigência (ativo / inativo pelo prazo) ─────────────────────

const ISO = /^\d{4}-\d{2}-\d{2}$/;
function addIso(iso: string, n: number, unit: 'd' | 'm' | 'y'): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (unit === 'd') dt.setUTCDate(dt.getUTCDate() + n);
  else {
    const months = unit === 'y' ? n * 12 : n;
    const target = new Date(Date.UTC(y, m - 1 + months, 1));
    const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    dt.setTime(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d, last)));
  }
  return dt.toISOString().slice(0, 10);
}

/**
 * Lê a vigência dos campos do contrato: {{inicio}} + {{fim}}, ou {{inicio}} + {{prazo}}
 * ("12 meses", "2 anos", "90 dias", "indeterminado"). Sem dado → nulo (preencher à mão).
 */
export function guessTerm(values: Record<string, string>): { startsOn: string | null; endsOn: string | null; indefinite: boolean } {
  const startsOn = ISO.test(values.inicio ?? '') ? values.inicio! : null;
  if (ISO.test(values.fim ?? '')) return { startsOn, endsOn: values.fim!, indefinite: false };
  const prazo = (values.prazo ?? '').toLowerCase();
  if (/indetermin/.test(prazo)) return { startsOn, endsOn: null, indefinite: true };
  const m = prazo.match(/(\d+)\s*(dia|m[eê]s|mes|ano)/);
  if (startsOn && m) {
    const n = Number(m[1]);
    const unit = m[2]!.startsWith('dia') ? 'd' : m[2]!.startsWith('ano') ? 'y' : 'm';
    return { startsOn, endsOn: addIso(addIso(startsOn, n, unit), -1, 'd'), indefinite: false };
  }
  return { startsOn, endsOn: null, indefinite: false };
}

export const TERM_STATUS = {
  A_INICIAR: { label: 'A iniciar', tone: 'blue', active: true },
  ATIVO: { label: 'Ativo', tone: 'green', active: true },
  VENCE_EM_BREVE: { label: 'Vence em breve', tone: 'amber', active: true },
  SEM_VIGENCIA: { label: 'Sem vigência', tone: 'neutral', active: true },
  VENCIDO: { label: 'Vencido', tone: 'red', active: false },
  ENCERRADO: { label: 'Encerrado', tone: 'red', active: false },
} as const;
export type TermStatus = keyof typeof TERM_STATUS;

/** Situação de um contrato ASSINADO na data de hoje. "Vence em breve" = até 30 dias. */
export function termStatus(c: { startsOn: string | null; endsOn: string | null; terminatedOn: string | null }, today: string): TermStatus {
  if (c.terminatedOn && c.terminatedOn <= today) return 'ENCERRADO';
  if (c.endsOn && c.endsOn < today) return 'VENCIDO';
  if (c.startsOn && c.startsOn > today) return 'A_INICIAR';
  if (c.endsOn && c.endsOn <= addIso(today, 30, 'd')) return 'VENCE_EM_BREVE';
  if (!c.startsOn && !c.endsOn) return 'SEM_VIGENCIA';
  return 'ATIVO';
}

/** Dias até o fim (negativo = já venceu). */
export function daysUntil(iso: string, today: string): number {
  return Math.round((Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10))) / 86_400_000);
}
