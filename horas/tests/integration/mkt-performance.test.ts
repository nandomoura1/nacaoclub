import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/server/db';
import { AuthorizationError } from '@/server/errors';
import { performancePanel } from '@/server/services/mkt-performance-service';
import { ensureCatalog, hasDb, makeUser } from './helpers';

/** Performance: lê leads, cliques e gastos do banco (ano distante para isolar). */
describe.skipIf(!hasDb)('Marketing — Performance', () => {
  const y = 2400 + Math.floor(Math.random() * 500);
  let mkt: Awaited<ReturnType<typeof makeUser>>;
  let lider: Awaited<ReturnType<typeof makeUser>>;
  beforeAll(async () => { await ensureCatalog(); mkt = await makeUser('MARKETING'); lider = await makeUser('LIDER'); });

  it('consolida o período e respeita o dia de Brasília', async () => {
    const link = await prisma.mktLink.create({ data: { slug: `perf-${y}`, title: 'Perf', destination: 'https://x.com' } });
    await prisma.mktLinkClickDay.create({ data: { linkId: link.id, day: new Date(`${y}-05-10T00:00:00Z`), clicks: 30 } });
    await prisma.mktLead.createMany({ data: [
      { name: 'A', source: 'INSTAGRAM', stage: 'MATRICULADO', linkId: link.id, createdAt: new Date(`${y}-05-10T15:00:00Z`) },
      // 31/05 às 23h em Brasília = 01/06 02:00 UTC → ainda é maio.
      { name: 'B', source: 'SITE', stage: 'NOVO', createdAt: new Date(`${y}-06-01T02:00:00Z`) },
    ] });
    await prisma.mktAdSpend.create({ data: { platform: 'META', periodStart: new Date(`${y}-05-01T00:00:00Z`), periodEnd: new Date(`${y}-05-31T00:00:00Z`), spendCents: 400_00 } });

    const r = await performancePanel(mkt.principal, `${y}-05-01`, `${y}-05-31`);
    expect(r.current).toMatchObject({ clicks: 30, leads: 2, won: 1, spendCents: 400_00, cac: 400_00 });
    expect(r.topLinks[0]).toMatchObject({ id: link.id, clicks: 30, leads: 1 });
    await expect(performancePanel(lider.principal, `${y}-05-01`, `${y}-05-31`)).rejects.toBeInstanceOf(AuthorizationError);

    await prisma.mktLead.deleteMany({ where: { linkId: link.id } });
    await prisma.mktLead.deleteMany({ where: { name: 'B', createdAt: new Date(`${y}-06-01T02:00:00Z`) } });
    await prisma.mktLinkClickDay.deleteMany({ where: { linkId: link.id } });
    await prisma.mktLink.delete({ where: { id: link.id } });
    await prisma.mktAdSpend.deleteMany({ where: { periodStart: new Date(`${y}-05-01T00:00:00Z`) } });
  });
});
