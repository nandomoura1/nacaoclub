'use server';

import { revalidatePath } from 'next/cache';
import { todayIso } from '@/lib/today';
import { getPrincipal, requestMeta } from '@/server/auth/session';
import { runAction, type ActionResult } from '@/server/action-result';
import { deleteScreen, pinScreen, rotateScreenToken, saveScreen } from '@/server/services/tv-service';

const refresh = () => { revalidatePath('/treinos/tv'); revalidatePath('/treinos', 'layout'); };

export async function saveScreenAction(id: string | null, values: { name: string; modalityId: string }): Promise<ActionResult<string>> {
  return runAction(async () => { const r = await saveScreen(await getPrincipal(), id, values, await requestMeta()); refresh(); return r; }, 'Tela salva.');
}
export async function pinScreenAction(id: string, date: string | null): Promise<ActionResult> {
  return runAction(async () => { await pinScreen(await getPrincipal(), id, date, todayIso(), await requestMeta()); refresh(); return undefined; }, date ? 'Dia fixado na TV — aparece em até 1 minuto.' : 'A TV voltou a mostrar o treino de hoje.');
}
export async function rotateScreenTokenAction(id: string): Promise<ActionResult> {
  return runAction(async () => { await rotateScreenToken(await getPrincipal(), id, await requestMeta()); refresh(); return undefined; }, 'Link novo gerado — abra o link novo na TV.');
}
export async function deleteScreenAction(id: string): Promise<ActionResult> {
  return runAction(async () => { await deleteScreen(await getPrincipal(), id, await requestMeta()); refresh(); return undefined; }, 'Tela excluída.');
}
