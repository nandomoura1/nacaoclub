import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/server/db';
import { AuthorizationError } from '@/server/errors';
import {
  addFinLine, analyzeHistoricReport, approveFinPeriod, commitHistoricReport, confirmFinLines, createFinPeriod, deleteFinDocument, finHistory,
  getFinPeriod, getFinVersion, processFinDocument, runFinAnalysis, updateFinLine, uploadFinDocument,
} from '@/server/services/fin-service';
import { META, ensureCatalog, hasDb, makeUser } from './helpers';

/** Relatório Financeiro com extração de exemplo (AI_FAKE) e números fictícios; ano aleatório para não colidir. */
describe.skipIf(!hasDb)('Relatório Financeiro', () => {
  const prev = process.env.AI_FAKE;
  const year = 2100 + Math.floor(Math.random() * 800);
  const M1 = `${year}-07`;
  const M2 = `${year}-08`;
  let admin: Awaited<ReturnType<typeof makeUser>>;
  const file = (name: string, text: string) => new File([text], name, { type: 'text/plain' });

  beforeAll(async () => {
    process.env.AI_FAKE = '1';
    await ensureCatalog();
    admin = await makeUser('ADMIN', { name: 'Admin Fin' });
  });
  afterAll(() => { process.env.AI_FAKE = prev; });

  it('competência: cria, envia, processa, confere, edita com auditoria e aprova v1; reaprovar gera v2 e preserva v1', async () => {
    expect(await createFinPeriod(admin.principal, M1, META)).toEqual({ month: M1, existed: false });
    expect(await createFinPeriod(admin.principal, M1, META)).toEqual({ month: M1, existed: true });

    for (const kind of ['DRE_RECEBIMENTOS', 'DRE_PAGAMENTOS', 'PDV', 'CAIXA', 'ALUNOS'] as const) {
      const id = await uploadFinDocument(admin.principal, M1, kind, file(`${kind}-${year}.txt`, `${kind} ${year}`), null, META);
      const r = await processFinDocument(admin.principal, id, META);
      expect(r.lines).toBeGreaterThan(0);
    }
    // Mesmo arquivo de novo na mesma competência: recusado.
    await expect(uploadFinDocument(admin.principal, M1, 'PDV', file('outro-nome.txt', `PDV ${year}`), null, META)).rejects.toThrow(/já foi enviado/);
    // Formato não aceito.
    await expect(uploadFinDocument(admin.principal, M1, 'OUTROS', new File(['x'], 'planilha.xls'), null, META)).rejects.toThrow(/Formato não aceito/);

    let p = await getFinPeriod(admin.principal, M1);
    expect(p.status).toBe('REVIEW');
    expect(p.lines.every((l) => l.status === 'EXTRACTED')).toBe(true);
    // Nada aprova com dado não conferido.
    await expect(approveFinPeriod(admin.principal, M1, null, META)).rejects.toThrow(/para conferir/);

    // Motor: pessoal sem IRRF e sem parceria; payout fora; caixa só disponível.
    expect(p.metrics.recebimentos.value).toBe(6_500_000);
    expect(p.metrics.pessoal.value).toBe(1_200_000);
    expect(p.metrics.payout.total.value).toBe(600_000);
    expect(p.metrics.caixa.disponivel.value).toBe(3_000_000);
    expect(p.metrics.alunos.total.value).toBe(102);

    const sal = p.lines.find((l) => l.key === 'pessoal.salarios')!;
    await updateFinLine(admin.principal, sal.id, { amountCents: 1_300_000 }, META);
    const log = await prisma.auditLog.findFirst({ where: { action: 'fin.line_edited', entityId: sal.id }, orderBy: { at: 'desc' } });
    expect(log?.before).toMatchObject({ amountCents: 1_200_000 });
    expect(log?.after).toMatchObject({ amountCents: 1_300_000 });

    expect(await confirmFinLines(admin.principal, M1, 'all', META)).toBeGreaterThan(5);
    expect(await approveFinPeriod(admin.principal, M1, null, META)).toBe(1);
    p = await getFinPeriod(admin.principal, M1);
    expect([p.status, p.version]).toEqual(['APPROVED', 1]);
    expect(p.documents.every((d) => d.status === 'APPROVED')).toBe(true);

    // Depois de aprovada: alterar exige motivo e volta para conferência; v1 continua valendo.
    await expect(updateFinLine(admin.principal, sal.id, { amountCents: 1_400_000 }, META)).rejects.toThrow(/motivo/);
    await updateFinLine(admin.principal, sal.id, { amountCents: 1_400_000, reason: 'folha corrigida' }, META);
    p = await getFinPeriod(admin.principal, M1);
    expect(p.status).toBe('REVIEW');
    const h1 = (await finHistory(admin.principal)).find((h) => h.month === M1)!;
    expect(h1.m.pessoal.value).toBe(1_300_000);

    await expect(approveFinPeriod(admin.principal, M1, null, META)).rejects.toThrow(/motivo da nova versão/);
    expect(await approveFinPeriod(admin.principal, M1, 'folha corrigida', META)).toBe(2);
    const v1 = await getFinVersion(admin.principal, M1, 1);
    const v2 = await getFinVersion(admin.principal, M1, 2);
    expect(v1.snapshot.metrics.pessoal.value).toBe(1_300_000);
    expect(v2.snapshot.metrics.pessoal.value).toBe(1_400_000);
    expect((await finHistory(admin.principal)).find((h) => h.month === M1)!.version).toBe(2);

    // Documento com dado conferido não sai.
    const docId = p.documents[0]!.id;
    await expect(deleteFinDocument(admin.principal, docId, META)).rejects.toThrow(/já conferido/);
  });

  it('análise (exemplo) e lançamento manual', async () => {
    const a = await runFinAnalysis(admin.principal, M1, META);
    expect(a.resumoExecutivo).toMatch(/Exemplo local/);
    await addFinLine(admin.principal, M1, { dataset: 'INVESTIMENTO', key: null, label: 'Reforma quadra', unit: null, amountCents: 500_000, quantity: null, classification: 'CAPEX', meta: null, reason: 'nota fiscal recebida' }, META);
    const p = await getFinPeriod(admin.principal, M1);
    expect(p.metrics.investimentos.total.value).toBe(500_000);
    expect(p.lines.find((l) => l.label === 'Reforma quadra')!.status).toBe('MANUAL');
  });

  it('importação de relatório antigo: novo (v1), duplicidade recusada, nova versão e atualizar para conferência', async () => {
    const a = await analyzeHistoricReport(admin.principal, file(`relatorio-${year}-08.txt`, `Relatório ${M2}`), META);
    expect(a.lines.length).toBe(3);
    const r = await commitHistoricReport(admin.principal, { documentId: a.documentId, month: M2, mode: 'novo', notes: a.notes, lines: a.lines }, META);
    expect(r).toEqual({ month: M2, version: 1 });
    const p = await getFinPeriod(admin.principal, M2);
    expect(p.metrics.recebimentos).toMatchObject({ value: 6_000_000, status: 'importado' });
    expect(p.metrics.source).toBe('importado');

    // O mesmo documento não entra duas vezes; um novo "novo" para o mês existente é recusado.
    await expect(commitHistoricReport(admin.principal, { documentId: a.documentId, month: M2, mode: 'novo', notes: null, lines: a.lines }, META)).rejects.toThrow(/já foi importado/);
    const b = await analyzeHistoricReport(admin.principal, file(`relatorio-${year}-08-v2.txt`, `Relatório ${M2} revisado`), META);
    await expect(commitHistoricReport(admin.principal, { documentId: b.documentId, month: M2, mode: 'novo', notes: null, lines: b.lines }, META)).rejects.toThrow(/Já existe um relatório/);

    const lines = b.lines.map((l) => (l.key === 'recebimentos' ? { ...l, amountCents: 6_100_000 } : l));
    expect(await commitHistoricReport(admin.principal, { documentId: b.documentId, month: M2, mode: 'versao', notes: null, lines }, META)).toEqual({ month: M2, version: 2 });
    expect((await getFinVersion(admin.principal, M2, 1)).snapshot.metrics.recebimentos.value).toBe(6_000_000);
    expect((await getFinVersion(admin.principal, M2, 2)).snapshot.metrics.recebimentos.value).toBe(6_100_000);

    const c = await analyzeHistoricReport(admin.principal, file(`relatorio-${year}-08-v3.txt`, `Relatório ${M2} v3`), META);
    expect(await commitHistoricReport(admin.principal, { documentId: c.documentId, month: M2, mode: 'atualizar', notes: null, lines: c.lines }, META)).toEqual({ month: M2, version: null });
    const q = await getFinPeriod(admin.principal, M2);
    expect(q.status).toBe('REVIEW');
    expect(q.lines.filter((l) => l.status === 'EXTRACTED')).toHaveLength(3);
  });

  it('importação com linha inválida não grava nada', async () => {
    const M3 = `${year}-09`;
    const a = await analyzeHistoricReport(admin.principal, file(`relatorio-${year}-09.txt`, `Relatório ${M3}`), META);
    const bad = [...a.lines, { ...a.lines[0]!, amountCents: null, quantity: null }];
    await expect(commitHistoricReport(admin.principal, { documentId: a.documentId, month: M3, mode: 'novo', notes: null, lines: bad }, META)).rejects.toThrow(/sem valor/);
    expect(await prisma.finPeriod.findUnique({ where: { month: M3 } })).toBeNull();
    expect((await prisma.finDocument.findUnique({ where: { id: a.documentId } }))!.periodId).toBeNull();
  });

  it('permissões: professor não vê; coordenador sem fin.* não importa nem aprova', async () => {
    const prof = await makeUser('PROFESSOR');
    await expect(getFinPeriod(prof.principal, M1)).rejects.toBeInstanceOf(AuthorizationError);
    const coord = await makeUser('COORDENADOR');
    await expect(uploadFinDocument(coord.principal, M1, 'PDV', file('x.txt', 'x'), null, META)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(approveFinPeriod(coord.principal, M1, 'x', META)).rejects.toBeInstanceOf(AuthorizationError);
  });
});
