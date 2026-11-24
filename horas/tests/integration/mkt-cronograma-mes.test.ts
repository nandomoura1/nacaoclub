import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/server/db';
import { AuthorizationError } from '@/server/errors';
import { approvePlan, cronogramaText, deletePost, generatePlan, getCronograma, importPlanText, markPost, postToTask, reopenPlan, savePlanInfo, savePost } from '@/server/services/mkt-cronograma-service';
import { META, ensureCatalog, hasDb, makeUser } from './helpers';

/** Cronograma do mês: objetivos + posts, IA nos dias livres, Docs ida e volta, Kanban e aprovação. */
describe.skipIf(!hasDb)('Marketing — Cronograma do mês', () => {
  const month = '2031-12';
  const prev = process.env.AI_FAKE;
  let admin: Awaited<ReturnType<typeof makeUser>>;
  let mkt: Awaited<ReturnType<typeof makeUser>>;
  let outsider: Awaited<ReturnType<typeof makeUser>>;
  let eventId: string;

  beforeAll(async () => {
    process.env.AI_FAKE = '1';
    await ensureCatalog();
    await prisma.mktContentPlan.deleteMany({ where: { month } });
    admin = await makeUser('ADMIN');
    mkt = await makeUser('MARKETING', { name: 'Maju Teste' });
    outsider = await makeUser('PROFESSOR');
    eventId = (await prisma.mktEvent.create({ data: { name: 'Murph de Natal 2031', startDate: new Date('2031-12-19T00:00:00Z'), status: 'PLANEJADO' } })).id;
  });
  afterAll(async () => {
    process.env.AI_FAKE = prev;
    await prisma.mktContentPlan.deleteMany({ where: { month } });
    await prisma.mktEvent.deleteMany({ where: { id: eventId } });
  });

  it('monta, sugere, liga, manda para o Kanban e aprova', async () => {
    await expect(getCronograma(outsider.principal, month)).rejects.toBeInstanceOf(AuthorizationError);
    await savePlanInfo(mkt.principal, month, { objectives: '- Plano Duo\n- Tênis e Hyrox', ownerId: mkt.principal.id }, META);

    // Colar do Docs: liga ao evento pelo nome.
    const doc = '01/12, SEGUNDA\n\nPLANO DUO\n\nCarrossel | “Duas modalidades. Um plano.”\n\nSlide 1: x\n\nCTA: Chama no WhatsApp.\n\n11/12, QUINTA\n\nCROSSFIT\n\nPost estático | “Murph de Natal 2031.”\n\nDia 19. [horário]';
    const imp = await importPlanText(mkt.principal, month, doc, META);
    expect(imp).toMatchObject({ created: 2, repeated: 0 });
    expect((await importPlanText(mkt.principal, month, doc, META)).created).toBe(0); // não duplica

    let v = await getCronograma(mkt.principal, month);
    const murph = v.posts.find((p) => p.date === '2031-12-11')!;
    expect(murph).toMatchObject({ format: 'ESTATICO', eventId, pending: 'horário', origin: 'DOCS' });
    expect(v.plan?.objectives).toMatch(/Plano Duo/);

    // IA (exemplo local) preenche só os dias livres; o evento do dia 19 vira cobertura ligada a ele.
    const g = await generatePlan(mkt.principal, month, META);
    expect(g.created).toBe(29);
    v = await getCronograma(mkt.principal, month);
    expect(v.posts).toHaveLength(31);
    expect(v.posts.filter((p) => p.date === '2031-12-01')).toHaveLength(1);
    expect(v.posts.find((p) => p.date === '2031-12-19')?.eventId).toBe(eventId);
    await expect(generatePlan(mkt.principal, month, META)).rejects.toThrow(/Todos os dias/);

    // Edição manual e exclusão.
    const id = await savePost(mkt.principal, month, null, { date: '2031-12-02', channel: 'WHATSAPP', topic: 'aviso', format: 'TEXTO', title: 'Horários de dezembro', body: 'texto', cta: null, stories: null, pending: null, campaignId: null, eventId: null }, META);
    expect((await prisma.mktContentPost.findUniqueOrThrow({ where: { id } })).topic).toBe('AVISO');
    await expect(savePost(mkt.principal, month, null, { date: '2032-01-02', channel: 'INSTAGRAM', topic: 'X', format: 'REELS', title: 'Fora', body: null, cta: null, stories: null, pending: null, campaignId: null, eventId: null }, META)).rejects.toThrow(/mês do cronograma/);
    await deletePost(mkt.principal, month, id, META);

    // Kanban: tarefa com o roteiro, prazo 2 dias antes, responsável do mês, ligada ao evento.
    const taskId = await postToTask(mkt.principal, murph.id, null, '2031-11-20', META);
    const task = await prisma.mktTask.findUniqueOrThrow({ where: { id: taskId } });
    expect(task).toMatchObject({ title: '[Post estático] Murph de Natal 2031.', assigneeId: mkt.principal.id, eventId });
    expect(task.dueDate?.toISOString().slice(0, 10)).toBe('2031-12-09');
    expect(task.description).toMatch(/A confirmar: horário/);
    await expect(postToTask(mkt.principal, murph.id, null, '2031-11-20', META)).rejects.toThrow(/já tem tarefa/);

    // Texto no formato do Docs.
    const txt = await cronogramaText(mkt.principal, month);
    expect(txt).toMatch(/11\/12, (QUINTA|SEXTA|QUARTA|TERÇA|SEGUNDA|SÁBADO|DOMINGO)/);
    expect(txt).toMatch(/Post estático \| “Murph de Natal 2031\.”/);
    expect(txt).toMatch(/A confirmar antes de aprovar/);

    // Aprovação: só quem aprova; trava a edição; resultado do post continua liberado; reabrir com motivo.
    await expect(approvePlan(mkt.principal, month, META)).rejects.toBeInstanceOf(AuthorizationError);
    await approvePlan(admin.principal, month, META);
    await expect(savePost(mkt.principal, month, murph.id, { date: '2031-12-11', channel: 'INSTAGRAM', topic: 'CROSSFIT', format: 'REELS', title: 'Outro', body: null, cta: null, stories: null, pending: null, campaignId: null, eventId: null }, META)).rejects.toThrow(/aprovado/);
    await markPost(mkt.principal, murph.id, { status: 'PUBLICADO', views: 3100 }, META);
    expect(await prisma.mktContentPost.findUniqueOrThrow({ where: { id: murph.id } })).toMatchObject({ status: 'PUBLICADO', views: 3100 });
    await expect(reopenPlan(mkt.principal, month, '', META)).rejects.toThrow(/motivo/);
    await reopenPlan(mkt.principal, month, 'trocar o post do dia 15', META);
    expect((await getCronograma(mkt.principal, month)).plan?.status).toBe('RASCUNHO');
    const audits = await prisma.auditLog.findMany({ where: { action: { in: ['mkt.plan_approved', 'mkt.plan_reopened', 'mkt.plan_generated', 'mkt.plan_imported'] }, actorId: { in: [mkt.principal.id, admin.principal.id] } } });
    expect(audits.length).toBeGreaterThanOrEqual(4);
  });
});
