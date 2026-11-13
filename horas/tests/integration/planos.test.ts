import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/server/db';
import { AuthorizationError, NotFoundError } from '@/server/errors';
import { adjustPrices, createDraft, deletePlan, importFromSheet, listPlanTables, planTable, planTableTsv, publishTable, savePlan, setOptionPrice, setPlanStatus } from '@/server/services/planos-service';
import { META, ensureCatalog, hasDb, makeUser } from './helpers';

describe.skipIf(!hasDb)('Planos Nação', () => {
  let admin: Awaited<ReturnType<typeof makeUser>>;
  let dp: Awaited<ReturnType<typeof makeUser>>;
  let prof: Awaited<ReturnType<typeof makeUser>>;
  let ids: { vigente: string; rascunho: string };

  beforeAll(async () => {
    await ensureCatalog();
    await prisma.planTable.deleteMany();
    admin = await makeUser('ADMIN');
    dp = await makeUser('CONSULTA');
    prof = await makeUser('PROFESSOR');
  });
  afterAll(async () => { await prisma.planTable.deleteMany(); });

  it('importa a planilha: 2026 vigente e o rascunho 2027 do repasse (o que não está no repasse fica "A decidir")', async () => {
    await expect(importFromSheet(dp.principal, META)).rejects.toBeInstanceOf(AuthorizationError);
    ids = await importFromSheet(admin.principal, META);
    await expect(importFromSheet(admin.principal, META)).rejects.toThrow(/já foi importada/);
    const v = await planTable(admin.principal, ids.rascunho);
    expect(v.plans).toHaveLength(30);
    expect(v.counts.A_DECIDIR).toBe(10);
    expect(v.base?.name).toBe('Planos 2026');
    const fit = v.plans.find((p) => p.name === 'Nação Fit')!;
    const mensal = fit.options.find((o) => o.label === 'Mensal')!;
    expect([mensal.card, mensal.baseCard, mensal.cardChange]).toEqual([438.9, 399, 10]);
    const sem = fit.options.find((o) => o.label === 'Semestral')!;
    expect([sem.card, sem.recurring, sem.recurringTotal]).toEqual([299, 328.9, 1973.4]);
    expect(v.plans.find((p) => p.name === 'Nação Blue')!.note).toMatch(/18 meses/);
    expect(await prisma.auditLog.count({ where: { action: 'plans.import' } })).toBeGreaterThanOrEqual(1);
  });

  it('quem consulta (DP) vê só a vigente; rascunho é do Administrador; professor não entra', async () => {
    expect((await listPlanTables(dp.principal)).map((t) => t.status)).toEqual(['VIGENTE']);
    await expect(planTable(dp.principal, ids.rascunho)).rejects.toBeInstanceOf(NotFoundError);
    await expect(listPlanTables(prof.principal)).rejects.toBeInstanceOf(AuthorizationError);
    expect((await planTable(dp.principal, ids.vigente)).table.editable).toBe(false);
    expect((await listPlanTables(admin.principal)).map((t) => t.status).sort()).toEqual(['RASCUNHO', 'VIGENTE']);
  });

  it('vigente é travada; no rascunho edita preço, situação e cria plano novo', async () => {
    const v26 = await planTable(admin.principal, ids.vigente);
    const opt26 = v26.plans[0]!.options[0]!;
    await expect(setOptionPrice(admin.principal, { optionId: opt26.id, field: 'card', value: 1 }, META)).rejects.toThrow(/não se edita/);
    const v = await planTable(admin.principal, ids.rascunho);
    const cross = v.plans.find((p) => p.name === 'Crossfit')!;
    await setOptionPrice(admin.principal, { optionId: cross.options[0]!.id, field: 'card', value: 449 }, META);
    await expect(setOptionPrice(dp.principal, { optionId: cross.options[0]!.id, field: 'card', value: 1 }, META)).rejects.toBeInstanceOf(AuthorizationError);
    const lutas = v.plans.find((p) => p.name === 'Nação Lutas')!;
    await setPlanStatus(admin.principal, { itemId: lutas.id, status: 'EXCLUIR' }, META);
    const id = await savePlan(admin.principal, { tableId: ids.rascunho, group: 'Lutas', name: 'Nação Lutas + Jiu Jitsu', status: 'NOVO', checkin: 'Check In Ilimitado',
      options: [{ label: 'Mensal', months: 1, card: 429, recurring: null }, { label: 'Anual', months: 12, card: 349, recurring: 379 }] }, META);
    await expect(savePlan(admin.principal, { tableId: ids.rascunho, group: 'Lutas', name: 'nação lutas + jiu jitsu', status: 'NOVO', options: [] }, META)).rejects.toThrow(/mesmo nome|Já existe/);
    const after = await planTable(admin.principal, ids.rascunho);
    expect(after.plans.find((p) => p.name === 'Crossfit')!.options[0]!.card).toBe(449);
    expect(after.plans.find((p) => p.id === id)!.options[1]!.cardTotal).toBe(4188);
    // Plano novo pode ser apagado; o que veio de 2026 só "sai".
    await expect(deletePlan(admin.principal, { itemId: lutas.id }, META)).rejects.toThrow(/Sai/);
    await deletePlan(admin.principal, { itemId: id }, META);
    expect(await prisma.planItem.count({ where: { id } })).toBe(0);
  });

  it('reajuste em lote: % sobre a base ou o atual, só nas opções escolhidas, com arredondamento', async () => {
    const v = await planTable(admin.principal, ids.rascunho);
    const tenis = v.plans.filter((p) => p.group === 'Tênis').map((p) => p.id);
    const n = await adjustPrices(admin.principal, { tableId: ids.rascunho, itemIds: tenis, labels: ['Anual'], target: 'CARD', from: 'BASE', pct: 8, rounding: 'INTEIRO' }, META);
    expect(n).toBe(5);
    const t1 = (await planTable(admin.principal, ids.rascunho)).plans.find((p) => p.name === 'Tênis 1x')!;
    expect(t1.options.find((o) => o.label === 'Anual')!.card).toBe(321); // 297,50 × 1,08
    expect(t1.options.find((o) => o.label === 'Mensal')!.card).toBe(385); // não mexeu
    await adjustPrices(admin.principal, { tableId: ids.rascunho, itemIds: [t1.id], labels: [], target: 'RECURRING_FROM_CARD', from: 'ATUAL', pct: 10, rounding: 'CENTAVOS' }, META);
    const t1b = (await planTable(admin.principal, ids.rascunho)).plans.find((p) => p.name === 'Tênis 1x')!;
    expect(t1b.options.find((o) => o.label === 'Anual')!.recurring).toBe(353.1);
    expect(t1b.options.find((o) => o.label === 'Mensal')!.recurring).toBeNull(); // mensal não tem recorrência
    expect(await prisma.auditLog.count({ where: { action: 'plans.adjust', entityId: ids.rascunho } })).toBe(2);
  });

  it('copiar para planilha e publicar: exige decidir os "A decidir"; a anterior vai para o arquivo', async () => {
    const tsv = await planTableTsv(admin.principal, ids.rascunho);
    expect(tsv.split('\n')[0]).toMatch(/SITUAÇÃO/);
    await expect(publishTable(admin.principal, { tableId: ids.rascunho }, META)).rejects.toThrow(/A decidir/);
    const v = await planTable(admin.principal, ids.rascunho);
    for (const p of v.plans.filter((x) => x.status === 'A_DECIDIR')) await setPlanStatus(admin.principal, { itemId: p.id, status: 'EXCLUIR' }, META);
    await publishTable(admin.principal, { tableId: ids.rascunho }, META);
    const tables = await listPlanTables(dp.principal);
    expect(tables.find((t) => t.id === ids.rascunho)!.status).toBe('VIGENTE');
    expect(tables.find((t) => t.id === ids.vigente)!.status).toBe('ARQUIVADA');
    // Na vigente, quem consulta não vê os que saíram na cópia para planilha.
    expect((await planTableTsv(dp.principal, ids.rascunho)).split("\n").map((l) => l.split("\t")[1])).not.toContain("Nação Lutas");
    // Novo rascunho a partir da vigente leva só os que ficaram.
    const d = await createDraft(admin.principal, { fromTableId: ids.rascunho, name: 'Planos 2028', year: 2028 }, META);
    const v28 = await planTable(admin.principal, d);
    expect(v28.plans).toHaveLength(20);
    expect(v28.plans.every((p) => p.status === 'MANTEM')).toBe(true);
  });
});
