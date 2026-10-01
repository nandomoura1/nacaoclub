'use server';

import { revalidatePath } from 'next/cache';
import { getPrincipal, requestMeta } from '@/server/auth/session';
import { runAction, type ActionResult } from '@/server/action-result';
import { AppError } from '@/server/errors';
import { AiPlanSchema, planToBlocks } from '@/domain/programming/ai-plan';
import { modalitySlug } from '@/domain/programming/modalities';
import { generateWorkout, type GenerateResult } from '@/server/ai/workout-generator';
import { setDayFromAi, workoutModalities } from '@/server/services/workout-service';
import { createProgram, deleteProgram, generateProgramDay, insertProgramDays, type ProgramDayResult } from '@/server/ai/program-generator';

export async function generateWorkoutAction(slug: string, values: Record<string, unknown>): Promise<ActionResult<GenerateResult>> {
  return runAction(async () => generateWorkout(await getPrincipal(), slug, values));
}

/** Leva o plano (já revisado pelo coach) para o Cadastro de Treino. */
export async function insertAiDayAction(slug: string, date: string, plan: unknown, replace: boolean): Promise<ActionResult<string>> {
  return runAction(async () => {
    const principal = await getPrincipal();
    const parsed = AiPlanSchema.safeParse(plan);
    if (!parsed.success) throw new AppError('Plano inválido.');
    const modality = (await workoutModalities(principal)).find((m) => modalitySlug(m.name) === slug);
    if (!modality) throw new AppError('Você não tem acesso a esta modalidade no Cadastro de Treino.');
    const r = await setDayFromAi(principal, { modalityId: modality.id, date, title: parsed.data.titulo, blocks: planToBlocks(parsed.data, slug), replace }, await requestMeta());
    revalidatePath('/treinos');
    return r.weekId;
  }, 'Treino lançado no Cadastro de Treino.');
}

export async function createProgramAction(slug: string, values: Record<string, unknown>): Promise<ActionResult<string>> {
  return runAction(async () => {
    const id = await createProgram(await getPrincipal(), slug, values, await requestMeta());
    revalidatePath(`/treinos/${slug}/ia`);
    return id;
  }, 'Planilha criada.');
}

export async function generateProgramDayAction(id: string, date: string): Promise<ActionResult<ProgramDayResult>> {
  return runAction(async () => generateProgramDay(await getPrincipal(), id, date));
}

export async function insertProgramDaysAction(id: string, dates: string[], replace: boolean): Promise<ActionResult<{ inserted: number; weekIds: string[] }>> {
  return runAction(async () => {
    const r = await insertProgramDays(await getPrincipal(), id, dates, replace, await requestMeta());
    revalidatePath('/treinos');
    return r;
  });
}

export async function deleteProgramAction(slug: string, id: string): Promise<ActionResult> {
  return runAction(async () => {
    await deleteProgram(await getPrincipal(), id, await requestMeta());
    revalidatePath(`/treinos/${slug}/ia`);
    return undefined;
  }, 'Planilha excluída.');
}
