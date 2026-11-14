import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/server/db';
import { AuthorizationError } from '@/server/errors';
import { cancelAbsence, saveAbsence, saveBenefitMonth, saveMealValue, saveMember, saveSector, saveTransportValue, setBenefitPerson, transportReport } from '@/server/services/ws-service';
import { META, ensureCatalog, hasDb, makeUser } from './helpers';

const H = (h: number) => h * 60;
const WEEKDAYS = { 1: [[H(8), H(18)]], 2: [[H(8), H(18)]], 3: [[H(8), H(18)]], 4: [[H(8), H(18)]], 5: [[H(8), H(18)]], 6: [], 7: [] };

/** Passagem: setor ADM (só seg–sex), sem escala gerada (estimado), faltas/atestados de junho descontam em julho/2035. */
describe.skipIf(!hasDb)('Escalas 5x2 · Passagem', () => {
  const tag = Math.random().toString(36).slice(2, 7);
  let admin: Awaited<ReturnType<typeof makeUser>>;
  let lider: Awaited<ReturnType<typeof makeUser>>;
  let sector = '';
  let ana = '';

  beforeAll(async () => {
    await ensureCatalog();
    admin = await makeUser('ADMIN'); lider = await makeUser('LIDER');
    sector = await saveSector(admin.principal, null, { name: `ADM ${tag}`, hours: WEEKDAYS, cycleRef: '2035-01-01', notes: null }, META);
    ana = await saveMember(admin.principal, sector, null, { newName: `Ana ${tag}`, bond: 'CLT', hours: { base: [H(8), H(17), 60] }, fixedOff: [6, 7] }, META);
    await saveMember(admin.principal, sector, null, { newName: `Beto ${tag}`, bond: 'FUNAP', hours: { base: [H(8), H(17), 60] }, fixedOff: [7] }, META);
    await saveMember(admin.principal, sector, null, { newName: `Caio ${tag}`, bond: 'MEI', hours: { base: [H(8), H(17), 60] } }, META);
  });

  it('dias de julho pelo padrão − falta e atestado de junho; MEI fora; valor só a gestão define', async () => {
    await saveAbsence(admin.principal, sector, { memberId: ana, type: 'FALTA', startDate: '2035-06-12', endDate: '2035-06-12' }, META);
    await saveAbsence(admin.principal, sector, { memberId: ana, type: 'ATESTADO', startDate: '2035-06-14', endDate: '2035-06-17' }, META); // qui, sex, sáb, dom → 2 dias úteis
    await saveAbsence(admin.principal, sector, { memberId: ana, type: 'FERIAS', startDate: '2035-07-30', endDate: '2035-07-31' }, META); // férias em julho: não vai
    const hol = await prisma.holiday.findMany({ where: { date: { gte: new Date('2035-07-01'), lte: new Date('2035-07-31') }, scope: { not: 'FACULTATIVO' } } });
    const weekdayHolidays = hol.filter((h) => ![0, 6].includes(h.date.getUTCDay())).length;

    const teacherId = (await prisma.wsMember.findUniqueOrThrow({ where: { id: ana } })).teacherId;
    await expect(saveTransportValue(lider.principal, teacherId, 1100, META)).rejects.toBeInstanceOf(AuthorizationError);
    await saveTransportValue(admin.principal, teacherId, 1100, META);
    await expect(saveMealValue(lider.principal, teacherId, 1500, META)).rejects.toBeInstanceOf(AuthorizationError);
    await saveMealValue(admin.principal, teacherId, 1500, META);

    const r = await transportReport(admin.principal, 2035, 7);
    const me = r.rows.find((x) => x.name === `Ana ${tag}`)!;
    // Julho/2035: 22 dias de seg a sex, menos 30 e 31 (férias) = 20.
    expect(me).toMatchObject({ source: 'estimado', workDays: 20 - weekdayHolidays, discount: 3, payDays: 17 - weekdayHolidays, dailyCents: 1100 });
    expect(me.discountDates).toEqual(['2035-06-12', '2035-06-14', '2035-06-15']);
    expect(me.totalCents).toBe((17 - weekdayHolidays) * 1100);
    // Alimentação: todos os dias de trabalho do mês (sem o desconto da passagem).
    expect([me.mealDailyCents, me.mealCents]).toEqual([1500, (20 - weekdayHolidays) * 1500]);
    expect(me.depositCents).toBe((17 - weekdayHolidays) * 1100 + (20 - weekdayHolidays) * 1500);
    expect(r.rows.find((x) => x.name === `Beto ${tag}`)).toMatchObject({ bond: 'FUNAP', dailyCents: null, totalCents: null });
    expect(r.rows.some((x) => x.name === `Caio ${tag}`)).toBe(false);
    expect(r.outside).toContainEqual({ name: `Caio ${tag}`, bond: 'MEI', sector: `ADM ${tag}` });
    expect(r.status.find((s) => s.sector === `ADM ${tag}`)).toMatchObject({ schedule: null });

    // A tela lança e anula pelo setor/pessoa que vem no relatório (mesmo registro de Férias e ausências).
    expect(me.refs).toEqual([{ sectorId: sector, memberId: ana }]);
    expect(me.leaves.map((l) => [l.type, l.start, l.end])).toEqual([['FALTA', '2035-06-12', '2035-06-12'], ['ATESTADO', '2035-06-14', '2035-06-17']]);
    await cancelAbsence(admin.principal, me.refs[0]!.sectorId, me.leaves[0]!.id, META);
    const again = (await transportReport(admin.principal, 2035, 7)).rows.find((x) => x.name === `Ana ${tag}`)!;
    expect(again).toMatchObject({ discount: 2, payDays: 18 - weekdayHolidays });
    expect(again.leaves).toHaveLength(1);
  });

  it('ajuste do mês: dias informados e valor fixo (só a gestão); vazio volta ao cálculo', async () => {
    const teacherId = (await prisma.wsMember.findUniqueOrThrow({ where: { id: ana } })).teacherId;
    await expect(saveBenefitMonth(lider.principal, { teacherId, month: '2035-07', days: 10, fixedCents: null }, META)).rejects.toBeInstanceOf(AuthorizationError);
    await saveBenefitMonth(admin.principal, { teacherId, month: '2035-07', days: 10, fixedCents: null }, META);
    let me = (await transportReport(admin.principal, 2035, 7)).rows.find((x) => x.teacherId === teacherId)!;
    expect(me).toMatchObject({ payDays: 10, manualDays: 10, totalCents: 11000 });
    expect(me.calcPayDays).toBeGreaterThan(10);
    expect(me.mealCents).toBe(me.workDays * 1500); // alimentação segue os dias de trabalho
    await saveBenefitMonth(admin.principal, { teacherId, month: '2035-07', days: 10, fixedCents: 20000 }, META);
    me = (await transportReport(admin.principal, 2035, 7)).rows.find((x) => x.teacherId === teacherId)!;
    expect(me).toMatchObject({ totalCents: 20000, fixedCents: 20000 });
    // Outro mês não é afetado.
    expect((await transportReport(admin.principal, 2035, 8)).rows.find((x) => x.teacherId === teacherId)!.manualDays).toBeNull();
    await saveBenefitMonth(admin.principal, { teacherId, month: '2035-07', days: null, fixedCents: null }, META);
    me = (await transportReport(admin.principal, 2035, 7)).rows.find((x) => x.teacherId === teacherId)!;
    expect(me.payDays).toBe(me.calcPayDays);
    expect(await prisma.benefitMonth.count({ where: { teacherId } })).toBe(0);
  });

  it('fora das escalas (professor): incluir, valor diário e dias do mês; quem está em equipe não entra', async () => {
    const prof = await prisma.teacher.create({ data: { name: `Prof Benef ${tag}` } });
    let r = await transportReport(admin.principal, 2035, 7);
    expect(r.candidates.some((c) => c.id === prof.id)).toBe(true);
    await expect(setBenefitPerson(lider.principal, prof.id, true, META)).rejects.toBeInstanceOf(AuthorizationError);
    await setBenefitPerson(admin.principal, prof.id, true, META);
    await saveTransportValue(admin.principal, prof.id, 760, META);
    await saveBenefitMonth(admin.principal, { teacherId: prof.id, month: '2035-07', days: 22, fixedCents: null }, META);
    r = await transportReport(admin.principal, 2035, 7);
    expect(r.rows.find((x) => x.teacherId === prof.id)).toMatchObject({ external: true, payDays: 22, dailyCents: 760, totalCents: 16720, depositCents: 16720 });
    expect(r.candidates.some((c) => c.id === prof.id)).toBe(false);
    const anaTeacher = (await prisma.wsMember.findUniqueOrThrow({ where: { id: ana } })).teacherId;
    await expect(setBenefitPerson(admin.principal, anaTeacher, true, META)).rejects.toThrow(/já está numa equipe/);
    await setBenefitPerson(admin.principal, prof.id, false, META);
    expect((await transportReport(admin.principal, 2035, 7)).rows.some((x) => x.teacherId === prof.id)).toBe(false);
    await prisma.teacher.delete({ where: { id: prof.id } });
  });
});
