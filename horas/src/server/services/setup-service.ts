import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '@/server/db';
import { audit } from '@/server/audit';
import { hashPassword } from '@/server/auth/password';
import type { RequestMeta } from '@/server/auth/session';
import { AppError } from '@/server/errors';
import { bootstrapStructure } from './bootstrap';

/**
 * Primeiro acesso em produção: monta a estrutura da Nação e cria o primeiro
 * administrador. Só funciona enquanto NÃO existe nenhum usuário, e exige o
 * SETUP_TOKEN configurado na Vercel — dupla trava contra uso indevido.
 */
export async function needsSetup(): Promise<boolean> {
  return (await prisma.user.count()) === 0;
}

const schema = z.object({
  token: z.string().min(1, 'Informe o código de primeiro acesso.'),
  name: z.string().trim().min(2, 'Informe seu nome.').max(120),
  email: z.string().trim().toLowerCase().email('E-mail inválido.'),
  password: z.string().min(10, 'A senha precisa de ao menos 10 caracteres.').max(200),
});

function sameSecret(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function runFirstSetup(input: unknown, meta: RequestMeta): Promise<string> {
  const expected = process.env.SETUP_TOKEN ?? '';
  if (expected.length < 16) throw new AppError('Primeiro acesso desativado: configure SETUP_TOKEN (16+ caracteres) na Vercel.', 403);
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  if (!sameSecret(parsed.data.token, expected)) throw new AppError('Código de primeiro acesso incorreto.', 403);

  const passwordHash = await hashPassword(parsed.data.password);
  return prisma.$transaction(async (tx) => {
    if ((await tx.user.count()) > 0) throw new AppError('O sistema já foi configurado. Entre pela tela de login.', 409);
    await bootstrapStructure(tx);
    const admin = await tx.role.findUniqueOrThrow({ where: { key: 'ADMIN' } });
    const user = await tx.user.create({
      data: { name: parsed.data.name, email: parsed.data.email, passwordHash, roles: { create: { roleId: admin.id } } },
    });
    await audit(tx, { actorId: user.id, ...meta }, {
      action: 'setup.completed',
      entityType: 'user',
      entityId: user.id,
      summary: `${user.name} configurou o sistema e criou o primeiro administrador`,
    });
    return user.id;
  }, { timeout: 120_000 });
}
