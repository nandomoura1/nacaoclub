import { z } from 'zod';
import { prisma } from '@/server/db';
import { audit } from '@/server/audit';
import { hashPassword, verifyPassword } from '@/server/auth/password';
import type { Principal } from '@/server/auth/principal';
import type { RequestMeta } from '@/server/auth/session';
import { AppError } from '@/server/errors';

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Informe um e-mail válido.'),
  password: z.string().min(1, 'Informe a senha.').max(200),
});

/**
 * Hash de uma senha que ninguém tem. Usado quando o e-mail não existe, para
 * que "usuário inexistente" e "senha errada" levem o mesmo tempo — sem
 * oráculo para descobrir quais e-mails têm conta.
 */
let dummyHash: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword('nao-existe-usuario-com-esta-senha');
  return dummyHash;
}

const INVALID = 'E-mail ou senha incorretos.';

/** Valida credenciais. Retorna o id do usuário ou lança AppError genérico. */
export async function authenticate(input: unknown, meta: RequestMeta): Promise<string> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? INVALID);
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  const ok = await verifyPassword(password, user?.passwordHash ?? (await getDummyHash()));

  if (!user || !ok || !user.active) {
    await audit(prisma, { actorId: user?.id ?? null, ...meta }, {
      action: 'auth.login_failed',
      entityType: 'user',
      entityId: user?.id ?? null,
      after: { email, reason: !user ? 'unknown_email' : !ok ? 'wrong_password' : 'inactive' },
      summary: `Tentativa de login recusada para ${email}`,
    });
    throw new AppError(INVALID, 401);
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await audit(tx, { actorId: user.id, ...meta }, {
      action: 'auth.login',
      entityType: 'user',
      entityId: user.id,
      summary: `${user.name} entrou no sistema`,
    });
  });

  return user.id;
}

export const changePasswordSchema = z
  .object({
    current: z.string().min(1, 'Informe a senha atual.'),
    next: z.string().min(8, 'A nova senha precisa de ao menos 8 caracteres.').max(200),
    confirm: z.string(),
  })
  .refine((v) => v.next === v.confirm, { message: 'As senhas não conferem.', path: ['confirm'] })
  .refine((v) => v.next !== v.current, {
    message: 'A nova senha precisa ser diferente da atual.',
    path: ['next'],
  });

export async function changeOwnPassword(
  principal: Principal,
  input: unknown,
  meta: RequestMeta,
): Promise<void> {
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');

  const user = await prisma.user.findUniqueOrThrow({ where: { id: principal.id } });
  if (!(await verifyPassword(parsed.data.current, user.passwordHash))) {
    throw new AppError('A senha atual está incorreta.');
  }

  const passwordHash = await hashPassword(parsed.data.next);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash, mustChangePassword: false },
    });
    await audit(tx, { actorId: user.id, ...meta }, {
      action: 'auth.password_changed',
      entityType: 'user',
      entityId: user.id,
      summary: `${user.name} trocou a própria senha`,
    });
  });
}
