import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/server/db';
import { bootstrapStructure } from '@/server/services/bootstrap';
import { changeSlot, createSlots, endSlot, listGrade } from '@/server/services/schedule-service';
import { commitImport, loadImportCatalog } from '@/server/services/import-service';
import { parseSheet } from '@/domain/import/parsers';
import { collectNames } from '@/domain/import/plan';
import type { Grid } from '@/domain/import/types';
import { AuthorizationError } from '@/server/errors';
import { META, hasDb, makeUser } from './helpers';

async function ids() {
  const [crossfit, hyrox, aula, lutas] = await Promise.all([
    prisma.modality.findUniqueOrThrow({ where: { name: 'CrossFit' } }),
    prisma.modality.findUniqueOrThrow({ where: { name: 'HYROX' } }),
    prisma.activityType.findUniqueOrThrow({ where: { name: 'Aula' } }),
    prisma.coordinationArea.findUniqueOrThrow({ where: { name: 'Lutas' } }),
  ]);
  return { crossfit, hyrox, aula, lutas };
}

describe.skipIf(!hasDb)('E3 · grade com vigência e importação', () => {
  beforeAll(async () => {
    await prisma.$transaction((tx) => bootstrapStructure(tx), { timeout: 60_000 });
  });

  describe('grade', () => {
    it('Cenário 5: alteração no dia 15 mantém a versão antiga até o dia 14', async () => {
      const admin = await makeUser('ADMIN', { name: 'Admin' });
      const { hyrox, aula } = await ids();
      const t1 = await prisma.teacher.create({ data: { name: 'Rafael Grade' } });
      const t2 = await prisma.teacher.create({ data: { name: 'João Grade' } });

      const [slotId] = await createSlots(admin.principal, {
        weekdays: [1], startMin: 300, durationMin: 60, modalityId: hyrox.id, activityTypeId: aula.id,
        spaceId: '', label: '', people: [{ teacherId: t1.id, role: 'TITULAR' }], validFrom: '2026-08-01',
      }, META);

      await changeSlot(admin.principal, slotId!, {
        weekday: 1, startMin: 360, durationMin: 60, modalityId: hyrox.id, activityTypeId: aula.id, spaceId: '', label: '',
        people: [{ teacherId: t2.id, role: 'TITULAR' }], from: '2026-10-15', reason: 'novo horário',
      }, META);

      const before = (await listGrade(admin.principal, '2026-10-14')).find((g) => g.slotId === slotId)!;
      const after = (await listGrade(admin.principal, '2026-10-15')).find((g) => g.slotId === slotId)!;
      expect(before).toMatchObject({ startMin: 300, validTo: '2026-10-14', nextChange: '2026-10-15', people: [{ name: 'Rafael Grade' }] });
      expect(after).toMatchObject({ startMin: 360, validFrom: '2026-10-15', validTo: null, people: [{ name: 'João Grade' }] });

      const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'schedule.changed', entityId: slotId } });
      expect(log.summary).toMatch(/Admin alterou a aula HYROX de segunda 05:00 a partir de 15\/10\/2026: HYROX de segunda 06:00 · 60 min · João Grade — novo horário/);
    });

    it('o banco impede duas versões valendo no mesmo dia (exclusion constraint)', async () => {
      const { crossfit, aula } = await ids();
      const slot = await prisma.scheduleSlot.create({ data: {} });
      const base = { slotId: slot.id, weekday: 2, startMin: 420, durationMin: 60, modalityId: crossfit.id, activityTypeId: aula.id };
      await prisma.scheduleSlotVersion.create({ data: { ...base, validFrom: new Date('2026-08-01'), validTo: null } });
      await expect(prisma.scheduleSlotVersion.create({ data: { ...base, validFrom: new Date('2026-09-01') } })).rejects.toThrow();
    });

    it('encerrar mantém o histórico; a aula some da grade a partir da data', async () => {
      const admin = await makeUser('ADMIN');
      const { crossfit, aula } = await ids();
      const [slotId] = await createSlots(admin.principal, {
        weekdays: [3], startMin: 480, durationMin: 60, modalityId: crossfit.id, activityTypeId: aula.id, spaceId: '', label: 'Encerrar', people: [], validFrom: '2026-08-01',
      }, META);
      await endSlot(admin.principal, slotId!, '2026-11-01', 'turma fechou', META);
      expect((await listGrade(admin.principal, '2026-10-31')).some((g) => g.slotId === slotId)).toBe(true);
      expect((await listGrade(admin.principal, '2026-11-01')).some((g) => g.slotId === slotId)).toBe(false);
      expect(await prisma.scheduleSlotVersion.count({ where: { slotId } })).toBe(1);
    });

    it('coordenador só mexe na própria área e só vê a própria área', async () => {
      const { crossfit, aula, lutas } = await ids();
      const coord = await makeUser('COORDENADOR', { areaIds: [lutas.id] });
      await expect(createSlots(coord.principal, {
        weekdays: [1], startMin: 300, durationMin: 60, modalityId: crossfit.id, activityTypeId: aula.id, spaceId: '', label: '', people: [], validFrom: '2026-08-01',
      }, META)).rejects.toThrow(AuthorizationError);
      const visible = await listGrade(coord.principal, '2026-10-01');
      expect(visible.every((g) => g.modality.areaId === lutas.id)).toBe(true);
    });
  });

  describe('importação', () => {
    const g = (rows: string[][]): Grid => rows.map((r) => r.map((t) => (t === '^' ? { text: '', slave: true } : { text: t, slave: false })));
    const SHEET = g([
      ['HORARIO', 'SALA', 'SEGUNDA', 'TERÇA'],
      ['5h', 'CROSSFIT 1', 'Zeca Import', 'Zeca Import'],
      ['^', 'FUNCIONAL 1', 'Hyrox', 'Mobilidade Master'],
      ['^', '^', 'Yara Import', 'Zeca Import (mobility)'],
      ['^', 'SALA TATAME', 'Pilates Solo', ''],
      ['^', '^', 'Yara Import', ''],
      ['^', 'ESTAGIÁRIOS', 'Xande Import', 'estagiário'],
    ]);

    it('grava aulas, cadastra quem falta, cria apelidos e habilitações; reimportar não duplica', async () => {
      const admin = await makeUser('ADMIN', { name: 'Admin' });
      const { rows } = parseSheet('CROSSFIT TESTE', SHEET);
      const catalog = await loadImportCatalog();
      const decisions = Object.fromEntries(collectNames(rows, catalog).map((n) => [n.key, n.auto]));
      const funcional = await prisma.modality.findUniqueOrThrow({ where: { name: 'Funcional' } });
      const payload = { fileName: 'teste.xlsx', sheets: ['CROSSFIT TESTE'], validFrom: '2026-08-26', rows, decisions, overrides: {} as Record<string, string> };

      // "Pilates Solo" não é modalidade: sem decisão, a importação é recusada.
      await expect(commitImport(admin.principal, payload, META)).rejects.toThrow(/sem modalidade/);

      const r = await commitImport(admin.principal, { ...payload, overrides: { 'CROSSFIT TESTE::pilates solo': funcional.id } }, META);
      expect(r).toMatchObject({ created: 7, newTeachers: 3, skipped: 0 });

      const zeca = await prisma.teacher.findFirstOrThrow({ where: { name: 'Zeca Import' }, include: { aliases: true, modalities: { include: { modality: true } } } });
      expect(zeca.aliases.map((a) => a.alias)).toEqual(['zeca import (mobility)']);
      expect(zeca.modalities.map((m) => m.modality.name).sort()).toEqual(['CrossFit', 'Mobilidade']);

      const grade = await listGrade(admin.principal, '2026-09-01');
      const tue = grade.filter((x) => x.weekday === 2 && x.startMin === 300);
      expect(tue.find((x) => x.modality.name === 'Mobilidade')).toMatchObject({ label: 'Master', durationMin: 30 });
      // "estagiário" não é ninguém: a linha de estagiários de terça não tem pessoa.
      expect(tue.find((x) => x.label === 'Estagiários')?.people ?? []).toHaveLength(0);
      const core = grade.find((x) => x.label === 'Pilates Solo')!;
      expect(core.modality.name).toBe('Funcional');

      const again = await commitImport(admin.principal, { ...payload, overrides: { 'CROSSFIT TESTE::pilates solo': funcional.id } }, META);
      expect(again).toMatchObject({ created: 0, skipped: 7, newTeachers: 0 });
      expect(await prisma.teacher.count({ where: { name: 'Zeca Import' } })).toBe(1);

      const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'schedule.imported' }, orderBy: { at: 'asc' } });
      expect(log.summary).toMatch(/Admin importou 7 aula\(s\) de teste\.xlsx .* 3 professor\(es\) cadastrado\(s\)/);
    });

    it('só o admin importa', async () => {
      const coord = await makeUser('COORDENADOR');
      await expect(commitImport(coord.principal, {}, META)).rejects.toThrow(AuthorizationError);
    });
  });
});
