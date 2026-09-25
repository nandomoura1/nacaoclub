'use server';

import { redirect } from 'next/navigation';
import { createSession, requestMeta } from '@/server/auth/session';
import { AppError } from '@/server/errors';
import { runFirstSetup } from '@/server/services/setup-service';

export async function setupAction(_prev: { error: string | null }, form: FormData): Promise<{ error: string | null }> {
  const meta = await requestMeta();
  try {
    const userId = await runFirstSetup(Object.fromEntries(form), meta);
    await createSession(userId, meta);
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    console.error('[primeiro-acesso]', err);
    return { error: 'Não foi possível concluir. Confira as variáveis na Vercel e tente de novo.' };
  }
  redirect('/admin/cadastros');
}
