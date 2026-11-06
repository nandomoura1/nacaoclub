import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/server/db';
import { bootstrapStructure } from '@/server/services/bootstrap';
import { createSlots, listGrade, removeTeacherFromSlot } from '@/server/services/schedule-service';
import { generatePeriod, periodOverview } from '@/server/services/period-service';
import { cancelLeave, coverLeaveClasses, listCoverableLeaves, listCoveredByTeacher, listLeaveClasses, listLeaves, previewLeave, saveLeave, setLeaveDeducts, uncoverLeaveClasses } from '@/server/services/leave-service';
import { AppError } from '@/server/errors';
import { defaultDeducts } from '@/domain/leave';
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
    await saveLeave(admin.principal, ana.id, { type: 'ATESTADO', startDate: '2034-04-06', endDate: '2034-04-06', coverage: 'CANCELAR', deductsHours: true }, META);
    const me = (await hours()).find((t) => t.teacherId === ana.id)!;
    expect(me).toMatchObject({ absenceMin: 60, cancelledMin: 60, absences: { FALTA: 60 } });
    const cancelled = await prisma.classOccurrence.findFirstOrThrow({ where: { date: new Date('2034-04-06'), label: { startsWith: `aus-${n}` } }, include: { cancellationReason: true } });
    expect(cancelled).toMatchObject({ status: 'CANCELADA', touched: true });
    expect(cancelled.cancellationReason?.name).toBe('Falta de professor');
  });

  it('atestado desconta por padrão e folga não; atestado abonado à mão; dá para trocar depois, e anular devolve', async () => {
    const { ana, bia, hours } = await setup(2034, 9); // 26/08 a 25/09/2034
    const atestado = await saveLeave(admin.principal, ana.id, { type: 'ATESTADO', startDate: '2034-09-05', endDate: '2034-09-05', coverage: 'SUBSTITUIR', substituteId: bia.id, deductsHours: false }, META);
    expect(defaultDeducts('ATESTADO')).toBe(true);
    await saveLeave(admin.principal, ana.id, { type: 'FOLGA', startDate: '2034-09-07', endDate: '2034-09-07', coverage: 'CANCELAR' }, META);
    await saveLeave(admin.principal, ana.id, { type: 'FALTA', startDate: '2034-09-12', endDate: '2034-09-12', coverage: 'PENDENTE' }, META);
    let me = (await hours()).find((t) => t.teacherId === ana.id)!;
    // Atestado (substituído) e folga (cancelada) contam para a Ana; a falta desconta. A Bia recebe a substituição.
    expect(me).toMatchObject({ paidLeaveMin: 120, absenceMin: 60, cancelledMin: 0, absences: { FALTA: 60 } });
    expect(me.totalMin).toBe(me.ownMin + 120);
    expect((await hours()).find((t) => t.teacherId === bia.id)).toMatchObject({ substitutionMin: 60 });
    expect((await listLeaves(admin.principal, ana.id)).map((l) => [l.type, l.deductsHours])).toEqual(expect.arrayContaining([['ATESTADO', false], ['FOLGA', false], ['FALTA', true]]));

    expect(await setLeaveDeducts(admin.principal, atestado.id, true, META)).toMatchObject({ updated: 1, closed: 0 });
    me = (await hours()).find((t) => t.teacherId === ana.id)!;
    expect(me).toMatchObject({ paidLeaveMin: 60, absenceMin: 120, absences: { FALTA: 60, ATESTADO: 60 } });

    await cancelLeave(admin.principal, atestado.id, META);
    me = (await hours()).find((t) => t.teacherId === ana.id)!;
    expect(me).toMatchObject({ paidLeaveMin: 60, absenceMin: 60 });
    expect(await prisma.classAssignment.count({ where: { plannedTeacherId: ana.id, status: 'PREVISTA', absencePaid: true } })).toBe(0);
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
    // A prévia mostra as aulas da grade que serão afetadas quando a competência for gerada (terças 02 a 30/05).
    expect(pre.pending).toMatchObject({ count: 5, minutes: 300, canGenerate: true });
    expect(pre.pending!.periods.map((x) => x.label)).toEqual(['Maio/2034', 'Junho/2034']);
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
  it('cobertura em lote: outro professor assume aulas do atestado; horas vão para ele, desfazer e anular devolvem', async () => {
    const { ana, bia, hours } = await setup(2034, 7); // 26/06 a 25/07/2034: terças 27/06, 04, 11, 18, 25/07; quintas 29/06, 06, 13, 20/07
    const leave = await saveLeave(admin.principal, ana.id, { type: 'FERIAS', startDate: '2034-07-03', endDate: '2034-07-16', coverage: 'PENDENTE' }, META);
    expect(leave.applied).toBe(4);
    const leaves = await listCoverableLeaves(admin.principal, bia.id, '2034-06-26', '2034-07-25');
    expect(leaves.map((l) => l.id)).toContain(leave.id);
    expect((await listCoverableLeaves(admin.principal, ana.id, '2034-06-26', '2034-07-25')).map((l) => l.id)).not.toContain(leave.id);

    const list = await listLeaveClasses(admin.principal, leave.id, bia.id);
    expect(list.rows.map((r) => [r.date, r.state])).toEqual([
      ['2034-07-04', 'pendente'], ['2034-07-06', 'pendente'], ['2034-07-11', 'pendente'], ['2034-07-13', 'pendente'],
    ]);
    const ids = list.rows.slice(0, 3).map((r) => r.assignmentId);
    const r = await coverLeaveClasses(admin.principal, bia.id, { leaveId: leave.id, assignmentIds: ids }, META);
    expect(r).toMatchObject({ covered: 3, minutes: 180, skipped: [] });
    let h = await hours();
    expect(h.find((t) => t.teacherId === bia.id)).toMatchObject({ substitutionMin: 180, totalMin: 180 });
    expect(h.find((t) => t.teacherId === ana.id)).toMatchObject({ absenceMin: 240 });
    expect((await listCoveredByTeacher(admin.principal, bia.id, '2034-06-26', '2034-07-25')).map((c) => c.date)).toEqual(['2034-07-04', '2034-07-06', '2034-07-11']);

    // De novo nas mesmas: nada a fazer. Ana não cobre a si mesma.
    await expect(coverLeaveClasses(admin.principal, bia.id, { leaveId: leave.id, assignmentIds: ids }, META)).rejects.toThrow(/já coberta/);
    await expect(coverLeaveClasses(admin.principal, ana.id, { leaveId: leave.id, assignmentIds: [list.rows[3]!.assignmentId] }, META)).rejects.toThrow(/próprio professor/);
    const after = await listLeaveClasses(admin.principal, leave.id, bia.id);
    expect(after.rows.map((x) => x.state)).toEqual(['coberta_por_mim', 'coberta_por_mim', 'coberta_por_mim', 'pendente']);

    // Desfazer uma: volta a aguardar substituto.
    expect((await uncoverLeaveClasses(admin.principal, bia.id, { leaveId: leave.id, assignmentIds: [ids[2]!] }, META)).undone).toBe(1);
    h = await hours();
    expect(h.find((t) => t.teacherId === bia.id)).toMatchObject({ substitutionMin: 120 });

    // Anular a ausência devolve tudo ao previsto, inclusive as cobertas.
    expect((await cancelLeave(admin.principal, leave.id, META)).restored).toBeGreaterThanOrEqual(4);
    h = await hours();
    expect(h.find((t) => t.teacherId === ana.id)).toMatchObject({ absenceMin: 0, ownMin: 540 });
    expect(h.find((t) => t.teacherId === bia.id)).toBeUndefined();
    const statuses = await prisma.classAssignment.findMany({ where: { plannedTeacherId: ana.id, occurrence: { date: { gte: new Date('2034-07-03'), lte: new Date('2034-07-16') } } }, select: { status: true, executingTeacherId: true } });
    expect(statuses.every((x) => x.status === 'PREVISTA' && x.executingTeacherId === ana.id)).toBe(true);
  });

  it('cobertura de atestado que cancelou a aula: a aula volta a acontecer com o substituto', async () => {
    const { ana, bia, hours } = await setup(2034, 8); // 26/07 a 25/08/2034
    const leave = await saveLeave(admin.principal, ana.id, { type: 'ATESTADO', startDate: '2034-08-01', endDate: '2034-08-01', coverage: 'CANCELAR', deductsHours: false }, META);
    const [row] = (await listLeaveClasses(admin.principal, leave.id, bia.id)).rows;
    expect(row).toMatchObject({ state: 'cancelada' });
    await coverLeaveClasses(admin.principal, bia.id, { leaveId: leave.id, assignmentIds: [row!.assignmentId] }, META);
    const occ = await prisma.classAssignment.findUniqueOrThrow({ where: { id: row!.assignmentId }, include: { occurrence: true } });
    expect(occ).toMatchObject({ status: 'SUBSTITUIDA', executingTeacherId: bia.id, absencePaid: true });
    expect(occ.occurrence.status).toBe('PREVISTA');
    const h = await hours();
    expect(h.find((t) => t.teacherId === bia.id)).toMatchObject({ substitutionMin: 60 });
    expect(h.find((t) => t.teacherId === ana.id)).toMatchObject({ paidLeaveMin: 60, absenceMin: 0 });
    await uncoverLeaveClasses(admin.principal, bia.id, { leaveId: leave.id, assignmentIds: [row!.assignmentId] }, META);
    expect((await prisma.classOccurrence.findUniqueOrThrow({ where: { id: occ.occurrenceId } })).status).toBe('CANCELADA');
  });
});
