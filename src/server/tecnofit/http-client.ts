import { getEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { loadEndpointMap, type EndpointMap } from './endpoint-map';
import { asDate, pickFirst } from './normalizer';
import { TecnofitError } from './types';

/**
 * Limitador de taxa por janela deslizante, em processo.
 *
 * A documentação oficial informa 100 req/min por endpoint/IP e 200 req/min
 * globais. Trabalhamos abaixo desse teto (TECNOFIT_RATE_LIMIT_PER_MINUTE)
 * porque estourar o limite penaliza a integração inteira, não só a chamada.
 *
 * Limitação conhecida: o estado é por processo. Com múltiplas instâncias
 * seria preciso um limitador compartilhado (Redis). Ver docs/deployment.md.
 */
class SlidingWindowLimiter {
  private hits: number[] = [];

  constructor(private readonly maxPerMinute: number) {}

  async acquire(): Promise<void> {
    const windowMs = 60_000;
    for (;;) {
      const now = Date.now();
      this.hits = this.hits.filter((t) => now - t < windowMs);
      if (this.hits.length < this.maxPerMinute) {
        this.hits.push(now);
        return;
      }
      const oldest = this.hits[0] ?? now;
      const waitMs = Math.max(50, windowMs - (now - oldest));
      logger.debug('Rate limit local atingido, aguardando', { waitMs });
      await sleep(waitMs);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Backoff exponencial com jitter, para não sincronizar retries. */
function backoffMs(attempt: number): number {
  const base = Math.min(8_000, 2 ** attempt * 250);
  return base + Math.random() * 250;
}

let limiter: SlidingWindowLimiter | null = null;

function getLimiter(): SlidingWindowLimiter {
  if (!limiter) limiter = new SlidingWindowLimiter(getEnv().TECNOFIT_RATE_LIMIT_PER_MINUTE);
  return limiter;
}

function baseUrl(): string {
  return getEnv().TECNOFIT_API_BASE_URL.replace(/\/+$/, '');
}

// ============================================================
// AUTENTICAÇÃO POR TROCA DE CREDENCIAIS
// ============================================================
//
// CONFIRMADO pelo painel Tecnofit: as chaves de acesso têm duas partes —
// `api_key` (pública) e `api_secret` (privada) — e as duas juntas são
// trocadas por um **token de acesso temporário**. Não é chave direta no
// header.
//
// Consequências que este módulo trata:
//   - o token precisa ser cacheado, senão gastamos uma requisição de auth
//     para cada chamada e estouramos o rate limit;
//   - o token expira, então renovamos com margem de segurança;
//   - várias chamadas simultâneas não podem disparar N autenticações —
//     há deduplicação da requisição em voo;
//   - um 401 no meio da operação invalida o cache e tenta uma vez mais,
//     porque o token pode ter sido revogado antes de expirar.

interface CachedToken {
  token: string;
  /** Epoch em ms. Já inclui a margem de segurança. */
  expiresAt: number;
}

/** Renovamos 60s antes do vencimento: relógios divergem, rede demora. */
const TOKEN_SKEW_MS = 60_000;

let cachedToken: CachedToken | null = null;
let tokenInFlight: Promise<string> | null = null;

/**
 * Faz a troca credenciais → token.
 *
 * Não passa por `tecnofitRequest` de propósito: esta é a única chamada que
 * não pode exigir um token, sob pena de recursão infinita.
 */
async function fetchAccessToken(map: EndpointMap): Promise<CachedToken> {
  const env = getEnv();
  const ep = map.paths.authToken;

  if (!ep.path) {
    throw new TecnofitError(
      'Endpoint de autenticação não configurado. A Tecnofit troca api_key + ' +
        'api_secret por um token temporário — informe o path desse endpoint em ' +
        'paths.authToken (endpoint-map.ts ou TECNOFIT_ENDPOINT_MAP). ' +
        'Este sistema não adivinha endpoints.',
      'NOT_CONFIGURED',
    );
  }
  if (!env.TECNOFIT_API_KEY || !env.TECNOFIT_API_SECRET) {
    throw new TecnofitError(
      'TECNOFIT_API_KEY e TECNOFIT_API_SECRET são obrigatórios para o fluxo de token.',
      'NOT_CONFIGURED',
    );
  }

  const url = `${baseUrl()}/${ep.path.replace(/^\/+/, '')}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.TECNOFIT_TIMEOUT_MS);

  await getLimiter().acquire();

  try {
    const res = await fetch(url, {
      method: ep.method,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        [map.auth.keyField]: env.TECNOFIT_API_KEY,
        [map.auth.secretField]: env.TECNOFIT_API_SECRET,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      // Nunca logamos o corpo: ele carrega as credenciais que acabamos de enviar.
      logger.error('Falha ao obter token Tecnofit', { path: ep.path, status: res.status });
      throw new TecnofitError(
        `Autenticação Tecnofit falhou (HTTP ${res.status}). ` +
          'Verifique TECNOFIT_API_KEY, TECNOFIT_API_SECRET e o path de authToken.',
        res.status === 401 || res.status === 403 ? 'UNAUTHORIZED' : 'BAD_RESPONSE',
        res.status,
        res.status >= 500,
      );
    }

    const body: unknown = await res.json();
    const token = pickFirst(body, map.auth.tokenPath);

    if (typeof token !== 'string' || !token) {
      throw new TecnofitError(
        'A resposta de autenticação não trouxe token reconhecível. ' +
          `Ajuste auth.tokenPath no EndpointMap (tentados: ${map.auth.tokenPath.join(', ')}).`,
        'BAD_RESPONSE',
      );
    }

    // Validade: preferimos o absoluto, caímos para o relativo e, na falta
    // dos dois, usamos o TTL conservador do mapa.
    const expiresAtRaw = asDate(pickFirst(body, map.auth.expiresAtPath));
    const expiresInRaw = pickFirst(body, map.auth.expiresInPath);
    const expiresInSeconds =
      typeof expiresInRaw === 'number'
        ? expiresInRaw
        : typeof expiresInRaw === 'string' && /^\d+$/.test(expiresInRaw)
          ? Number(expiresInRaw)
          : undefined;

    const absoluteMs =
      expiresAtRaw?.getTime() ??
      Date.now() + (expiresInSeconds ?? map.auth.fallbackTtlSeconds) * 1000;

    // Nunca deixamos a validade efetiva virar passado por causa da margem.
    const expiresAt = Math.max(Date.now() + 30_000, absoluteMs - TOKEN_SKEW_MS);

    logger.info('Token Tecnofit obtido', {
      validoPorSegundos: Math.round((expiresAt - Date.now()) / 1000),
      validadeInformadaPelaApi: expiresAtRaw !== undefined || expiresInSeconds !== undefined,
    });

    return { token, expiresAt };
  } catch (err) {
    if (err instanceof TecnofitError) throw err;
    const aborted = err instanceof Error && err.name === 'AbortError';
    throw new TecnofitError(
      aborted ? 'Timeout ao autenticar na Tecnofit' : 'Falha de rede ao autenticar na Tecnofit',
      aborted ? 'TIMEOUT' : 'NETWORK',
      undefined,
      true,
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Devolve um token válido, reaproveitando o cache.
 * Chamadas simultâneas compartilham a mesma requisição em voo.
 */
async function getAccessToken(map: EndpointMap, forceRefresh = false): Promise<string> {
  if (!forceRefresh && cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }
  if (forceRefresh) cachedToken = null;

  if (tokenInFlight) return tokenInFlight;

  tokenInFlight = fetchAccessToken(map)
    .then((t) => {
      cachedToken = t;
      return t.token;
    })
    .finally(() => {
      tokenInFlight = null;
    });

  return tokenInFlight;
}

/**
 * Monta os headers de autenticação.
 *
 * `token-exchange` é o esquema CONFIRMADO da Tecnofit. Os demais permanecem
 * suportados porque o adapter é genérico e pode servir a outra origem.
 */
async function buildAuthHeaders(map: EndpointMap): Promise<Record<string, string>> {
  const env = getEnv();
  const { TECNOFIT_API_KEY: key, TECNOFIT_API_SECRET: secret } = env;

  if (env.TECNOFIT_AUTH_SCHEME === 'token-exchange') {
    return { Authorization: `Bearer ${await getAccessToken(map)}` };
  }

  if (!key && !secret) {
    throw new TecnofitError(
      'Credenciais Tecnofit ausentes (TECNOFIT_API_KEY / TECNOFIT_API_SECRET).',
      'NOT_CONFIGURED',
    );
  }

  switch (env.TECNOFIT_AUTH_SCHEME) {
    case 'bearer':
      return { Authorization: `Bearer ${secret || key}` };
    case 'api-key-header':
      return { [env.TECNOFIT_AUTH_HEADER]: key || secret };
    case 'basic':
      return {
        Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`,
      };
  }
}

function classify(status: number): { kind: TecnofitError['kind']; retryable: boolean } {
  if (status === 401 || status === 403) return { kind: 'UNAUTHORIZED', retryable: false };
  if (status === 404) return { kind: 'NOT_FOUND', retryable: false };
  if (status === 429) return { kind: 'RATE_LIMITED', retryable: true };
  if (status >= 500) return { kind: 'BAD_RESPONSE', retryable: true };
  return { kind: 'BAD_RESPONSE', retryable: false };
}

export interface RequestOptions {
  path: string;
  method?: 'GET' | 'POST';
  query?: Record<string, string | number | undefined>;
  body?: unknown;
}

/**
 * Executa uma requisição contra a API Tecnofit com timeout, retry,
 * rate limiting e renovação automática de token.
 * Nunca loga corpo de resposta nem credenciais.
 */
export async function tecnofitRequest<T = unknown>(
  opts: RequestOptions,
  map: EndpointMap = loadEndpointMap(),
): Promise<T> {
  const env = getEnv();

  if (!opts.path) {
    throw new TecnofitError(
      'Endpoint não configurado. Preencha src/server/tecnofit/endpoint-map.ts ' +
        'ou a variável TECNOFIT_ENDPOINT_MAP com o path oficial. ' +
        'Este sistema não adivinha endpoints.',
      'NOT_CONFIGURED',
    );
  }

  const url = new URL(`${baseUrl()}/${opts.path.replace(/^\/+/, '')}`);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
  }

  const maxRetries = env.TECNOFIT_MAX_RETRIES;
  /** Um 401 pode ser token revogado antes da hora. Vale exatamente uma renovação. */
  let tokenRefreshed = false;
  let lastError: TecnofitError | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const headers: Record<string, string> = {
      // A documentação exige definição explícita de Content-Type e Accept.
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(await buildAuthHeaders(map)),
    };

    await getLimiter().acquire();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.TECNOFIT_TIMEOUT_MS);
    const startedAt = Date.now();

    try {
      const res = await fetch(url, {
        method: opts.method ?? 'GET',
        headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      });

      const durationMs = Date.now() - startedAt;

      if (!res.ok) {
        // Token revogado ou expirado antes do previsto: renova uma vez e
        // repete, sem consumir o orçamento normal de retries.
        if (
          res.status === 401 &&
          env.TECNOFIT_AUTH_SCHEME === 'token-exchange' &&
          !tokenRefreshed
        ) {
          tokenRefreshed = true;
          logger.warn('401 na Tecnofit — renovando token e repetindo', { path: opts.path });
          await getAccessToken(map, true);
          attempt--;
          continue;
        }

        const { kind, retryable } = classify(res.status);
        // Só o path é logado. Query e corpo podem conter dado pessoal.
        logger.warn('Tecnofit respondeu com erro', {
          path: opts.path,
          status: res.status,
          durationMs,
          attempt,
        });
        lastError = new TecnofitError(
          `Tecnofit retornou HTTP ${res.status} em ${opts.path}`,
          kind,
          res.status,
          retryable,
        );
        if (!retryable || attempt === maxRetries) throw lastError;

        // Respeita Retry-After quando a API o envia.
        const retryAfter = Number(res.headers.get('retry-after'));
        await sleep(
          Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoffMs(attempt),
        );
        continue;
      }

      logger.debug('Tecnofit OK', { path: opts.path, durationMs, attempt });
      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    } catch (err) {
      if (err instanceof TecnofitError) {
        if (!err.retryable || attempt === maxRetries) throw err;
        lastError = err;
        continue;
      }

      const aborted = err instanceof Error && err.name === 'AbortError';
      lastError = new TecnofitError(
        aborted ? `Timeout ao chamar ${opts.path}` : `Falha de rede ao chamar ${opts.path}`,
        aborted ? 'TIMEOUT' : 'NETWORK',
        undefined,
        true,
      );
      logger.warn('Falha na chamada Tecnofit', {
        path: opts.path,
        kind: lastError.kind,
        attempt,
      });
      if (attempt === maxRetries) throw lastError;
      await sleep(backoffMs(attempt));
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError ?? new TecnofitError('Falha desconhecida na integração', 'UNKNOWN');
}

/** Exportado para teste. Reseta limitador e cache de token entre cenários. */
export function __resetClient(): void {
  limiter = null;
  cachedToken = null;
  tokenInFlight = null;
}

/** Exportado para o probe: mostra o estado do token sem revelá-lo. */
export function tokenStatus(): { cached: boolean; expiresInSeconds: number | null } {
  if (!cachedToken) return { cached: false, expiresInSeconds: null };
  return {
    cached: true,
    expiresInSeconds: Math.max(0, Math.round((cachedToken.expiresAt - Date.now()) / 1000)),
  };
}
