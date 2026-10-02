import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/server/db';
import { bootstrapStructure } from '@/server/services/bootstrap';
import { changeSlot, createSlots, endSlot, listGrade, removeTeacherFromSlot } from '@/server/services/schedule-service';
import { saveTeacherFromForm } from '@/server/services/teacher-service';
import { decideHoliday, generatePeriod, listOccurrences, periodOverview } from '@/server/services/period-service';
import { saveHoliday } from '@/server/services/holiday-service';
import { toUtc } from '@/domain/dates';
import { AppError, AuthorizationError } from '@/server/errors';
import { META, hasDb, makeUser } from './helpers';

/**
 * Cada teste usa uma competência própria (meses diferentes de 2030+) para não
 * interferir nos outros, já que o schema é compartilhado pela suíte.
 */
describe.skipIf(!hasDb)('E4 · competência, geração e horas', () => {
  let admin: Awaited<ReturnType<typeof makeUser>>;
  let hyrox: { id: string; areaId: string };
  let crossfit: { id: string; areaId: string };
  let aula: { id: string };

  beforeAll(async () => {
    await prisma.$transaction((tx) => bootstrapStructure(tx, [2030, 2031]), { timeout: 60_000 });
    admin = await makeUser('ADMIN', { name: 'Admin' });
    hyrox = await prisma.modality.findUniqueOrThrow({ where: { name: 'HYROX' } });
    crossfit = await prisma.modality.findUniqueOrThrow({ where: { name: 'CrossFit' } });
    aula = await prisma.activityType.findUniqueOrThrow({ where: { name: 'Aula' } });
  });

  async function teacher(name: string) {
    return prisma.teacher.create({ data: { name } });
  }
  async function slot(weekday: number, teacherId: string, opts: { modalityId?: string; startMin?: number; validFrom?: string; durationMin?: number } = {}) {
    const [id] = await createSlots(admin.principal, {
      weekdays: [weekday], startMin: opts.startMin ?? 300, durationMin: opts.durationMin ?? 60, modalityId: opts.modalityId ?? hyrox.id,
      activityTypeId: aula.id, spaceId: '', label: `t-${Math.random().toString(36).slice(2, 8)}`,
      people: [{ teacherId, role: 'TITULAR' }], validFrom: opts.validFrom ?? '2030-01-01',
    }, META);
    return id!;
  }
  const hoursOf = async (year: number, month: number, teacherId: string) =>
    (await periodOverview(admin.principal, { year, month })).teachers.find((t) => t.teacherId === teacherId);

  it('gera a competência 26→25 e é idempotente', async () => {
    const t = await teacher('Idem Potente');
    await slot(2, t.id); // terças
    const first = await generatePeriod(admin.principal, { year: 2030, month: 3 }, META); // 26/02 a 25/03/2030
    const again = await generatePeriod(admin.principal, { year: 2030, month: 3 }, META);
    expect(first.created).toBeGreaterThan(0);
    expect(again.created).toBe(0);

    const period = await prisma.payrollPeriod.findUniqueOrThrow({ where: { year_month: { year: 2030, month: 3 } } });
    expect(period.startDate.toISOString().slice(0, 10)).toBe('2030-02-26');
    expect(period.endDate.toISOString().slice(0, 10)).toBe('2030-03-25');
    // terças de 26/02 a 25/03/2030: 26/02, 05, 12, 19/03
    const mine = await prisma.classOccurrence.findMany({ where: { periodId: period.id, assignments: { some: { plannedTeacherId: t.id } } }, orderBy: { date: 'asc' } });
    expect(mine.map((o) => o.date.toISOString().slice(0, 10))).toEqual(['2030-02-26', '2030-03-05', '2030-03-12', '2030-03-19']);
    expect(await hoursOf(2030, 3, t.id)).toMatchObject({ plannedMin: 240, totalMin: 240 });
  });

  it('Cenário 2 no banco: feriado "cancelar todas" cancela com o motivo Feriado, sem sumir com a aula', async () => {
    const t = await teacher('Feriado Cancela');
    await slot(1, t.id); // segundas
    await saveHoliday(admin.principal, null, { date: '2030-04-08', name: 'Feriado de teste', scope: 'NACAO', policy: 'CANCELAR_TODAS' }, META);
    await generatePeriod(admin.principal, { year: 2030, month: 4 }, META); // 26/03 a 25/04/2030 → segundas: 01, 08, 15, 22/04

    const occ = (await listOccurrences(admin.principal, { start: '2030-04-08', end: '2030-04-08' })).find((o) => o.people.some((p) => p.planned === 'Feriado Cancela'))!;
    expect(occ).toMatchObject({ status: 'CANCELADA', holiday: 'Feriado de teste', cancellationReason: 'Feriado' });
    expect(await hoursOf(2030, 4, t.id)).toMatchObject({ plannedMin: 240, ownMin: 180, cancelledMin: 60, totalMin: 180 });
  });

  it('mudar a política do feriado depois de gerar refaz as aulas intocadas', async () => {
    const t = await teacher('Feriado Muda');
    await slot(3, t.id); // quartas
    const h = await saveHoliday(admin.principal, null, { date: '2030-05-15', name: 'Muda política', scope: 'NACAO', policy: 'MANTER_TODAS' }, META);
    await generatePeriod(admin.principal, { year: 2030, month: 5 }, META);
    expect((await hoursOf(2030, 5, t.id))!.cancelledMin).toBe(0);

    await saveHoliday(admin.principal, h, { date: '2030-05-15', name: 'Muda política', scope: 'NACAO', policy: 'CANCELAR_TODAS' }, META);
    expect((await hoursOf(2030, 5, t.id))!.cancelledMin).toBe(60);
  });

  it('feriado "decidir": aguarda (0h); coordenador decide só a própria área, com exceção registrada', async () => {
    const tH = await teacher('Decide Hyrox');
    const tC = await teacher('Decide CrossFit');
    await slot(4, tH.id, { modalityId: hyrox.id });
    await slot(4, tC.id, { modalityId: crossfit.id });
    await saveHoliday(admin.principal, null, { date: '2030-06-13', name: 'Decidir', scope: 'NACAO', policy: 'DECIDIR_INDIVIDUALMENTE' }, META);
    await generatePeriod(admin.principal, { year: 2030, month: 6 }, META);
    expect(await hoursOf(2030, 6, tH.id)).toMatchObject({ pendingMin: 60 });

    const coordCF = await makeUser('COORDENADOR', { areaIds: [crossfit.areaId] });
    await expect(decideHoliday(coordCF.principal, '2030-06-13', 'CANCELAR', hyrox.areaId, META)).rejects.toThrow(/não está sob a sua coordenação/);
    expect(await decideHoliday(coordCF.principal, '2030-06-13', 'MANTER', null, META)).toBe(1); // só o CrossFit
    expect(await decideHoliday(admin.principal, '2030-06-13', 'CANCELAR', hyrox.areaId, META)).toBe(1);

    expect(await hoursOf(2030, 6, tC.id)).toMatchObject({ pendingMin: 0, cancelledMin: 0 });
    expect(await hoursOf(2030, 6, tH.id)).toMatchObject({ pendingMin: 0, cancelledMin: 60 });

    const ex = await prisma.classException.findMany({ where: { type: 'DECISAO_FERIADO', occurrence: { date: toUtc('2030-06-13') } } });
    expect(ex).toHaveLength(2);
    await expect(prisma.classException.delete({ where: { id: ex[0]!.id } })).rejects.toThrow(/somente-inclusão/);
    await expect(decideHoliday(admin.principal, '2030-06-13', 'CANCELAR', null, META)).rejects.toThrow(AppError);
  });

  it('Cenário 5 de ponta a ponta: grade muda no dia 15 com a competência já gerada', async () => {
    const antigo = await teacher('Cinco Antigo');
    const novo = await teacher('Cinco Novo');
    const slotId = await slot(5, antigo.id, { validFrom: '2030-01-01' }); // sextas
    await generatePeriod(admin.principal, { year: 2030, month: 8 }, META); // 26/07 a 25/08/2030: sextas 26/07, 02, 09, 16, 23/08

    await changeSlot(admin.principal, slotId, {
      weekday: 5, startMin: 360, durationMin: 60, modalityId: hyrox.id, activityTypeId: aula.id, spaceId: '', label: 'mudou',
      people: [{ teacherId: novo.id, role: 'TITULAR' }], from: '2030-08-15',
    }, META);

    expect(await hoursOf(2030, 8, antigo.id)).toMatchObject({ totalMin: 180 }); // 26/07, 02, 09
    expect(await hoursOf(2030, 8, novo.id)).toMatchObject({ totalMin: 120 });   // 16, 23 (às 06:00)
    const occ = await prisma.classOccurrence.findMany({ where: { slotId, date: { gte: toUtc('2030-07-26'), lte: toUtc('2030-08-25') } }, orderBy: { date: 'asc' } });
    expect(occ).toHaveLength(5); // realinhou sem duplicar
    expect(occ.at(-1)!.startMin).toBe(360);
  });

  it('aula em que alguém mexeu não é refeita pela grade: fica para revisão', async () => {
    const t = await teacher('Revisão Humana');
    await slot(1, t.id, { validFrom: '2030-01-01' });
    await saveHoliday(admin.principal, null, { date: '2030-09-02', name: 'Mexida', scope: 'NACAO', policy: 'DECIDIR_INDIVIDUALMENTE' }, META);
    await generatePeriod(admin.principal, { year: 2030, month: 9 }, META);
    await decideHoliday(admin.principal, '2030-09-02', 'MANTER', null, META);

    const touched = await prisma.classOccurrence.findFirstOrThrow({ where: { date: toUtc('2030-09-02'), assignments: { some: { plannedTeacherId: t.id } } } });
    await changeSlot(admin.principal, touched.slotId!, {
      weekday: 1, startMin: 420, durationMin: 60, modalityId: hyrox.id, activityTypeId: aula.id, spaceId: '', label: 'x',
      people: [{ teacherId: t.id, role: 'TITULAR' }], from: '2030-08-26',
    }, META);
    const after = await prisma.classOccurrence.findUniqueOrThrow({ where: { id: touched.id } });
    expect(after).toMatchObject({ startMin: 300, needsReview: true, touched: true });
  });

  it('excluir horário: desde o lançamento some com tudo; competência fechada trava a data', async () => {
    const t = await teacher('Exclui Engano');
    const engano = await slot(1, t.id, { validFrom: '2031-03-03' }); // segundas
    await generatePeriod(admin.principal, { year: 2031, month: 3 }, META); // 26/02 a 25/03/2031
    expect(await hoursOf(2031, 3, t.id)).toMatchObject({ totalMin: 240 }); // 03, 10, 17, 24
    const item = (await listGrade(admin.principal, '2031-03-10')).find((g) => g.slotId === engano)!;
    expect(item.since).toBe('2031-03-03');
    await endSlot(admin.principal, engano, item.since, 'lançada por engano', META);
    expect((await hoursOf(2031, 3, t.id))?.totalMin ?? 0).toBe(0);
    expect((await listGrade(admin.principal, '2031-03-10')).some((g) => g.slotId === engano)).toBe(false);

    const dupla = await teacher('Exclui Dupla');
    const fixa = await createSlots(admin.principal, {
      weekdays: [3], startMin: 300, durationMin: 60, modalityId: hyrox.id, activityTypeId: aula.id, spaceId: '', label: 'dupla',
      people: [{ teacherId: t.id, role: 'TITULAR' }, { teacherId: dupla.id, role: 'AUXILIAR' }], validFrom: '2031-04-01',
    }, META).then((ids) => ids[0]!);
    await generatePeriod(admin.principal, { year: 2031, month: 5 }, META); // 26/04 a 25/05/2031
    await prisma.payrollPeriod.update({ where: { year_month: { year: 2031, month: 5 } }, data: { status: 'FECHADO' } });
    await expect(endSlot(admin.principal, fixa, '2031-05-01', undefined, META)).rejects.toThrow(/competência fechada/);
    await expect(removeTeacherFromSlot(admin.principal, fixa, dupla.id, '2031-05-01', META)).rejects.toThrow(/competência fechada/);
    await removeTeacherFromSlot(admin.principal, fixa, dupla.id, '2031-05-26', META);
    expect((await listGrade(admin.principal, '2031-06-04')).find((g) => g.slotId === fixa)!.people.map((p) => p.name)).toEqual(['Exclui Engano']);
  });

  it('desativar professor: sai de todas as aulas da grade (inclusive mudança já agendada); aula só dele fica sem professor', async () => {
    const sai = await teacher('Sai Desligado');
    const fica = await teacher('Fica Ativo');
    const so = await slot(2, sai.id, { validFrom: '2031-06-01' }); // só dele
    const [dupla] = await createSlots(admin.principal, {
      weekdays: [4], startMin: 420, durationMin: 60, modalityId: hyrox.id, activityTypeId: aula.id, spaceId: '', label: 'dupla-desl',
      people: [{ teacherId: sai.id, role: 'TITULAR' }, { teacherId: fica.id, role: 'AUXILIAR' }], validFrom: '2031-06-01',
    }, META);
    // Mudança agendada para depois (outro horário) ainda com ele.
    await changeSlot(admin.principal, so, { weekday: 2, startMin: 360, durationMin: 60, modalityId: hyrox.id, activityTypeId: aula.id, spaceId: '', label: 'so-depois', people: [{ teacherId: sai.id, role: 'TITULAR' }], from: '2031-08-01' }, META);

    const r = await saveTeacherFromForm(admin.principal, sai.id, { name: 'Sai Desligado', active: false, terminationDate: '2031-06-30' }, META, '2031-06-15');
    expect(r.grade).toMatchObject({ from: '2031-07-01', removed: 2, kept: [] });
    const at = async (date: string) => (await listGrade(admin.principal, date)).filter((g) => g.slotId === so || g.slotId === dupla);
    expect((await at('2031-06-20')).flatMap((g) => g.people.map((p) => p.teacherId))).toContain(sai.id); // antes do desligamento, nada muda
    for (const d of ['2031-07-10', '2031-09-10']) {
      const g = await at(d);
      expect(g).toHaveLength(2);
      expect(g.flatMap((x) => x.people.map((p) => p.teacherId))).toEqual([fica.id]);
    }
    expect((await at('2031-09-10')).find((g) => g.slotId === so)!.startMin).toBe(360); // a mudança agendada continua

    const again = await saveTeacherFromForm(admin.principal, sai.id, { name: 'Sai Desligado', active: false }, META, '2031-06-15');
    expect(again.grade).toBeNull(); // já estava inativo: não mexe de novo
  });

  it('competência fechada não é regerada; competências não se sobrepõem', async () => {
    await generatePeriod(admin.principal, { year: 2031, month: 1 }, META);
    await prisma.payrollPeriod.update({ where: { year_month: { year: 2031, month: 1 } }, data: { status: 'FECHADO' } });
    await expect(generatePeriod(admin.principal, { year: 2031, month: 1 }, META)).rejects.toThrow(/está fechada/);
    await expect(prisma.payrollPeriod.create({ data: { year: 2099, month: 1, startDate: toUtc('2031-01-10'), endDate: toUtc('2031-01-20') } })).rejects.toThrow();
  });

  it('coordenador não gera competência e só vê horas da própria área', async () => {
    const coord = await makeUser('COORDENADOR', { areaIds: [crossfit.areaId] });
    await expect(generatePeriod(coord.principal, { year: 2030, month: 10 }, META)).rejects.toThrow(AuthorizationError);
    const seen = await listOccurrences(coord.principal, { start: '2030-02-26', end: '2030-09-25' });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((o) => o.modality.areaId === crossfit.areaId)).toBe(true);
  });
});
