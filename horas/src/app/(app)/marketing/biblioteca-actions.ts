'use server';

import { revalidatePath } from 'next/cache';
import { getPrincipal, requestMeta } from '@/server/auth/session';
import { runAction, type ActionResult } from '@/server/action-result';
import { deleteAsset, registerAsset, setAssetStatus, startAssetUpload, updateAsset } from '@/server/services/mkt-asset-service';

const refresh = () => revalidatePath('/marketing/biblioteca');

export async function startAssetUploadAction(file: { name: string; size: number }): Promise<ActionResult<{ path: string; mime: string; uploadUrl: string }>> {
  return runAction(async () => startAssetUpload(await getPrincipal(), file));
}
export async function registerAssetAction(input: { path: string; fileName: string; sendToReview?: boolean } & Record<string, unknown>): Promise<ActionResult<string>> {
  return runAction(async () => { const r = await registerAsset(await getPrincipal(), input, await requestMeta()); refresh(); return r; });
}
export async function updateAssetAction(id: string, values: Record<string, unknown>): Promise<ActionResult> {
  return runAction(async () => { await updateAsset(await getPrincipal(), id, values, await requestMeta()); refresh(); return undefined; }, 'Arquivo atualizado.');
}
export async function setAssetStatusAction(id: string, status: string, note: string | null = null): Promise<ActionResult> {
  return runAction(async () => { await setAssetStatus(await getPrincipal(), id, status, note, await requestMeta()); refresh(); return undefined; });
}
export async function deleteAssetAction(id: string): Promise<ActionResult> {
  return runAction(async () => { await deleteAsset(await getPrincipal(), id, await requestMeta()); refresh(); return undefined; }, 'Arquivo excluído.');
}
