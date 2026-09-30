'use server';

import { revalidatePath } from 'next/cache';
import { getPrincipal, requestMeta } from '@/server/auth/session';
import { runAction, type ActionResult } from '@/server/action-result';
import { saveBenchmark, setBenchmarkActive } from '@/server/services/benchmark-service';

export async function saveBenchmarkAction(id: string | null, values: Record<string, unknown>): Promise<ActionResult<string>> {
  return runAction(async () => {
    const r = await saveBenchmark(await getPrincipal(), id, values, await requestMeta());
    revalidatePath(`/treinos/${String(values.modality ?? 'crossfit')}/benchmarks`);
    return r;
  }, 'Benchmark salvo.');
}

export async function setBenchmarkActiveAction(id: string, active: boolean): Promise<ActionResult> {
  return runAction(async () => {
    await setBenchmarkActive(await getPrincipal(), id, active, await requestMeta());
    revalidatePath('/treinos', 'layout');
    return undefined;
  });
}
