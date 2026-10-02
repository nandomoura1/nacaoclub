import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/server/db';
import { bootstrapStructure } from '@/server/services/bootstrap';
import { createSlots } from '@/server/services/schedule-service';
import { deletePersonalWorkout, listPersonalWorkouts, personalSlots, savePersonalWorkout } from '@/server/services/personal-workout-service';
import { createWeek, getWeek, listWeeks } from '@/server/services/workout-service';
import { AuthorizationError } from '@/server/errors';
import { META, hasDb, makeUser } from './helpers';

/** Perfil Professor: treinos Personal das próprias aulas e leitura do Cadastro de Treino. Datas de 2037. */
describe.skipIf(!hasDb)('perfil Professor: treinos', () => {
  let admin: Awaited<ReturnType<typeof makeUser>>;
  let personal: { id: string };
  let musc: { id: string };
  beforeAll(async () => {
    await prisma.$transaction((tx) => bootstrapStructure(tx, []), { timeout: 60_000 });
    admin = await makeUser('ADMIN', { name: 'Admin' });
    personal = await prisma.activityType.findUniqueOrThrow({ where: { name: 'Personal' } });
    musc = await prisma.modality.findUniqueOrThrow({ where: { name: 'Musculação' } });
  });

  it('cria treino Personal só para a própria aula, no dia certo; vê só os próprios', async () => {
    const n = Date.now();
    const eu = await prisma.teacher.create({ data: { name: `Personal Eu ${n}` } });
    const outro = await prisma.teacher.create({ data: { name: `Personal Outro ${n}` } });
    const mk = (teacherId: string, weekday: number) => createSlots(admin.principal, {
      weekdays: [weekday], startMin: 420, durationMin: 60, modalityId: musc.id, activityTypeId: personal.id, spaceId: '', label: `pers-${n}-${weekday}`,
      people: [{ teacherId, role: 'TITULAR' }], validFrom: '2037-01-01',
    }, META).then((ids) => ids[0]!);
    const minha = await mk(eu.id, 1); // segundas 07:00
    const dele = await mk(outro.id, 3);

    const semVinculo = await makeUser('PROFESSOR', { name: 'Prof sem vínculo' });
    await expect(listPersonalWorkouts(semVinculo.principal)).rejects.toThrow(/não está vinculado/);
    const prof = { ...(await makeUser('PROFESSOR', { name: 'Prof' })).principal, teacherId: eu.id };

    expect((await personalSlots(prof, '2037-01-01')).map((s) => s.slotId)).toEqual([minha]);
    const treino = { slotId: minha, date: '2037-03-02', student: 'Joana', title: 'Pernas + core', blocks: [{ kind: 'FORCA', title: 'Agachamento', format: '4 x 10', content: 'Goblet 12kg' }] };
    const id = await savePersonalWorkout(prof, null, treino, META); // 02/03/2037 é segunda
    await expect(savePersonalWorkout(prof, null, { ...treino, date: '2037-03-03' }, META)).rejects.toThrow(/é de segunda/);
    await expect(savePersonalWorkout(prof, null, { ...treino, slotId: dele, date: '2037-03-04' }, META)).rejects.toThrow(/de outro professor/);
    await expect(savePersonalWorkout(prof, null, { ...treino, teacherId: outro.id, slotId: null }, META)).resolves.toBeTruthy(); // teacherId ignorado: fica no dele
    const avulso = await savePersonalWorkout(prof, null, { ...treino, slotId: null, date: '2037-03-05' }, META); // aula avulsa

    const outroId = await savePersonalWorkout(admin.principal, null, { ...treino, teacherId: outro.id, slotId: dele, date: '2037-03-04' }, META);
    const meus = await listPersonalWorkouts(prof);
    expect(meus.every((w) => w.teacherId === eu.id)).toBe(true);
    expect(meus.find((w) => w.id === id)).toMatchObject({ startMin: 420, student: 'Joana', blocks: [{ kind: 'FORCA', title: 'Agachamento' }] });
    expect((await listPersonalWorkouts(admin.principal)).some((w) => w.id === outroId)).toBe(true); // coordenação/admin vê todos
    await expect(deletePersonalWorkout(prof, outroId, META)).rejects.toThrow(AuthorizationError);
    await deletePersonalWorkout(prof, avulso, META);
  });

  it('vê os treinos de todas as modalidades, sem poder criar ou editar a semana', async () => {
    const cf = await prisma.modality.findUniqueOrThrow({ where: { name: 'CrossFit' } });
    const week = await createWeek(admin.principal, { modalityId: cf.id, date: '2037-05-04' }, META);
    const prof = (await makeUser('PROFESSOR', { name: 'Prof leitura' })).principal;
    expect((await listWeeks(prof)).some((w) => w.id === week)).toBe(true);
    expect(await getWeek(prof, week)).toMatchObject({ modality: 'CrossFit' });
    await expect(createWeek(prof, { modalityId: cf.id, date: '2037-05-11' }, META)).rejects.toThrow(AuthorizationError);
  });
});
