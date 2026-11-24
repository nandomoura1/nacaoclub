'use server';

import { revalidatePath } from 'next/cache';
import { todayIso } from '@/lib/today';
import { getPrincipal, requestMeta } from '@/server/auth/session';
import { runAction, type ActionResult } from '@/server/action-result';
import { approvePlan, cronogramaText, deletePost, generatePlan, importPlanText, markPost, postToTask, reopenPlan, savePlanInfo, savePost } from '@/server/services/mkt-cronograma-service';

const refresh = () => { revalidatePath('/marketing/cronograma'); revalidatePath('/marketing/kanban'); revalidatePath('/marketing/calendario'); };

export async function savePlanInfoAction(month: string, values: Record<string, unknown>): Promise<ActionResult> {
  return runAction(async () => { await savePlanInfo(await getPrincipal(), month, values, await requestMeta()); refresh(); return undefined; }, 'Objetivos salvos.');
}
export async function savePostAction(month: string, id: string | null, values: Record<string, unknown>): Promise<ActionResult<string>> {
  return runAction(async () => { const r = await savePost(await getPrincipal(), month, id, values, await requestMeta()); refresh(); return r; }, 'Post salvo.');
}
export async function deletePostAction(month: string, id: string): Promise<ActionResult> {
  return runAction(async () => { await deletePost(await getPrincipal(), month, id, await requestMeta()); refresh(); return undefined; }, 'Post tirado do cronograma.');
}
export async function markPostAction(id: string, values: { status: string; views: number | null }): Promise<ActionResult> {
  return runAction(async () => { await markPost(await getPrincipal(), id, values, await requestMeta()); refresh(); return undefined; }, 'Resultado salvo.');
}
export async function postToTaskAction(id: string, assigneeId: string | null): Promise<ActionResult<string>> {
  return runAction(async () => { const r = await postToTask(await getPrincipal(), id, assigneeId, todayIso(), await requestMeta()); refresh(); return r; }, 'Tarefa criada no Kanban.');
}
export async function approvePlanAction(month: string): Promise<ActionResult> {
  return runAction(async () => { await approvePlan(await getPrincipal(), month, await requestMeta()); refresh(); return undefined; }, 'Cronograma aprovado.');
}
export async function reopenPlanAction(month: string, reason: string): Promise<ActionResult> {
  return runAction(async () => { await reopenPlan(await getPrincipal(), month, reason, await requestMeta()); refresh(); return undefined; }, 'Cronograma reaberto para edição.');
}
export async function generatePlanAction(month: string): Promise<ActionResult<{ created: number; note: string }>> {
  return runAction(async () => { const r = await generatePlan(await getPrincipal(), month, await requestMeta()); refresh(); return r; });
}
export async function importPlanTextAction(month: string, text: string): Promise<ActionResult<{ created: number; repeated: number; skipped: number }>> {
  return runAction(async () => { const r = await importPlanText(await getPrincipal(), month, text, await requestMeta()); refresh(); return r; });
}
export async function cronogramaTextAction(month: string): Promise<ActionResult<string>> {
  return runAction(async () => cronogramaText(await getPrincipal(), month));
}
