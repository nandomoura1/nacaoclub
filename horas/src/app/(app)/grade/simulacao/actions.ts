'use server';

import { revalidatePath } from 'next/cache';
import { getPrincipal, requestMeta } from '@/server/auth/session';
import { runAction, type ActionResult } from '@/server/action-result';
import { applySimulation, createSimulation, discardSimulation, saveSimulation } from '@/server/services/grade-sim-service';

const refresh = () => { revalidatePath('/grade', 'layout'); };

export async function createSimulationAction(input: unknown): Promise<ActionResult<string>> {
  return runAction(async () => { const id = await createSimulation(await getPrincipal(), input, await requestMeta()); refresh(); return id; });
}
export async function saveSimulationAction(id: string, input: unknown): Promise<ActionResult> {
  return runAction(async () => { await saveSimulation(await getPrincipal(), id, input, await requestMeta()); refresh(); return undefined; }, 'Simulação salva.');
}
export async function discardSimulationAction(id: string): Promise<ActionResult> {
  return runAction(async () => { await discardSimulation(await getPrincipal(), id, await requestMeta()); refresh(); return undefined; }, 'Simulação descartada.');
}
export async function applySimulationAction(id: string, from: string, acceptConflicts: boolean): Promise<ActionResult<Record<string, number>>> {
  return runAction(async () => { const r = await applySimulation(await getPrincipal(), id, { from, acceptConflicts }, await requestMeta()); refresh(); return r; });
}
