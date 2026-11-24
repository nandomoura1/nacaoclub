import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/server/db';
import { AuthorizationError } from '@/server/errors';
import { bootstrapStructure } from '@/server/services/bootstrap';
import { saveExtraHours } from '@/server/services/extra-hours-service';
import { cancelLateness, listLateness, saveLateness } from '@/server/services/lateness-service';
import { periodOverview } from '@/server/services/period-service';
import { saveMember, saveSector, saveTransportValue, setSectorBenefits, transportReport } from '@/server/services/ws-service';
import { META, ensureCatalog, hasDb, makeUser } from './helpers';

const H = (h: number) => h * 60;
const WEEKDAYS = { 1: [[H(8), H(18)]], 2: [[H(8), H(18)]], 3: [[H(8), H(18)]], 4: [[H(8), H(18)]], 5: [[H(8), H(18)]], 6: [], 7: [] };

describe.skipIf(!hasDb)('Atraso do horista e equipe fora dos Benefícios', () => {
  let admin: Awaited<ReturnType<typeof makeUser>>;
  let lider: Awaited<ReturnType<typeof makeUser>>;
  beforeAll(async () => {
    await ensureCatalog();
    await prisma.$transaction((tx) => bootstrapStructure(tx, []), { timeout: 60_000 });
    admin = await makeUser('ADMIN'); lider = await makeUser('LIDER');
  });

  it('1h de atraso = 1h a menos na carga; anular devolve', async () => {
    const musc = await prisma.modality.findUniqueOrThrow({ where: { name: 'Musculação' }, select: { id: true } });
    const aula = await prisma.activityType.findUniqueOrThrow({ where: { name: 'Aula' } });
    const t = await prisma.teacher.create({ data: { name: `Atraso ${Date.now()}` } });
    const base = { modalityId: musc.id, activityTypeId: aula.id, description: 'Aula da manhã' };
    await saveExtraHours(admin.principal, t.id, { ...base, date: '2037-03-04', start: '06:00', end: '07:00' }, META);
    await saveExtraHours(admin.principal, t.id, { ...base, date: '2037-03-04', start: '07:00', end: '08:00' }, META);
    const total = async () => (await periodOverview(admin.principal, { year: 2037, month: 3 })).teachers.find((x) => x.teacherId === t.id)?.totalMin ?? 0;
    expect(await total()).toBe(120);

    await expect(saveLateness(lider.principal, t.id, { date: '2037-03-04', minutes: 60, notes: null }, META)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(saveLateness(admin.principal, t.id, { date: '2037-03-04', minutes: 180, notes: null }, META)).rejects.toThrow(/maior que as aulas/);
    await expect(saveLateness(admin.principal, t.id, { date: '2037-03-05', minutes: 30, notes: null }, META)).rejects.toThrow(/não tem aula/);
    const r = await saveLateness(admin.principal, t.id, { date: '2037-03-04', minutes: 90, notes: 'chegou 7h30' }, META);
    expect(r.classes).toBe(2);
    expect(await total()).toBe(30);
    expect((await listLateness(admin.principal, t.id))[0]).toMatchObject({ minutes: 90, classes: 2, cancelled: false });

    expect(await cancelLateness(admin.principal, r.id, META)).toEqual({ restored: 2, skipped: 0 });
    expect(await total()).toBe(120);
    await expect(cancelLateness(admin.principal, r.id, META)).rejects.toThrow(/não encontrado/);
  });

  it('equipe fora dos Benefícios sai do cálculo e volta', async () => {
    const tag = Math.random().toString(36).slice(2, 7);
    const sector = await saveSector(admin.principal, null, { name: `Kids ${tag}`, hours: WEEKDAYS, cycleRef: '2035-01-01', notes: null }, META);
    const m = await saveMember(admin.principal, sector, null, { newName: `Mon ${tag}`, bond: 'CLT', hours: { base: [H(8), H(17), 60] }, fixedOff: [6, 7] }, META);
    const teacherId = (await prisma.wsMember.findUniqueOrThrow({ where: { id: m } })).teacherId;
    await saveTransportValue(admin.principal, teacherId, 1000, META);
    const has = async () => (await transportReport(admin.principal, 2035, 9)).rows.some((r) => r.teacherId === teacherId);
    expect(await has()).toBe(true);

    await expect(setSectorBenefits(lider.principal, sector, true, META)).rejects.toBeInstanceOf(AuthorizationError);
    await setSectorBenefits(admin.principal, sector, true, META);
    const r = await transportReport(admin.principal, 2035, 9);
    expect(r.rows.some((x) => x.teacherId === teacherId)).toBe(false);
    expect(r.offSectors.find((o) => o.id === sector)).toMatchObject({ name: `Kids ${tag}`, members: 1 });
    expect(r.status.some((s) => s.sector === `Kids ${tag}`)).toBe(false);

    await setSectorBenefits(admin.principal, sector, false, META);
    expect(await has()).toBe(true);
  });
});
