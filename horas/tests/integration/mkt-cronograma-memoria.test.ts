import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/server/db';
import { AuthorizationError } from '@/server/errors';
import { addDays } from '@/domain/dates';
import { analyzeSchedule, autoImportSchedule, commitSchedule, getScheduleReview, repeatEventNextYear, undoImport } from '@/server/services/mkt-import-service';
import { deleteKnowledge, draftKnowledge, listKnowledge, memoryContext, saveKnowledge } from '@/server/services/mkt-memory-service';
import { META, ensureCatalog, hasDb, makeUser } from './helpers';

/** Cronograma (IA em modo exemplo, datas num ano distante) e Memória da Nação. */
describe.skipIf(!hasDb)('Marketing — cronograma e memória', () => {
  const prev = process.env.AI_FAKE;
  const year = 2300 + Math.floor(Math.random() * 600);
  const today = `${year}-10-14`;
  let admin: Awaited<ReturnType<typeof makeUser>>;
  let mkt: Awaited<ReturnType<typeof makeUser>>;
  const doc = () => new File([`Cronograma ${year}\nSetembro: Nação Celebration Etapa 3…`], `cronograma-${year}.txt`, { type: 'text/plain' });

  beforeAll(async () => {
    process.env.AI_FAKE = '1';
    await ensureCatalog();
    admin = await makeUser('ADMIN', { name: 'Admin Crono' });
    mkt = await makeUser('MARKETING', { name: 'Equipe Mkt' });
  });
  afterAll(() => { process.env.AI_FAKE = prev; });

  it('só quem administra o marketing importa; texto curto é recusado', async () => {
    await expect(analyzeSchedule(mkt.principal, { file: doc(), text: null }, today, META)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(analyzeSchedule(admin.principal, { file: null, text: 'oi' }, today, META)).rejects.toThrow(/cole o texto/);
  });

  it('lê → revisa → importa (lote desfazível) → reimportar não duplica → desfazer', async () => {
    const sid = await analyzeSchedule(admin.principal, { file: doc(), text: null }, today, META);
    const review = await getScheduleReview(admin.principal, sid, today);
    expect(review.rows.length).toBe(6);
    const chosen = review.rows.filter((r) => r.include);
    expect(chosen.map((r) => r.kind).sort()).toEqual(['CAMPANHA', 'EVENTO', 'EVENTO', 'TEMA_DO_MES']); // sem feriado e sem privado
    const celebration = review.rows.find((r) => r.title.startsWith('Nação Celebration'))!;
    expect(celebration.status).toBe('REALIZADO'); // março, antes de "hoje"

    const decisions = chosen.map((r) => ({ index: r.index, kind: r.kind, title: r.title, startDate: r.startDate, endDate: r.endDate, status: r.status, campaignType: r.campaignType }));
    const res = await commitSchedule(admin.principal, sid, decisions, META);
    expect(res).toMatchObject({ eventos: 2, campanhas: 1, datas: 1, duplicados: 0 });
    const ev = await prisma.mktEvent.findMany({ where: { importId: res.importId } });
    expect(ev.find((e) => e.name.startsWith('Nação Celebration'))!.notes).toContain('Parceiro/patrocínio: Brasal');
    const camp = await prisma.mktCampaign.findFirstOrThrow({ where: { importId: res.importId } });
    expect([camp.name, camp.type, camp.status]).toEqual(['Pai Treina Grátis', 'AQUISICAO', 'FINALIZADA']);
    expect(await prisma.mktCalendarItem.count({ where: { importId: res.importId, kind: 'TEMA_DO_MES' } })).toBe(1);
    await expect(commitSchedule(admin.principal, sid, decisions, META)).rejects.toThrow(/já foi importada/);

    // Mesmo documento de novo: tudo aparece como duplicado e desmarcado.
    const sid2 = await analyzeSchedule(admin.principal, { file: doc(), text: null }, today, META);
    const r2 = await getScheduleReview(admin.principal, sid2, today);
    expect(r2.rows.filter((r) => r.duplicate).length).toBe(4);
    await expect(commitSchedule(admin.principal, sid2, r2.rows.filter((r) => r.duplicate).map((r) => ({ index: r.index, kind: r.kind, title: r.title, startDate: r.startDate, endDate: r.endDate, status: r.status, campaignType: r.campaignType })), META)).rejects.toThrow(/já existem/);

    // Subida automática: grava o que a revisão marcaria; com tudo já existente, recusa.
    await expect(autoImportSchedule(admin.principal, sid2, today, META)).rejects.toThrow(/já estão no calendário/);

    // Desfazer mantém o que já está em uso (campanha com tarefa).
    await prisma.mktTask.create({ data: { title: 'Tarefa real', campaignId: camp.id } });
    expect(await undoImport(admin.principal, res.importId, META)).toEqual({ removidos: 3, mantidos: 1 });
    await expect(undoImport(admin.principal, res.importId, META)).rejects.toThrow(/já foi desfeita/);
    expect(await prisma.auditLog.count({ where: { entityId: res.importId, action: { in: ['mkt.schedule_imported', 'mkt.schedule_undone'] } } })).toBe(2);

    // Depois de desfeito, a subida automática do mesmo documento grava tudo de novo, sem revisão.
    const sid3 = await analyzeSchedule(admin.principal, { file: doc(), text: null }, today, META);
    await expect(autoImportSchedule(mkt.principal, sid3, today, META)).rejects.toBeInstanceOf(AuthorizationError);
    const auto = await autoImportSchedule(admin.principal, sid3, today, META);
    expect(auto.eventos + auto.campanhas + auto.datas).toBe(3); // a campanha mantida no desfazer já existe
    await expect(autoImportSchedule(admin.principal, sid3, today, META)).rejects.toThrow(/já foi importada/);
  });

  it('memória: rascunho da IA não grava; salvar/editar/excluir auditado; contexto inclui memória ativa e o mesmo período do ano anterior', async () => {
    const before = (await listKnowledge(admin.principal)).length;
    const d = await draftKnowledge(admin.principal, { file: doc(), text: null }, META);
    expect(d.content).toMatch(/Celebration/);
    expect((await listKnowledge(admin.principal)).length).toBe(before);
    await expect(saveKnowledge(mkt.principal, null, { title: 'x', content: 'y' }, META)).rejects.toBeInstanceOf(AuthorizationError);
    const id = await saveKnowledge(admin.principal, null, { title: `Calendário ${year}`, content: `- Nação Celebration acontece em etapas (mar, jun, set, nov) — ${year}.`, source: d.source, active: true }, META);
    const inactive = await saveKnowledge(admin.principal, null, { title: `Rascunho ${year}`, content: `- Não usar ainda (${year}).`, active: false }, META);

    // Evento do ano anterior perto da data de referência entra no histórico.
    await prisma.mktEvent.create({ data: { name: `Murph de Natal ${year - 1}`, startDate: new Date(`${year - 1}-12-19T00:00:00Z`), status: 'REALIZADO' } });
    const ctx = await memoryContext(`${year}-12-01`);
    expect(ctx.memoria).toContain(`Calendário ${year}`);
    expect(ctx.memoria).not.toContain(`Rascunho ${year}`);
    expect(ctx.historico.some((h) => h.includes(`Murph de Natal ${year - 1}`))).toBe(true);
    expect((await memoryContext(addDays(`${year}-12-01`, 120))).historico.some((h) => h.includes('Murph'))).toBe(false);

    await deleteKnowledge(admin.principal, id, META);
    await deleteKnowledge(admin.principal, inactive, META);
    expect(await prisma.auditLog.count({ where: { entityId: id, action: { in: ['mkt.memory_created', 'mkt.memory_deleted'] } } })).toBe(2);
  });

  it('repetir evento no ano seguinte: mesmo dia da semana, planejado, sem duplicar', async () => {
    const e = await prisma.mktEvent.create({ data: { name: `Celebration modelo ${year}`, startDate: new Date(`${year}-09-12T00:00:00Z`), status: 'REALIZADO' } });
    const r = await repeatEventNextYear(mkt.principal, e.id, META);
    const n = await prisma.mktEvent.findUniqueOrThrow({ where: { id: r.id } });
    expect(n.status).toBe('PLANEJADO');
    expect(n.startDate.getUTCDay()).toBe(e.startDate.getUTCDay());
    expect(n.notes).toMatch(/Modelo:/);
    await expect(repeatEventNextYear(mkt.principal, e.id, META)).rejects.toThrow(/Já existe/);
  });
});
