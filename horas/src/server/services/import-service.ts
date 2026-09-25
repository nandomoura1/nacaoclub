import { z } from 'zod';
import { prisma } from '@/server/db';
import { audit } from '@/server/audit';
import { assertCan } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import type { RequestMeta } from '@/server/auth/session';
import { AppError } from '@/server/errors';
import { formatDateBR, isIsoDate, toUtc } from '@/domain/dates';
import { normalizeName } from '@/domain/names';
import { parseSheet } from '@/domain/import/parsers';
import { buildPlan, collectHints, collectNames, finalPerson, type ImportCatalog } from '@/domain/import/plan';
import type { ImportRow } from '@/domain/import/types';
import { readWorkbook } from '@/server/import/xlsx';
import { onScheduleChanged } from './period-service';

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export async function loadImportCatalog(): Promise<ImportCatalog & { countsHours: Record<string, boolean>; modalityNames: Record<string, string> }> {
  const [modalities, spaces, activityTypes, teachers] = await Promise.all([
    prisma.modality.findMany({ where: { active: true }, select: { id: true, name: true, defaultDurationMin: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.space.findMany({ where: { active: true }, select: { id: true, name: true } }),
    prisma.activityType.findMany({ where: { active: true }, select: { id: true, kind: true, countsHours: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.teacher.findMany({ where: { active: true }, select: { id: true, name: true, displayName: true, aliases: { select: { alias: true } } }, orderBy: { name: 'asc' } }),
  ]);
  return {
    modalities,
    spaces,
    activityTypes: activityTypes.map((t) => ({ id: t.id, kind: t.kind })),
    teachers: teachers.map((t) => ({ id: t.id, name: t.name, displayName: t.displayName, aliases: t.aliases.map((a) => a.alias) })),
    countsHours: Object.fromEntries(activityTypes.map((t) => [t.id, t.countsHours])),
    modalityNames: Object.fromEntries(modalities.map((m) => [m.id, m.name])),
  };
}

/** Lê o arquivo e devolve tudo que a prévia precisa. Não grava nada. */
export async function analyzeWorkbook(principal: Principal | null, file: File) {
  assertCan(principal, 'import.run');
  if (file.size > MAX_IMPORT_BYTES) throw new AppError('Arquivo grande demais (máximo 5 MB).');
  if (!/\.xlsx$/i.test(file.name)) throw new AppError('Envie a planilha em formato .xlsx (no Google Sheets: Arquivo → Fazer download → Microsoft Excel).');

  let sheets;
  try {
    sheets = await readWorkbook(await file.arrayBuffer());
  } catch {
    throw new AppError('Não foi possível ler o arquivo. Ele está corrompido ou não é um .xlsx.');
  }
  const parsed = sheets.map((s) => parseSheet(s.name, s.grid));
  const catalog = await loadImportCatalog();
  const rows = parsed.flatMap((p) => p.rows);

  return {
    fileName: file.name,
    sheets: parsed.map((p) => ({ sheet: p.sheet, layout: p.layout, rows: p.rows.length, warnings: p.warnings })),
    rows,
    hints: collectHints(rows, catalog),
    names: collectNames(rows, catalog),
    catalog,
  };
}

const rowSchema: z.ZodType<ImportRow> = z.object({
  sheet: z.string().max(100),
  ref: z.string().max(20),
  weekday: z.number().int().min(1).max(7),
  startMin: z.number().int().min(0).max(1439),
  durationMin: z.number().int().min(5).max(600).nullable(),
  spaceHint: z.string().max(100).nullable(),
  activityText: z.string().max(200).nullable(),
  fallbackText: z.string().max(200).nullable(),
  labelHint: z.string().max(100).nullable().optional(),
  kind: z.enum(['AULA', 'PLANTAO', 'PERSONAL', 'COORDENACAO']),
  people: z.array(z.object({ raw: z.string().max(120), role: z.enum(['TITULAR', 'AUXILIAR', 'ESTAGIARIO']) })).max(20),
});

const decisionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('link'), teacherId: z.string().uuid() }),
  z.object({ action: z.literal('create'), name: z.string().trim().min(2).max(120) }),
  z.object({ action: z.literal('same'), key: z.string().max(200) }),
  z.object({ action: z.literal('ignore') }),
]);

export const commitSchema = z.object({
  fileName: z.string().max(200),
  sheets: z.array(z.string().max(100)).min(1, 'Escolha ao menos uma aba.'),
  validFrom: z.string().refine(isIsoDate, 'Data de vigência inválida.'),
  rows: z.array(rowSchema).max(5000),
  overrides: z.record(z.string().max(300), z.union([z.string().uuid(), z.literal('ignore')])),
  decisions: z.record(z.string().max(200), decisionSchema),
});

/** Grava a grade importada numa transação: professores, apelidos, habilitações e aulas. */
export async function commitImport(principal: Principal | null, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'import.run');
  const parsed = commitSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const data = parsed.data;

  const rows = data.rows.filter((r) => data.sheets.includes(r.sheet));
  const catalog = await loadImportCatalog();
  const teacherIds = new Set(catalog.teachers.map((t) => t.id));
  const modalityIds = new Set(catalog.modalities.map((m) => m.id));
  for (const d of Object.values(data.decisions)) {
    if (d.action === 'link' && !teacherIds.has(d.teacherId)) throw new AppError('Um dos professores escolhidos não existe mais. Recarregue a prévia.');
  }
  for (const o of Object.values(data.overrides)) {
    if (o !== 'ignore' && !modalityIds.has(o)) throw new AppError('Uma das modalidades escolhidas não existe mais. Recarregue a prévia.');
  }
  const plan = buildPlan(rows, catalog, data.overrides, data.decisions);
  if (plan.unresolvedKeys.length) {
    throw new AppError(`Ainda há ${plan.unresolvedKeys.length} texto(s) sem modalidade. Escolha a modalidade ou "ignorar".`);
  }
  const validFrom = toUtc(data.validFrom);

  return prisma.$transaction(async (tx) => {
    // 1. Aulas que realmente entram (as que já existem na grade nesta data são puladas)
    const existing = await tx.scheduleSlotVersion.findMany({
      where: { validFrom: { lte: validFrom }, OR: [{ validTo: null }, { validTo: { gte: validFrom } }] },
      select: { weekday: true, startMin: true, modalityId: true, label: true, spaceId: true, activityTypeId: true },
    });
    const sig = (s: { weekday: number; startMin: number; modalityId: string; label: string | null; spaceId: string | null; activityTypeId: string }) =>
      [s.weekday, s.startMin, s.modalityId, s.activityTypeId, s.spaceId ?? '', normalizeName(s.label ?? '')].join('|');
    const seenSigs = new Set(existing.map(sig));
    const toCreate = plan.slots.filter((s) => {
      if (seenSigs.has(sig(s))) return false;
      seenSigs.add(sig(s));
      return true;
    });
    const skipped = plan.slots.length - toCreate.length;

    // 2. Professores novos — só quem dá alguma aula que entra; mesmo nome = mesma pessoa.
    const newIds = new Map<string, string>();
    const neededNew = new Set(toCreate.flatMap((s) => s.people.filter((p) => p.ref.startsWith('new:')).map((p) => p.ref.slice(4))));
    const byName = new Map((await tx.teacher.findMany({ select: { id: true, name: true } })).map((t) => [normalizeName(t.name), t.id]));
    let createdTeachers = 0;
    for (const key of neededNew) {
      const d = data.decisions[key];
      if (d?.action !== 'create') continue;
      const existingId = byName.get(normalizeName(d.name));
      if (existingId) {
        newIds.set(key, existingId);
        continue;
      }
      const t = await tx.teacher.create({ data: { name: d.name, createdById: principal.id } });
      byName.set(normalizeName(d.name), t.id);
      newIds.set(key, t.id);
      createdTeachers++;
    }
    const teacherOf = (ref: string): string | undefined => (ref.startsWith('new:') ? newIds.get(ref.slice(4)) : ref);

    // 3. Apelidos: como a pessoa aparece na planilha → quem ela é
    const involved = [...new Set(toCreate.flatMap((s) => s.people.map((p) => teacherOf(p.ref))))].filter((x): x is string => !!x);
    const known = await tx.teacher.findMany({ where: { id: { in: involved } }, select: { id: true, name: true } });
    const nameById = new Map(known.map((t) => [t.id, normalizeName(t.name)]));
    const aliasTaken = new Set((await tx.teacherAlias.findMany({ select: { alias: true } })).map((a) => a.alias));
    for (const key of new Set(rows.flatMap((r) => r.people.map((p) => normalizeName(p.raw))))) {
      const person = finalPerson(key, data.decisions);
      if (!person) continue;
      const id = teacherOf(person.ref);
      if (!id || aliasTaken.has(key) || nameById.get(id) === key) continue;
      await tx.teacherAlias.create({ data: { teacherId: id, alias: key } });
      aliasTaken.add(key);
    }

    // 4. Aulas
    const habilitations = new Set<string>();
    for (const s of toCreate) {
      const slot = await tx.scheduleSlot.create({ data: { createdById: principal.id } });
      const people = s.people.map((p) => ({ teacherId: teacherOf(p.ref)!, role: p.role }));
      await tx.scheduleSlotVersion.create({
        data: {
          slotId: slot.id, weekday: s.weekday, startMin: s.startMin, durationMin: s.durationMin,
          modalityId: s.modalityId, activityTypeId: s.activityTypeId, spaceId: s.spaceId, label: s.label,
          validFrom, createdById: principal.id, changeReason: `Importado de ${data.fileName} (${s.refs.join(', ')})`,
          teachers: { create: people },
        },
      });
      for (const p of people) habilitations.add(`${p.teacherId}|${s.modalityId}`);
    }
    const created = toCreate.length;
    // 5. Quem dá aula de uma modalidade fica habilitado nela (alimenta a sugestão de substitutos).
    await tx.teacherModality.createMany({
      data: [...habilitations].map((h) => { const [teacherId, modalityId] = h.split('|'); return { teacherId: teacherId!, modalityId: modalityId! }; }),
      skipDuplicates: true,
    });

    await audit(tx, { actorId: principal.id, ...meta }, {
      action: 'schedule.imported',
      entityType: 'schedule_slot',
      after: { arquivo: data.fileName, abas: data.sheets, aulas: created, ja_existiam: skipped, professores_novos: createdTeachers, vigencia: data.validFrom },
      summary: `${principal.name} importou ${created} aula(s) de ${data.fileName} (${data.sheets.join(', ')}), valendo a partir de ${formatDateBR(data.validFrom)}; ${createdTeachers} professor(es) cadastrado(s)${skipped ? `; ${skipped} já existiam` : ''}`,
    });
    await onScheduleChanged(tx, null, data.validFrom);
    return { created, skipped, newTeachers: createdTeachers, ignoredRows: plan.ignoredRows };
  }, { timeout: 120_000, maxWait: 10_000 });
}
