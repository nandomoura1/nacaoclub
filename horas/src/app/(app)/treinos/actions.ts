'use server';

import { revalidatePath } from 'next/cache';
import { getPrincipal, requestMeta } from '@/server/auth/session';
import { runAction, type ActionResult } from '@/server/action-result';
import { changeWeekModality, createWeek, deleteWeek, saveWeek } from '@/server/services/workout-service';

export async function createWeekAction(input: { modalityId: string; date: string; copyPrevious: boolean }): Promise<ActionResult<string>> {
  return runAction(async () => {
    const id = await createWeek(await getPrincipal(), input, await requestMeta());
    revalidatePath('/treinos');
    return id;
  });
}

export async function saveWeekAction(id: string, values: Record<string, unknown>): Promise<ActionResult> {
  return runAction(async () => {
    await saveWeek(await getPrincipal(), id, values, await requestMeta());
    revalidatePath('/treinos');
    revalidatePath(`/treinos/${id}`);
    return undefined;
  }, 'Treinos salvos.');
}

export async function deleteWeekAction(id: string): Promise<ActionResult> {
  return runAction(async () => {
    await deleteWeek(await getPrincipal(), id, await requestMeta());
    revalidatePath('/treinos');
    return undefined;
  });
}

export async function changeWeekModalityAction(id: string, modalityId: string): Promise<ActionResult<string>> {
  return runAction(async () => {
    const to = await changeWeekModality(await getPrincipal(), id, modalityId, await requestMeta());
    revalidatePath('/treinos');
    revalidatePath(`/treinos/${id}`);
    revalidatePath(`/treinos/${to}`);
    return to;
  });
}
