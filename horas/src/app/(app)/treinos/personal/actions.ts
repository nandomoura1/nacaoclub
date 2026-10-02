'use server';

import { revalidatePath } from 'next/cache';
import { getPrincipal, requestMeta } from '@/server/auth/session';
import { runAction, type ActionResult } from '@/server/action-result';
import { deletePersonalWorkout, savePersonalWorkout } from '@/server/services/personal-workout-service';

export async function savePersonalAction(id: string | null, values: Record<string, unknown>): Promise<ActionResult<string>> {
  return runAction(async () => {
    const r = await savePersonalWorkout(await getPrincipal(), id, values, await requestMeta());
    revalidatePath('/treinos/personal');
    return r;
  }, 'Treino salvo.');
}

export async function deletePersonalAction(id: string): Promise<ActionResult> {
  return runAction(async () => {
    await deletePersonalWorkout(await getPrincipal(), id, await requestMeta());
    revalidatePath('/treinos/personal');
    return undefined;
  }, 'Treino excluído.');
}
