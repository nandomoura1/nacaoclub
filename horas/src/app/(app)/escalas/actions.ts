'use server';

import { revalidatePath } from 'next/cache';
import { getPrincipal, requestMeta } from '@/server/auth/session';
import { runAction, type ActionResult } from '@/server/action-result';
import { saveDuty } from '@/server/services/duty-service';

export async function saveDutyAction(input: unknown): Promise<ActionResult<{ shifts: number; minutes: number; warnings: string[] }>> {
  return runAction(async () => {
    const r = await saveDuty(await getPrincipal(), input, await requestMeta());
    revalidatePath('/escalas');
    revalidatePath('/professores');
    revalidatePath('/relatorios');
    return r;
  });
}
