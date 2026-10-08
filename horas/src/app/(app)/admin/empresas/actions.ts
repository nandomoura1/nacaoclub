'use server';

import { revalidatePath } from 'next/cache';
import { getPrincipal, requestMeta } from '@/server/auth/session';
import { runAction, type ActionResult } from '@/server/action-result';
import { AppError } from '@/server/errors';
import { deleteCompanyDoc, saveCompany, setCompanyDocArchived, uploadCompanyDoc } from '@/server/services/company-service';

const refresh = (id?: string) => {
  revalidatePath('/admin/empresas');
  if (id) revalidatePath(`/admin/empresas/${id}`);
  revalidatePath('/hoje');
};

export async function saveCompanyAction(id: string | null, values: Record<string, unknown>): Promise<ActionResult<string>> {
  return runAction(async () => { const r = await saveCompany(await getPrincipal(), id, values, await requestMeta()); refresh(r); return r; }, 'Dados da empresa salvos.');
}
export async function uploadCompanyDocAction(companyId: string, form: FormData): Promise<ActionResult<string>> {
  return runAction(async () => {
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) throw new AppError('Escolha o arquivo.');
    const f = (k: string) => String(form.get(k) ?? '');
    const id = await uploadCompanyDoc(await getPrincipal(), companyId, { kind: f('kind'), title: f('title'), validFrom: f('validFrom'), validUntil: f('validUntil'), notes: f('notes') }, file, await requestMeta());
    refresh(companyId);
    return id;
  }, 'Documento guardado na pasta.');
}
export async function archiveCompanyDocAction(companyId: string, documentId: string, archived: boolean): Promise<ActionResult> {
  return runAction(async () => { await setCompanyDocArchived(await getPrincipal(), documentId, archived, await requestMeta()); refresh(companyId); return undefined; }, archived ? 'Documento arquivado.' : 'Documento reativado.');
}
export async function deleteCompanyDocAction(companyId: string, documentId: string): Promise<ActionResult> {
  return runAction(async () => { await deleteCompanyDoc(await getPrincipal(), documentId, await requestMeta()); refresh(companyId); return undefined; }, 'Documento excluído.');
}
