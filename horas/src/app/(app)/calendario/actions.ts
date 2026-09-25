'use server';

import { revalidatePath } from 'next/cache';
import { getPrincipal, requestMeta } from '@/server/auth/session';
import { runAction } from '@/server/action-result';
import { decideHoliday, generatePeriod } from '@/server/services/period-service';

export async function generatePeriodAction(year: number, month: number) {
  return runAction(async () => {
    const r = await generatePeriod(await getPrincipal(), { year, month }, await requestMeta());
    revalidatePath('/calendario');
    revalidatePath('/hoje');
    return r;
  });
}

export async function decideHolidayAction(date: string, decision: 'MANTER' | 'CANCELAR', areaId: string | null) {
  return runAction(async () => {
    const n = await decideHoliday(await getPrincipal(), date, decision, areaId, await requestMeta());
    revalidatePath('/calendario');
    revalidatePath('/hoje');
    return n;
  });
}
