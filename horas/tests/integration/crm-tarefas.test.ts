import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/server/db';
import { AuthorizationError } from '@/server/errors';
import { addDays } from '@/domain/dates';
import { todayIso } from '@/lib/today';
import { setFakeTecnofit } from '@/server/tecnofit/client';
import { FakeTecnofit, type FakeData } from '@/server/tecnofit/fake';
import { runTecnofitSync } from '@/server/services/crm-sync-service';
import { assignCases, linkConsultant, listConsultants } from '@/server/services/crm-service';
import { createManualTask, dailyDigests, generateTasks, listTasks, markTaskDone, removeTask, saveAgentRule, snoozeTask, taskCounts } from '@/server/services/crm-task-service';
import { runDueAutomations, sendCrmDigests } from '@/server/whatsapp/automations';
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
  let outsiderId: string;
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
    outsiderId = (await makeUser('MARKETING')).principal.id;
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
    expect(mine.map((t) => t.customer!.tecnofitId).sort()).toEqual(['201', '202']);
    expect(mine.find((t) => t.kind === 'D-3')!.todo).toMatch(/vence em \d{2}\/\d{2}\/\d{4}/);
    await expect(listTasks(agent.principal, 'todas')).rejects.toBeInstanceOf(AuthorizationError);
    expect((await taskCounts(lider.principal)).escalados).toBe(1);
    expect((await listTasks(lider.principal, 'sem')).map((t) => t.customer!.tecnofitId).sort()).toEqual(['203', '204']);
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
    await assignCases(lider.principal, { caseIds: [pen.caseId!], ownerId: agent.principal.id }, META); // a tarefa vai junto
    await expect(markTaskDone(other.principal, { taskId: pen.id }, META)).rejects.toBeInstanceOf(AuthorizationError);
    await markTaskDone(agent.principal, { taskId: pen.id }, META);
    expect((await prisma.crmTask.findUniqueOrThrow({ where: { id: pen.id } })).doneVia).toBe('MANUAL');
    await expect(markTaskDone(agent.principal, { taskId: pen.id }, META)).rejects.toThrow(/já saiu/);
    expect(await prisma.auditLog.count({ where: { action: 'crm.task_done', entityId: pen.id } })).toBe(1);
  });

  it('regras do líder: consultor só recebe os tipos marcados; o resto fica em "Fora das regras" com o líder', async () => {
    const day = addDays(day1, 7);
    // Uma tarefa de cobrança nova para a consultora (aluno 201 com novo vencimento em 2 dias → D-3).
    const c201 = data.customers.find((c) => c.id === '201')!;
    c201.sales[0]!.openValue = 0; // pagou a venda antiga
    c201.sales.push(sale('6211', addDays(day, 2), 210));
    await runTecnofitSync(day, { force: true });
    const caso = await prisma.crmCase.findFirstOrThrow({ where: { status: 'ABERTO', customer: { tecnofitId: '201' } } });
    await assignCases(lider.principal, { caseIds: [caso.id], ownerId: agent.principal.id }, META);
    await expect(saveAgentRule(agent.principal, { userId: agent.principal.id, taskKinds: [], sendHour: 8, sendDays: [1] }, META)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(saveAgentRule(lider.principal, { userId: agent.principal.id, taskKinds: [], sendHour: 8, sendDays: [1] }, META)).rejects.toThrow(/ao menos um tipo/);
    await expect(saveAgentRule(lider.principal, { userId: agent.principal.id, taskKinds: ['D+3'], sendHour: 5, sendDays: [1] }, META)).rejects.toThrow(/6h às 14h/);
    await saveAgentRule(lider.principal, { userId: agent.principal.id, taskKinds: ['D+3', 'D+5', 'D+7', 'RETORNO'], sendHour: 10, sendDays: [1, 2, 3, 4, 5, 6, 7] }, META);
    expect((await listTasks(agent.principal, 'minhas')).some((t) => t.kind === 'D-3')).toBe(false);
    // A tarefa é do dia simulado (futuro): o líder a vê em "Agendadas", marcada como fora das regras.
    const held = await listTasks(lider.principal, 'agendadas');
    expect(held.some((t) => t.kind === 'D-3' && t.ownerId === agent.principal.id && t.held)).toBe(true);
    expect(JSON.stringify(await dailyDigests(day, { hour: 10 }))).not.toMatch(/lembrete/); // fora das regras não vai no WhatsApp
    expect(await prisma.auditLog.count({ where: { action: 'crm.agent_rule', entityId: agent.principal.id } })).toBe(1);
  });

  it('líder adia e tira tarefa da lista (com motivo); tirada não volta a ser gerada', async () => {
    const day = addDays(day1, 7);
    const [t] = await listTasks(lider.principal, 'escalados');
    await expect(snoozeTask(agent.principal, { taskId: t!.id, until: addDays(day, 2) }, META)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(snoozeTask(lider.principal, { taskId: t!.id, until: todayIso() }, META)).rejects.toThrow(/a partir de amanhã/);
    await snoozeTask(lider.principal, { taskId: t!.id, until: addDays(todayIso(), 3) }, META);
    expect((await listTasks(lider.principal, 'escalados')).some((x) => x.id === t!.id)).toBe(false);
    expect((await listTasks(lider.principal, 'agendadas')).some((x) => x.id === t!.id)).toBe(true);
    await expect(removeTask(lider.principal, { taskId: t!.id, reason: 'x' }, META)).rejects.toThrow(/motivo/);
    await removeTask(lider.principal, { taskId: t!.id, reason: 'Gerência já negociou com o aluno' }, META);
    expect((await prisma.crmTask.findUniqueOrThrow({ where: { id: t!.id } })).status).toBe('REMOVIDA');
    expect((await generateTasks(day)).created).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: { in: ['crm.task_snoozed', 'crm.task_removed'] }, entityId: t!.id } })).toBe(2);
  });

  it('tarefa manual do líder: entra no dia escolhido; com aluno, a ligação na Tecnofit dá baixa', async () => {
    const day = addDays(todayIso(), 1);
    const aluno = await prisma.tecCustomer.findUniqueOrThrow({ where: { tecnofitId: '203' } });
    await expect(createManualTask(agent.principal, { ownerId: agent.principal.id, showFrom: day, title: 'Ligar' }, META)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(createManualTask(lider.principal, { ownerId: outsiderId, showFrom: day, title: 'Ligar' }, META)).rejects.toThrow(/time de CRM/);
    const semAluno = await createManualTask(lider.principal, { ownerId: agent.principal.id, showFrom: day, title: 'Atualizar o funil da Tecnofit', note: 'Coluna "Negociação"' }, META);
    const comAluno = await createManualTask(lider.principal, { ownerId: agent.principal.id, showFrom: day, title: 'Oferecer plano anual', customerId: aluno.id }, META);
    // Ainda não aparece hoje (é para amanhã), nem com regra que exclui tipos.
    expect((await listTasks(agent.principal, 'minhas')).some((t) => t.manual)).toBe(false);
    expect((await listTasks(lider.principal, 'agendadas')).filter((t) => t.manual)).toHaveLength(2);
    // Amanhã: a ligação concluída para o aluno dá baixa só na que tem aluno.
    data.calls.push({ customerId: '203', consultantId: '7001', consultantName: 'Consultora Tarefas', at: day, done: true, deadline: day, doneAt: day });
    await runTecnofitSync(day, { force: true });
    expect((await prisma.crmTask.findUniqueOrThrow({ where: { id: comAluno } })).doneVia).toBe('LIGACAO_TECNOFIT');
    expect((await prisma.crmTask.findUniqueOrThrow({ where: { id: semAluno } })).status).toBe('ABERTA');
  });

  it('WhatsApp no horário de cada consultor: só contagens e link, uma vez por dia, só se a automação estiver ligada', async () => {
    const day = addDays(todayIso(), 1); // a tarefa manual sem aluno aparece neste dia
    await saveAgentRule(lider.principal, { userId: lider.principal.id, taskKinds: ['D+15', 'PENDENCIA'], sendHour: 8, sendDays: [1, 2, 3, 4, 5, 6, 7] }, META);
    const at10 = await dailyDigests(day, { hour: 10 });
    expect(at10.map((x) => x.userId)).toEqual([agent.principal.id]); // consultora às 10h
    expect(at10[0]!.text).toMatch(/tarefa\(s\) do líder/);
    expect((await dailyDigests(day, { hour: 8 })).some((x) => x.userId === agent.principal.id)).toBe(false);
    expect(JSON.stringify(await dailyDigests(day, { hour: null }))).not.toMatch(/Aluno|Aluna|99111|funil/);

    // A automação nasce desligada: nada sai.
    expect(await sendCrmDigests(day, 10)).toMatchObject({ pulado: expect.stringMatching(/desligada/) });
    await prisma.waAutomation.updateMany({ where: { audience: 'CRM_TAREFAS' }, data: { active: true } });
    expect(await sendCrmDigests(day, 10)).toMatchObject({ enviados: 1 });
    expect(await sendCrmDigests(day, 10)).toMatchObject({ total: 0 }); // não repete no dia
    const msgs = await prisma.waMessage.findMany({ where: { kind: 'CRM' } });
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.toMasked).toContain('7777');
    expect(msgs.every((m) => !/Aluno|Aluna|99111/.test(m.preview ?? ''))).toBe(true);
    // O agendador das 8h não manda tarefas de CRM (têm horário próprio).
    expect(Object.keys(await runDueAutomations(day)).some((k) => /Tarefas de CRM/.test(k))).toBe(false);
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
