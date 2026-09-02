import { getEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
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

export interface RequestOptions {
  path: string;
  method?: 'GET' | 'POST';
  query?: Record<string, string | number | undefined>;
  body?: unknown;
}

let limiter: SlidingWindowLimiter | null = null;

function getLimiter(): SlidingWindowLimiter {
  if (!limiter) limiter = new SlidingWindowLimiter(getEnv().TECNOFIT_RATE_LIMIT_PER_MINUTE);
  return limiter;
}

/**
 * Monta os headers de autenticação.
 *
 * ⚠️ NÃO VERIFICADO: o esquema real de autenticação da API Tecnofit não pôde
 * ser confirmado na documentação oficial neste ambiente. Suportamos os três
 * esquemas usuais e a escolha é feita por TECNOFIT_AUTH_SCHEME, sem mudança
 * de código. Ver docs/tecnofit-integration.md.
 */
function buildAuthHeaders(): Record<string, string> {
  const env = getEnv();
  const { TECNOFIT_API_KEY: key, TECNOFIT_API_SECRET: secret } = env;

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

/**
 * Executa uma requisição contra a API Tecnofit com timeout, retry e
 * rate limiting. Nunca loga corpo de resposta nem credenciais.
 */
export async function tecnofitRequest<T = unknown>(opts: RequestOptions): Promise<T> {
  const env = getEnv();

  if (!opts.path) {
    throw new TecnofitError(
      'Endpoint não configurado. Preencha src/server/tecnofit/endpoint-map.ts ' +
        'ou a variável TECNOFIT_ENDPOINT_MAP com o path oficial. ' +
        'Este sistema não adivinha endpoints.',
      'NOT_CONFIGURED',
    );
  }

  const base = env.TECNOFIT_API_BASE_URL.replace(/\/+$/, '');
  const url = new URL(`${base}/${opts.path.replace(/^\/+/, '')}`);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
  }

  const headers: Record<string, string> = {
    // A documentação exige definição explícita de Content-Type e Accept.
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...buildAuthHeaders(),
  };

  const maxRetries = env.TECNOFIT_MAX_RETRIES;
  let lastError: TecnofitError | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
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
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoffMs(attempt));
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

/** Exportado para teste. Reseta o limitador entre cenários. */
export function __resetLimiter(): void {
  limiter = null;
}
