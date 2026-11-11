'use server';

import { revalidatePath } from 'next/cache';
import { getPrincipal, requestMeta } from '@/server/auth/session';
import { runAction, type ActionResult } from '@/server/action-result';
import { assignCases, linkConsultant, syncNow } from '@/server/services/crm-service';

const refresh = () => revalidatePath('/cobranca', 'layout');

export async function assignCasesAction(caseIds: string[], ownerId: string | null): Promise<ActionResult<number>> {
  return runAction(async () => { const n = await assignCases(await getPrincipal(), { caseIds, ownerId }, await requestMeta()); refresh(); return n; }, 'Responsável atualizado.');
}
export async function linkConsultantAction(consultantId: string, userId: string | null): Promise<ActionResult<number>> {
  return runAction(async () => { const n = await linkConsultant(await getPrincipal(), { consultantId, userId }, await requestMeta()); refresh(); return n; });
}
export async function syncNowAction(force: boolean): Promise<ActionResult<{ status: string; processed: number; remaining: number }>> {
  return runAction(async () => {
    const r = await syncNow(await getPrincipal(), { force }, await requestMeta());
    refresh();
    return { status: r.status, processed: r.processed, remaining: r.remaining };
  });
}
