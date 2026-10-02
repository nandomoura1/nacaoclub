import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/server/db';
import { bootstrapStructure } from '@/server/services/bootstrap';
import { listExtraHours, removeExtraHours, saveExtraHours } from '@/server/services/extra-hours-service';
import { periodOverview } from '@/server/services/period-service';
import { AuthorizationError } from '@/server/errors';
import { META, hasDb, makeUser } from './helpers';

/** Competências de 2036 (próprias deste arquivo). Abril/2036 = 26/03 a 25/04/2036. */
describe.skipIf(!hasDb)('horas extras lançadas na ficha do professor', () => {
  let admin: Awaited<ReturnType<typeof makeUser>>;
  let musc: { id: string; areaId: string };
  let aula: { id: string };
  beforeAll(async () => {
    await prisma.$transaction((tx) => bootstrapStructure(tx, []), { timeout: 60_000 });
    admin = await makeUser('ADMIN', { name: 'Admin' });
    musc = await prisma.modality.findUniqueOrThrow({ where: { name: 'Musculação' }, select: { id: true, areaId: true } });
    aula = await prisma.activityType.findUniqueOrThrow({ where: { name: 'Aula' } });
  });

  it('entra como extra no quadro de horas; remover tira; competência fechada trava', async () => {
    const t = await prisma.teacher.create({ data: { name: `Extra ${Date.now()}` } });
    const base = { modalityId: musc.id, activityTypeId: aula.id, description: 'Aulão de sábado' };
    const r = await saveExtraHours(admin.principal, t.id, { ...base, date: '2036-04-05', start: '08:00', end: '10:30' }, META);
    expect(r.minutes).toBe(150);
    const hours = async () => (await periodOverview(admin.principal, { year: 2036, month: 4 })).teachers.find((x) => x.teacherId === t.id);
    expect(await hours()).toMatchObject({ extraMin: 150, totalMin: 150 });
    expect(await listExtraHours(admin.principal, t.id, '2036-03-26', '2036-04-25')).toMatchObject([{ start: '08:00', end: '10:30', description: 'Aulão de sábado', closed: false }]);

    await expect(saveExtraHours(admin.principal, t.id, { ...base, date: '2036-04-06', start: '10:00', end: '09:00' }, META)).rejects.toThrow(/término/);
    const coordKids = await makeUser('COORDENADOR', { name: 'Coord', areaIds: [(await prisma.modality.findUniqueOrThrow({ where: { name: 'Futebol Kids' } })).areaId] });
    await expect(saveExtraHours(coordKids.principal, t.id, { ...base, date: '2036-04-06', start: '08:00', end: '09:00' }, META)).rejects.toThrow(AuthorizationError);

    await removeExtraHours(admin.principal, r.id, META);
    expect(await hours()).toBeUndefined();

    const r2 = await saveExtraHours(admin.principal, t.id, { ...base, date: '2036-05-02', start: '08:00', end: '09:00' }, META);
    await prisma.payrollPeriod.update({ where: { year_month: { year: 2036, month: 5 } }, data: { status: 'FECHADO' } });
    await expect(removeExtraHours(admin.principal, r2.id, META)).rejects.toThrow(/fechada/);
    await expect(saveExtraHours(admin.principal, t.id, { ...base, date: '2036-05-03', start: '08:00', end: '09:00' }, META)).rejects.toThrow(/fechada/);
  });
});
