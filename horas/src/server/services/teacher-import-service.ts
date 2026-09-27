import { z } from 'zod';
import { prisma, type Tx } from '@/server/db';
import { audit } from '@/server/audit';
import { assertCan, can } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import type { RequestMeta } from '@/server/auth/session';
import { AppError } from '@/server/errors';
import { formatDateBR, fromUtc, isIsoDate, toUtc } from '@/domain/dates';
import { normalizeName } from '@/domain/names';
import { parseTeacherSheet, type TeacherImportRow } from '@/domain/import/teachers';
import { readWorkbook } from '@/server/import/xlsx';
import { buildTeacherTemplate } from '@/server/import/teacher-template';
import { todayIso } from '@/lib/today';
import { MAX_IMPORT_BYTES } from './import-service';

/**
 * Importação de professores por planilha. A prévia e a gravação usam o mesmo
 * plano (`planTeachers`): o que o admin vê é o que grava. Célula vazia = manter.
 */

const key = (s: string) => normalizeName(s).replace(/-/g, ' ').replace(/\s+/g, ' ').trim();

async function loadState(db: Tx) {
  const [teachers, modalities, positions, contractTypes, aliases] = await Promise.all([
    db.teacher.findMany({ include: { modalities: { select: { modalityId: true } }, aliases: { select: { alias: true } }, position: true, contractType: true, primaryModality: true } }),
    db.modality.findMany({ where: { active: true }, select: { id: true, name: true } }),
    db.position.findMany({ where: { active: true }, select: { id: true, name: true } }),
    db.contractType.findMany({ where: { active: true }, select: { id: true, name: true } }),
    db.teacherAlias.findMany({ select: { alias: true, teacherId: true } }),
  ]);
  return { teachers, modalities, positions, contractTypes, aliases };
}
type State = Awaited<ReturnType<typeof loadState>>;

export interface TeacherChange {
  line: number;
  name: string;
  action: 'create' | 'update' | 'same' | 'skip';
  teacherId: string | null;
  changes: string[];
  warnings: string[];
  data: {
    name: string; displayName?: string; email?: string; phone?: string; level?: string; notes?: string;
    positionId?: string; contractTypeId?: string; primaryModalityId?: string;
    admissionDate?: string; terminationDate?: string; active?: boolean;
  };
  modalityIds: string[] | null;
  newAliases: string[];
}

export function planTeachers(rows: TeacherImportRow[], st: State): TeacherChange[] {
  const byName = new Map(st.teachers.map((t) => [normalizeName(t.name), t]));
  const aliasOwner = new Map(st.aliases.map((a) => [a.alias, a.teacherId]));
  const byId = new Map(st.teachers.map((t) => [t.id, t]));
  const findIn = <T extends { name: string }>(items: T[], text: string) => items.find((i) => key(i.name) === key(text));
  const modName = new Map(st.modalities.map((m) => [m.id, m.name]));
  const claimedAliases = new Map<string, number>();

  return rows.map((row) => {
    const nk = normalizeName(row.name);
    const current = byName.get(nk) ?? byId.get(aliasOwner.get(nk) ?? '') ?? null;
    const warnings: string[] = [];
    const changes: string[] = [];
    const data: TeacherChange['data'] = { name: row.name };
    const set = <K extends keyof TeacherChange['data']>(field: K, label: string, value: TeacherChange['data'][K] | null, now: unknown, show?: (v: unknown) => string) => {
      if (value === null || value === undefined) return;
      if (current && value === now) return;
      data[field] = value;
      const fmt = show ?? ((v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v)));
      changes.push(current ? `${label}: ${fmt(now)} → ${fmt(value)}` : `${label}: ${fmt(value)}`);
    };
    const lookup = (items: { id: string; name: string }[], text: string | null, label: string) => {
      if (!text) return null;
      const hit = findIn(items, text);
      if (!hit) warnings.push(`${label} "${text}" não existe no cadastro — campo ignorado.`);
      return hit ?? null;
    };

    if (current && current.name !== row.name && normalizeName(current.name) === nk) set('name', 'Nome', row.name, current.name);
    set('displayName', 'Nome na grade', row.displayName, current?.displayName ?? null);
    set('email', 'E-mail', row.email, current?.email ?? null);
    set('phone', 'Telefone', row.phone, current?.phone ?? null);
    set('level', 'Nível', row.level, current?.level ?? null);
    set('notes', 'Observações', row.notes, current?.notes ?? null);
    const position = lookup(st.positions, row.position, 'Cargo');
    if (position) set('positionId', 'Cargo', position.id, current?.positionId ?? null, (v) => st.positions.find((p) => p.id === v)?.name ?? '—');
    const contract = lookup(st.contractTypes, row.contractType, 'Contrato');
    if (contract) set('contractTypeId', 'Contrato', contract.id, current?.contractTypeId ?? null, (v) => st.contractTypes.find((p) => p.id === v)?.name ?? '—');
    const primary = lookup(st.modalities, row.primaryModality, 'Modalidade');
    if (primary) set('primaryModalityId', 'Modalidade principal', primary.id, current?.primaryModalityId ?? null, (v) => modName.get(String(v)) ?? '—');
    const dateOf = (d: Date | null | undefined) => (d ? fromUtc(d) : null);
    const showDate = (v: unknown) => (v ? formatDateBR(String(v)) : '—');
    set('admissionDate', 'Admissão', row.admissionDate, dateOf(current?.admissionDate), showDate);
    set('terminationDate', 'Desligamento', row.terminationDate, dateOf(current?.terminationDate), showDate);
    const active = row.active ?? (current ? null : true);
    if (active !== null) set('active', 'Ativo', active, current?.active ?? null, (v) => (v === null ? '—' : v ? 'Sim' : 'Não'));

    const admission = data.admissionDate ?? dateOf(current?.admissionDate);
    const termination = data.terminationDate ?? dateOf(current?.terminationDate);
    if (admission && termination && termination < admission) {
      return { line: row.line, name: row.name, action: 'skip' as const, teacherId: current?.id ?? null, changes: [], warnings: ['Desligamento antes da admissão — linha ignorada.'], data, modalityIds: null, newAliases: [] };
    }

    // Habilitações: a lista da planilha (mais a principal) substitui; vazia mantém.
    let modalityIds: string[] | null = null;
    const currentMods = new Set(current?.modalities.map((m) => m.modalityId) ?? []);
    if (row.modalities) {
      const ids = new Set<string>(primary ? [primary.id] : []);
      for (const text of row.modalities) {
        const m = lookup(st.modalities, text, 'Modalidade');
        if (m) ids.add(m.id);
      }
      modalityIds = [...ids];
    } else if (primary && !currentMods.has(primary.id)) {
      modalityIds = [...currentMods, primary.id];
    }
    if (modalityIds) {
      const same = modalityIds.length === currentMods.size && modalityIds.every((id) => currentMods.has(id));
      if (same) modalityIds = null;
      else changes.push(`Modalidades: ${[...currentMods].map((id) => modName.get(id)).sort().join(', ') || '—'} → ${modalityIds.map((id) => modName.get(id)).sort().join(', ') || '—'}`);
    }

    // Apelidos: só acrescenta; nunca rouba o de outra pessoa.
    const newAliases: string[] = [];
    const ownName = normalizeName(data.name);
    for (const raw of row.aliases ?? []) {
      const a = normalizeName(raw);
      if (!a || a === ownName || (current && current.aliases.some((x) => x.alias === a)) || newAliases.includes(a)) continue;
      const owner = aliasOwner.get(a) ?? (byName.get(a) && byName.get(a) !== current ? byName.get(a)!.id : undefined);
      if ((owner && owner !== current?.id) || claimedAliases.has(a)) {
        warnings.push(`"${raw}" já identifica outra pessoa — apelido ignorado.`);
        continue;
      }
      claimedAliases.set(a, row.line);
      newAliases.push(a);
    }
    if (newAliases.length) changes.push(`Outros nomes: + ${newAliases.join(', ')}`);

    const action = !current ? 'create' : changes.length ? 'update' : 'same';
    return { line: row.line, name: row.name, action, teacherId: current?.id ?? null, changes, warnings, data, modalityIds, newAliases };
  });
}

/** Planilha de professores (.xlsx): em branco ou espelho do cadastro atual. */
export async function teacherTemplate(principal: Principal | null, mirror: boolean): Promise<{ fileName: string; buffer: Buffer }> {
  assertCan(principal, 'teacher.edit');
  const personal = can(principal, 'teacher.view_personal');
  const [modalities, positions, contractTypes, teachers] = await Promise.all([
    prisma.modality.findMany({ where: { active: true }, select: { name: true }, orderBy: [{ area: { sortOrder: 'asc' } }, { sortOrder: 'asc' }] }),
    prisma.position.findMany({ where: { active: true }, select: { name: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.contractType.findMany({ where: { active: true }, select: { name: true }, orderBy: { sortOrder: 'asc' } }),
    mirror
      ? prisma.teacher.findMany({
          orderBy: [{ active: 'desc' }, { name: 'asc' }],
          include: { modalities: { include: { modality: { select: { name: true } } } }, aliases: true, position: true, contractType: true, primaryModality: true },
        })
      : Promise.resolve([]),
  ]);
  const rows = teachers.map((t) => ({
    name: t.name,
    displayName: t.displayName,
    // Dado pessoal só vai para quem pode ver; vazio na volta = mantém.
    email: personal ? t.email : null,
    phone: personal ? t.phone : null,
    position: t.position?.name ?? null,
    contractType: t.contractType?.name ?? null,
    level: t.level,
    primaryModality: t.primaryModality?.name ?? null,
    modalities: t.modalities.map((m) => m.modality.name).filter((n) => n !== t.primaryModality?.name).sort(),
    admissionDate: t.admissionDate ? fromUtc(t.admissionDate) : null,
    terminationDate: t.terminationDate ? fromUtc(t.terminationDate) : null,
    active: t.active,
    aliases: t.aliases.map((a) => a.alias).sort(),
    notes: personal ? t.notes : null,
  }));
  const today = todayIso();
  const title = mirror
    ? `Espelho do cadastro em ${formatDateBR(today)} — ${rows.length} pessoa(s). Complete o que falta e envie de volta em Professores → Importar planilha.`
    : 'Modelo em branco. Preencha a aba "Professores" e envie em Professores → Importar planilha.';
  const buffer = await buildTeacherTemplate(
    { modalities: modalities.map((m) => m.name), positions: positions.map((p) => p.name), contractTypes: contractTypes.map((c) => c.name) },
    rows,
    title,
  );
  return { fileName: mirror ? `nacao-professores-espelho-${today.replaceAll('-', '')}.xlsx` : 'nacao-professores-modelo.xlsx', buffer };
}

/** Lê a planilha e devolve a prévia. Não grava nada. */
export async function analyzeTeachers(principal: Principal | null, file: File) {
  assertCan(principal, 'teacher.edit');
  if (file.size > MAX_IMPORT_BYTES) throw new AppError('Arquivo grande demais (máximo 5 MB).');
  if (!/\.xlsx$/i.test(file.name)) throw new AppError('Envie a planilha em formato .xlsx.');
  let sheets;
  try {
    sheets = await readWorkbook(await file.arrayBuffer());
  } catch {
    throw new AppError('Não foi possível ler o arquivo. Ele está corrompido ou não é um .xlsx.');
  }
  const parsed = sheets.map((s) => ({ sheet: s.name, result: parseTeacherSheet(s.grid) })).find((p) => p.result);
  if (!parsed?.result) throw new AppError('Não achei a aba de professores: a linha de títulos precisa ter "Nome completo" e "Cargo". Baixe o modelo e use-o.');
  const plan = planTeachers(parsed.result.rows, await loadState(prisma));
  return { fileName: file.name, sheet: parsed.sheet, rows: parsed.result.rows, warnings: parsed.result.warnings, plan };
}

const rowSchema: z.ZodType<TeacherImportRow> = z.object({
  line: z.number().int().min(1).max(100_000),
  name: z.string().trim().min(2).max(120),
  displayName: z.string().max(40).nullable(),
  email: z.string().max(200).email().nullable(),
  phone: z.string().max(30).nullable(),
  position: z.string().max(80).nullable(),
  contractType: z.string().max(80).nullable(),
  level: z.string().max(20).nullable(),
  primaryModality: z.string().max(80).nullable(),
  modalities: z.array(z.string().max(80)).max(30).nullable(),
  admissionDate: z.string().refine(isIsoDate).nullable(),
  terminationDate: z.string().refine(isIsoDate).nullable(),
  active: z.boolean().nullable(),
  aliases: z.array(z.string().max(80)).max(30).nullable(),
  notes: z.string().max(1000).nullable(),
});
const commitSchema = z.object({ fileName: z.string().max(200), rows: z.array(rowSchema).min(1).max(2000) });

/** Grava a planilha de professores: cria, atualiza e acrescenta apelidos, numa transação. */
export async function commitTeachers(principal: Principal | null, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'teacher.edit');
  const parsed = commitSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const { fileName, rows } = parsed.data;

  return prisma.$transaction(async (tx) => {
    const plan = planTeachers(rows, await loadState(tx));
    const toDate = (v?: string) => (v ? toUtc(v) : undefined);
    const fields = (d: TeacherChange['data']) => ({
      ...d, admissionDate: toDate(d.admissionDate), terminationDate: toDate(d.terminationDate),
    });

    const creates = plan.filter((p) => p.action === 'create');
    const created = creates.length
      ? await tx.teacher.createManyAndReturn({ data: creates.map((p) => ({ ...fields(p.data), createdById: principal.id })), select: { id: true, name: true } })
      : [];
    const idOf = new Map(plan.map((p) => [p.line, p.teacherId]));
    // Nome é único na planilha (linhas repetidas já caem no parser): casa por nome, não pela ordem.
    const createdByName = new Map(created.map((t) => [normalizeName(t.name), t.id]));
    for (const p of creates) idOf.set(p.line, createdByName.get(normalizeName(p.data.name)) ?? null);

    const updates = plan.filter((p) => p.action === 'update');
    for (const p of updates) {
      const { name, ...rest } = fields(p.data);
      const data = { ...rest, ...(p.changes.some((c) => c.startsWith('Nome:')) ? { name } : {}) };
      if (Object.keys(data).length) await tx.teacher.update({ where: { id: p.teacherId! }, data });
    }

    const withMods = plan.filter((p) => p.modalityIds && (p.action === 'create' || p.action === 'update'));
    const modTeacherIds = withMods.map((p) => idOf.get(p.line)!).filter(Boolean);
    if (modTeacherIds.length) await tx.teacherModality.deleteMany({ where: { teacherId: { in: modTeacherIds } } });
    const modRows = withMods.flatMap((p) => p.modalityIds!.map((modalityId) => ({ teacherId: idOf.get(p.line)!, modalityId })));
    if (modRows.length) await tx.teacherModality.createMany({ data: modRows, skipDuplicates: true });

    const aliasRows = plan.flatMap((p) => (p.action === 'skip' ? [] : p.newAliases.map((alias) => ({ teacherId: idOf.get(p.line)!, alias }))));
    if (aliasRows.length) await tx.teacherAlias.createMany({ data: aliasRows, skipDuplicates: true });

    const summary = {
      created: creates.length,
      updated: updates.length,
      unchanged: plan.filter((p) => p.action === 'same').length,
      skipped: plan.filter((p) => p.action === 'skip').length,
    };
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: 'teacher.imported',
      entityType: 'teacher',
      after: {
        arquivo: fileName,
        criados: creates.map((p) => p.name),
        alterados: updates.map((p) => ({ nome: p.name, mudancas: p.changes })),
      },
      summary: `${principal.name} importou professores de ${fileName}: ${summary.created} novo(s), ${summary.updated} atualizado(s)${summary.unchanged ? `, ${summary.unchanged} sem mudança` : ''}`,
    });
    return summary;
  }, { timeout: 120_000, maxWait: 10_000 });
}
