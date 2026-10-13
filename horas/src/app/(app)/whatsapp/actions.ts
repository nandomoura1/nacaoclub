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
import { prisma } from '@/server/db';
import { audit } from '@/server/audit';
import { isJobKey } from '@/domain/wa-jobs';
import { jobRecipients, runWaJob, type JobResult } from '@/server/whatsapp/jobs';
import { maskDestination, normalizeDestination } from '@/domain/whatsapp';

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

// ── Envios automáticos ─────────────────────────────────────

export async function toggleWaJobAction(key: string, enabled: boolean): Promise<ActionResult> {
  return runAction(async () => {
    const p = await getPrincipal();
    assertCan(p, 'whatsapp.admin');
    if (!isJobKey(key)) throw new AppError('Envio desconhecido.');
    await prisma.$transaction(async (tx) => {
      await tx.waJob.upsert({ where: { key }, create: { key, enabled }, update: { enabled } });
      await audit(tx, { actorId: p.id, ...(await requestMeta()) }, { action: 'whatsapp.job_toggle', entityType: 'wa_job', entityId: null, after: { envio: key, ligado: enabled }, summary: `${p.name} ${enabled ? 'ligou' : 'desligou'} o envio automático ${key}` });
    });
    revalidatePath('/admin/whatsapp');
    return undefined;
  }, enabled ? 'Envio automático ligado.' : 'Envio automático desligado.');
}

/** Prévia: quem receberia e o texto, sem enviar nada. */
export async function previewWaJobAction(key: string): Promise<ActionResult<{ total: number; semTelefone: string[]; amostras: { para: string; nome: string; texto: string }[] }>> {
  return runAction(async () => {
    const p = await getPrincipal();
    assertCan(p, 'whatsapp.admin');
    if (!isJobKey(key)) throw new AppError('Envio desconhecido.');
    const list = await jobRecipients(key, todayIso());
    const ok = list.filter((r) => r.phone && normalizeDestination(r.phone));
    return {
      total: list.length,
      semTelefone: list.filter((r) => !ok.includes(r)).map((r) => r.name),
      amostras: ok.slice(0, 3).map((r) => ({ para: maskDestination(normalizeDestination(r.phone!)!), nome: r.name, texto: r.text })),
    };
  });
}

/** Enviar agora (fora do dia programado). Marca o período como enviado. */
export async function runWaJobAction(key: string): Promise<ActionResult<JobResult>> {
  return runAction(async () => {
    const p = await getPrincipal();
    assertCan(p, 'whatsapp.admin');
    if (!isJobKey(key)) throw new AppError('Envio desconhecido.');
    const r = await runWaJob(key, todayIso(), { force: true, actorName: p.name });
    revalidatePath('/admin/whatsapp');
    return r!;
  });
}
