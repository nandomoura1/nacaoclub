import { cookies, headers } from 'next/headers';
import { cache } from 'react';
import { getEnv } from '@/lib/env';
import { prisma } from '@/server/db';
import { AuthenticationError } from '@/server/errors';
import { loadPrincipal, type Principal } from './principal';
import { hashSessionToken, newSessionToken } from './token';

export const SESSION_COOKIE = 'nacao_horas_session';

export interface RequestMeta {
  ipAddress?: string;
  userAgent?: string;
}

export async function createSession(userId: string, meta: RequestMeta): Promise<void> {
  const env = getEnv();
  const token = newSessionToken();
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_HOURS * 3600 * 1000);

  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashSessionToken(token, env.SESSION_SECRET),
      expiresAt,
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent?.slice(0, 255) ?? null,
    },
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  });
}

/**
 * Usuário da requisição atual, ou `null`. Memoizado por requisição
 * (React cache): layout e página não consultam o banco duas vezes.
 */
export const getPrincipal = cache(async (): Promise<Principal | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token, getEnv().SESSION_SECRET) },
    select: { userId: true, expiresAt: true, revokedAt: true },
  });
  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;

  return loadPrincipal(prisma, session.userId);
});

export async function requirePrincipal(): Promise<Principal> {
  const principal = await getPrincipal();
  if (!principal) throw new AuthenticationError();
  return principal;
}

export async function destroyCurrentSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.updateMany({
      where: { tokenHash: hashSessionToken(token, getEnv().SESSION_SECRET), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  store.delete(SESSION_COOKIE);
}

/** Revoga todas as sessões de um usuário (desativação, troca de senha). */
export async function revokeUserSessions(userId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** IP e user-agent para a auditoria. Best-effort atrás de proxy. */
export async function requestMeta(): Promise<RequestMeta> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for');
  return {
    ipAddress: forwarded?.split(',')[0]?.trim() || h.get('x-real-ip') || undefined,
    userAgent: h.get('user-agent') ?? undefined,
  };
}
