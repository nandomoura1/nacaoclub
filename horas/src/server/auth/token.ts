import { createHmac, randomBytes } from 'node:crypto';

/**
 * Tokens de sessão — funções puras, testáveis sem Next.
 *
 * O cookie carrega 32 bytes aleatórios. O banco guarda só o HMAC-SHA256
 * do token com SESSION_SECRET: um dump do banco não permite forjar sessão.
 */
export function newSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string, secret: string): string {
  return createHmac('sha256', secret).update(token).digest('hex');
}
