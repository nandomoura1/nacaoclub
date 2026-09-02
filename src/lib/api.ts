import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { AuthenticationError, AuthorizationError } from '@/server/auth/rbac';
import { getCurrentUser, type SessionUser } from '@/server/auth/session';

/** Resposta de erro padronizada. Mensagem útil para o usuário, sem vazar interno. */
export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

/**
 * Envelopa um handler autenticado.
 *
 * Todo endpoint passa por aqui — é o que garante que nenhuma rota nasça
 * acidentalmente pública. Erros de autorização viram 401/403 limpos;
 * qualquer outro erro é logado e vira 500 genérico, sem stack no cliente.
 */
export function withAuth<A extends unknown[]>(
  handler: (user: SessionUser, ...args: A) => Promise<Response>,
) {
  return async (...args: A): Promise<Response> => {
    try {
      const user = await getCurrentUser();
      if (!user) return fail('Autenticação necessária.', 401);
      return await handler(user, ...args);
    } catch (err) {
      if (err instanceof AuthorizationError) return fail(err.message, 403);
      if (err instanceof AuthenticationError) return fail(err.message, 401);

      const message = (err as Error).message;
      logger.error('Erro não tratado em rota de API', { error: message });

      // Erros de validação carregam mensagem escrita para humano; os demais
      // são engolidos para não expor detalhe de implementação.
      const isValidation = /não pode|deve ter|não encontrada|desconhecid|inválid/i.test(message);
      return fail(isValidation ? message : 'Erro interno. Tente novamente.', isValidation ? 400 : 500);
    }
  };
}
