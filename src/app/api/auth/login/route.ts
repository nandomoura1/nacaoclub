import { z } from 'zod';
import { prisma } from '@/server/db/prisma';
import { verifyPassword } from '@/server/auth/password';
import { createSession, requestMeta, setSessionCookie } from '@/server/auth/session';
import { AuditService } from '@/server/services/audit-service';
import { logger } from '@/lib/logger';
import { fail, ok } from '@/lib/api';

const schema = z.object({
  email: z.string().email('E-mail inválido.'),
  password: z.string().min(1, 'Informe a senha.'),
});

/**
 * Rate limiting simples por IP, em memória.
 *
 * Suficiente para conter tentativa de força bruta numa instância única.
 * Em deploy multi-instância isso precisa migrar para um store compartilhado —
 * documentado em docs/security.md.
 */
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 10 * 60_000;

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > MAX_ATTEMPTS;
}

export async function POST(request: Request) {
  const meta = await requestMeta();
  const ip = meta.ipAddress ?? 'desconhecido';

  if (rateLimited(ip)) {
    logger.warn('Login bloqueado por excesso de tentativas', { ip });
    return fail('Muitas tentativas. Aguarde alguns minutos.', 429);
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? 'Dados inválidos.', 400);
  }

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });

  // Mensagem idêntica para e-mail inexistente e senha errada: não entregamos
  // ao atacante a informação de quais e-mails existem.
  const invalid = () => fail('E-mail ou senha incorretos.', 401);

  if (!user || !user.active) {
    // Verificação falsa para igualar o tempo de resposta e não vazar
    // a existência da conta por temporização.
    await verifyPassword(password, 'scrypt$1$00$00');
    return invalid();
  }

  if (!(await verifyPassword(password, user.passwordHash))) {
    await AuditService.record({
      userId: user.id,
      action: 'LOGIN_FAILED',
      entity: 'User',
      entityId: user.id,
      ...meta,
    });
    return invalid();
  }

  const { token, expiresAt } = await createSession(user.id, meta);
  await setSessionCookie(token, expiresAt);

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await AuditService.record({
    userId: user.id,
    action: 'LOGIN_SUCCESS',
    entity: 'User',
    entityId: user.id,
    ...meta,
  });

  attempts.delete(ip);
  logger.info('Login realizado', { userId: user.id, role: user.role });

  return ok({
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
      defaultTurnstileId: user.defaultTurnstileId,
    },
  });
}
