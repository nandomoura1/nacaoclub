import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/server/db';
import { bootstrapStructure } from '@/server/services/bootstrap';
import { saveCenter, saveIptuYear, saveMeter, saveRecurringItem } from '@/server/services/condo-service';
import { chargeDocs, closePeriod, getPeriod, markCharge, openPeriod, reopenPeriod, savePeriod } from '@/server/services/condo-period-service';
import { condoChargesPdf } from '@/server/condominio/pdf';
import { condoDashboard } from '@/server/services/condo-dashboard-service';
import { AuthorizationError } from '@/server/errors';
import { META, hasDb, makeUser } from './helpers';

/** Condomínio Nação: números fictícios, meses de 2091 (não colidem com outros testes). */
describe.skipIf(!hasDb)('Condomínio Nação', () => {
  let admin: Awaited<ReturnType<typeof makeUser>>;
  const tag = randomUUID().slice(0, 6);
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    await prisma.$transaction((tx) => bootstrapStructure(tx, []), { timeout: 60_000 });
    admin = await makeUser('ADMIN', { name: 'Admin Condo' });
    const c = (name: string, extra: Record<string, unknown>) => saveCenter(admin.principal, null, { name: `${name} ${tag}`, kind: 'INTERNAL', areaM2: 0, iptuSharePct: 100, activeFrom: '2091-01-01', ...extra }, META);
    ids.op = await c('Operação', { areaM2: 400 });
    ids.lanch = await c('Lanchonete', { isSnackBar: true, areaM2: 100 });
    ids.parc = await c('Parceiro', { kind: 'PARTNER', areaM2: 100, displayName: `Parceiro Ltda ${tag}`, contactPhone: '(61) 99999-0000' });
    ids.meia = await c('Meia', { kind: 'PARTNER', areaM2: 200, iptuSharePct: 50, chargesCondo: false, activeTo: '2091-07-15' });
    ids.meter = await saveMeter(admin.principal, null, { centerId: ids.parc, name: `Relógio ${tag}`, installReading: 1000, activeFrom: '2091-01-01' }, META);
    await saveRecurringItem(admin.principal, null, { centerId: ids.parc, description: 'Aluguel da Sala', amountCents: 10_000, activeFrom: '2091-01-01' }, META);
    await saveRecurringItem(admin.principal, null, { centerId: ids.parc, description: 'Check In', unitCents: 2500, defaultQty: 4, activeFrom: '2091-01-01' }, META);
    await saveIptuYear(admin.principal, { year: 2091, totalCents: 600_000, totalAreaM2: 1000, firstMonth: 5, parcels: 6 }, META);
  });

  const body = (p: Awaited<ReturnType<typeof getPeriod>>, patch: Record<string, unknown> = {}) => ({
    dueDate: p.dueDate, tariff: 1, flag: 'VERDE', flagFactor: 1.1, snackBarPct: 30, notes: null,
    expenses: [{ group: 'GERAIS', description: 'Água', amountCents: 60_000, kind: 'VARIABLE', confirmed: true, memo: null }, { group: 'GERAIS', description: 'Seguro', amountCents: 40_000, kind: 'FIXED', confirmed: true, memo: '400' }],
    centers: p.centers.map((c) => ({ centerId: c.id, headcount: c.id === ids.op ? 2 : c.id === ids.parc ? 1 : 0, billing: c.billing })),
    readings: p.meters.map((m) => ({ meterId: m.id, reading: 1200, estimated: false, isReset: false })),
    items: p.items.map(({ id: _id, ...i }) => i),
    ...patch,
  });

  it('julho: abre, lança, só fecha sem pendência, congela e gera cobranças; reabrir pede permissão', async () => {
    expect(await openPeriod(admin.principal, '2091-07', META)).toBe('2091-07');
    const p = await getPeriod(admin.principal, '2091-07');
    expect(p.dueDate).toBe('2091-08-20');
    // Quem sai no meio do mês entra proporcional.
    expect(p.centers.find((c) => c.id === ids.meia)!.billing).toBe('PRORATA');
    expect(p.items.map((i) => [i.description, i.qty])).toEqual([['Aluguel da Sala', null], ['Check In', 4]]);
    await expect(closePeriod(admin.principal, '2091-07', META)).rejects.toThrow(/Falta a leitura/);

    await savePeriod(admin.principal, '2091-07', body(p), META);
    const saved = await getPeriod(admin.principal, '2091-07');
    const parc = saved.result.charges.find((c) => c.centerId === ids.parc)!;
    expect(parc.lines.map((l) => [l.description, l.cents])).toEqual([
      ['Energia', 22000], ['Condomínio', 23333], ['IPTU 3 de 6', 10000], ['Aluguel da Sala', 10000], ['Check In (4)', 10000],
    ]);
    const meia = saved.result.charges.find((c) => c.centerId === ids.meia)!;
    expect(meia.prorata).toEqual({ days: 15, of: 31 });
    expect(meia.lines).toEqual([{ kind: 'IPTU', description: '50% IPTU 3 de 6', cents: Math.round(10000 * 15 / 31) }]);

    const coord = await makeUser('COORDENADOR');
    await expect(getPeriod(coord.principal, '2091-07')).rejects.toThrow(AuthorizationError);

    const r = await closePeriod(admin.principal, '2091-07', META);
    expect(r).toEqual({ charges: 2, totalCents: 75333 + Math.round(10000 * 15 / 31) });
    await expect(savePeriod(admin.principal, '2091-07', body(saved), META)).rejects.toThrow(/fechada/);
    // Snapshot: mudar a área depois não muda a competência fechada.
    await prisma.condoCenter.update({ where: { id: ids.parc }, data: { areaM2: 999 } });
    expect((await getPeriod(admin.principal, '2091-07')).result.charges.find((c) => c.centerId === ids.parc)!.totalCents).toBe(75333);
    await prisma.condoCenter.update({ where: { id: ids.parc }, data: { areaM2: 100 } });

    // Documento: PDF de uma página por parceiro; pagamento registrado.
    const docs = await chargeDocs(admin.principal, '2091-07', null, '2091-08-01');
    expect(docs.map((d) => d.totalCents).sort()).toEqual([75333, Math.round(10000 * 15 / 31)].sort());
    expect(docs.find((x) => x.name.startsWith('Parceiro'))!.allocation.filter((a) => a.mine)).toHaveLength(1);
    const pdf = await condoChargesPdf(docs);
    expect(Buffer.from(pdf).subarray(0, 5).toString()).toBe('%PDF-');
    const charge = (await getPeriod(admin.principal, '2091-07')).charges.find((c) => c.centerId === ids.parc)!;
    await markCharge(admin.principal, charge.id, { status: 'PAID', paidAt: '2091-08-18', paidCents: 75333 }, META);
    const number = charge.number;

    // Reabrir: só com condo.close; refechar mantém nº e pagamento.
    const prof = await makeUser('PROFESSOR');
    await expect(reopenPeriod(prof.principal, '2091-07', META)).rejects.toThrow(AuthorizationError);
    await reopenPeriod(admin.principal, '2091-07', META);
    await closePeriod(admin.principal, '2091-07', META);
    const again = (await getPeriod(admin.principal, '2091-07')).charges.find((c) => c.centerId === ids.parc)!;
    expect(again).toMatchObject({ number, status: 'PAID', paidCents: 75333 });
  });

  it('agosto: copia julho (fixas confirmadas, variáveis a confirmar, alunos e quantidades); quem saiu some', async () => {
    await openPeriod(admin.principal, '2091-08', META);
    const p = await getPeriod(admin.principal, '2091-08');
    expect(p.expenses.map((e) => [e.description, e.amountCents, e.confirmed])).toEqual([['Água', 60_000, false], ['Seguro', 40_000, true]]);
    expect(p.centers.map((c) => c.id)).not.toContain(ids.meia);
    expect(p.changes.left).toContain(`Meia ${tag}`);
    expect(p.centers.find((c) => c.id === ids.op)!.headcount).toBe(2);
    // Leitura anterior = a de julho.
    expect(p.meters[0]).toMatchObject({ previous: 1200, current: null });
    expect(p.result.issues.join(' ')).toMatch(/a confirmar: Água/);

    const dash = await condoDashboard(admin.principal, 12, '2091-09-01');
    expect(dash.series.at(-1)!.month).toBe('2091-07');
    expect(dash.open.some((o) => o.name === `Meia ${tag}`)).toBe(true);
  });
});
