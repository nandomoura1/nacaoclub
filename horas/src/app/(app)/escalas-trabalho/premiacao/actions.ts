'use server';

import { revalidatePath } from 'next/cache';
import { getPrincipal, requestMeta } from '@/server/auth/session';
import { runAction, type ActionResult } from '@/server/action-result';
import { addAwardPeople, closeAwardMonth, reopenAwardMonth, saveAwardMonth, saveAwardPerson, setAwardPaid, setAwardPersonActive } from '@/server/services/premiacao-service';

const refresh = () => revalidatePath('/escalas-trabalho/premiacao');
const run = async <T,>(fn: () => Promise<T>, ok?: string): Promise<ActionResult<T>> => runAction(async () => { const r = await fn(); refresh(); return r; }, ok);

export async function saveAwardMonthAction(input: unknown) { return run(async () => saveAwardMonth(await getPrincipal(), input, await requestMeta())); }
export async function saveAwardPersonAction(input: unknown) { return run(async () => saveAwardPerson(await getPrincipal(), input, await requestMeta()), 'Valores salvos.'); }
export async function addAwardPeopleAction(input: unknown) { return run(async () => addAwardPeople(await getPrincipal(), input, await requestMeta())); }
export async function setAwardPersonActiveAction(teacherId: string, active: boolean) { return run(async () => setAwardPersonActive(await getPrincipal(), teacherId, active, await requestMeta()), active ? 'Pessoa de volta na Premiação.' : 'Pessoa retirada da Premiação.'); }
export async function closeAwardMonthAction(month: string) { return run(async () => closeAwardMonth(await getPrincipal(), month, await requestMeta())); }
export async function reopenAwardMonthAction(month: string, reason: string) { return run(async () => reopenAwardMonth(await getPrincipal(), month, reason, await requestMeta()), 'Mês reaberto.'); }
export async function setAwardPaidAction(month: string, paid: boolean) { return run(async () => setAwardPaid(await getPrincipal(), month, paid, await requestMeta()), paid ? 'Pagamento registrado.' : 'Pagamento desmarcado.'); }
