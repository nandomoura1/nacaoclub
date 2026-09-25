'use server';

import { revalidatePath } from 'next/cache';
import { getPrincipal, requestMeta } from '@/server/auth/session';
import { runAction, type ActionResult } from '@/server/action-result';
import { saveCatalogItem } from '@/server/services/catalog-service';
import { importOfficialHolidays, saveHoliday } from '@/server/services/holiday-service';
import { isCatalogKey } from '@/shared/catalogs';
import { AppError } from '@/server/errors';

export async function saveCatalogAction(key: string, id: string | null, values: Record<string, unknown>): Promise<ActionResult> {
  return runAction(async () => {
    if (!isCatalogKey(key)) throw new AppError('Cadastro inexistente.');
    await saveCatalogItem(await getPrincipal(), key, id, values, await requestMeta());
    revalidatePath('/admin/cadastros');
    return undefined;
  }, 'Salvo.');
}

export async function saveHolidayAction(id: string | null, values: Record<string, unknown>): Promise<ActionResult> {
  return runAction(async () => {
    await saveHoliday(await getPrincipal(), id, values, await requestMeta());
    revalidatePath('/admin/cadastros');
    return undefined;
  }, 'Feriado salvo.');
}

export async function importHolidaysAction(year: number): Promise<ActionResult<number>> {
  return runAction(async () => {
    const n = await importOfficialHolidays(await getPrincipal(), year, await requestMeta());
    revalidatePath('/admin/cadastros');
    return n;
  });
}
