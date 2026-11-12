'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { todayIso } from '@/lib/today';
import { selfBaseUrl } from '@/lib/app-url';
import { getPrincipal, requestMeta } from '@/server/auth/session';
import { runAction, type ActionResult } from '@/server/action-result';
import { assignCases, linkConsultant, syncNow } from '@/server/services/crm-service';
import { createManualTask, markTaskDone, removeTask, saveAgentRule, searchCustomers, snoozeTask } from '@/server/services/crm-task-service';

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
    // Não coube no clique: a rodada continua sozinha em segundo plano (mesma rota do agendamento da madrugada).
    const secret = process.env.CRON_SECRET;
    const base = selfBaseUrl();
    if (r.status === 'RODANDO' && secret && base) {
      after(() => fetch(`${base}/api/cron/tecnofit?dia=${todayIso()}&parte=2`, { headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(10_000) }).then(() => undefined, () => undefined));
    }
    return { status: r.status, processed: r.processed, remaining: r.remaining };
  });
}
export async function markTaskDoneAction(taskId: string): Promise<ActionResult> {
  return runAction(async () => { await markTaskDone(await getPrincipal(), { taskId }, await requestMeta()); refresh(); return undefined; }, 'Tarefa concluída.');
}
export async function snoozeTaskAction(taskId: string, until: string): Promise<ActionResult> {
  return runAction(async () => { await snoozeTask(await getPrincipal(), { taskId, until }, await requestMeta()); refresh(); return undefined; }, 'Tarefa adiada.');
}
export async function removeTaskAction(taskId: string, reason: string): Promise<ActionResult> {
  return runAction(async () => { await removeTask(await getPrincipal(), { taskId, reason }, await requestMeta()); refresh(); return undefined; }, 'Tarefa tirada da lista.');
}
export async function createManualTaskAction(input: { ownerId: string; showFrom: string; title: string; note?: string | null; customerId?: string | null }): Promise<ActionResult<string>> {
  return runAction(async () => { const id = await createManualTask(await getPrincipal(), input, await requestMeta()); refresh(); return id; }, 'Tarefa criada.');
}
export async function searchCustomersAction(q: string): Promise<ActionResult<{ id: string; name: string; tecnofitId: string }[]>> {
  return runAction(async () => searchCustomers(await getPrincipal(), q));
}
export async function saveAgentRuleAction(input: { userId: string; taskKinds: string[]; sendHour: number; sendDays: number[] }): Promise<ActionResult> {
  return runAction(async () => { await saveAgentRule(await getPrincipal(), input, await requestMeta()); refresh(); return undefined; }, 'Regras salvas.');
}
