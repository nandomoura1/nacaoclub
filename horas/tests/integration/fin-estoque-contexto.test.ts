import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { prisma } from '@/server/db';
import { AuthorizationError } from '@/server/errors';
import {
  approveFinPeriod, confirmFinLines, createFinPeriod, getFinPeriod, getFinVersion, planFinContext, processFinDocument, runFinAnalysis, toggleFinContextAdjustment, saveFinReportContext, uploadFinDocument,
} from '@/server/services/fin-service';
import { META, ensureCatalog, hasDb, makeUser } from './helpers';

/** Estoque no CMV e contexto dos sócios (números fictícios; ano aleatório). */
describe.skipIf(!hasDb)('Financeiro — estoque e contexto dos sócios', () => {
  const prev = process.env.AI_FAKE;
  const year = 2100 + Math.floor(Math.random() * 800);
  const M1 = `${year}-09`;
  const M2 = `${year}-10`;
  let admin: Awaited<ReturnType<typeof makeUser>>;

  async function xlsx(rows: unknown[][]) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Estoque');
    rows.forEach((r) => ws.addRow(r));
    const buf = await wb.xlsx.writeBuffer();
    return new File([new Uint8Array(buf as ArrayBuffer)], `estoque-${year}.xlsx`, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  const send = async (month: string, kind: string, f: File) => {
    const id = await uploadFinDocument(admin.principal, month, kind, f, null, META);
    return { id, ...(await processFinDocument(admin.principal, id, META)) };
  };

  beforeAll(async () => {
    process.env.AI_FAKE = '1';
    await ensureCatalog();
    admin = await makeUser('ADMIN', { name: 'Admin Estoque' });
  });
  afterAll(() => { process.env.AI_FAKE = prev; });

  it('posição de estoque em planilha é lida pelas colunas (sem IA) e o negativo fica fora do valor', async () => {
    await createFinPeriod(admin.principal, M1, META);
    const r = await send(M1, 'ESTOQUE', await xlsx([
      ['Posição de estoque'], ['Produto', 'Quantidade', 'Custo unitário', 'Valor total'],
      ['Refrigerante lata', 300, 3, 900], ['Água 500ml', 400, 1, 400], ['Picolé', -12, 5, -60], ['Total', 688, null, 1240],
    ]));
    expect(r.lines).toBe(3);
    expect(r.warnings.some((w) => /1 produto\(s\) com estoque negativo/.test(w))).toBe(true);
    const p = await getFinPeriod(admin.principal, M1);
    const stock = p.lines.filter((l) => l.dataset === 'ESTOQUE');
    expect(stock.map((l) => [l.label, l.key, l.amountCents])).toEqual(expect.arrayContaining([['Refrigerante lata', 'final', 900_00], ['Picolé', 'final', -60_00]]));
    expect(stock.find((l) => l.label === 'Água 500ml')!.sourceRef).toMatch(/linha 4/);
    expect(p.metrics.estoque!.final.value).toBe(1_300_00);
    expect(p.metrics.checks.some((c) => c.key === 'estoque_inicial')).toBe(true); // 1º mês: sem estoque inicial
    // Arquivo que não é planilha (PDF, print, texto) vai para a IA; no modo exemplo ela devolve 3 produtos.
    await expect(send(M1, 'ESTOQUE', new File(['qualquer coisa'], 'nao-e-estoque.txt'))).resolves.toMatchObject({ lines: 3 });
  });

  it('mês seguinte: estoque inicial = posição final do mês anterior; CMV ajustado', async () => {
    await createFinPeriod(admin.principal, M2, META);
    await send(M2, 'DRE_PAGAMENTOS', new File([`pag ${year}`], 'pagamentos.txt')); // exemplo: compras de revenda R$ 6.500
    await send(M2, 'PDV', new File([`pdv ${year}`], 'pdv.txt')); // faturamento R$ 17.000
    await send(M2, 'ESTOQUE', new File(['Descrição;Saldo;Custo médio\nRefrigerante lata;100;3,00\nÁgua 500ml;200;1,00\nGelo;-3;2,00\n'], 'estoque-out.csv', { type: 'text/csv' }));
    const p = await getFinPeriod(admin.principal, M2);
    // M1 tem duas posições "final" (a planilha e o exemplo do .txt): 1.300 + 1.300 = 2.600 de abertura.
    expect(p.metrics.estoque).toMatchObject({ inicialFonte: 'mes_anterior', final: { value: 500_00 } });
    expect(p.metrics.cmv.metodo).toBe('ajustado_estoque');
    expect(p.metrics.cmv.valor.value).toBe(6_500_00 - (500_00 - p.metrics.estoque!.inicial.value!));
    expect(p.metrics.cmv.valor.status).toBe('estimativa');
  });

  it('contexto dos sócios: valida motivo, audita, alimenta a análise e congela na versão', async () => {
    const mkt = await makeUser('CONSULTA', { name: 'Só consulta' });
    await expect(saveFinReportContext(mkt.principal, M2, { partnerContext: 'x', exclusions: [] }, META)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(saveFinReportContext(admin.principal, M2, { partnerContext: null, exclusions: [{ key: 'cmv', reason: '' }] }, META)).rejects.toThrow(/por que/);
    await expect(saveFinReportContext(admin.principal, M2, { partnerContext: null, exclusions: [{ key: 'inventado', reason: 'abc' }] }, META)).rejects.toThrow();

    await saveFinReportContext(admin.principal, M2, {
      partnerContext: 'Compramos bebida em volume para o evento do dia 20.',
      exclusions: [{ key: 'cmv', reason: 'compra concentrada para o evento' }, { key: 'cmv', reason: 'duplicado' }, { key: 'pessoal', reason: 'rescisões do mês' }],
    }, META);
    let p = await getFinPeriod(admin.principal, M2);
    expect(p.partnerContext).toMatch(/evento do dia 20/);
    expect(p.exclusions.map((e) => e.key)).toEqual(['cmv', 'pessoal']);
    expect(p.contextAt).not.toBeNull();
    expect(await prisma.auditLog.count({ where: { action: 'fin.report_context', entityId: p.id } })).toBe(1);

    // O contexto precisa ser aplicado aos números antes da análise.
    await expect(runFinAnalysis(admin.principal, M2, META)).rejects.toThrow(/aplique o contexto/);
    await expect(planFinContext(mkt.principal, M2, META)).rejects.toBeInstanceOf(AuthorizationError);
    await planFinContext(admin.principal, M2, META);
    p = await getFinPeriod(admin.principal, M2);
    expect(p.contextPlanStale).toBe(false);
    expect(p.contextPlan?.context).toMatch(/evento do dia 20/);

    // Um ajuste estrutural (como a IA devolveria): tira um pagamento do relatório.
    const target = p.lines.find((l) => l.dataset === 'DESPESA')!;
    const before = p.metrics.pagamentos.value!;
    await prisma.finPeriod.update({ where: { id: p.id }, data: { contextPlan: { ...p.contextPlan!, items: [{ id: 'a1', kind: 'EXCLUIR', lineId: target.id, dataset: 'DESPESA', label: target.label, unit: null, fromCents: target.amountCents, toCents: null, fromKey: target.key, toKey: null, reason: 'pontual', quote: 'evento', active: true }] } } });
    p = await getFinPeriod(admin.principal, M2);
    expect(p.metrics.pagamentos.value).toBe(before - target.amountCents!);
    expect(p.contextEffects.find((e) => e.key === 'pagamentos')).toMatchObject({ from: before, to: before - target.amountCents! });
    expect(p.lines.find((l) => l.id === target.id)?.amountCents).toBe(target.amountCents); // original intacto
    await toggleFinContextAdjustment(admin.principal, M2, 'a1', false, META);
    expect((await getFinPeriod(admin.principal, M2)).metrics.pagamentos.value).toBe(before);
    await toggleFinContextAdjustment(admin.principal, M2, 'a1', true, META);

    await runFinAnalysis(admin.principal, M2, META);
    await confirmFinLines(admin.principal, M2, 'all', META);
    await approveFinPeriod(admin.principal, M2, null, META);
    const v = await getFinVersion(admin.principal, M2, 1);
    expect(v.snapshot.partnerContext).toMatch(/evento/);
    expect(v.snapshot.exclusions?.map((e) => e.key)).toEqual(['cmv', 'pessoal']);
    expect(v.snapshot.metrics.cmv.metodo).toBe('ajustado_estoque'); // número continua guardado
    expect(v.snapshot.contextPlan?.items.map((a) => a.id)).toEqual(['a1']);
    expect(v.snapshot.metrics.pagamentos.value).toBe(before - target.amountCents!);
    expect(v.snapshot.lines.find((l) => l.label === target.label)?.amountCents).toBe(target.amountCents);

    // Limpar o contexto também é registrado.
    await saveFinReportContext(admin.principal, M2, { partnerContext: '', exclusions: [] }, META);
    p = await getFinPeriod(admin.principal, M2);
    expect([p.partnerContext, p.exclusions, p.contextPlan]).toEqual([null, [], null]);
  });
});

describe.skipIf(!hasDb)('Financeiro — explicação do gestor na linha', () => {
  it('nota e motivo ficam na própria linha (meta) para a análise', async () => {
    const { addFinLine, updateFinLine } = await import('@/server/services/fin-service');
    const admin = await makeUser('ADMIN', { name: 'Admin Nota' });
    const M = `${2100 + Math.floor(Math.random() * 800)}-03`;
    await createFinPeriod(admin.principal, M, META);
    const id = await addFinLine(admin.principal, M, { dataset: 'DESPESA', key: 'desp.outras', label: 'Conserto', unit: null, amountCents: 300_00, quantity: null, classification: null, meta: { nota: 'quebrou a bomba' }, reason: 'não veio no DRE' }, META);
    let l = await prisma.finLine.findUniqueOrThrow({ where: { id } });
    expect(l.meta).toEqual({ nota: 'quebrou a bomba', motivo: 'não veio no DRE' });
    await updateFinLine(admin.principal, id, { amountCents: 350_00, reason: 'nota fiscal final' }, META);
    l = await prisma.finLine.findUniqueOrThrow({ where: { id } });
    expect(l.meta).toEqual({ nota: 'quebrou a bomba', motivo: 'nota fiscal final' });
    expect(l.amountCents).toBe(350_00);
  });
});
