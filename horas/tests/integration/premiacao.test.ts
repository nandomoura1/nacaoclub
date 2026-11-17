import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/server/db';
import { AuthorizationError } from '@/server/errors';
import { addAwardPeople, awardBoard, closeAwardMonth, reopenAwardMonth, saveAwardMonth, setAwardPaid, setAwardPersonActive, setGroupValues } from '@/server/services/premiacao-service';
import { saveAbsence, saveMember, saveSector } from '@/server/services/ws-service';
import { META, ensureCatalog, hasDb, makeUser } from './helpers';

const H = (h: number) => h * 60;
const WEEKDAYS = { 1: [[H(8), H(18)]], 2: [[H(8), H(18)]], 3: [[H(8), H(18)]], 4: [[H(8), H(18)]], 5: [[H(8), H(18)]], 6: [], 7: [] };

describe.skipIf(!hasDb)('Premiação (painel)', () => {
  const tag = Math.random().toString(36).slice(2, 7);
  let admin: Awaited<ReturnType<typeof makeUser>>;
  let dp: Awaited<ReturnType<typeof makeUser>>;
  let lider: Awaited<ReturnType<typeof makeUser>>;
  let sector = '';
  const m: Record<string, string> = {};
  const t: Record<string, string> = {};
  const M = '2035-06'; // competência 15/05/2035 a 14/06/2035, paga em 15/06/2035

  beforeAll(async () => {
    await ensureCatalog();
    admin = await makeUser('ADMIN'); dp = await makeUser('CONSULTA'); lider = await makeUser('LIDER');
    sector = await saveSector(admin.principal, null, { name: `Cozinha Prem ${tag}`, hours: WEEKDAYS, cycleRef: '2035-01-01', notes: null }, META);
    for (const [k, bond] of [['ana', 'CLT'], ['bia', 'CLT'], ['caio', 'FUNAP'], ['davi', 'MEI']] as const) {
      m[k] = await saveMember(admin.principal, sector, null, { newName: `${k} prem ${tag}`, bond, hours: { base: [H(8), H(17), 60] }, fixedOff: [6, 7] }, META);
      t[k] = (await prisma.wsMember.findUniqueOrThrow({ where: { id: m[k] } })).teacherId;
    }
    t.prof = (await prisma.teacher.create({ data: { name: `prof prem ${tag}` } })).id;
  });
  afterAll(async () => {
    await prisma.awardClosure.deleteMany({ where: { month: M } });
  });

  it('equipes da escala entram sozinhas; faltas/atestados/atrasos pela regra; correção à mão; incluir professor', async () => {
    await expect(awardBoard(lider.principal, M)).rejects.toBeInstanceOf(AuthorizationError);
    await saveAbsence(admin.principal, sector, { memberId: m.bia!, type: 'ATESTADO', startDate: '2035-06-10', endDate: '2035-06-10' }, META);
    await saveAbsence(admin.principal, sector, { memberId: m.caio!, type: 'FALTA', startDate: '2035-05-20', endDate: '2035-05-20' }, META);
    await saveAbsence(admin.principal, sector, { memberId: m.ana!, type: 'FALTA', startDate: '2035-05-02', endDate: '2035-05-02' }, META); // competência anterior

    let b = await awardBoard(dp.principal, M);
    const row = (k: string) => b.rows.find((r) => r.teacherId === t[k])!;
    expect(b.rows.some((r) => r.teacherId === t.davi)).toBe(false); // MEI fica fora
    expect([row('ana').total, row('ana').group, row('ana').source, row('ana').faltas]).toEqual([30000, `Cozinha Prem ${tag}`, 'escala', []]);
    expect([row('bia').total, row('bia').atestados]).toEqual([20000, ['2035-06-10']]);
    expect(row('caio').total).toBe(0);

    // Ana: 1 atraso (perde pontualidade) e ajuste; Bia: atestado perdoado à mão.
    await saveAwardMonth(dp.principal, { teacherId: t.ana!, month: M, productivity: null, punctuality: null, attendance: null, lateCount: 1, extraCents: 5000, note: 'bônus' }, META);
    await saveAwardMonth(dp.principal, { teacherId: t.bia!, month: M, productivity: null, punctuality: null, attendance: true, lateCount: 0, extraCents: 0 }, META);
    // Cozinha com valores próprios.
    expect(await setGroupValues(dp.principal, { month: M, group: `Cozinha Prem ${tag}`, productivity: 15000, punctuality: 10000, attendance: 15000 }, META)).toBe(3);
    // Professor incluído à mão.
    await addAwardPeople(dp.principal, { teacherIds: [t.prof!], groupName: `Academia ${tag}`, productivity: 10000, punctuality: 10000, attendance: 10000 }, META);
    b = await awardBoard(dp.principal, M);
    expect([row('ana').total, row('ana').lateCount, row('ana').reasons]).toEqual([15000 + 15000 + 5000, 1, ['1 atraso > 15 min']]);
    expect([row('bia').total, row('bia').overrides.attendance]).toEqual([40000, true]);
    expect([row('prof').source, row('prof').total, row('prof').ref]).toEqual(['incluido', 30000, null]);
    // Voltar tudo ao automático apaga a linha.
    await saveAwardMonth(dp.principal, { teacherId: t.bia!, month: M, productivity: null, punctuality: null, attendance: null, lateCount: 0, extraCents: 0 }, META);
    expect(await prisma.awardMonth.count({ where: { teacherId: t.bia!, month: M } })).toBe(0);

    // Tirar da Premiação (mesmo vindo da escala).
    await setAwardPersonActive(dp.principal, t.caio!, false, META, `Cozinha Prem ${tag}`);
    b = await awardBoard(dp.principal, M);
    expect(b.rows.some((r) => r.teacherId === t.caio)).toBe(false);

    // Fechar congela; pagar; reabrir só sem pagamento.
    const mine = b.rows.filter((r) => [t.ana, t.bia, t.prof].includes(r.teacherId)).reduce((a, r) => a + r.total, 0);
    expect(mine).toBe(35000 + 25000 + 30000);
    await closeAwardMonth(dp.principal, M, META);
    await expect(saveAwardMonth(dp.principal, { teacherId: t.ana!, month: M, productivity: null, punctuality: null, attendance: null, lateCount: 0, extraCents: 0 }, META)).rejects.toThrow(/fechad/);
    await setAwardPaid(dp.principal, M, true, META);
    await expect(reopenAwardMonth(dp.principal, M, 'corrigir', META)).rejects.toThrow(/paga/);
    await setAwardPaid(dp.principal, M, false, META);
    await reopenAwardMonth(dp.principal, M, 'corrigir valor', META);
    expect((await awardBoard(dp.principal, M)).closure).toBeNull();
  });
});
