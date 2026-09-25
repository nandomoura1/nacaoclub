'use server';

import { revalidatePath } from 'next/cache';
import { getPrincipal, requestMeta } from '@/server/auth/session';
import { runAction, type ActionResult } from '@/server/action-result';
import { changeSlot, createSlots, endSlot, slotHistory } from '@/server/services/schedule-service';

export async function createSlotsAction(values: Record<string, unknown>): Promise<ActionResult<number>> {
  return runAction(async () => {
    const ids = await createSlots(await getPrincipal(), values, await requestMeta());
    revalidatePath('/grade');
    return ids.length;
  });
}

export async function changeSlotAction(slotId: string, values: Record<string, unknown>): Promise<ActionResult> {
  return runAction(async () => {
    await changeSlot(await getPrincipal(), slotId, values, await requestMeta());
    revalidatePath('/grade');
    return undefined;
  });
}

export async function endSlotAction(slotId: string, from: string, reason?: string): Promise<ActionResult> {
  return runAction(async () => {
    await endSlot(await getPrincipal(), slotId, from, reason, await requestMeta());
    revalidatePath('/grade');
    return undefined;
  });
}

export async function slotHistoryAction(slotId: string) {
  return runAction(async () => slotHistory(await getPrincipal(), slotId));
}
