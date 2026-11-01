'use server';

import { requestMeta } from '@/server/auth/session';
import { runAction, type ActionResult } from '@/server/action-result';
import { refuseSign, requestSignCode, signWithCode } from '@/server/services/contract-service';

/** Ações da página pública de assinatura: a autorização é o próprio link (token) + o código no WhatsApp. */
export async function requestCodeAction(token: string): Promise<ActionResult> {
  return runAction(async () => { await requestSignCode(token, await requestMeta()); return undefined; }, 'Código enviado para o seu WhatsApp.');
}

export async function signAction(token: string, input: { code: string; name: string; agree: boolean }): Promise<ActionResult<{ completed: boolean }>> {
  return runAction(async () => signWithCode(token, input, await requestMeta()), 'Assinatura registrada.');
}

export async function refuseAction(token: string, reason: string): Promise<ActionResult> {
  return runAction(async () => { await refuseSign(token, reason, await requestMeta()); return undefined; }, 'Recusa registrada.');
}
