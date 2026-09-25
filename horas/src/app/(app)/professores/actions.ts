'use server';

import { revalidatePath } from 'next/cache';
import { getPrincipal, requestMeta } from '@/server/auth/session';
import { runAction, type ActionResult } from '@/server/action-result';
import { saveTeacher } from '@/server/services/teacher-service';

export async function saveTeacherAction(id: string | null, values: Record<string, unknown>): Promise<ActionResult> {
  return runAction(async () => {
    await saveTeacher(await getPrincipal(), id, values, await requestMeta());
    revalidatePath('/professores');
    return undefined;
  }, 'Professor salvo.');
}
