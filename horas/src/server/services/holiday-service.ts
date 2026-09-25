import { z } from 'zod';
import { prisma, type Tx } from '@/server/db';
import { audit } from '@/server/audit';
import { assertCan } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import type { RequestMeta } from '@/server/auth/session';
import { AppError, NotFoundError } from '@/server/errors';
import { fromUtc, isIsoDate, toUtc, formatDateBR } from '@/domain/dates';
import { holidaysOf } from '@/domain/holidays';
import { onHolidayChanged } from './period-service';

export const HOLIDAY_POLICIES = [
  { value: 'DECIDIR_INDIVIDUALMENTE', label: 'Decidir aula por aula' },
  { value: 'CANCELAR_TODAS', label: 'Cancelar todas as aulas' },
  { value: 'MANTER_TODAS', label: 'Manter todas as aulas' },
] as const;

export const HOLIDAY_SCOPES = [
  { value: 'NACIONAL', label: 'Nacional' },
  { value: 'DISTRITAL', label: 'Distrital (DF)' },
  { value: 'FACULTATIVO', label: 'Ponto facultativo' },
  { value: 'NACAO', label: 'Data da Nação' },
] as const;

const holidaySchema = z.object({
  date: z.string().refine(isIsoDate, 'Data inválida.'),
  name: z.string().trim().min(2, 'Informe o nome.').max(120),
  scope: z.enum(['NACIONAL', 'DISTRITAL', 'FACULTATIVO', 'NACAO']),
  policy: z.enum(['DECIDIR_INDIVIDUALMENTE', 'CANCELAR_TODAS', 'MANTER_TODAS']),
});

/**
 * Garante os feriados oficiais de um ano. Idempotente: não sobrescreve
 * política nem nome que a Nação já tenha ajustado.
 */
export async function ensureOfficialHolidays(tx: Tx, year: number): Promise<string[]> {
  const created: string[] = [];
  for (const h of holidaysOf(year)) {
    const exists = await tx.holiday.findUnique({ where: { date: toUtc(h.date) } });
    if (exists) continue;
    await tx.holiday.create({
      data: {
        date: toUtc(h.date),
        name: h.name,
        scope: h.scope,
        // Ponto facultativo: por padrão a Nação funciona normalmente.
        policy: h.scope === 'FACULTATIVO' ? 'MANTER_TODAS' : 'DECIDIR_INDIVIDUALMENTE',
      },
    });
    created.push(h.date);
  }
  return created;
}

export async function listHolidays(principal: Principal | null, year: number) {
  assertCan(principal, 'schedule.view');
  const rows = await prisma.holiday.findMany({
    where: { date: { gte: toUtc(`${year}-01-01`), lte: toUtc(`${year}-12-31`) } },
    orderBy: { date: 'asc' },
  });
  return rows.map((h) => ({ ...h, date: fromUtc(h.date) }));
}

export async function importOfficialHolidays(principal: Principal | null, year: number, meta: RequestMeta) {
  assertCan(principal, 'admin.catalog');
  if (!Number.isInteger(year) || year < 2020 || year > 2100) throw new AppError('Ano inválido.');
  return prisma.$transaction(async (tx) => {
    const created = await ensureOfficialHolidays(tx, year);
    for (const date of created) await onHolidayChanged(tx, date);
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: 'holiday.imported',
      entityType: 'holiday',
      summary: `${principal.name} carregou os feriados oficiais de ${year} (${created.length} novos)`,
    });
    return created.length;
  });
}

export async function saveHoliday(principal: Principal | null, id: string | null, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'admin.catalog');
  const parsed = holidaySchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const data = { ...parsed.data, date: toUtc(parsed.data.date) };

  return prisma.$transaction(async (tx) => {
    const before = id ? await tx.holiday.findUnique({ where: { id } }) : null;
    if (id && !before) throw new NotFoundError();
    const clash = await tx.holiday.findUnique({ where: { date: data.date } });
    if (clash && clash.id !== id) throw new AppError('Já existe um feriado nesta data.');

    const row = id ? await tx.holiday.update({ where: { id }, data }) : await tx.holiday.create({ data });
    // Competências já geradas refletem a nova política (aulas em que ninguém mexeu).
    if (before && fromUtc(before.date) !== parsed.data.date) await onHolidayChanged(tx, fromUtc(before.date));
    await onHolidayChanged(tx, parsed.data.date);
    const policy = HOLIDAY_POLICIES.find((p) => p.value === row.policy)!.label.toLowerCase();
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: id ? 'holiday.updated' : 'holiday.created',
      entityType: 'holiday',
      entityId: row.id,
      before: before ? { ...before, date: fromUtc(before.date) } : null,
      after: { ...row, date: fromUtc(row.date) },
      summary: `${principal.name} ${id ? 'alterou' : 'cadastrou'} o feriado ${row.name} (${formatDateBR(fromUtc(row.date))}): ${policy}`,
    });
    return row.id;
  });
}
