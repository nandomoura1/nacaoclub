'use server';

import { revalidatePath } from 'next/cache';
import { getPrincipal, requestMeta } from '@/server/auth/session';
import { runAction, type ActionResult } from '@/server/action-result';
import { deleteSpend, saveSpend } from '@/server/services/mkt-traffic-service';

const refresh = () => revalidatePath('/marketing/trafego');

export async function saveSpendAction(id: string | null, values: Record<string, unknown>): Promise<ActionResult<string>> {
  return runAction(async () => { const r = await saveSpend(await getPrincipal(), id, values, await requestMeta()); refresh(); return r; }, 'Gasto salvo.');
}
export async function deleteSpendAction(id: string): Promise<ActionResult> {
  return runAction(async () => { await deleteSpend(await getPrincipal(), id, await requestMeta()); refresh(); return undefined; }, 'Lançamento excluído.');
}
