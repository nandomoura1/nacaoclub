import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/server/db';
import { AuthorizationError } from '@/server/errors';
import { addAwardPeople, awardBoard, closeAwardMonth, reopenAwardMonth, saveAwardMonth, saveAwardPerson, setAwardPaid, setAwardPersonActive } from '@/server/services/premiacao-service';
import { META, ensureCatalog, hasDb, makeUser } from './helpers';

describe.skipIf(!hasDb)('Premiação', () => {
  const tag = Math.random().toString(36).slice(2, 7);
  let admin: Awaited<ReturnType<typeof makeUser>>;
  let dp: Awaited<ReturnType<typeof makeUser>>;
  let lider: Awaited<ReturnType<typeof makeUser>>;
  const ids: string[] = [];
  const M = '2035-06';

  beforeAll(async () => {
    await ensureCatalog();
    admin = await makeUser('ADMIN'); dp = await makeUser('CONSULTA'); lider = await makeUser('LIDER');
    for (const n of ['Ana', 'Bia', 'Caio']) ids.push((await prisma.teacher.create({ data: { name: `${n} Prem ${tag}` } })).id);
    await prisma.leave.create({ data: { teacherId: ids[1]!, type: 'ATESTADO', startDate: new Date('2035-06-10T00:00:00Z'), endDate: new Date('2035-06-10T00:00:00Z') } });
    await prisma.leave.create({ data: { teacherId: ids[2]!, type: 'FALTA', startDate: new Date('2035-06-12T00:00:00Z'), endDate: new Date('2035-06-12T00:00:00Z') } });
  });
  afterAll(async () => {
    await prisma.awardClosure.deleteMany({ where: { month: M } });
    await prisma.leave.deleteMany({ where: { teacherId: { in: ids } } });
    await prisma.teacher.deleteMany({ where: { id: { in: ids } } });
  });

  it('só a gestão (DP/Admin); sugestão pelas ausências; avaliação, ajuste e fechamento', async () => {
    await expect(awardBoard(lider.principal, M)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(addAwardPeople(lider.principal, { teacherIds: ids, groupName: `Kids ${tag}`, productivity: 10000, punctuality: 10000, attendance: 10000 }, META)).rejects.toBeInstanceOf(AuthorizationError);
    await addAwardPeople(dp.principal, { teacherIds: ids, groupName: `Kids ${tag}`, productivity: 10000, punctuality: 10000, attendance: 10000 }, META);
    await saveAwardPerson(admin.principal, { teacherId: ids[0]!, groupName: `Cozinha ${tag}`, productivity: 15000, punctuality: 10000, attendance: 15000 }, META);

    let b = await awardBoard(dp.principal, M);
    const row = (i: number) => b.rows.find((r) => r.teacherId === ids[i])!;
    expect([row(0).total, row(0).max, row(0).group]).toEqual([40000, 40000, `Cozinha ${tag}`]);
    expect(row(1)).toMatchObject({ total: 20000, reviewed: false, reasons: ['Atestado 10/06/2035'] });
    expect(row(2).total).toBe(0);
    expect(b.payDay).toBe('2035-06-15');
    expect(b.period).toEqual({ first: '2035-05-15', last: '2035-06-14' });

    // Ana atrasou (perde pontualidade) e ganha ajuste de R$ 50; Caio: falta justificada depois → volta.
    await saveAwardMonth(dp.principal, { teacherId: ids[0]!, month: M, productivity: true, punctuality: false, attendance: true, extraCents: 5000, note: 'Atraso 05/06' }, META);
    await saveAwardMonth(dp.principal, { teacherId: ids[2]!, month: M, productivity: true, punctuality: true, attendance: false, extraCents: 0 }, META);
    b = await awardBoard(dp.principal, M);
    expect([row(0).total, row(0).reviewed, row(0).note, row(0).lost]).toEqual([35000, true, 'Atraso 05/06', 'Perdeu: Pontualidade']);
    expect(row(2).total).toBe(20000);
    await saveAwardMonth(dp.principal, { teacherId: ids[2]!, month: M, productivity: true, punctuality: true, attendance: true, extraCents: 0, reset: true }, META);
    b = await awardBoard(dp.principal, M);
    expect([row(2).total, row(2).reviewed]).toEqual([0, false]);

    // Tirar da Premiação: some do mês se não foi avaliado.
    await setAwardPersonActive(dp.principal, ids[2]!, false, META);
    b = await awardBoard(dp.principal, M);
    expect(b.rows.some((r) => r.teacherId === ids[2])).toBe(false);

    // Fechar congela; edição bloqueada; pagar; reabrir só sem pagamento.
    const total = await closeAwardMonth(dp.principal, M, META);
    expect(total).toBe(35000 + 20000);
    await expect(saveAwardMonth(dp.principal, { teacherId: ids[1]!, month: M, productivity: true, punctuality: true, attendance: true, extraCents: 0 }, META)).rejects.toThrow(/fechado/);
    await saveAwardPerson(admin.principal, { teacherId: ids[0]!, groupName: `Cozinha ${tag}`, productivity: 99900, punctuality: 10000, attendance: 15000 }, META);
    expect((await awardBoard(dp.principal, M)).rows.find((r) => r.teacherId === ids[0])!.total).toBe(35000); // congelado
    await setAwardPaid(dp.principal, M, true, META);
    await expect(reopenAwardMonth(dp.principal, M, 'corrigir', META)).rejects.toThrow(/paga/);
    await setAwardPaid(dp.principal, M, false, META);
    await reopenAwardMonth(dp.principal, M, 'corrigir valor', META);
    expect((await awardBoard(dp.principal, M)).closure).toBeNull();
    expect(await prisma.auditLog.count({ where: { action: { startsWith: 'award.' }, entityId: M } })).toBe(4);
  });
});
