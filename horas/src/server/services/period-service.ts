import type { Tx } from '@/server/db';
import type { IsoDate } from '@/domain/dates';

/**
 * Gancho chamado sempre que a grade muda. A E4 realinha aqui as ocorrências
 * já geradas de competências abertas a partir da data informada.
 */
export async function onScheduleChanged(_tx: Tx, _slotId: string | null, _from: IsoDate, _opts: { ending?: boolean } = {}): Promise<void> {}
