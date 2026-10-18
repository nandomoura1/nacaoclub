'use server';

import { revalidatePath } from 'next/cache';
import { getPrincipal, requestMeta } from '@/server/auth/session';
import { runAction, type ActionResult } from '@/server/action-result';
import { deleteMaterial, deleteTrack, saveMaterial, saveTrack, setCompleted, startEduUpload } from '@/server/services/edu-service';

const refresh = () => { revalidatePath('/universidade', 'layout'); revalidatePath('/hoje'); revalidatePath('/meu-extrato'); };

export async function startEduUploadAction(file: { name: string; size: number }): Promise<ActionResult<{ path: string; mime: string; uploadUrl: string }>> {
  return runAction(async () => startEduUpload(await getPrincipal(), file));
}
export async function saveMaterialAction(id: string | null, values: Record<string, unknown>): Promise<ActionResult<string>> {
  return runAction(async () => { const r = await saveMaterial(await getPrincipal(), id, values, await requestMeta()); refresh(); return r; }, 'Material salvo.');
}
export async function deleteMaterialAction(id: string): Promise<ActionResult> {
  return runAction(async () => { await deleteMaterial(await getPrincipal(), id, await requestMeta()); refresh(); return undefined; }, 'Material excluído.');
}
export async function setCompletedAction(id: string, done: boolean): Promise<ActionResult> {
  return runAction(async () => { await setCompleted(await getPrincipal(), id, done); refresh(); return undefined; });
}
export async function saveTrackAction(id: string | null, values: Record<string, unknown>): Promise<ActionResult<string>> {
  return runAction(async () => { const r = await saveTrack(await getPrincipal(), id, values, await requestMeta()); refresh(); return r; }, 'Trilha salva.');
}
export async function deleteTrackAction(id: string): Promise<ActionResult> {
  return runAction(async () => { await deleteTrack(await getPrincipal(), id, await requestMeta()); refresh(); return undefined; }, 'Trilha excluída.');
}
