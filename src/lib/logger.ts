import { getEnv } from './env';

type Level = 'debug' | 'info' | 'warn' | 'error';
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/**
 * Chaves que jamais podem aparecer em log, em nenhuma profundidade.
 * A redação acontece antes da serialização — não depende de disciplina
 * de quem chama.
 */
const SECRET_KEYS = [
  'password', 'passwordhash', 'senha', 'token', 'tokenhash', 'secret',
  'apikey', 'api_key', 'apisecret', 'api_secret', 'authorization',
  'cookie', 'sessiontoken', 'signature', 'cpf',
];

function isSecretKey(key: string): boolean {
  const k = key.toLowerCase().replace(/[-_]/g, '');
  return SECRET_KEYS.some((s) => k.includes(s.replace(/[-_]/g, '')));
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[profundidade máxima]';
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = isSecretKey(k) ? '[REDACTED]' : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

function emit(level: Level, message: string, meta?: Record<string, unknown>) {
  let min: Level = 'info';
  try {
    min = getEnv().LOG_LEVEL;
  } catch {
    // Ambiente ainda não validado (ex.: durante o boot). Não derruba o log.
  }
  if (ORDER[level] < ORDER[min]) return;

  const line = {
    ts: new Date().toISOString(),
    level,
    message,
    ...(meta ? { meta: redact(meta) } : {}),
  };
  const serialized = JSON.stringify(line);
  if (level === 'error') console.error(serialized);
  else if (level === 'warn') console.warn(serialized);
  else console.log(serialized);
}

export const logger = {
  debug: (m: string, meta?: Record<string, unknown>) => emit('debug', m, meta),
  info: (m: string, meta?: Record<string, unknown>) => emit('info', m, meta),
  warn: (m: string, meta?: Record<string, unknown>) => emit('warn', m, meta),
  error: (m: string, meta?: Record<string, unknown>) => emit('error', m, meta),
};
