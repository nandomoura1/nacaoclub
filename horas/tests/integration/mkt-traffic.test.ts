import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/server/db';
import { AuthorizationError } from '@/server/errors';
import { deleteSpend, saveSpend, trafficPanel } from '@/server/services/mkt-traffic-service';
import { META, ensureCatalog, hasDb, makeUser } from './helpers';

/** Tráfego Pago: datas num ano distante para não colidir com outros testes. */
describe.skipIf(!hasDb)('Marketing — Tráfego Pago', () => {
  const y = 2300 + Math.floor(Math.random() * 600);
  let admin: Awaited<ReturnType<typeof makeUser>>;
  let mkt: Awaited<ReturnType<typeof makeUser>>;
  let lider: Awaited<ReturnType<typeof makeUser>>;
  beforeAll(async () => {
    await ensureCatalog();
    admin = await makeUser('ADMIN'); mkt = await makeUser('MARKETING'); lider = await makeUser('LIDER');
  });

  it('lança gasto, cruza com leads reais e calcula CPL / custo por matrícula', async () => {
    const base = { platform: 'META', campaignId: null, adName: 'Aula experimental', impressions: 10_000, clicks: 200, platformLeads: 12, notes: null };
    await expect(saveSpend(mkt.principal, null, { ...base, start: `${y}-10-10`, end: `${y}-10-01`, spendCents: 100 }, META)).rejects.toThrow(/antes/);
    await expect(saveSpend(mkt.principal, null, { ...base, start: `${y}-10-01`, end: `${y}-10-31`, spendCents: 100, clicks: 20_000 }, META)).rejects.toThrow(/impressões/);
    await expect(saveSpend(lider.principal, null, { ...base, start: `${y}-10-01`, end: `${y}-10-31`, spendCents: 100 }, META)).rejects.toBeInstanceOf(AuthorizationError);
    const id = await saveSpend(mkt.principal, null, { ...base, start: `${y}-10-01`, end: `${y}-10-31`, spendCents: 600_00 }, META);

    await prisma.mktLead.createMany({ data: [
      { name: 'Lead A', source: 'META_ADS', stage: 'MATRICULADO', createdAt: new Date(`${y}-10-05T15:00:00Z`) },
      { name: 'Lead B', source: 'META_ADS', stage: 'NOVO', createdAt: new Date(`${y}-10-06T15:00:00Z`) },
      { name: 'Lead C', source: 'META_ADS', stage: 'CONTATO', createdAt: new Date(`${y}-10-07T15:00:00Z`) },
      { name: 'Lead D', source: 'SITE', stage: 'NOVO', createdAt: new Date(`${y}-10-07T15:00:00Z`) },
    ] });
    const p = await trafficPanel(mkt.principal, `${y}-10-01`, `${y}-10-31`);
    expect(p.rows.map((r) => r.id)).toContain(id);
    expect(p.report.total).toMatchObject({ spendCents: 600_00, leads: 3, won: 1, cpl: 200_00, cac: 600_00, ctr: 0.02, cpc: 3_00 });

    // Metade do mês → metade do gasto.
    const half = await trafficPanel(mkt.principal, `${y}-10-01`, `${y}-10-15`);
    expect(half.report.total.spendCents).toBeCloseTo(290_32, -1);

    await expect(deleteSpend(mkt.principal, id, META)).rejects.toBeInstanceOf(AuthorizationError);
    await deleteSpend(admin.principal, id, META);
    await prisma.mktLead.deleteMany({ where: { createdAt: { gte: new Date(`${y}-01-01`), lt: new Date(`${y + 1}-01-01`) } } });
  });
});
