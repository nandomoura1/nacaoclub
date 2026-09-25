import { AppError } from '@/server/errors';

/** Resultado serializável de Server Action — nunca vaza stack para o cliente. */
export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string };

export async function runAction<T>(
  fn: () => Promise<T>,
  message?: string,
): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn(), message };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    console.error('[action] erro inesperado', err);
    return { ok: false, error: 'Algo deu errado. Tente de novo; se persistir, avise o administrador.' };
  }
}
