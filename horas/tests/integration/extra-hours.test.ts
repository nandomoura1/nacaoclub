import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/server/db';
import { bootstrapStructure } from '@/server/services/bootstrap';
import { listExtraHours, removeExtraHours, saveExtraHours } from '@/server/services/extra-hours-service';
import { periodOverview } from '@/server/services/period-service';
import { hoursReport, parseReportFilter } from '@/server/services/report-service';
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

  it('perfil Professor: vê só o próprio extrato (com o dobro de domingo), nunca o de outro', async () => {
    const eu = await prisma.teacher.create({ data: { name: `Eu Prof ${Date.now()}` } });
    const outro = await prisma.teacher.create({ data: { name: `Outro Prof ${Date.now()}` } });
    const base = { modalityId: musc.id, activityTypeId: aula.id, description: 'Plantão' };
    await saveExtraHours(admin.principal, eu.id, { ...base, date: '2036-04-06', start: '08:00', end: '14:00' }, META); // domingo
    await saveExtraHours(admin.principal, outro.id, { ...base, date: '2036-04-07', start: '08:00', end: '10:00' }, META);
    const prof = await makeUser('PROFESSOR', { name: 'Prof' });
    const filter = await parseReportFilter({ competencia: '2036-04', professor: outro.id }); // tenta ver o outro
    await expect(hoursReport(prof.principal, filter)).rejects.toThrow(/não está vinculado/);
    const linked = { ...prof.principal, teacherIds: [eu.id] };
    const r = await hoursReport(linked, filter);
    expect(r.byTeacher.map((t) => t.teacherId)).toEqual([eu.id]);
    expect(r.byTeacher[0]).toMatchObject({ extraMin: 360, bonusMin: 360, totalMin: 720 }); // 8h–14h no domingo = 12h
    expect(r.detail.every((o) => o.people.some((p) => p.executingId === eu.id || p.plannedId === eu.id))).toBe(true);
    expect(r.detail[0]).toMatchObject({ doubled: true });
  });

  it('uma pessoa com dois cadastros (ex.: CrossFit e Nação Fit): extrato de cada um, nunca de terceiros', async () => {
    const n = Date.now();
    const cross = await prisma.teacher.create({ data: { name: `Maria_cross ${n}` } });
    const fit = await prisma.teacher.create({ data: { name: `Maria_fit ${n}` } });
    const terceiro = await prisma.teacher.create({ data: { name: `Terceiro ${n}` } });
    const base = { modalityId: musc.id, activityTypeId: aula.id, description: 'Turno' };
    await saveExtraHours(admin.principal, cross.id, { ...base, date: '2036-04-08', start: '08:00', end: '09:00' }, META);
    await saveExtraHours(admin.principal, fit.id, { ...base, date: '2036-04-09', start: '08:00', end: '10:00' }, META);
    await saveExtraHours(admin.principal, terceiro.id, { ...base, date: '2036-04-09', start: '10:00', end: '11:00' }, META);

    const { createUser } = await import('@/server/services/user-service');
    const { loadPrincipal } = await import('@/server/auth/principal');
    const { userId } = await createUser(admin.principal, { name: `Maria ${n}`, email: `maria.${n}@teste.dev`, roleKeys: ['PROFESSOR'], teacherIds: [cross.id, fit.id] }, META);
    await expect(createUser(admin.principal, { name: 'Outra', email: `outra.${n}@teste.dev`, roleKeys: ['PROFESSOR'], teacherIds: [fit.id] }, META)).rejects.toThrow(/já está vinculado/);
    await prisma.user.update({ where: { id: userId }, data: { mustChangePassword: false } });
    const maria = (await loadPrincipal(prisma, userId))!;
    expect(new Set(maria.teacherIds)).toEqual(new Set([cross.id, fit.id]));

    const f = await parseReportFilter({ competencia: '2036-04' });
    expect((await hoursReport(maria, { ...f, teacherId: cross.id })).byTeacher.map((t) => [t.teacherId, t.extraMin])).toEqual([[cross.id, 60]]);
    expect((await hoursReport(maria, { ...f, teacherId: fit.id })).byTeacher.map((t) => [t.teacherId, t.extraMin])).toEqual([[fit.id, 120]]);
    const tentativa = await hoursReport(maria, { ...f, teacherId: terceiro.id }); // não é dela: cai no próprio
    expect(tentativa.byTeacher.map((t) => t.teacherId)).not.toContain(terceiro.id);
  });
});

