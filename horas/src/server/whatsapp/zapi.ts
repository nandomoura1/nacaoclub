import { AppError } from '@/server/errors';

/**
 * Cliente Z-API (só no servidor). Credenciais SÓ por variáveis de ambiente
 * (Vercel): ZAPI_INSTANCE_ID, ZAPI_INSTANCE_TOKEN e, se a conta tiver o token
 * de segurança ativo, ZAPI_CLIENT_TOKEN. ZAPI_TEST_PHONE redireciona todos os
 * envios para um número (modo teste). ZAPI_FAKE=1 simula (desenvolvimento).
 */

export interface ZapiConfig { configured: boolean; testPhone: string | null; fake: boolean; base: string | null; clientToken: string | null; hints: { id: string | null; token: string | null; client: string | null } }

/** Para conferir sem expor: 4 primeiros + 4 últimos + tamanho. */
const hint = (v?: string) => (v ? `${v.slice(0, 4)}…${v.slice(-4)} (${v.length} caracteres)` : null);

/** Limpa o valor colado: aspas, espaços e quebras de linha. */
const clean = (v: string | undefined) => v?.replace(/["'`\s]/g, '') || undefined;

/**
 * Aceita o ID puro ou o link inteiro da Z-API colado por engano
 * (…/instances/<ID>/token/<TOKEN>/send-text): extrai ID e token dele.
 */
export function parseInstance(rawId: string | undefined, rawToken: string | undefined): { id?: string; token?: string } {
  const id = clean(rawId);
  const token = clean(rawToken);
  const fromUrl = (v?: string) => v?.match(/instances\/([^/]+)(?:\/token\/([^/]+))?/i);
  const m = fromUrl(id) ?? fromUrl(token);
  return {
    id: m?.[1] ?? id,
    token: (token && !/instances\//i.test(token) ? token : undefined) ?? m?.[2],
  };
}

export function zapiConfig(): ZapiConfig {
  const { id, token } = parseInstance(process.env.ZAPI_INSTANCE_ID, process.env.ZAPI_INSTANCE_TOKEN);
  const fake = process.env.ZAPI_FAKE === '1';
  const api = (process.env.ZAPI_BASE_URL?.trim() || 'https://api.z-api.io').replace(/\/$/, '');
  return {
    configured: fake || !!(id && token),
    fake,
    testPhone: process.env.ZAPI_TEST_PHONE?.replace(/\D/g, '') || null,
    base: id && token ? `${api}/instances/${encodeURIComponent(id)}/token/${encodeURIComponent(token)}` : null,
    clientToken: clean(process.env.ZAPI_CLIENT_TOKEN) ?? null,
    hints: { id: hint(id), token: hint(token), client: hint(clean(process.env.ZAPI_CLIENT_TOKEN)) },
  };
}

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const c = zapiConfig();
  if (!c.base) throw new AppError('WhatsApp não configurado: faltam ZAPI_INSTANCE_ID e ZAPI_INSTANCE_TOKEN nas variáveis da Vercel.');
  let res: Response;
  try {
    res = await fetch(`${c.base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(c.clientToken ? { 'Client-Token': c.clientToken } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
      cache: 'no-store',
    });
  } catch {
    throw new AppError('Não consegui falar com a Z-API (rede ou tempo esgotado). Tente de novo.');
  }
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* resposta não-JSON */ }
  if (!res.ok) {
    const msg = (json as { error?: string; message?: string } | null)?.error ?? (json as { message?: string } | null)?.message ?? text.slice(0, 200);
    if (res.status === 401 || res.status === 403 || /client-token/i.test(String(msg))) throw new AppError(`Z-API recusou as credenciais (${res.status}). Confira o token da instância e o Client-Token de segurança.`);
    if (res.status === 404 && /instance/i.test(String(msg))) throw new AppError('Z-API não encontrou a instância (404): confira ZAPI_INSTANCE_ID (só o ID, sem aspas nem espaços) e se ele não está trocado com o ZAPI_INSTANCE_TOKEN.');
    if (/token/i.test(String(msg)) && res.status === 400) throw new AppError(`Z-API recusou o token da instância (${res.status}): confira ZAPI_INSTANCE_TOKEN.`);
    throw new AppError(`Z-API respondeu ${res.status}: ${String(msg) || 'erro sem detalhe'}`);
  }
  return json as T;
}

export interface ZapiStatus { connected: boolean; smartphoneConnected: boolean | null; error: string | null }

export async function zapiStatus(): Promise<ZapiStatus> {
  if (zapiConfig().fake) return { connected: true, smartphoneConnected: true, error: null };
  const r = await call<{ connected?: boolean; smartphoneConnected?: boolean; error?: string }>('GET', '/status');
  return { connected: !!r?.connected, smartphoneConnected: r?.smartphoneConnected ?? null, error: r?.error ?? null };
}

/** Envia texto. Devolve o id da mensagem na Z-API. */
export async function zapiSendText(phone: string, message: string): Promise<string | null> {
  if (zapiConfig().fake) return `fake-${Date.now()}`;
  const r = await call<{ messageId?: string; zaapId?: string; id?: string }>('POST', '/send-text', { phone, message });
  return r?.messageId ?? r?.zaapId ?? r?.id ?? null;
}

/** Envia um PDF (base64) com legenda opcional. */
export async function zapiSendPdf(phone: string, pdf: Uint8Array, fileName: string, caption?: string): Promise<string | null> {
  if (zapiConfig().fake) return `fake-${Date.now()}`;
  const document = `data:application/pdf;base64,${Buffer.from(pdf).toString('base64')}`;
  const r = await call<{ messageId?: string; zaapId?: string; id?: string }>('POST', '/send-document/pdf', { phone, document, fileName, ...(caption ? { caption } : {}) });
  return r?.messageId ?? r?.zaapId ?? r?.id ?? null;
}
