import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import type { Role, User } from '@prisma/client';
import { getEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { prisma } from '@/server/db/prisma';

export const SESSION_COOKIE = 'nacao_session';

/**
 * Sessão opaca persistida em banco.
 *
 * O cookie carrega apenas um token aleatório. O banco guarda o HMAC desse
 * token — assim um dump do banco não permite forjar sessão. Revogar é um
 * UPDATE, não uma espera de expiração de JWT.
 */

function tokenHash(token: string): string {
  return createHmac('sha256', getEnv().SESSION_SECRET).update(token).digest('hex');
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  defaultTurnstileId: string | null;
}

function toSessionUser(user: User): SessionUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    defaultTurnstileId: user.defaultTurnstileId,
  };
}

export async function createSession(
  userId: string,
  meta: { ipAddress?: string; userAgent?: string } = {},
): Promise<{ token: string; expiresAt: Date }> {
  const env = getEnv();
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_HOURS * 3600 * 1000);

  await prisma.session.create({
    data: {
      userId,
      tokenHash: tokenHash(token),
      expiresAt,
      ipAddress: meta.ipAddress ?? null,
      // Truncado: user agent longo não acrescenta valor e infla o banco.
      userAgent: meta.userAgent?.slice(0, 255) ?? null,
    },
  });

  return { token, expiresAt };
}

export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** Resolve o usuário da requisição atual. `null` quando não autenticado. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: tokenHash(token) },
    include: { user: true },
  });

  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  if (!session.user.active) return null;

  return toSessionUser(session.user);
}

export async function revokeSession(token: string): Promise<void> {
  const hash = tokenHash(token);
  await prisma.session.updateMany({
    where: { tokenHash: hash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeCurrentSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await revokeSession(token);
}

/** Metadados da requisição para auditoria. Best-effort atrás de proxy. */
export async function requestMeta(): Promise<{ ipAddress?: string; userAgent?: string }> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for');
  return {
    ipAddress: forwarded?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? undefined,
    userAgent: h.get('user-agent') ?? undefined,
  };
}

/** Remove sessões expiradas. Chamar por cron ou no boot. */
export async function pruneExpiredSessions(): Promise<number> {
  const { count } = await prisma.session.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  if (count) logger.info('Sessões expiradas removidas', { count });
  return count;
}

/** Comparação constante para segredos curtos (ex.: assinatura de webhook). */
export function safeCompare(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
