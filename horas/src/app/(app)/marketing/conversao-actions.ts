'use server';

import QRCode from 'qrcode';
import { revalidatePath } from 'next/cache';
import { getPrincipal, requestMeta } from '@/server/auth/session';
import { assertCan } from '@/server/auth/authz';
import { runAction, type ActionResult } from '@/server/action-result';
import { deleteLead, deleteLink, saveLead, saveLink, setLeadStage } from '@/server/services/mkt-leads-service';

const refresh = () => { revalidatePath('/marketing/leads'); revalidatePath('/marketing/canais'); revalidatePath('/marketing/performance'); };

export async function saveLeadAction(id: string | null, values: Record<string, unknown>): Promise<ActionResult<string>> {
  return runAction(async () => { const r = await saveLead(await getPrincipal(), id, values, await requestMeta()); refresh(); return r; }, 'Lead salvo.');
}
export async function setLeadStageAction(id: string, stage: string, lostReason: string | null = null): Promise<ActionResult> {
  return runAction(async () => { await setLeadStage(await getPrincipal(), id, stage, lostReason, await requestMeta()); refresh(); return undefined; });
}
export async function deleteLeadAction(id: string): Promise<ActionResult> {
  return runAction(async () => { await deleteLead(await getPrincipal(), id, await requestMeta()); refresh(); return undefined; }, 'Lead excluído.');
}
export async function saveLinkAction(id: string | null, values: Record<string, unknown>): Promise<ActionResult<string>> {
  return runAction(async () => { const r = await saveLink(await getPrincipal(), id, values, await requestMeta()); refresh(); return r; }, 'Link salvo.');
}
export async function deleteLinkAction(id: string): Promise<ActionResult> {
  return runAction(async () => { await deleteLink(await getPrincipal(), id, await requestMeta()); refresh(); return undefined; }, 'Link excluído.');
}
/** QR Code (PNG em data URL) do link curto, para material impresso. */
export async function linkQrAction(url: string): Promise<ActionResult<string>> {
  return runAction(async () => { assertCan(await getPrincipal(), 'mkt.view'); return QRCode.toDataURL(url, { margin: 1, width: 600, color: { dark: '#022B57', light: '#FFFFFF' } }); });
}
