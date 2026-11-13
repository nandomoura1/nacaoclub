'use server';

import { revalidatePath } from 'next/cache';
import { getPrincipal, requestMeta } from '@/server/auth/session';
import { runAction, type ActionResult } from '@/server/action-result';
import { adjustPrices, createDraft, deletePlan, importFromSheet, planTableTsv, publishTable, savePlan, setOptionPrice, setPlanStatus } from '@/server/services/planos-service';

const refresh = () => revalidatePath('/admin/planos');

export async function importFromSheetAction(): Promise<ActionResult<{ vigente: string; rascunho: string }>> {
  return runAction(async () => { const r = await importFromSheet(await getPrincipal(), await requestMeta()); refresh(); return r; }, 'Planilha importada: Planos 2026 (vigente) e rascunho Planos 2027.');
}
export async function createDraftAction(input: { fromTableId: string; name: string; year: number }): Promise<ActionResult<string>> {
  return runAction(async () => { const id = await createDraft(await getPrincipal(), input, await requestMeta()); refresh(); return id; }, 'Rascunho criado.');
}
export async function savePlanAction(input: unknown): Promise<ActionResult<string>> {
  return runAction(async () => { const id = await savePlan(await getPrincipal(), input, await requestMeta()); refresh(); return id; }, 'Plano salvo.');
}
export async function setPlanStatusAction(itemId: string, status: string): Promise<ActionResult> {
  return runAction(async () => { await setPlanStatus(await getPrincipal(), { itemId, status }, await requestMeta()); refresh(); return undefined; });
}
export async function setOptionPriceAction(optionId: string, field: 'card' | 'recurring', value: number | null): Promise<ActionResult<number | null>> {
  return runAction(async () => { const v = await setOptionPrice(await getPrincipal(), { optionId, field, value }, await requestMeta()); refresh(); return v; });
}
export async function deletePlanAction(itemId: string): Promise<ActionResult> {
  return runAction(async () => { await deletePlan(await getPrincipal(), { itemId }, await requestMeta()); refresh(); return undefined; }, 'Plano apagado do rascunho.');
}
export async function adjustPricesAction(input: unknown): Promise<ActionResult<number>> {
  return runAction(async () => { const n = await adjustPrices(await getPrincipal(), input, await requestMeta()); refresh(); return n; });
}
export async function publishTableAction(tableId: string): Promise<ActionResult> {
  return runAction(async () => { await publishTable(await getPrincipal(), { tableId }, await requestMeta()); refresh(); return undefined; }, 'Tabela publicada: agora é a vigente.');
}
export async function tableTsvAction(tableId: string): Promise<ActionResult<string>> {
  return runAction(async () => planTableTsv(await getPrincipal(), tableId));
}
