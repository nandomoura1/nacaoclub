'use server';

import { requestMeta, requirePrincipal } from '@/server/auth/session';
import { changeOwnPassword } from '@/server/services/auth-service';
import { runAction, type ActionResult } from '@/server/action-result';

export async function changePasswordAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const principal = await requirePrincipal();
    await changeOwnPassword(
      principal,
      { current: form.get('current'), next: form.get('next'), confirm: form.get('confirm') },
      await requestMeta(),
    );
    return undefined;
  }, 'Senha alterada.');
}
