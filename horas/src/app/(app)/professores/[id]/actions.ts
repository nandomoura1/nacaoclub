'use server';

import { revalidatePath } from 'next/cache';
import { getPrincipal, requestMeta } from '@/server/auth/session';
import { runAction, type ActionResult } from '@/server/action-result';
import { removeTeacherFromSlot } from '@/server/services/schedule-service';
import { cancelLeave, previewLeave, saveLeave } from '@/server/services/leave-service';
import { saveGuidelines } from '@/server/services/teacher-share-service';

const refresh = () => { revalidatePath('/professores', 'layout'); revalidatePath('/grade'); revalidatePath('/calendario'); };

export async function removeFromSlotAction(slotId: string, teacherId: string, from: string): Promise<ActionResult> {
  return runAction(async () => {
    await removeTeacherFromSlot(await getPrincipal(), slotId, teacherId, from, await requestMeta());
    refresh();
    return undefined;
  }, 'Pronto: a pessoa saiu da aula a partir da data escolhida.');
}

export async function previewLeaveAction(teacherId: string, values: Record<string, unknown>) {
  return runAction(async () => previewLeave(await getPrincipal(), teacherId, values));
}

export async function saveLeaveAction(teacherId: string, values: Record<string, unknown>) {
  return runAction(async () => {
    const r = await saveLeave(await getPrincipal(), teacherId, values, await requestMeta());
    refresh();
    return r;
  });
}

export async function cancelLeaveAction(leaveId: string) {
  return runAction(async () => {
    const r = await cancelLeave(await getPrincipal(), leaveId, await requestMeta());
    refresh();
    return r;
  });
}

export async function saveGuidelinesAction(teacherId: string, values: { general: string; specific: string }): Promise<ActionResult> {
  return runAction(async () => {
    await saveGuidelines(await getPrincipal(), teacherId, values, await requestMeta());
    revalidatePath('/professores', 'layout');
    return undefined;
  }, 'Orientações salvas.');
}
