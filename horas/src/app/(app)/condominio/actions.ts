'use server';

import { revalidatePath } from 'next/cache';
import { getPrincipal, requestMeta } from '@/server/auth/session';
import { runAction, type ActionResult } from '@/server/action-result';
import { AppError } from '@/server/errors';
import { deleteRecurringItem, saveCenter, saveCondoSettings, saveIptuYear, saveMeter, saveRecurringItem } from '@/server/services/condo-service';
import { closePeriod, markCharge, openPeriod, reopenPeriod, savePeriod } from '@/server/services/condo-period-service';
import { analyzeCondoImport, commitCondoImport, type CondoImportAnalysis } from '@/server/services/condo-import-service';

const refresh = (month?: string) => {
  revalidatePath('/condominio');
  revalidatePath('/condominio/competencias');
  revalidatePath('/condominio/cadastros');
  if (month) revalidatePath(`/condominio/competencias/${month}`);
};

export async function saveSettingsAction(values: Record<string, unknown>): Promise<ActionResult> {
  return runAction(async () => { await saveCondoSettings(await getPrincipal(), values, await requestMeta()); refresh(); return undefined; }, 'Dados de recebimento salvos.');
}
export async function saveCenterAction(id: string | null, values: Record<string, unknown>): Promise<ActionResult<string>> {
  return runAction(async () => { const r = await saveCenter(await getPrincipal(), id, values, await requestMeta()); refresh(); return r; }, 'Centro de custo salvo.');
}
export async function saveMeterAction(id: string | null, values: Record<string, unknown>): Promise<ActionResult<string>> {
  return runAction(async () => { const r = await saveMeter(await getPrincipal(), id, values, await requestMeta()); refresh(); return r; }, 'Relógio salvo.');
}
export async function saveItemAction(id: string | null, values: Record<string, unknown>): Promise<ActionResult<string>> {
  return runAction(async () => { const r = await saveRecurringItem(await getPrincipal(), id, values, await requestMeta()); refresh(); return r; }, 'Item salvo.');
}
export async function deleteItemAction(id: string): Promise<ActionResult> {
  return runAction(async () => { await deleteRecurringItem(await getPrincipal(), id, await requestMeta()); refresh(); return undefined; }, 'Item excluído.');
}
export async function saveIptuAction(values: Record<string, unknown>): Promise<ActionResult> {
  return runAction(async () => { await saveIptuYear(await getPrincipal(), values, await requestMeta()); refresh(); return undefined; }, 'IPTU salvo.');
}

const fileOf = (form: FormData) => {
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) throw new AppError('Escolha a planilha .xlsx.');
  return file;
};
export async function analyzeImportAction(form: FormData): Promise<ActionResult<CondoImportAnalysis>> {
  return runAction(async () => analyzeCondoImport(await getPrincipal(), fileOf(form)));
}
export async function commitImportAction(form: FormData): Promise<ActionResult<{ periods: number; latest: string }>> {
  return runAction(async () => { const r = await commitCondoImport(await getPrincipal(), fileOf(form), await requestMeta()); refresh(); return r; });
}

export async function openPeriodAction(month: string): Promise<ActionResult<string>> {
  return runAction(async () => { const m = await openPeriod(await getPrincipal(), month, await requestMeta()); refresh(m); return m; });
}
export async function savePeriodAction(month: string, values: Record<string, unknown>): Promise<ActionResult> {
  return runAction(async () => { await savePeriod(await getPrincipal(), month, values, await requestMeta()); refresh(month); return undefined; }, 'Competência salva.');
}
export async function closePeriodAction(month: string): Promise<ActionResult<{ charges: number; totalCents: number }>> {
  return runAction(async () => { const r = await closePeriod(await getPrincipal(), month, await requestMeta()); refresh(month); return r; });
}
export async function reopenPeriodAction(month: string): Promise<ActionResult> {
  return runAction(async () => { await reopenPeriod(await getPrincipal(), month, await requestMeta()); refresh(month); return undefined; }, 'Competência reaberta.');
}
export async function markChargeAction(id: string, month: string, values: { status: 'PENDING' | 'SENT' | 'PAID'; paidAt?: string | null; paidCents?: number | null; note?: string | null }): Promise<ActionResult> {
  return runAction(async () => { await markCharge(await getPrincipal(), id, values, await requestMeta()); refresh(month); return undefined; });
}
