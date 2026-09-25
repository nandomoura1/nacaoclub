'use server';

import { revalidatePath } from 'next/cache';
import { getPrincipal, requestMeta } from '@/server/auth/session';
import { runAction, type ActionResult } from '@/server/action-result';
import { createUser, resetPassword, updateUser } from '@/server/services/user-service';

export interface UserFormPayload {
  name: string;
  email: string;
  roleKeys: string[];
  areaIds: string[];
  active: boolean;
}

export async function createUserAction(
  payload: UserFormPayload,
): Promise<ActionResult<{ temporaryPassword: string }>> {
  return runAction(async () => {
    const { temporaryPassword } = await createUser(await getPrincipal(), payload, await requestMeta());
    revalidatePath('/admin/usuarios');
    return { temporaryPassword };
  }, 'Usuário criado.');
}

export async function updateUserAction(userId: string, payload: UserFormPayload): Promise<ActionResult> {
  return runAction(async () => {
    await updateUser(await getPrincipal(), userId, payload, await requestMeta());
    revalidatePath('/admin/usuarios');
    return undefined;
  }, 'Alterações salvas.');
}

export async function resetPasswordAction(
  userId: string,
): Promise<ActionResult<{ temporaryPassword: string }>> {
  return runAction(async () => {
    const result = await resetPassword(await getPrincipal(), userId, await requestMeta());
    revalidatePath('/admin/usuarios');
    return result;
  }, 'Nova senha provisória gerada.');
}
