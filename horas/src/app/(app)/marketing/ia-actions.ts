'use server';

import { revalidatePath } from 'next/cache';
import { todayIso } from '@/lib/today';
import { getPrincipal, requestMeta } from '@/server/auth/session';
import { runAction, type ActionResult } from '@/server/action-result';
import { approveCopy, discardStudio, studioAnalise, studioCopy, studioPauta, studioToTask } from '@/server/services/mkt-studio-service';

const refresh = () => { revalidatePath('/marketing/ia'); revalidatePath('/marketing/kanban'); };

export async function studioCopyAction(values: Record<string, unknown>): Promise<ActionResult<string>> {
  return runAction(async () => { const r = await studioCopy(await getPrincipal(), values, await requestMeta()); refresh(); return r; });
}
export async function studioPautaAction(input: { de: string; ate: string; foco: string | null }): Promise<ActionResult<string>> {
  return runAction(async () => { const r = await studioPauta(await getPrincipal(), input, await requestMeta()); refresh(); return r; });
}
export async function studioAnaliseAction(input: { de: string; ate: string }): Promise<ActionResult<string>> {
  return runAction(async () => { const r = await studioAnalise(await getPrincipal(), input, await requestMeta()); refresh(); return r; });
}
export async function approveCopyAction(id: string, index: number, texto: string): Promise<ActionResult> {
  return runAction(async () => { await approveCopy(await getPrincipal(), id, index, texto, await requestMeta()); refresh(); return undefined; }, 'Texto aprovado.');
}
export async function discardStudioAction(id: string): Promise<ActionResult> {
  return runAction(async () => { await discardStudio(await getPrincipal(), id, await requestMeta()); refresh(); return undefined; }, 'Descartado.');
}
export async function studioToTaskAction(id: string, index: number): Promise<ActionResult<string>> {
  return runAction(async () => { const r = await studioToTask(await getPrincipal(), id, index, todayIso(), await requestMeta()); refresh(); return r; }, 'Tarefa criada no Kanban.');
}
