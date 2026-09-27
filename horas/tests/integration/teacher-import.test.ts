import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/server/db';
import { bootstrapStructure } from '@/server/services/bootstrap';
import { commitTeachers, planTeachers, teacherTemplate } from '@/server/services/teacher-import-service';
import { parseTeacherSheet, TEACHER_COLUMNS, type TeacherImportRow } from '@/domain/import/teachers';
import { readWorkbook } from '@/server/import/xlsx';
import { AuthorizationError } from '@/server/errors';
import { META, hasDb, makeUser } from './helpers';

const tag = randomUUID().slice(0, 6);
const base = (name: string, over: Partial<TeacherImportRow> = {}): TeacherImportRow => ({
  line: 2, name, displayName: null, email: null, phone: null, position: null, contractType: null, level: null,
  primaryModality: null, modalities: null, admissionDate: null, terminationDate: null, active: null, aliases: null, notes: null, ...over,
});

describe.skipIf(!hasDb)('importação de professores', () => {
  beforeAll(async () => {
    await prisma.$transaction((tx) => bootstrapStructure(tx), { timeout: 60_000 });
  });

  it('cria, atualiza só o que veio preenchido e não apaga nada', async () => {
    const admin = await makeUser('ADMIN', { name: 'Admin' });
    const ana = `Ana ${tag}`;
    const r1 = await commitTeachers(admin.principal, {
      fileName: 'prof.xlsx',
      rows: [base(ana, { line: 2, displayName: 'Ana', email: 'ana@x.com', position: 'Professor', contractType: 'CLT', primaryModality: 'CrossFit', modalities: ['HYROX'], admissionDate: '2024-03-01', aliases: [`Ana ${tag} (mobility)`] }),
        base(`Bruno ${tag}`, { line: 3 })],
    }, META);
    expect(r1).toEqual({ created: 2, updated: 0, unchanged: 0, skipped: 0 });

    const t = await prisma.teacher.findFirstOrThrow({ where: { name: ana }, include: { modalities: { include: { modality: true } }, aliases: true, position: true, contractType: true } });
    expect(t).toMatchObject({ displayName: 'Ana', email: 'ana@x.com', active: true });
    expect(t.position?.name).toBe('Professor');
    expect(t.modalities.map((m) => m.modality.name).sort()).toEqual(['CrossFit', 'HYROX']);
    expect(t.aliases.map((a) => a.alias)).toEqual([`ana ${tag.toLowerCase()} (mobility)`]);

    // Segunda planilha: só o cargo e o desligamento vêm preenchidos.
    const r2 = await commitTeachers(admin.principal, {
      fileName: 'prof2.xlsx', rows: [base(ana.toUpperCase(), { position: 'Coordenador', terminationDate: '2026-08-31', active: false })],
    }, META);
    expect(r2).toMatchObject({ created: 0, updated: 1 });
    const t2 = await prisma.teacher.findUniqueOrThrow({ where: { id: t.id }, include: { modalities: true, aliases: true, position: true } });
    expect(t2).toMatchObject({ email: 'ana@x.com', displayName: 'Ana', active: false, name: ana.toUpperCase() });
    expect(t2.position?.name).toBe('Coordenador');
    expect(t2.modalities).toHaveLength(2);
    expect(t2.aliases).toHaveLength(1);

    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'teacher.imported' }, orderBy: { at: 'desc' } });
    expect(log.summary).toMatch(/Admin importou professores de prof2\.xlsx: 0 novo\(s\), 1 atualizado\(s\)/);
  });

  it('acha pela grafia da planilha (apelido) e não rouba apelido de outra pessoa', async () => {
    const admin = await makeUser('ADMIN');
    await commitTeachers(admin.principal, { fileName: 'a.xlsx', rows: [base(`Caio ${tag}`, { aliases: [`Caio Est ${tag}`] }), base(`Dani ${tag}`, { line: 3 })] }, META);
    const st = {
      teachers: await prisma.teacher.findMany({ include: { modalities: { select: { modalityId: true } }, aliases: { select: { alias: true } }, position: true, contractType: true, primaryModality: true } }),
      modalities: await prisma.modality.findMany({ select: { id: true, name: true } }),
      positions: await prisma.position.findMany({ select: { id: true, name: true } }),
      contractTypes: await prisma.contractType.findMany({ select: { id: true, name: true } }),
      aliases: await prisma.teacherAlias.findMany({ select: { alias: true, teacherId: true } }),
    };
    const plan = planTeachers([
      base(`Caio Est ${tag}`, { level: 'II' }),
      base(`Dani ${tag}`, { line: 3, aliases: [`Caio Est ${tag}`], position: 'Astronauta' }),
    ], st);
    expect(plan[0]).toMatchObject({ action: 'update', changes: ['Nível: — → II'] });
    expect(plan[0]!.teacherId).toBe(st.teachers.find((t) => t.name === `Caio ${tag}`)!.id);
    expect(plan[1]).toMatchObject({ action: 'same', newAliases: [] });
    expect(plan[1]!.warnings).toEqual([`Cargo "Astronauta" não existe no cadastro — campo ignorado.`, `"Caio Est ${tag}" já identifica outra pessoa — apelido ignorado.`]);
  });

  it('espelho do cadastro reimportado: ninguém muda', async () => {
    const admin = await makeUser('ADMIN');
    const { buffer } = await teacherTemplate(admin.principal, true);
    const sheets = await readWorkbook(new Uint8Array(buffer).buffer);
    const parsed = parseTeacherSheet(sheets.find((s) => s.name === 'Professores')!.grid)!;
    expect(parsed.warnings).toEqual([]);
    expect(parsed.rows.length).toBe(await prisma.teacher.count());
    const r = await commitTeachers(admin.principal, { fileName: 'espelho.xlsx', rows: parsed.rows }, META);
    expect(r).toMatchObject({ created: 0, updated: 0 });
    expect(TEACHER_COLUMNS[0]).toBe('Nome completo');
  });

  it('só quem edita professores importa ou baixa', async () => {
    const coord = await makeUser('COORDENADOR');
    await expect(teacherTemplate(coord.principal, true)).rejects.toThrow(AuthorizationError);
    await expect(commitTeachers(coord.principal, { fileName: 'x', rows: [] }, META)).rejects.toThrow(AuthorizationError);
  });
});
