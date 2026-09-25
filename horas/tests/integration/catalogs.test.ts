import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/server/db';
import { bootstrapStructure } from '@/server/services/bootstrap';
import { listCatalog, saveCatalogItem } from '@/server/services/catalog-service';
import { importOfficialHolidays, saveHoliday } from '@/server/services/holiday-service';
import { listTeachers, saveTeacher } from '@/server/services/teacher-service';
import { AuthorizationError } from '@/server/errors';
import { toUtc } from '@/domain/dates';
import { META, hasDb, makeUser } from './helpers';

describe.skipIf(!hasDb)('E2 · cadastros, feriados e professores', () => {
  beforeAll(async () => {
    await prisma.$transaction((tx) => bootstrapStructure(tx), { timeout: 60_000 });
  });

  it('estrutura inicial é idempotente e fiel às respostas da Nação', async () => {
    const count = () => Promise.all([prisma.modality.count(), prisma.holiday.count(), prisma.activityType.count()]);
    const before = await count();
    await prisma.$transaction((tx) => bootstrapStructure(tx), { timeout: 60_000 });
    expect(await count()).toEqual(before);

    const mob = await prisma.modality.findUniqueOrThrow({ where: { name: 'Mobilidade' }, include: { area: true } });
    expect(mob.defaultDurationMin).toBe(30);
    expect(mob.area.name).toBe('Aulas Coletivas');
    expect((await prisma.activityType.findUniqueOrThrow({ where: { name: 'Personal' } })).countsHours).toBe(false);
    expect((await prisma.activityType.findUniqueOrThrow({ where: { name: 'Plantão' } })).countsHours).toBe(true);
    const reasons = await prisma.cancellationReason.findMany({ orderBy: { sortOrder: 'asc' } });
    expect(reasons[0]!.name).toBe('Falta de professor');
    expect(reasons.every((r) => !r.countsTeacherHours)).toBe(true);
  });

  describe('cadastros', () => {
    it('admin cria e altera modalidade, com auditoria de antes/depois', async () => {
      const admin = await makeUser('ADMIN', { name: 'Admin' });
      const area = await prisma.coordinationArea.findUniqueOrThrow({ where: { name: 'Lutas' } });
      const id = await saveCatalogItem(admin.principal, 'modalidades', null, {
        name: 'Boxe', areaId: area.id, defaultDurationMin: '60', color: '#B91C1C', costCenterId: '', requiresConfirmation: false, active: true,
      }, META);
      await saveCatalogItem(admin.principal, 'modalidades', id, {
        name: 'Boxe', areaId: area.id, defaultDurationMin: '45', color: '#B91C1C', costCenterId: '', requiresConfirmation: false, active: true,
      }, META);

      expect((await prisma.modality.findUniqueOrThrow({ where: { id } })).defaultDurationMin).toBe(45);
      const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'catalog.updated', entityId: id } });
      expect(log.summary).toBe('Admin alterou modalidade Boxe');
      expect(log.before).toMatchObject({ defaultDurationMin: 60 });
      expect(log.after).toMatchObject({ defaultDurationMin: 45, costCenterId: null });
    });

    it('valida no servidor: duração fora do limite e nome duplicado', async () => {
      const admin = await makeUser('ADMIN');
      const area = await prisma.coordinationArea.findFirstOrThrow();
      const base = { name: 'Nova', areaId: area.id, color: '#000000', costCenterId: '', requiresConfirmation: false, active: true };
      await expect(saveCatalogItem(admin.principal, 'modalidades', null, { ...base, defaultDurationMin: 0 }, META)).rejects.toThrow(/mínimo 5/);
      await expect(saveCatalogItem(admin.principal, 'modalidades', null, { ...base, name: 'CrossFit', defaultDurationMin: 60 }, META)).rejects.toThrow(/Já existe/);
    });

    it('coordenador não edita cadastros (403)', async () => {
      const coord = await makeUser('COORDENADOR');
      await expect(listCatalog(coord.principal, 'espacos')).rejects.toThrow(AuthorizationError);
      await expect(saveCatalogItem(coord.principal, 'espacos', null, { name: 'X', active: true }, META)).rejects.toThrow(AuthorizationError);
    });
  });

  describe('feriados', () => {
    it('recarregar oficiais não sobrescreve a política que a Nação escolheu', async () => {
      const admin = await makeUser('ADMIN');
      const indep = await prisma.holiday.findUniqueOrThrow({ where: { date: toUtc('2026-09-07') } });
      expect(indep.policy).toBe('DECIDIR_INDIVIDUALMENTE');
      await saveHoliday(admin.principal, indep.id, { date: '2026-09-07', name: indep.name, scope: 'NACIONAL', policy: 'CANCELAR_TODAS' }, META);

      expect(await importOfficialHolidays(admin.principal, 2026, META)).toBe(0);
      expect((await prisma.holiday.findUniqueOrThrow({ where: { id: indep.id } })).policy).toBe('CANCELAR_TODAS');
    });

    it('ponto facultativo nasce "manter todas"; duas datas iguais são recusadas', async () => {
      const admin = await makeUser('ADMIN');
      const carnaval = await prisma.holiday.findUniqueOrThrow({ where: { date: toUtc('2026-02-17') } });
      expect(carnaval.policy).toBe('MANTER_TODAS');
      await expect(saveHoliday(admin.principal, null, { date: '2026-02-17', name: 'Outro', scope: 'NACAO', policy: 'MANTER_TODAS' }, META)).rejects.toThrow(/Já existe/);
    });
  });

  describe('professores', () => {
    it('salva habilitações e apelidos normalizados; principal entra nas habilitações', async () => {
      const admin = await makeUser('ADMIN');
      const [hyrox, func] = await Promise.all([
        prisma.modality.findUniqueOrThrow({ where: { name: 'HYROX' } }),
        prisma.modality.findUniqueOrThrow({ where: { name: 'Funcional' } }),
      ]);
      const id = await saveTeacher(admin.principal, null, {
        name: 'Rafael Teste', displayName: 'Rafa', primaryModalityId: hyrox.id, modalityIds: [func.id],
        aliases: ['RAFAEL (coordenação)', 'rafael  (coordenação)', 'Rafael Teste'],
      }, META);

      const t = await prisma.teacher.findUniqueOrThrow({ where: { id }, include: { modalities: true, aliases: true } });
      expect(t.modalities.map((m) => m.modalityId).sort()).toEqual([hyrox.id, func.id].sort());
      expect(t.aliases.map((a) => a.alias)).toEqual(['rafael (coordenacao)']); // dedup + sem o próprio nome
    });

    it('recusa apelido que já é de outro professor', async () => {
      const admin = await makeUser('ADMIN');
      await saveTeacher(admin.principal, null, { name: 'Eduarda Teste', aliases: ['Duda'] }, META);
      await expect(saveTeacher(admin.principal, null, { name: 'Outra Pessoa', aliases: ['duda'] }, META)).rejects.toThrow(/já pertence a Eduarda Teste/);
    });

    it('dado pessoal só sai do servidor para quem pode ver', async () => {
      const admin = await makeUser('ADMIN');
      await saveTeacher(admin.principal, null, { name: 'Pessoa Privada', email: 'privada@teste.dev', phone: '61 99999-0000' }, META);
      const consulta = await makeUser('CONSULTA');
      const coord = await makeUser('COORDENADOR');

      const seenByConsulta = (await listTeachers(consulta.principal)).find((t) => t.name === 'Pessoa Privada')!;
      expect(seenByConsulta.email).toBeNull();
      expect(seenByConsulta.phone).toBeNull();
      const seenByCoord = (await listTeachers(coord.principal)).find((t) => t.name === 'Pessoa Privada')!;
      expect(seenByCoord.email).toBe('privada@teste.dev');
      await expect(saveTeacher(coord.principal, null, { name: 'X Y' }, META)).rejects.toThrow(AuthorizationError);
    });
  });
});
