'use server';

import { revalidatePath } from 'next/cache';
import { getPrincipal, requestMeta } from '@/server/auth/session';
import { runAction, type ActionResult } from '@/server/action-result';
import { saveTeacherFromForm } from '@/server/services/teacher-service';
import { todayIso } from '@/lib/today';

export async function saveTeacherAction(id: string | null, values: Record<string, unknown>): Promise<ActionResult<Awaited<ReturnType<typeof saveTeacherFromForm>>>> {
  return runAction(async () => {
    const r = await saveTeacherFromForm(await getPrincipal(), id, values, await requestMeta(), todayIso());
    revalidatePath('/professores', 'layout');
    if (r.grade) { revalidatePath('/grade'); revalidatePath('/calendario'); revalidatePath('/hoje'); }
    return r;
  }, 'Professor salvo.');
}
