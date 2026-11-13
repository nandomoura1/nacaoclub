import { AppError } from '@/server/errors';
import { addDays as addDaysIso } from '@/domain/dates';

const minIso = (a: string, b: string) => (a < b ? a : b);

/**
 * Cliente da API externa da Tecnofit (só no servidor, só leitura).
 * Doc: https://api-externa-tecnofit.readme.io — base https://integracao.tecnofit.com.br/v1.
 *
 * Credenciais SÓ por variáveis da Vercel: TECNOFIT_API_KEY (pública, pk_…) e
 * TECNOFIT_API_SECRET (privada, sk_…). TECNOFIT_COMPANY_ID (opcional) escolhe a unidade
 * numa chave multiempresa. TECNOFIT_FAKE=1 usa dados simulados (dev/testes).
 *
 * Login: POST /v1/auth/login {api_key, api_secret} → token Bearer até `expiration_at`
 * (sem refresh: loga de novo). Limite: 200 req/min no total e 100/min por endpoint —
 * o cliente espaça as chamadas (MIN_GAP_MS) e espera em 429.
 */

export interface TecnofitConfig { configured: boolean; fake: boolean; base: string; companyId: string | null; keyHint: string | null }

const clean = (v: string | undefined) => v?.replace(/["'`\s]/g, '') || undefined;
const hint = (v?: string) => (v ? `${v.slice(0, 6)}…${v.slice(-3)} (${v.length} caracteres)` : null);

export function tecnofitConfig(): TecnofitConfig {
  const fake = process.env.TECNOFIT_FAKE === '1';
  const key = clean(process.env.TECNOFIT_API_KEY);
  const secret = clean(process.env.TECNOFIT_API_SECRET);
  return {
    configured: fake || !!(key && secret),
    fake,
    base: (process.env.TECNOFIT_BASE_URL?.trim() || 'https://integracao.tecnofit.com.br').replace(/\/+$/, ''),
    companyId: clean(process.env.TECNOFIT_COMPANY_ID) ?? null,
    keyHint: hint(key),
  };
}

// ── Formatos (tolerantes: a doc não garante todos os campos) ──────────────

export interface TfCustomerRef { id: string; name: string }
export interface TfUnreceivedSale { saleId: string; customer: TfCustomerRef }
export interface TfCustomerSale { id: string; totalValue: unknown; openValue: unknown; saleDate: unknown; dueDate: unknown; saleStatus?: unknown; installments?: unknown; items?: { name?: string }[]; seller?: TfPerson | null }
/** Funcionário citado num registro (vendedor/consultor). */
export interface TfPerson { id: string; name: string | null }

/** Campos em que a Tecnofit pode trazer o funcionário responsável (a documentação varia por recurso). */
const PERSON_KEYS = ['consultant', 'seller', 'salesman', 'salesperson', 'saleConsultant', 'employee', 'responsible', 'attendant', 'collaborator', 'user', 'createdBy'];
/** Primeiro funcionário encontrado no registro (objeto { id, name } ou campo "...Id"). Só id e nome. */
export function personOf(r: Record<string, unknown>, keys = PERSON_KEYS): TfPerson | null {
  for (const k of keys) {
    const v = r[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const o = v as Record<string, unknown>;
      const id = o.id ?? o.employeeId ?? o.userId;
      if (id != null && String(id).trim()) return { id: String(id).trim(), name: o.name != null ? String(o.name).trim() || null : null };
    }
    for (const idKey of [`${k}Id`, `${k}_id`]) {
      const id = r[idKey];
      if (id != null && String(id).trim() && typeof id !== 'object') return { id: String(id).trim(), name: typeof r[`${k}Name`] === 'string' ? String(r[`${k}Name`]) : null };
    }
  }
  return null;
}
/** Só os NOMES dos campos (nunca valores) para diagnóstico: "a,b,customer{id,name}". */
export function shapeOf(r: Record<string, unknown> | undefined): string {
  if (!r) return '';
  return Object.keys(r).slice(0, 40).map((k) => {
    const v = r[k];
    return v && typeof v === 'object' && !Array.isArray(v) ? `${k}{${Object.keys(v as object).slice(0, 12).join(',')}}` : k;
  }).join(',');
}
/** Diagnóstico da última leitura (contagens e nomes de campos — sem dado de aluno). */
export interface TfDiag { calls?: { raw: number; parsed: number; withConsultant: number; shape: string }; sales?: { total: number; withSeller: number; shape: string } }
export interface TfContact { contact: string; type: string | null }
export interface TfCustomer { id: string; name: string; status: string | null }
export interface TfEmployee { id: string; name: string; types: string[] }
/** Ligação do CRM da Tecnofit. `done` = concluída; `deadline` = data agendada; `doneAt` = quando foi feita. Notas NÃO são lidas. */
export interface TfCall { customerId: string; consultantId: string | null; consultantName: string | null; at: string | null; done: boolean; deadline: string | null; doneAt: string | null }

/** Check-in (turma/CrossFit). `classId` pode ser a turma ou o evento do dia: a agenda desfaz a dúvida. */
export interface TfCheckin { customerId: string; customerName: string; classId: string; className: string; classStart: string | null; checkinAt: string | null }
/** Aula do dia na agenda da Tecnofit. */
export interface TfScheduleEvent { eventId: string; classId: string; name: string; date: string; startTime: string; endTime: string; modality: string | null; place: string | null; capacity: number | null; occupied: number | null }
export interface TfClass { id: string; name: string; modality: string | null; place: string | null }

/** Agenda e frequência (check-ins na TV). */
export interface TecnofitAgendaApi {
  /** Uma página de check-ins do dia (type = class | crossfit; máx. 50 por página). */
  checkinsPage(date: string, type: 'class' | 'crossfit', page: number): Promise<{ rows: TfCheckin[]; total: number; pages: number }>;
  schedule(date: string): Promise<TfScheduleEvent[]>;
  classes(): Promise<TfClass[]>;
}

/** O que a sincronização precisa da Tecnofit. A implementação real e a simulada seguem este contrato. */
export interface TecnofitApi {
  /** Vendas não recebidas com data de venda no período (máx. 90 dias por chamada). */
  unreceivedSales(startDate: string, endDate: string): Promise<TfUnreceivedSale[]>;
  customersByStatus(status: 'blocked' | 'restricted'): Promise<TfCustomer[]>;
  customer(id: string): Promise<TfCustomer | null>;
  customerSales(id: string, saleStartDate: string): Promise<TfCustomerSale[]>;
  customerContacts(id: string): Promise<TfContact[]>;
  consultants(): Promise<TfEmployee[]>;
  /** Ligações do CRM no período (traz o consultor de cada aluno). */
  calls(startDate: string, endDate: string): Promise<TfCall[]>;
  /** Contagens/formato da última leitura (só o cliente real preenche). */
  diag?: TfDiag;
  /** Alunos ativos (só ids, para a varredura de renovações). */
  activeCustomerIds(): Promise<string[]>;
  /** Contratos do aluno (todos os status). `dueDate` = fim do contrato. */
  customerContracts(id: string): Promise<TfContract[]>;
  /** Recurso indicado por um aviso (webhook): GET do `resource_url`, só no host da API. */
  resource(url: string): Promise<Record<string, unknown> | null>;
}

export interface TfContract { id: string; name: string | null; startDate: string | null; dueDate: string | null; status: string | null }

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const rowsOf = (res: unknown): Record<string, unknown>[] => {
  if (Array.isArray(res)) return res as Record<string, unknown>[];
  const r = res as { data?: unknown; items?: unknown } | null;
  const d = r?.data ?? r?.items;
  if (Array.isArray(d)) return d as Record<string, unknown>[];
  const nested = (d as { data?: unknown } | undefined)?.data;
  return Array.isArray(nested) ? (nested as Record<string, unknown>[]) : [];
};
/** Total de páginas informado pela API (null = a resposta não trouxe `meta.pages`). */
const pagesOf = (res: unknown): number | null => {
  const r = res as { meta?: { pages?: unknown }; data?: { meta?: { pages?: unknown } } } | null;
  const p = Number(r?.meta?.pages ?? r?.data?.meta?.pages);
  return Number.isFinite(p) && p > 0 ? p : null;
};
/** Erro HTTP da Tecnofit com o motivo que ela devolveu (código/mensagem de validação; sem dado de aluno). */
export class TecnofitHttpError extends AppError {
  constructor(readonly httpStatus: number, path: string, detail: string | null) {
    super(`A Tecnofit respondeu ${httpStatus} em ${path}${detail ? ` (${detail})` : ''}.`);
  }
}
async function errorDetail(res: Response): Promise<string | null> {
  try {
    const b = (await res.json()) as { message?: unknown; code?: unknown; error?: unknown; errors?: unknown; details?: unknown };
    const parts = [b.code, b.message, b.error, b.errors ?? b.details].filter((x) => x !== undefined && x !== null).map((x) => (typeof x === 'string' ? x : JSON.stringify(x)));
    return parts.join(' · ').replace(/\s+/g, ' ').slice(0, 240) || null;
  } catch { return null; }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const MIN_GAP_MS = 350; // ~170 req/min: sobra para os check-ins da TV dentro do limite de 200/min
const MAX_PAGES = 200;
/** Combinação de parâmetros de /customers/{id}/sales que a Tecnofit aceitou (vale para a instância do servidor). */
let salesVariantMemo: number | null = null;
export const resetSalesVariant = () => { salesVariantMemo = null; };

type Fetch = typeof fetch;

export class HttpTecnofit implements TecnofitApi, TecnofitAgendaApi {
  private token: string | null = null;
  private tokenExp = 0;
  private last = 0;
  /** Chamadas feitas (para o registro da sincronização). */
  calls_made = 0;

  constructor(private readonly cfg: TecnofitConfig, private readonly doFetch: Fetch = fetch, private readonly gapMs = MIN_GAP_MS, private readonly creds?: { key?: string; secret?: string }) {}

  private async pace() {
    const wait = this.last + this.gapMs - Date.now();
    if (wait > 0) await sleep(wait);
    this.last = Date.now();
  }

  private async login(attempt = 0): Promise<string> {
    if (this.token && Date.now() < this.tokenExp) return this.token;
    const key = clean(this.creds ? this.creds.key : process.env.TECNOFIT_API_KEY);
    const secret = clean(this.creds ? this.creds.secret : process.env.TECNOFIT_API_SECRET);
    if (!key || !secret) throw new AppError(this.creds ? 'Chave de webhooks não configurada: faltam TECNOFIT_WEBHOOK_API_KEY e TECNOFIT_WEBHOOK_API_SECRET na Vercel.' : 'Tecnofit não configurada: faltam TECNOFIT_API_KEY e TECNOFIT_API_SECRET nas variáveis da Vercel.');
    await this.pace();
    this.calls_made++;
    let res: Response;
    try {
      res = await this.doFetch(`${this.cfg.base}/v1/auth/login`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: key, api_secret: secret }),
        signal: AbortSignal.timeout(20_000),
        cache: 'no-store',
      });
    } catch {
      throw new AppError('Não consegui falar com a Tecnofit (rede ou tempo esgotado).');
    }
    // Limite de uso: espera e tenta de novo (até 3 vezes).
    if (res.status === 429 && attempt < 3) { await sleep(Number(res.headers.get('retry-after')) * 1000 || 30_000); return this.login(attempt + 1); }
    if (res.status === 401 || res.status === 422) throw new AppError('A Tecnofit recusou as chaves da API (confira TECNOFIT_API_KEY/SECRET e se a chave está ativa).');
    if (!res.ok) throw new AppError(`A Tecnofit respondeu ${res.status} no login.`);
    const body = (await res.json()) as { token?: string; expiration_at?: string; data?: { token?: string; expiration_at?: string } };
    const token = body.token ?? body.data?.token;
    if (!token) throw new AppError('Login na Tecnofit sem token na resposta.');
    const exp = Date.parse(body.expiration_at ?? body.data?.expiration_at ?? '');
    this.token = token;
    // Sem validade informada: renova a cada 30 min. Com validade: 1 min antes.
    this.tokenExp = Number.isFinite(exp) ? exp - 60_000 : Date.now() + 30 * 60_000;
    return token;
  }

  private async get(path: string, params: Record<string, string | number | undefined> = {}, attempt = 0): Promise<unknown> {
    const token = await this.login();
    const url = /^https:\/\//.test(path) ? new URL(path) : new URL(`${this.cfg.base}/v1${path}`);
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
    await this.pace();
    this.calls_made++;
    let res: Response;
    try {
      res = await this.doFetch(url, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, ...(this.cfg.companyId ? { 'X-Company-Id': this.cfg.companyId } : {}) },
        signal: AbortSignal.timeout(30_000),
        cache: 'no-store',
      });
    } catch {
      if (attempt < 2) { await sleep(2_000 * (attempt + 1)); return this.get(path, params, attempt + 1); }
      throw new AppError(`Tecnofit sem resposta em ${path}.`);
    }
    if (res.status === 401 && attempt === 0) { this.token = null; return this.get(path, params, 1); }
    if (res.status === 429 && attempt < 3) { await sleep(Number(res.headers.get('retry-after')) * 1000 || 30_000); return this.get(path, params, attempt + 1); }
    if (res.status >= 500 && attempt < 2) { await sleep(3_000); return this.get(path, params, attempt + 1); }
    if (res.status === 404) return { data: [] };
    if (!res.ok) throw new TecnofitHttpError(res.status, path, await errorDetail(res));
    return res.json();
  }

  private async all(path: string, params: Record<string, string | number | undefined>, limit = 100): Promise<Record<string, unknown>[]> {
    const out: Record<string, unknown>[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const res = await this.get(path, { ...params, page, limit });
      const rows = rowsOf(res);
      out.push(...rows);
      // Confia em meta.pages (a API pode devolver menos itens que o `limit` pedido);
      // sem meta, para quando a página vier incompleta.
      const pages = pagesOf(res);
      if (!rows.length || (pages !== null ? page >= pages : rows.length < limit)) break;
    }
    return out;
  }

  async unreceivedSales(startDate: string, endDate: string) {
    const rows = await this.all('/financial/sales', { startDate, endDate, received: 'false' });
    return rows.map((r) => {
      const s = (r.sale ?? r) as Record<string, unknown>;
      const c = (s.customer ?? {}) as Record<string, unknown>;
      return { saleId: str(s.id), customer: { id: str(c.id), name: str(c.name) } };
    }).filter((s) => s.customer.id);
  }

  async customersByStatus(status: 'blocked' | 'restricted') {
    const rows = await this.all('/customers', { status, type: 'customer' });
    return rows.map((r) => ({ id: str(r.id), name: str(r.name), status: r.status ? str(r.status) : status })).filter((c) => c.id);
  }

  async customer(id: string) {
    const res = (await this.get(`/customers/${encodeURIComponent(id)}`)) as Record<string, unknown>;
    const r = (res?.data && !Array.isArray(res.data) ? res.data : res) as Record<string, unknown>;
    return r?.id ? { id: str(r.id), name: str(r.name), status: r.status ? str(r.status) : null } : null;
  }

  async checkinsPage(date: string, type: 'class' | 'crossfit', page: number) {
    const res = await this.get('/attendances', { startDate: date, endDate: date, type, page, limit: 50 });
    const meta = (res as { meta?: { total?: unknown; pages?: unknown } } | null)?.meta ?? {};
    const rows = rowsOf(res).map((r) => {
      const c = (r.customer ?? {}) as Record<string, unknown>;
      const k = (r.class ?? {}) as Record<string, unknown>;
      const ch = (r.checkin ?? {}) as Record<string, unknown>;
      return { customerId: str(c.id), customerName: str(c.name), classId: str(k.id), className: str(k.name), classStart: str(k.start) || null, checkinAt: str(ch.createdAt) || null };
    }).filter((x) => x.customerId && x.classId);
    return { rows, total: Number(meta.total ?? rows.length) || rows.length, pages: Number(meta.pages ?? 1) || 1 };
  }

  async schedule(date: string) {
    const res = await this.get('/calendar/schedule', { startDate: date, endDate: date });
    return rowsOf(res).map((r) => {
      const m = (r.modality ?? {}) as Record<string, unknown>;
      const p = (r.place ?? {}) as Record<string, unknown>;
      const o = (r.occupancy ?? {}) as Record<string, unknown>;
      const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));
      return { eventId: str(r.id), classId: str(r.classId), name: str(r.name), date: str(r.date) || date, startTime: str(r.startTime), endTime: str(r.endTime), modality: m.name ? str(m.name) : null, place: p.name ? str(p.name) : null, capacity: num(o.capacity), occupied: num(o.occupied) };
    }).filter((e) => e.eventId);
  }

  async classes() {
    const rows = await this.all('/calendar/classes', {});
    return rows.map((r) => {
      const m = (r.modality ?? {}) as Record<string, unknown>;
      const p = (r.place ?? {}) as Record<string, unknown>;
      return { id: str(r.id), name: str(r.name), modality: m.name ? str(m.name) : null, place: p.name ? str(p.name) : null };
    }).filter((c) => c.id);
  }

  async activeCustomerIds() {
    const rows = await this.all('/customers', { status: 'active', type: 'customer' });
    return rows.map((r) => str(r.id)).filter(Boolean);
  }

  async customerContracts(id: string) {
    const rows = await this.all(`/customers/${encodeURIComponent(id)}/contracts`, {});
    return rows.map((r) => {
      const c = (r.contract ?? {}) as Record<string, unknown>;
      return { id: str(r.id), name: str(r.name ?? c.name) || null, startDate: str(r.startDate) || null, dueDate: str(r.dueDate) || null, status: r.status ? str(r.status) : null };
    }).filter((c) => c.id);
  }

  async resource(url: string) {
    const u = new URL(url, this.cfg.base);
    // Só o host da API e caminhos /v1 (o aviso não pode nos fazer chamar outro endereço).
    if (u.origin !== new URL(this.cfg.base).origin || !u.pathname.startsWith('/v1/')) throw new AppError('Link do aviso fora da API da Tecnofit.');
    const res = (await this.get(u.toString())) as Record<string, unknown> | null;
    const d = res && typeof res === 'object' && res.data && !Array.isArray(res.data) ? (res.data as Record<string, unknown>) : res;
    return d && typeof d === 'object' && Object.keys(d).length ? d : null;
  }

  /** Webhooks (chave separada, com permissão de administrar webhooks). */
  async createWebhook(url: string, events: string[], description: string) {
    const token = await this.login();
    await this.pace();
    const res = await this.doFetch(`${this.cfg.base}/v1/webhooks/subscriptions`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(this.cfg.companyId ? { 'X-Company-Id': this.cfg.companyId } : {}) },
      body: JSON.stringify({ url, events, description }),
      signal: AbortSignal.timeout(30_000),
      cache: 'no-store',
    });
    if (!res.ok) throw new TecnofitHttpError(res.status, '/webhooks/subscriptions', await errorDetail(res));
    const b = (await res.json()) as Record<string, unknown>;
    const d = (b.data && typeof b.data === 'object' ? b.data : b) as Record<string, unknown>;
    return { id: str(d.id), secret: str(d.secret), events: Array.isArray(d.events) ? d.events.map(str) : events };
  }

  async listWebhooks() {
    const rows = await this.all('/webhooks/subscriptions', {});
    return rows.map((r) => ({ id: str(r.id), url: str(r.url), events: Array.isArray(r.events) ? r.events.map(str) : [], active: r.ativo !== false && r.active !== false, lastDeliveredAt: str(r.lastDeliveredAt) || null, lastFailedAt: str(r.lastFailedAt) || null }));
  }

  /**
   * Vendas do aluno. Em produção a combinação de parâmetros da doc deu 422 (validação, sem dizer
   * o campo); então tenta combinações da mais provável à mais simples e lembra a que funcionou.
   * Sem filtro de data na API, o corte por data é feito aqui.
   */
  async customerSales(id: string, saleStartDate: string) {
    const path = `/customers/${encodeURIComponent(id)}/sales`;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    const variants: { params: Record<string, string>; limit: number }[] = [
      { params: { saleStartDate, saleEndDate: today }, limit: 50 },
      { params: { saleStartDate, saleEndDate: today, order: 'saleDate', sort: 'asc' }, limit: 50 },
      { params: { saleStartDate }, limit: 50 },
      { params: {}, limit: 50 },
      { params: {}, limit: 10 },
    ];
    const order = this.salesVariant === null ? variants.map((_, i) => i) : [this.salesVariant, ...variants.map((_, i) => i).filter((i) => i !== this.salesVariant)];
    let last: unknown = null;
    for (const i of order) {
      try {
        const rows = await this.all(path, variants[i]!.params, variants[i]!.limit);
        this.salesVariant = i;
        const ds = (this.diag.sales ??= { total: 0, withSeller: 0, shape: '' });
        ds.total += rows.length;
        if (!ds.shape && rows[0]) ds.shape = shapeOf(rows[0]);
        return rows
          .map((r) => { const seller = personOf(r); if (seller) ds.withSeller++; return { ...r, id: str(r.id), seller } as TfCustomerSale; })
          .filter((r) => { const sd = typeof r.saleDate === 'string' ? r.saleDate.slice(0, 10) : null; return !sd || sd >= saleStartDate; });
      } catch (e) {
        if (!(e instanceof TecnofitHttpError && (e.httpStatus === 422 || e.httpStatus === 400))) throw e;
        last = e;
        if (this.salesVariant !== null && i === this.salesVariant) break; // a que funcionava falhou: é deste aluno, não da combinação
      }
    }
    throw last;
  }
  private get salesVariant() { return salesVariantMemo; }
  private set salesVariant(v: number | null) { salesVariantMemo = v; }

  async customerContacts(id: string) {
    const rows = await this.all(`/customers/${encodeURIComponent(id)}/contacts`, {});
    return rows.map((r) => ({ contact: str(r.contact), type: r.type ? str(r.type) : null }));
  }

  async consultants() {
    const rows = await this.all('/employees', { type: 'consultant' });
    return rows.map((r) => ({ id: str(r.id), name: str(r.name), types: Array.isArray(r.types) ? r.types.map(str) : [] })).filter((e) => e.id);
  }

  /**
   * Ligações em janelas de 30 dias (um período longo deu 422 em produção); se a janela
   * ainda for recusada (422), tenta de 7 em 7 dias.
   */
  async calls(startDate: string, endDate: string) {
    const out: TfCall[] = [];
    const windows = (from: string, to: string, size: number) => {
      const w: [string, string][] = [];
      for (let a = from; a <= to; a = addDaysIso(a, size)) w.push([a, minIso(addDaysIso(a, size - 1), to)]);
      return w;
    };
    for (const [a, b] of windows(startDate, endDate, 30)) {
      try {
        out.push(...(await this.callsRange(a, b)));
      } catch (e) {
        if (!(e instanceof TecnofitHttpError && e.httpStatus === 422)) throw e;
        for (const [x, y] of windows(a, b, 7)) out.push(...(await this.callsRange(x, y)));
      }
    }
    return out;
  }

  private async callsRange(startDate: string, endDate: string): Promise<TfCall[]> {
    const rows = await this.all('/crm/calls', { startDate, endDate }, 50);
    const parsed = rows.map((r) => {
      const c = (r.customer ?? r.client ?? {}) as Record<string, unknown>;
      const k = personOf(r);
      const st = str(r.status).toLowerCase();
      const done = /complet|conclu|realiz|done|finaliz/.test(st);
      return {
        customerId: str(c.id ?? r.customerId ?? r.customer_id ?? r.clientId), consultantId: k?.id ?? null, consultantName: k?.name ?? null,
        at: str(r.callDate || r.callDeadline || r.createdAt) || null,
        done, deadline: str(r.callDeadline) || null, doneAt: done ? str(r.callDate) || null : null,
      };
    }).filter((c) => c.customerId);
    const d = (this.diag.calls ??= { raw: 0, parsed: 0, withConsultant: 0, shape: '' });
    d.raw += rows.length; d.parsed += parsed.length; d.withConsultant += parsed.filter((c) => c.consultantId).length;
    if (!d.shape && rows[0]) d.shape = shapeOf(rows[0]);
    return parsed;
  }

  /** Contagens e formato da última leitura (para o aviso da sincronização). */
  diag: TfDiag = {};

}

let fakeFactory: (() => TecnofitApi & TecnofitAgendaApi) | null = null;
/** Testes e o modo TECNOFIT_FAKE injetam a fonte simulada por aqui. */
export function setFakeTecnofit(factory: (() => TecnofitApi & TecnofitAgendaApi) | null) { fakeFactory = factory; }

export async function tecnofitApi(): Promise<{ api: TecnofitApi & TecnofitAgendaApi; cfg: TecnofitConfig; callsMade: () => number }> {
  const cfg = tecnofitConfig();
  if (fakeFactory) return { api: fakeFactory(), cfg: { ...cfg, fake: true, configured: true }, callsMade: () => 0 };
  if (cfg.fake) {
    const { FakeTecnofit } = await import('./fake');
    return { api: new FakeTecnofit(), cfg, callsMade: () => 0 };
  }
  if (!cfg.configured) throw new AppError('Tecnofit não configurada: faltam TECNOFIT_API_KEY e TECNOFIT_API_SECRET nas variáveis da Vercel.');
  const http = new HttpTecnofit(cfg);
  return { api: http, cfg, callsMade: () => http.calls_made };
}
