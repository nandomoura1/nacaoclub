'use server';

import { revalidatePath } from 'next/cache';
import { getPrincipal, requestMeta } from '@/server/auth/session';
import { runAction } from '@/server/action-result';
import { AppError } from '@/server/errors';
import { analyzeWorkbook, commitImport } from '@/server/services/import-service';

export async function analyzeAction(form: FormData) {
  return runAction(async () => {
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) throw new AppError('Escolha o arquivo .xlsx.');
    return analyzeWorkbook(await getPrincipal(), file);
  });
}

export async function commitAction(payload: unknown) {
  return runAction(async () => {
    const r = await commitImport(await getPrincipal(), payload, await requestMeta());
    revalidatePath('/grade');
    revalidatePath('/professores');
    return r;
  });
}
