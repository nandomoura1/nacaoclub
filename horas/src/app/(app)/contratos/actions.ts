'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getPrincipal, requestMeta } from '@/server/auth/session';
import { runAction, type ActionResult } from '@/server/action-result';
import {
  cancelContract, loadDefaultTemplates, previewBuiltins, resendLink, saveContract, saveTemplate, sendContract,
} from '@/server/services/contract-service';

const refresh = () => revalidatePath('/contratos', 'layout');

/** Endereço público do app (para o link de assinatura) quando APP_URL não estiver definido. */
async function origin() {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  return `${h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')}://${host}`;
}

export async function saveContractAction(id: string | null, input: unknown): Promise<ActionResult<string>> {
  return runAction(async () => { const r = await saveContract(await getPrincipal(), id, input, await requestMeta()); refresh(); return r; }, 'Contrato salvo.');
}
export async function sendContractAction(id: string): Promise<ActionResult<{ signerId: string; name: string; link: string; whatsapp: string }[]>> {
  return runAction(async () => { const r = await sendContract(await getPrincipal(), id, await origin(), await requestMeta()); refresh(); return r; }, 'Contrato enviado para assinatura.');
}
export async function resendLinkAction(signerId: string): Promise<ActionResult<{ link: string; whatsapp: string }>> {
  return runAction(async () => { const r = await resendLink(await getPrincipal(), signerId, await origin(), await requestMeta()); refresh(); return r; }, 'Novo link gerado (o anterior deixou de valer).');
}
export async function cancelContractAction(id: string, reason: string): Promise<ActionResult> {
  return runAction(async () => { await cancelContract(await getPrincipal(), id, reason, await requestMeta()); refresh(); return undefined; }, 'Contrato cancelado.');
}
export async function previewBuiltinsAction(companyId: string | null, code: string | null): Promise<ActionResult<Record<string, string>>> {
  return runAction(async () => previewBuiltins(await getPrincipal(), companyId, code));
}
export async function saveTemplateAction(id: string | null, input: unknown): Promise<ActionResult<string>> {
  return runAction(async () => { const r = await saveTemplate(await getPrincipal(), id, input, await requestMeta()); refresh(); return r; }, 'Modelo salvo.');
}
export async function loadDefaultTemplatesAction(): Promise<ActionResult<string[]>> {
  return runAction(async () => { const r = await loadDefaultTemplates(await getPrincipal(), await requestMeta()); refresh(); return r; });
}
