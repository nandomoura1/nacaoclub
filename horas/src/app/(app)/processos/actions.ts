'use server';

import { revalidatePath } from 'next/cache';
import { getPrincipal, requestMeta } from '@/server/auth/session';
import { runAction, type ActionResult } from '@/server/action-result';
import { todayIso } from '@/lib/today';
import { closeProcMeeting, quickUpdateDemand, saveMeetingNotes, setDemandBlocker, setDemandFocus, startProcMeeting } from '@/server/services/proc-meeting-service';
import { addDemandComment, deleteDemand, demandComments, saveDemand, saveSector, setDemandStatus } from '@/server/services/proc-service';

const refresh = () => { revalidatePath('/processos', 'layout'); revalidatePath('/hoje'); };

export async function saveDemandAction(id: string | null, values: Record<string, unknown>): Promise<ActionResult<string>> {
  return runAction(async () => { const r = await saveDemand(await getPrincipal(), id, values, await requestMeta()); refresh(); return r; }, 'Demanda salva.');
}
export async function setDemandStatusAction(id: string, status: string): Promise<ActionResult> {
  return runAction(async () => { await setDemandStatus(await getPrincipal(), id, status, await requestMeta()); refresh(); return undefined; }, 'Status atualizado.');
}
export async function deleteDemandAction(id: string): Promise<ActionResult> {
  return runAction(async () => { await deleteDemand(await getPrincipal(), id, await requestMeta()); refresh(); return undefined; }, 'Demanda excluída.');
}
export async function demandCommentsAction(id: string): Promise<ActionResult<Awaited<ReturnType<typeof demandComments>>>> {
  return runAction(async () => demandComments(await getPrincipal(), id));
}
export async function addDemandCommentAction(id: string, body: string): Promise<ActionResult> {
  return runAction(async () => { await addDemandComment(await getPrincipal(), id, body, await requestMeta()); refresh(); return undefined; });
}
export async function saveSectorAction(id: string | null, values: Record<string, unknown>): Promise<ActionResult<string>> {
  return runAction(async () => { const r = await saveSector(await getPrincipal(), id, values, await requestMeta()); refresh(); return r; }, 'Setor salvo.');
}

// ── Reunião de líderes ──

export async function startProcMeetingAction(kind: string): Promise<ActionResult<string>> {
  return runAction(async () => { const r = await startProcMeeting(await getPrincipal(), kind, todayIso(), await requestMeta()); refresh(); return r; });
}
export async function setDemandFocusAction(id: string, week: string | null): Promise<ActionResult> {
  return runAction(async () => { await setDemandFocus(await getPrincipal(), id, week, await requestMeta()); refresh(); return undefined; });
}
export async function setDemandBlockerAction(id: string, blocker: string | null): Promise<ActionResult> {
  return runAction(async () => { await setDemandBlocker(await getPrincipal(), id, blocker, await requestMeta()); refresh(); return undefined; });
}
export async function quickUpdateDemandAction(id: string, values: { dueDate?: string | null; ownerId?: string | null }): Promise<ActionResult> {
  return runAction(async () => { await quickUpdateDemand(await getPrincipal(), id, values, await requestMeta()); refresh(); return undefined; });
}
export async function saveMeetingNotesAction(id: string, notes: string): Promise<ActionResult> {
  return runAction(async () => { await saveMeetingNotes(await getPrincipal(), id, notes); return undefined; });
}
export async function closeProcMeetingAction(id: string, notes: string | null, notify: boolean): Promise<ActionResult<{ enviados: number; falhas: string[] }>> {
  return runAction(async () => { const r = await closeProcMeeting(await getPrincipal(), id, notes, notify, todayIso(), await requestMeta()); refresh(); return r; });
}
