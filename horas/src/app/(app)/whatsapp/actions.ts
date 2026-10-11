'use server';

import { revalidatePath } from 'next/cache';
import { getPrincipal, requestMeta } from '@/server/auth/session';
import { runAction, type ActionResult } from '@/server/action-result';
import { can } from '@/server/auth/authz';
import { AppError } from '@/server/errors';
import { todayIso } from '@/lib/today';
import { zapiConfig } from '@/server/whatsapp/zapi';
import { sendWhatsApp, type SendResult } from '@/server/services/whatsapp-service';
import { chargeDocs } from '@/server/services/condo-period-service';
import { condoChargesPdf } from '@/server/condominio/pdf';

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
