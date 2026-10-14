'use server';

import { revalidatePath } from 'next/cache';
import { todayIso } from '@/lib/today';
import { getPrincipal, requestMeta } from '@/server/auth/session';
import { runAction, type ActionResult } from '@/server/action-result';
import { deleteNotice, markNoticeRead, noticeReaders, previewNotice, publishNotice, saveNotice, type SendResult } from '@/server/services/mkt-notice-service';

const refresh = () => { revalidatePath('/marketing/interna'); revalidatePath('/hoje'); revalidatePath('/meu-extrato'); };
type Filter = { modalityId?: string | null; roleKey?: string | null; numbers?: string[] } | null;

export async function saveNoticeAction(id: string | null, values: Record<string, unknown>): Promise<ActionResult<string>> {
  return runAction(async () => { const r = await saveNotice(await getPrincipal(), id, values, await requestMeta()); refresh(); return r; }, 'Comunicado salvo.');
}
export async function previewNoticeAction(input: { audience: string; filter: Filter; kind: string; title: string; body: string; askConfirmation: boolean }) {
  return runAction(async () => previewNotice(await getPrincipal(), input, todayIso()));
}
export async function publishNoticeAction(id: string): Promise<ActionResult<SendResult | null>> {
  return runAction(async () => { const r = await publishNotice(await getPrincipal(), id, todayIso(), await requestMeta()); refresh(); return r; });
}
export async function deleteNoticeAction(id: string): Promise<ActionResult> {
  return runAction(async () => { await deleteNotice(await getPrincipal(), id, await requestMeta()); refresh(); return undefined; }, 'Comunicado excluído.');
}
export async function markNoticeReadAction(id: string): Promise<ActionResult> {
  return runAction(async () => { await markNoticeRead(await getPrincipal(), id); refresh(); return undefined; });
}
export async function noticeReadersAction(id: string) {
  return runAction(async () => noticeReaders(await getPrincipal(), id));
}
