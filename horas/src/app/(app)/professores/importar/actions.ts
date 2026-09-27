'use server';

import { revalidatePath } from 'next/cache';
import { getPrincipal, requestMeta } from '@/server/auth/session';
import { runAction } from '@/server/action-result';
import { AppError } from '@/server/errors';
import { analyzeTeachers, commitTeachers } from '@/server/services/teacher-import-service';

export async function analyzeTeachersAction(form: FormData) {
  return runAction(async () => {
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) throw new AppError('Escolha o arquivo .xlsx.');
    return analyzeTeachers(await getPrincipal(), file);
  });
}

export async function commitTeachersAction(payload: unknown) {
  return runAction(async () => {
    const r = await commitTeachers(await getPrincipal(), payload, await requestMeta());
    revalidatePath('/professores');
    return r;
  });
}
