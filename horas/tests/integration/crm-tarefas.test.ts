import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/server/db';
import { AuthorizationError } from '@/server/errors';
import { addDays } from '@/domain/dates';
import { todayIso } from '@/lib/today';
import { setFakeTecnofit } from '@/server/tecnofit/client';
import { FakeTecnofit, type FakeData } from '@/server/tecnofit/fake';
import { runTecnofitSync } from '@/server/services/crm-sync-service';
import { linkConsultant, listConsultants } from '@/server/services/crm-service';
import { dailyDigests, generateTasks, listTasks, markTaskDone, taskCounts } from '@/server/services/crm-task-service';
import { runDueAutomations } from '@/server/whatsapp/automations';
import { META, ensureCatalog, hasDb, makeUser, wipeCrm } from './helpers';

/**
 * Tarefas de CRM: o sistema NÃO fala com o aluno. A régua vira tarefa do consultor;
 * ligação concluída na Tecnofit dá baixa; retorno agendado pausa; pagamento fecha.
 */
describe.skipIf(!hasDb)('Cobrança — tarefas de CRM do consultor', () => {
  const day1 = todayIso();
  const sale = (id: string, due: string, open: number) => ({ id, totalValue: open, openValue: open, saleDate: addDays(due, -30), dueDate: due, items: [{ name: 'Plano Mensal' }] });
  const data: FakeData = {
    consultants: [{ id: '7001', name: 'Consultora Tarefas', types: ['consultant'] }],
    customers: [
      { id: '201', name: 'Aluno Tarefa Um', status: 'active', contacts: [{ contact: '(61) 99111-0201', type: 'WHATSAPP' }], sales: [sale('6201', addDays(day1, 2), 200)] }, // D-3
      { id: '202', name: 'Aluna Tarefa Dois', status: 'active', contacts: [{ contact: '(61) 99111-0202', type: 'WHATSAPP' }], sales: [sale('6202', addDays(day1, -3), 300)] }, // D+3
      { id: '203', name: 'Aluno Tarefa Três', status: 'active', contacts: [{ contact: '(61) 99111-0203', type: 'WHATSAPP' }], sales: [sale('6203', addDays(day1, -16), 150)] }, // D+15
      { id: '204', name: 'Aluna Tarefa Quatro', status: 'restricted', contacts: [], sales: [] }, // pendência
    ],
    calls: [
      { customerId: '201', consultantId: '7001', consultantName: 'Consultora Tarefas', at: addDays(day1, -10), done: true, deadline: addDays(day1, -10), doneAt: addDays(day1, -10) },
      { customerId: '202', consultantId: '7001', consultantName: 'Consultora Tarefas', at: addDays(day1, -10), done: true, deadline: addDays(day1, -10), doneAt: addDays(day1, -10) },
    ],
  };
  let admin: Awaited<ReturnType<typeof makeUser>>;
  let lider: Awaited<ReturnType<typeof makeUser>>;
  let agent: Awaited<ReturnType<typeof makeUser>>;
  let other: Awaited<ReturnType<typeof makeUser>>;
  const prev = { z: process.env.ZAPI_FAKE, t: process.env.ZAPI_TEST_PHONE };

  const tasksOf = (tecnofitId: string) => prisma.crmTask.findMany({ where: { case: { customer: { tecnofitId } } }, orderBy: { createdAt: 'asc' } });
  const sync = (day: string) => runTecnofitSync(day, { force: true });

  beforeAll(async () => {
    process.env.ZAPI_FAKE = '1'; delete process.env.ZAPI_TEST_PHONE;
    await ensureCatalog();
    await wipeCrm();
    setFakeTecnofit(() => new FakeTecnofit(data));
    admin = await makeUser('ADMIN');
    lider = await makeUser('CRM_LIDER', { name: 'Líder Tarefas' });
    agent = await makeUser('CRM', { name: 'Consultora Tarefas Usuária' });
    other = await makeUser('CRM', { name: 'Outro Consultor' });
    await prisma.user.update({ where: { id: agent.principal.id }, data: { phone: '61988887777' } });
    await prisma.user.update({ where: { id: lider.principal.id }, data: { phone: '61988886666' } });
  });
  afterAll(async () => {
    setFakeTecnofit(null);
    await wipeCrm();
    await prisma.waAutomation.updateMany({ where: { audience: 'CRM_TAREFAS' }, data: { active: false, lastPeriod: null } });
    process.env.ZAPI_FAKE = prev.z; if (prev.t) process.env.ZAPI_TEST_PHONE = prev.t;
  });

  it('dia 1: cada caso ganha a tarefa do passo da régua (ou da pendência); nada é enviado ao aluno', async () => {
    const r = await runTecnofitSync(day1);
    expect(r.status).toBe('CONCLUIDA');
    expect(r.stats.tasksCreated).toBe(4);
    expect((await tasksOf('201')).map((t) => t.kind)).toEqual(['D-3']);
    expect((await tasksOf('202')).map((t) => t.kind)).toEqual(['D+3']);
    expect((await tasksOf('203')).map((t) => t.kind)).toEqual(['D+15']);
    expect((await tasksOf('204')).map((t) => t.kind)).toEqual(['PENDENCIA']);
    // Ligação concluída ANTES da tarefa existir não dá baixa.
    expect((await tasksOf('202'))[0]!.status).toBe('ABERTA');
    // D+15 escala para o líder (fica no histórico).
    expect(await prisma.auditLog.count({ where: { action: 'crm.case_escalated' } })).toBeGreaterThanOrEqual(1);
    // Nenhuma mensagem para aluno.
    expect(await prisma.waMessage.count({ where: { toMasked: { contains: '0201' } } })).toBe(0);
    // Rodar de novo não duplica.
    expect((await generateTasks(day1)).created).toBe(0);
  });

  it('lista: consultor vê as dele com o que fazer; líder vê o time e os escalados', async () => {
    const cons = await listConsultants(admin.principal);
    await linkConsultant(admin.principal, { consultantId: cons.find((c) => c.tecnofitId === '7001')!.id, userId: agent.principal.id }, META);
    const mine = await listTasks(agent.principal, 'minhas');
    expect(mine.map((t) => t.customer.tecnofitId).sort()).toEqual(['201', '202']);
    expect(mine.find((t) => t.kind === 'D-3')!.todo).toMatch(/vence em \d{2}\/\d{2}\/\d{4}/);
    await expect(listTasks(agent.principal, 'todas')).rejects.toBeInstanceOf(AuthorizationError);
    expect((await taskCounts(lider.principal)).escalados).toBe(1);
    expect((await listTasks(lider.principal, 'sem')).map((t) => t.customer.tecnofitId).sort()).toEqual(['203', '204']);
  });

  it('dia 2: ligação concluída na Tecnofit dá baixa; tarefa não feita continua (atrasada)', async () => {
    const day2 = addDays(day1, 1);
    data.calls.push({ customerId: '201', consultantId: '7001', consultantName: 'Consultora Tarefas', at: day2, done: true, deadline: day2, doneAt: day2 });
    await sync(day2);
    const t201 = (await tasksOf('201'))[0]!;
    expect(t201.status).toBe('FEITA');
    expect(t201.doneVia).toBe('LIGACAO_TECNOFIT');
    const t202 = await prisma.crmTask.findFirstOrThrow({ where: { case: { customer: { tecnofitId: '202' } }, status: 'ABERTA' } });
    expect(t202.kind).toBe('D+3');
    expect(await generateTasks(day2)).toMatchObject({ created: 0 });
  });

  it('próximo passo da régua substitui o anterior não feito e anota "sem contato"', async () => {
    const day3 = addDays(day1, 2); // aluno 202 chega ao D+5
    await sync(day3);
    const ts = await tasksOf('202');
    expect(ts.map((t) => `${t.kind}:${t.status}`)).toEqual(['D+3:SUBSTITUIDA', 'D+5:ABERTA']);
    expect(ts[1]!.missed).toEqual(['D+3']);
  });

  it('retorno agendado na Tecnofit pausa a régua; chegando a data vira tarefa "Retorno / promessa"', async () => {
    const day3 = addDays(day1, 2);
    const promise = addDays(day1, 6);
    data.calls.push({ customerId: '202', consultantId: '7001', consultantName: 'Consultora Tarefas', at: day3, done: true, deadline: day3, doneAt: day3 });
    data.calls.push({ customerId: '202', consultantId: '7001', consultantName: 'Consultora Tarefas', at: promise, done: false, deadline: promise, doneAt: null });
    await sync(addDays(day1, 4)); // seria o D+7, mas há retorno agendado para o dia 6
    let ts = await tasksOf('202');
    expect(ts.map((t) => t.kind)).toEqual(['D+3', 'D+5']);
    expect(ts[1]!.status).toBe('FEITA'); // a ligação do dia 3 deu baixa
    await sync(promise);
    ts = await tasksOf('202');
    expect(ts.find((t) => t.kind === 'RETORNO')?.status).toBe('ABERTA');
    // A régua volta junto (D+7 em diante) — a promessa vencida é conferida no mesmo contato.
    expect(ts.some((t) => t.kind === 'D+7' && t.status === 'ABERTA')).toBe(true);
  });

  it('pagou: as tarefas abertas do aluno fecham sozinhas como pagamento', async () => {
    data.customers.find((c) => c.id === '202')!.sales[0]!.openValue = 0;
    await sync(addDays(day1, 7));
    const ts = await tasksOf('202');
    expect(ts.filter((t) => t.status === 'ABERTA')).toEqual([]);
    expect(ts.filter((t) => t.doneVia === 'PAGAMENTO').length).toBeGreaterThanOrEqual(1);
  });

  it('"Já registrei na Tecnofit": só o dono ou o líder, e fica no histórico', async () => {
    const pen = (await tasksOf('204'))[0]!;
    await prisma.crmCase.update({ where: { id: pen.caseId }, data: { ownerId: agent.principal.id } });
    await expect(markTaskDone(other.principal, { taskId: pen.id }, META)).rejects.toBeInstanceOf(AuthorizationError);
    await markTaskDone(agent.principal, { taskId: pen.id }, META);
    expect((await prisma.crmTask.findUniqueOrThrow({ where: { id: pen.id } })).doneVia).toBe('MANUAL');
    await expect(markTaskDone(agent.principal, { taskId: pen.id }, META)).rejects.toThrow(/já saiu/);
    expect(await prisma.auditLog.count({ where: { action: 'crm.task_done', entityId: pen.id } })).toBe(1);
  });

  it('resumo diário no WhatsApp: só contagens e link — nunca nome ou telefone de aluno', async () => {
    const day = addDays(day1, 7);
    const digests = await dailyDigests(day);
    const leader = digests.find((x) => x.userId === lider.principal.id)!;
    expect(leader.text).toMatch(/escalado/);
    const all = JSON.stringify(digests);
    expect(all).not.toMatch(/Aluno|Aluna|99111/);

    // A automação nasce desligada: nada sai.
    expect(await runDueAutomations(day, { audience: 'CRM_TAREFAS' })).toEqual({});
    await prisma.waAutomation.updateMany({ where: { audience: 'CRM_TAREFAS' }, data: { active: true } });
    const sent = Object.values(await runDueAutomations(day, { audience: 'CRM_TAREFAS' }))[0] as { enviados: number };
    expect(sent.enviados).toBeGreaterThanOrEqual(1);
    const msgs = await prisma.waMessage.findMany({ where: { kind: 'CRM' } });
    expect(msgs.length).toBe(sent.enviados);
    expect(msgs.every((m) => !/Aluno|Aluna|99111/.test(m.preview ?? ''))).toBe(true);
    // Uma vez por dia: o agendador das 8h não manda de novo.
    expect(Object.values(await runDueAutomations(day))).toContain('já enviada neste período');
  });

  it('se a Tecnofit recusar as ligações, a sincronização segue e registra o aviso', async () => {
    class NoCalls extends FakeTecnofit { override async calls(): Promise<never> { throw new Error('A Tecnofit respondeu 422 em /crm/calls.'); } }
    setFakeTecnofit(() => new NoCalls(data));
    const r = await runTecnofitSync(addDays(day1, 8), { force: true });
    expect(r.status).toBe('CONCLUIDA');
    expect(r.stats.warning).toMatch(/Ligações do CRM indisponíveis.*422/);
    setFakeTecnofit(() => new FakeTecnofit(data));
  });
});
