'use server';

import { revalidatePath } from 'next/cache';
import { getPrincipal, requestMeta } from '@/server/auth/session';
import { runAction, type ActionResult } from '@/server/action-result';
import type { ContactDraft } from '@/domain/contacts';
import { importContacts, previewImport, saveContact, setContactActive } from '@/server/services/contacts-service';

const refresh = () => revalidatePath('/admin/contatos');

export async function saveContactAction(input: unknown): Promise<ActionResult<string>> {
  return runAction(async () => { const id = await saveContact(await getPrincipal(), input, await requestMeta()); refresh(); return id; }, 'Contato salvo.');
}
export async function setContactActiveAction(id: string, active: boolean): Promise<ActionResult> {
  return runAction(async () => { await setContactActive(await getPrincipal(), { id, active }, await requestMeta()); refresh(); return undefined; }, active ? 'Contato reativado.' : 'Contato desativado.');
}
export async function previewImportAction(text: string, group: string) {
  return runAction(async () => previewImport(await getPrincipal(), { text, group }));
}
export async function importContactsAction(rows: ContactDraft[]): Promise<ActionResult<number>> {
  return runAction(async () => { const n = await importContacts(await getPrincipal(), { rows }, await requestMeta()); refresh(); return n; });
}
