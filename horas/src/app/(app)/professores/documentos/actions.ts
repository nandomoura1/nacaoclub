'use server';

import { revalidatePath } from 'next/cache';
import { getPrincipal, requestMeta } from '@/server/auth/session';
import { runAction, type ActionResult } from '@/server/action-result';
import { AppError } from '@/server/errors';
import { deleteTeacherDoc, uploadTeacherDoc } from '@/server/services/staff-doc-service';

const refresh = (teacherId: string) => {
  revalidatePath('/professores/documentos');
  revalidatePath(`/professores/${teacherId}`);
  revalidatePath('/hoje');
};

export async function uploadTeacherDocAction(teacherId: string, form: FormData): Promise<ActionResult<string>> {
  return runAction(async () => {
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) throw new AppError('Escolha o arquivo.');
    const field = (k: string) => String(form.get(k) ?? '');
    const id = await uploadTeacherDoc(await getPrincipal(), teacherId, {
      kind: field('kind'), validFrom: field('validFrom'), validUntil: field('validUntil'), number: field('number'), notes: field('notes'),
    }, file, await requestMeta());
    refresh(teacherId);
    return id;
  }, 'Documento guardado na pasta.');
}

export async function deleteTeacherDocAction(teacherId: string, documentId: string): Promise<ActionResult> {
  return runAction(async () => { await deleteTeacherDoc(await getPrincipal(), documentId, await requestMeta()); refresh(teacherId); return undefined; }, 'Documento removido.');
}
