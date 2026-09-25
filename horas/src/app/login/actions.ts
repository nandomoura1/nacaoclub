'use server';

import { redirect } from 'next/navigation';
import { authenticate } from '@/server/services/auth-service';
import { createSession, destroyCurrentSession, requestMeta } from '@/server/auth/session';
import { AppError } from '@/server/errors';

export type LoginState = { error: string | null; email: string };

/** Só aceita caminhos internos: evita open redirect via ?next=. */
function safeNext(value: FormDataEntryValue | null): string {
  const s = typeof value === 'string' ? value : '';
  return s.startsWith('/') && !s.startsWith('//') ? s : '/hoje';
}

export async function loginAction(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get('email') ?? '');
  const meta = await requestMeta();
  try {
    const userId = await authenticate({ email, password: form.get('password') }, meta);
    await createSession(userId, meta);
  } catch (err) {
    if (err instanceof AppError) return { error: err.message, email };
    console.error('[login] erro inesperado', err);
    return { error: 'Não foi possível entrar agora. Tente novamente.', email };
  }
  redirect(safeNext(form.get('next')));
}

export async function logoutAction(): Promise<void> {
  await destroyCurrentSession();
  redirect('/login');
}
