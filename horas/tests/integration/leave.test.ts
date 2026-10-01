import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/server/db';
import { bootstrapStructure } from '@/server/services/bootstrap';
import { createSlots, listGrade, removeTeacherFromSlot } from '@/server/services/schedule-service';
import { generatePeriod, periodOverview } from '@/server/services/period-service';
import { cancelLeave, listLeaves, previewLeave, saveLeave } from '@/server/services/leave-service';
import { AppError } from '@/server/errors';
import { META, hasDb, makeUser } from './helpers';

/**
 * Competências de 2034 (sem feriado nas datas usadas), próprias deste arquivo.
 * Março/2034 = 26/02 a 25/03/2034. Terças: 28/02, 07, 14, 21/03. Quintas: 02, 09, 16, 23/03.
 */
describe.skipIf(!hasDb)('E5 · ausências lançadas na ficha do professor', () => {
  let admin: Awaited<ReturnType<typeof makeUser>>;
  let aula: { id: string };
  let crossfit: { id: string; areaId: string };
  let futevolei: { id: string; areaId: string };

  beforeAll(async () => {
    await prisma.$transaction((tx) => bootstrapStructure(tx, []), { timeout: 60_000 });
    admin = await makeUser('ADMIN', { name: 'Admin' });
    aula = await prisma.activityType.findUniqueOrThrow({ where: { name: 'Aula' } });
    crossfit = await prisma.modality.findUniqueOrThrow({ where: { name: 'CrossFit' } });
    futevolei = await prisma.modality.findUniqueOrThrow({ where: { name: 'Futevôlei' } });
  });

  let n = 0;
  async function setup(year: number, month: number) {
    n++;
    const ana = await prisma.teacher.create({ data: { name: `Ana Aus ${n}`, modalities: { create: { modalityId: crossfit.id } } } });
    const bia = await prisma.teacher.create({ data: { name: `Bia Aus ${n}` } });
    for (const weekday of [2, 4]) {
      await createSlots(admin.principal, {
        weekdays: [weekday], startMin: 1320, durationMin: 60, modalityId: crossfit.id, activityTypeId: aula.id, spaceId: '', label: `aus-${n}-${weekday}`,
        people: [{ teacherId: ana.id, role: 'TITULAR' }], validFrom: '2034-01-01',
      }, META);
    }
    await generatePeriod(admin.principal, { year, month }, META);
    const hours = async () => (await periodOverview(admin.principal, { year, month })).teachers;
    return { ana, bia, hours };
  }

  it('férias com substituto: horas vão para quem cobriu; anular devolve tudo', async () => {
    const { ana, bia, hours } = await setup(2034, 3);
    const input = { type: 'FERIAS', startDate: '2034-03-06', endDate: '2034-03-12', coverage: 'SUBSTITUIR', substituteId: bia.id, notes: '' };
    const preview = await previewLeave(admin.principal, ana.id, input);
    expect(preview).toMatchObject({ count: 2, minutes: 120, conflicts: [] });

    const r = await saveLeave(admin.principal, ana.id, input, META);
    expect(r.applied).toBe(2);
    let h = await hours();
    expect(h.find((t) => t.teacherId === ana.id)).toMatchObject({ plannedMin: 480, ownMin: 360, absenceMin: 120, totalMin: 360, absences: { FERIAS: 120 } });
    expect(h.find((t) => t.teacherId === bia.id)).toMatchObject({ substitutionMin: 120, totalMin: 120 });

    await expect(saveLeave(admin.principal, ana.id, { ...input, type: 'FOLGA', coverage: 'PENDENTE', substituteId: '' }, META)).rejects.toThrow(/Já existe férias/);

    expect((await cancelLeave(admin.principal, r.id, META)).restored).toBe(2);
    h = await hours();
    expect(h.find((t) => t.teacherId === ana.id)).toMatchObject({ ownMin: 480, absenceMin: 0, totalMin: 480 });
    expect(h.find((t) => t.teacherId === bia.id)).toBeUndefined();
    const list = await listLeaves(admin.principal, ana.id);
    expect(list[0]).toMatchObject({ cancelled: true, type: 'FERIAS', classes: 2 });
    await expect(cancelLeave(admin.principal, r.id, META)).rejects.toThrow(/já foi anulada/);
  });

  it('falta sem substituto fica pendente; cancelar derruba a aula com "Falta de professor"', async () => {
    const { ana, hours } = await setup(2034, 4); // 26/03 a 25/04/2034; terça 04/04, quinta 06/04
    await saveLeave(admin.principal, ana.id, { type: 'FALTA', startDate: '2034-04-04', endDate: '2034-04-04', coverage: 'PENDENTE' }, META);
    await saveLeave(admin.principal, ana.id, { type: 'ATESTADO', startDate: '2034-04-06', endDate: '2034-04-06', coverage: 'CANCELAR' }, META);
    const me = (await hours()).find((t) => t.teacherId === ana.id)!;
    expect(me).toMatchObject({ absenceMin: 60, cancelledMin: 60, absences: { FALTA: 60 } });
    const cancelled = await prisma.classOccurrence.findFirstOrThrow({ where: { date: new Date('2034-04-06'), label: { startsWith: `aus-${n}` } }, include: { cancellationReason: true } });
    expect(cancelled).toMatchObject({ status: 'CANCELADA', touched: true });
    expect(cancelled.cancellationReason?.name).toBe('Falta de professor');
  });

  it('ausência lançada ANTES de gerar a competência vale quando ela é gerada', async () => {
    n++;
    const ana = await prisma.teacher.create({ data: { name: `Ana Futuro ${n}` } });
    await createSlots(admin.principal, {
      weekdays: [2], startMin: 1380, durationMin: 60, modalityId: crossfit.id, activityTypeId: aula.id, spaceId: '', label: `fut-${n}`,
      people: [{ teacherId: ana.id, role: 'TITULAR' }], validFrom: '2034-01-01',
    }, META);
    const pre = await previewLeave(admin.principal, ana.id, { type: 'FERIAS', startDate: '2034-05-01', endDate: '2034-05-31', coverage: 'PENDENTE' });
    expect(pre.count).toBe(0);
    expect(pre.note).toMatch(/quando a competência for gerada/);
    await saveLeave(admin.principal, ana.id, { type: 'FERIAS', startDate: '2034-05-01', endDate: '2034-05-31', coverage: 'PENDENTE' }, META);
    await generatePeriod(admin.principal, { year: 2034, month: 5 }, META); // 26/04 a 25/05: terças 02, 09, 16, 23/05 de férias
    const me = (await periodOverview(admin.principal, { year: 2034, month: 5 })).teachers.find((t) => t.teacherId === ana.id)!;
    expect(me).toMatchObject({ absenceMin: 240, ownMin: 0 });
    // Gerar de novo não aplica duas vezes.
    await generatePeriod(admin.principal, { year: 2034, month: 5 }, META);
    expect(await prisma.classException.count({ where: { leave: { teacherId: ana.id } } })).toBe(4);
  });

  it('coordenador só lança ausência de quem dá aula na área dele', async () => {
    const { ana } = await setup(2034, 6);
    const coordFut = await makeUser('COORDENADOR', { areaIds: [futevolei.areaId] });
    await expect(saveLeave(coordFut.principal, ana.id, { type: 'FOLGA', startDate: '2034-06-06', endDate: '2034-06-06', coverage: 'PENDENTE' }, META)).rejects.toThrow(AppError);
    const coordCf = await makeUser('COORDENADOR', { areaIds: [crossfit.areaId] });
    await expect(saveLeave(coordCf.principal, ana.id, { type: 'FOLGA', startDate: '2034-06-06', endDate: '2034-06-06', coverage: 'PENDENTE' }, META)).resolves.toMatchObject({ applied: 1 });
  });

  it('sair desta aula tira só a pessoa; a ausência aparece na grade da data', async () => {
    n++;
    const ana = await prisma.teacher.create({ data: { name: `Ana Dupla ${n}` } });
    const bia = await prisma.teacher.create({ data: { name: `Bia Dupla ${n}` } });
    const [slotId] = await createSlots(admin.principal, {
      weekdays: [5], startMin: 1200, durationMin: 60, modalityId: crossfit.id, activityTypeId: aula.id, spaceId: '', label: `dupla-${n}`,
      people: [{ teacherId: ana.id, role: 'TITULAR' }, { teacherId: bia.id, role: 'TITULAR' }], validFrom: '2034-01-01',
    }, META);
    await saveLeave(admin.principal, bia.id, { type: 'FERIAS', startDate: '2034-07-01', endDate: '2034-07-20', coverage: 'SUBSTITUIR', substituteId: ana.id }, META);
    const onLeave = (await listGrade(admin.principal, '2034-07-10')).find((g) => g.slotId === slotId)!;
    expect(onLeave.people.find((p) => p.teacherId === bia.id)!.leave).toMatchObject({ type: 'FERIAS', until: '2034-07-20', substitute: `Ana Dupla ${n}` });
    expect(onLeave.people.find((p) => p.teacherId === ana.id)!.leave).toBeNull();

    await removeTeacherFromSlot(admin.principal, slotId!, ana.id, '2034-08-01', META);
    const before = (await listGrade(admin.principal, '2034-07-28')).find((g) => g.slotId === slotId)!;
    const after = (await listGrade(admin.principal, '2034-08-04')).find((g) => g.slotId === slotId)!;
    expect(before.people.map((p) => p.teacherId).sort()).toEqual([ana.id, bia.id].sort());
    expect(after.people.map((p) => p.teacherId)).toEqual([bia.id]);
    await expect(removeTeacherFromSlot(admin.principal, slotId!, ana.id, '2034-08-10', META)).rejects.toThrow(/não está nessa aula/);
  });

  it('substituição por aula: um substituto só na aula de terça, por cima das férias, inclusive em competência gerada depois', async () => {
    const { ana, bia, hours } = await setup(2034, 9); // 26/08 a 25/09/2034: terças 29/08, 05, 12, 19/09; quintas 31/08, 07, 14, 21/09
    const grade = await listGrade(admin.principal, '2034-09-10');
    const tue = grade.find((g) => g.label === `aus-${n}-2`)!;
    const thu = grade.find((g) => g.label === `aus-${n}-4`)!;
    const sub = { type: 'FERIAS', startDate: '2034-09-04', endDate: '2034-09-30', coverage: 'SUBSTITUIR', substituteId: bia.id, slotId: tue.slotId };

    const ferias = await saveLeave(admin.principal, ana.id, { type: 'FERIAS', startDate: '2034-09-04', endDate: '2034-09-17', coverage: 'PENDENTE' }, META);
    expect(ferias.applied).toBe(4);
    expect(await previewLeave(admin.principal, ana.id, sub)).toMatchObject({ count: 3 }); // 05 e 12 (pendentes) + 19/09
    const s = await saveLeave(admin.principal, ana.id, sub, META);
    expect(s.applied).toBe(3);
    expect((await hours()).find((t) => t.teacherId === bia.id)).toMatchObject({ substitutionMin: 180 });

    // Na grade: a terça mostra o substituto; a quinta, as férias.
    const g2 = await listGrade(admin.principal, '2034-09-10');
    expect(g2.find((g) => g.slotId === tue.slotId)!.people[0]!.leave).toMatchObject({ substitute: bia.name });
    expect(g2.find((g) => g.slotId === thu.slotId)!.people[0]!.leave).toMatchObject({ type: 'FERIAS', substitute: null });

    await expect(saveLeave(admin.principal, ana.id, { ...sub, startDate: '2034-09-20', endDate: '2034-09-22' }, META)).rejects.toThrow(/substituição nesta aula/);
    await expect(saveLeave(admin.principal, bia.id, { ...sub, substituteId: ana.id }, META)).rejects.toThrow(/não está nessa aula/);
    await expect(saveLeave(admin.principal, ana.id, { ...sub, coverage: 'PENDENTE', substituteId: '' }, META)).rejects.toThrow(/precisa de um substituto/);

    // Competência gerada depois já nasce com o substituto (terça 26/09).
    await generatePeriod(admin.principal, { year: 2034, month: 10 }, META);
    const oct = (await periodOverview(admin.principal, { year: 2034, month: 10 })).teachers;
    expect(oct.find((t) => t.teacherId === bia.id)).toMatchObject({ substitutionMin: 60 });

    // Anular as férias não desfaz a substituição; anular a substituição devolve a aula à Ana.
    await cancelLeave(admin.principal, ferias.id, META);
    let h = await hours();
    expect(h.find((t) => t.teacherId === bia.id)).toMatchObject({ substitutionMin: 180 });
    expect(h.find((t) => t.teacherId === ana.id)).toMatchObject({ ownMin: 300, absenceMin: 180 });
    await cancelLeave(admin.principal, s.id, META);
    h = await hours();
    expect(h.find((t) => t.teacherId === bia.id)).toBeUndefined();
    expect(h.find((t) => t.teacherId === ana.id)).toMatchObject({ ownMin: 480, absenceMin: 0 });
    expect((await listLeaves(admin.principal, ana.id)).find((l) => l.id === s.id)).toMatchObject({ slot: 'CrossFit · Terça 22:00', cancelled: true });
  });
});
