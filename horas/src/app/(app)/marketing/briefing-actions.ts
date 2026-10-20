'use server';

import { revalidatePath } from 'next/cache';
import { todayIso } from '@/lib/today';
import { getPrincipal, requestMeta } from '@/server/auth/session';
import { runAction, type ActionResult } from '@/server/action-result';
import { previewNotice, type SendResult } from '@/server/services/mkt-notice-service';
import { sendBriefing } from '@/server/services/mkt-briefing-service';

type Pick = { userIds: string[]; roleKeys: string[]; numbers: string[] };

/** Quantos recebem e quem está sem WhatsApp. */
export async function briefingAudienceAction(pick: Pick) {
  return runAction(async () => {
    const p = await previewNotice(await getPrincipal(), { audience: 'SELECAO', filter: pick, kind: 'CAMPANHA', title: 'Briefing', body: '.', askConfirmation: false }, todayIso());
    return { total: p.total, comTelefone: p.comTelefone, semTelefone: p.semTelefone, teste: p.teste };
  });
}

export async function sendBriefingAction(campaignId: string, values: Pick & { text: string; askConfirmation: boolean }): Promise<ActionResult<SendResult | null>> {
  return runAction(async () => {
    const r = await sendBriefing(await getPrincipal(), campaignId, values, todayIso(), await requestMeta());
    revalidatePath('/marketing/interna'); revalidatePath('/hoje');
    return r;
  });
}
