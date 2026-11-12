import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/server/db';
import { AuthorizationError } from '@/server/errors';
import { saveAbsence, saveMember, saveSector, saveTransportValue, transportReport } from '@/server/services/ws-service';
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

    const r = await transportReport(admin.principal, 2035, 7);
    const me = r.rows.find((x) => x.name === `Ana ${tag}`)!;
    // Julho/2035: 22 dias de seg a sex, menos 30 e 31 (férias) = 20.
    expect(me).toMatchObject({ source: 'estimado', workDays: 20 - weekdayHolidays, discount: 3, payDays: 17 - weekdayHolidays, dailyCents: 1100 });
    expect(me.discountDates).toEqual(['2035-06-12', '2035-06-14', '2035-06-15']);
    expect(me.totalCents).toBe((17 - weekdayHolidays) * 1100);
    expect(r.rows.find((x) => x.name === `Beto ${tag}`)).toMatchObject({ bond: 'FUNAP', dailyCents: null, totalCents: null });
    expect(r.rows.some((x) => x.name === `Caio ${tag}`)).toBe(false);
    expect(r.outside).toContainEqual({ name: `Caio ${tag}`, bond: 'MEI', sector: `ADM ${tag}` });
    expect(r.status.find((s) => s.sector === `ADM ${tag}`)).toMatchObject({ schedule: null });
  });
});
