'use server';

import { revalidatePath } from 'next/cache';
import { getPrincipal, requestMeta } from '@/server/auth/session';
import { runAction, type ActionResult } from '@/server/action-result';
import { assertCan, can } from '@/server/auth/authz';
import { AppError } from '@/server/errors';
import { todayIso } from '@/lib/today';
import { zapiConfig } from '@/server/whatsapp/zapi';
import { sendWhatsApp, type SendResult } from '@/server/services/whatsapp-service';
import { chargeDocs } from '@/server/services/condo-period-service';
import { condoChargesPdf } from '@/server/condominio/pdf';
import { deleteAutomation, previewAutomation, runAutomation, saveAutomation, setAutomationActive, type RunResult } from '@/server/whatsapp/automations';

/** O usuário pode enviar e a Z-API está configurada? (o botão some quando não). */
export async function whatsAppAvailableAction(): Promise<{ canSend: boolean; configured: boolean; testMode: boolean }> {
  const p = await getPrincipal();
  const c = zapiConfig();
  return { canSend: !!p && can(p, 'whatsapp.send'), configured: c.configured, testMode: !!c.testPhone };
}

export async function sendWhatsAppAction(input: { kind: string; to: string; text: string; hasSecret?: boolean }): Promise<ActionResult<SendResult>> {
  return runAction(async () => { const r = await sendWhatsApp(await getPrincipal(), input, await requestMeta()); revalidatePath('/admin/whatsapp'); return r; });
}

/** Cobrança do condomínio: manda o PDF da prestação de contas com o texto como legenda. */
export async function sendCondoChargeAction(month: string, chargeId: string, to: string, text: string): Promise<ActionResult<SendResult>> {
  return runAction(async () => {
    if (!/^[0-9a-f-]{36}$/i.test(chargeId)) throw new AppError('Cobrança inválida.');
    const principal = await getPrincipal();
    const docs = await chargeDocs(principal, month, chargeId, todayIso());
    const doc = docs[0];
    if (!doc) throw new AppError('Cobrança não encontrada.');
    const pdf = await condoChargesPdf(docs);
    const fileName = `Condominio_${doc.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_')}_${month}.pdf`;
    const r = await sendWhatsApp(principal, { kind: 'CONDOMINIO', to, text }, await requestMeta(), { bytes: pdf, fileName });
    revalidatePath('/admin/whatsapp');
    return r;
  });
}

// ── Automações ─────────────────────────────────────────────

const autoRefresh = () => { revalidatePath('/admin/whatsapp'); revalidatePath('/admin/whatsapp/automacoes'); };

export async function saveAutomationAction(id: string | null, values: Record<string, unknown>): Promise<ActionResult<string>> {
  return runAction(async () => { const r = await saveAutomation(await getPrincipal(), id, values, await requestMeta()); autoRefresh(); return r; }, 'Automação salva.');
}
export async function deleteAutomationAction(id: string): Promise<ActionResult> {
  return runAction(async () => { await deleteAutomation(await getPrincipal(), id, await requestMeta()); autoRefresh(); return undefined; }, 'Automação excluída.');
}
export async function toggleAutomationAction(id: string, active: boolean): Promise<ActionResult> {
  return runAction(async () => { await setAutomationActive(await getPrincipal(), id, active, await requestMeta()); autoRefresh(); return undefined; }, active ? 'Automação ligada.' : 'Automação desligada.');
}

/** Prévia: quem receberia hoje e o texto, sem enviar nada (aceita o rascunho do editor). */
export async function previewAutomationAction(draft: { audience: string; filter: Record<string, unknown> | null; template: string }): Promise<ActionResult<Awaited<ReturnType<typeof previewAutomation>>>> {
  return runAction(async () => {
    assertCan(await getPrincipal(), 'whatsapp.admin');
    return previewAutomation({ audience: draft.audience, filter: draft.filter as never, template: draft.template }, todayIso());
  });
}

/** Enviar agora (fora do dia programado). Marca o período como enviado. */
export async function runAutomationAction(id: string): Promise<ActionResult<RunResult>> {
  return runAction(async () => {
    const p = await getPrincipal();
    assertCan(p, 'whatsapp.admin');
    const r = await runAutomation(id, todayIso(), { force: true, actorName: p.name });
    autoRefresh();
    return r!;
  });
}
