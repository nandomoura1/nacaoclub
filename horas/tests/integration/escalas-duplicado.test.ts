import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/server/db';
import { AuthorizationError } from '@/server/errors';
import { mergeDuplicate, saveAbsence, saveBenefitMonth, saveMember, saveSector } from '@/server/services/ws-service';
import { META, ensureCatalog, hasDb, makeUser } from './helpers';

const H = (h: number) => h * 60;
const WEEKDAYS = { 1: [[H(8), H(18)]], 2: [[H(8), H(18)]], 3: [[H(8), H(18)]], 4: [[H(8), H(18)]], 5: [[H(8), H(18)]], 6: [], 7: [] };

describe.skipIf(!hasDb)('Escalas 5x2 · cadastro duplicado', () => {
  const tag = Math.random().toString(36).slice(2, 7);
  let admin: Awaited<ReturnType<typeof makeUser>>;
  let coord: Awaited<ReturnType<typeof makeUser>>;
  let s1 = '', s2 = '';

  beforeAll(async () => {
    await ensureCatalog();
    admin = await makeUser('ADMIN'); coord = await makeUser('COORDENADOR');
    s1 = await saveSector(admin.principal, null, { name: `Limp ${tag}`, hours: WEEKDAYS, cycleRef: '2035-01-01', notes: null }, META);
    s2 = await saveSector(admin.principal, null, { name: `Coz ${tag}`, hours: WEEKDAYS, cycleRef: '2035-01-01', notes: null }, META);
  });

  it('quem fica herda equipes, ausências e ajuste do mês; o duplicado é desativado; vaga repetida sai', async () => {
    const carlos = await saveMember(admin.principal, s1, null, { newName: `Carlos ${tag}`, bond: 'CLT', hours: { base: [H(8), H(17), 60] }, fixedOff: [6, 7] }, META);
    const junior = await saveMember(admin.principal, s1, null, { newName: `Junior ${tag}`, bond: 'CLT', hours: { base: [H(8), H(17), 60] }, fixedOff: [6, 7] }, META);
    const juniorOther = await saveMember(admin.principal, s2, null, { teacherId: (await prisma.wsMember.findUniqueOrThrow({ where: { id: junior } })).teacherId, bond: 'CLT', hours: { base: [H(8), H(17), 60] } }, META);
    const keepId = (await prisma.wsMember.findUniqueOrThrow({ where: { id: carlos } })).teacherId;
    const dupId = (await prisma.wsMember.findUniqueOrThrow({ where: { id: junior } })).teacherId;
    await prisma.teacher.update({ where: { id: dupId }, data: { phone: '61 90000-0000' } });
    await saveAbsence(admin.principal, s1, { memberId: junior, type: 'FALTA', startDate: '2035-06-12', endDate: '2035-06-12' }, META);
    await saveBenefitMonth(admin.principal, { teacherId: dupId, month: '2035-07', days: 9, fixedCents: null }, META);

    await expect(mergeDuplicate(coord.principal, s1, junior, keepId, META)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(mergeDuplicate(admin.principal, s1, junior, dupId, META)).rejects.toThrow(/mesmo cadastro/);
    const r = await mergeDuplicate(admin.principal, s1, junior, keepId, META);
    expect(r).toMatchObject({ moved: [`Coz ${tag}`], dropped: [`Limp ${tag}`] });

    expect(await prisma.wsMember.findUnique({ where: { id: junior } })).toBeNull(); // sem escala salva: sai
    expect((await prisma.wsMember.findUniqueOrThrow({ where: { id: juniorOther } })).teacherId).toBe(keepId); // passa para quem fica
    expect(await prisma.leave.count({ where: { teacherId: keepId } })).toBe(1);
    expect((await prisma.benefitMonth.findUniqueOrThrow({ where: { teacherId_month: { teacherId: keepId, month: '2035-07' } } })).transportDays).toBe(9);
    const dup = await prisma.teacher.findUniqueOrThrow({ where: { id: dupId } });
    expect(dup.active).toBe(false);
    expect(dup.notes).toMatch(/Cadastro duplicado de Carlos/);
    expect((await prisma.teacher.findUniqueOrThrow({ where: { id: keepId } })).phone).toBe('61 90000-0000');
    expect(await prisma.auditLog.count({ where: { action: 'ws.member.duplicate', entityId: dupId } })).toBe(1);
  });
});
