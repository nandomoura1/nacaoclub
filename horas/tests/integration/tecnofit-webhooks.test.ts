import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/server/db';
import { AuthorizationError } from '@/server/errors';
import { addDays } from '@/domain/dates';
import { todayIso } from '@/lib/today';
import { setFakeTecnofit } from '@/server/tecnofit/client';
import { FakeTecnofit, type FakeData } from '@/server/tecnofit/fake';
import { runTecnofitSync } from '@/server/services/crm-sync-service';
import { processEvent, processPending, registerWebhook, storeEvent } from '@/server/services/tecnofit-webhook-service';
import { META, ensureCatalog, hasDb, makeUser, wipeCrm } from './helpers';

/** Avisos da Tecnofit (webhooks) e renovações: pagou/ligou/renovou fecha na hora; contrato terminando vira tarefa. */
describe.skipIf(!hasDb)('Tecnofit — webhooks e renovações', () => {
  const today = todayIso();
  const R = 'https://integracao.tecnofit.com.br/v1';
  const data: FakeData = {
    consultants: [], calls: [],
    customers: [
      { id: '401', name: 'Aluno Aviso Um', status: 'active', contacts: [{ contact: '(61) 99222-0401', type: 'WHATSAPP' }], sales: [{ id: '7401', totalValue: 250, openValue: 250, saleDate: addDays(today, -40), dueDate: addDays(today, -6), items: [{ name: 'Plano' }] }] },
      { id: '402', name: 'Aluna Renova Dois', status: 'active', contacts: [], sales: [] },
      { id: '403', name: 'Aluno Renovado Três', status: 'active', contacts: [], sales: [] },
    ],
    active: ['401', '402', '403'],
    contracts: {
      '402': [{ id: 'c402', name: 'Plano Semestral', startDate: addDays(today, -160), dueDate: addDays(today, 20), status: 'active' }],
      // 403 termina em 10 dias, mas já tem o contrato seguinte (renovou antes): não vira tarefa.
      '403': [
        { id: 'c403', name: 'Plano Anual', startDate: addDays(today, -355), dueDate: addDays(today, 10), status: 'active' },
        { id: 'c403b', name: 'Plano Anual', startDate: addDays(today, 11), dueDate: addDays(today, 375), status: 'waitingStart' },
      ],
    },
    resources: {},
  };
  let admin: Awaited<ReturnType<typeof makeUser>>;
  let lider: Awaited<ReturnType<typeof makeUser>>;
  const tasksOf = (tecnofitId: string) => prisma.crmTask.findMany({ where: { customer: { tecnofitId } }, orderBy: { createdAt: 'asc' } });
  const fire = async (id: string, event: string, url: string, resource: Record<string, unknown>) => {
    data.resources![url] = resource;
    expect(await storeEvent(id, event, url)).toBe(true);
    return processEvent(id, today);
  };

  beforeAll(async () => {
    await ensureCatalog();
    await wipeCrm();
    await prisma.tecContractCheck.deleteMany({});
    await prisma.tecWebhookEvent.deleteMany({});
    setFakeTecnofit(() => new FakeTecnofit(data));
    admin = await makeUser('ADMIN'); lider = await makeUser('CRM_LIDER');
  });
  afterAll(async () => { setFakeTecnofit(null); await wipeCrm(); await prisma.tecContractCheck.deleteMany({}); });

  it('sincronização: cobrança + varredura de renovações (só quem termina em 30 dias e não renovou)', async () => {
    const r = await runTecnofitSync(today, { force: true });
    expect(r.status).toBe('CONCLUIDA');
    expect(r.stats.renewalsChecked).toBe(3);
    expect((await tasksOf('402')).map((t) => [t.kind, t.title, t.status])).toEqual([['RENOVACAO', 'Plano Semestral', 'ABERTA']]);
    expect(await tasksOf('403')).toEqual([]);
    expect((await prisma.tecContract.findUniqueOrThrow({ where: { tecnofitId: 'c403' } })).renewed).toBe(true);
    // Aluno ativo sem contrato terminando não entra no espelho (só o id na fila da varredura).
    expect(await prisma.tecCustomer.count({ where: { tecnofitId: { in: ['402', '403'] } } })).toBe(2);
    expect(await prisma.tecContractCheck.count({ where: { checkedOn: { not: null } } })).toBe(3);
    expect((await tasksOf('401')).map((t) => t.kind)).toEqual(['D+5']);
  });

  it('payment.received: pagou → caso resolvido e tarefa fechada na hora (sem esperar a madrugada)', async () => {
    data.customers.find((c) => c.id === '401')!.sales[0]!.openValue = 0;
    expect(await fire('wh-1', 'payment.received', `${R}/financial/receivables/9001`, { id: 9001, customer: { id: 401, name: 'Aluno Aviso Um' } })).toBe('PROCESSADO');
    expect((await prisma.crmCase.findFirstOrThrow({ where: { customer: { tecnofitId: '401' }, kind: 'COBRANCA' } })).status).toBe('RESOLVIDO');
    expect((await tasksOf('401'))[0]!.doneVia).toBe('PAGAMENTO');
  });

  it('o mesmo aviso reenviado não é processado de novo', async () => {
    expect(await storeEvent('wh-1', 'payment.received', `${R}/financial/receivables/9001`)).toBe(false);
  });

  it('call.completed: a ligação registrada na Tecnofit dá baixa na tarefa na hora', async () => {
    expect(await fire('wh-2', 'call.completed', `${R}/crm/calls/55`, { id: 55, status: 'completed', callDate: `${today} 10:00:00`, customer: { id: 402 } })).toBe('PROCESSADO');
    const t = (await tasksOf('402'))[0]!;
    expect([t.status, t.doneVia]).toEqual(['FEITA', 'LIGACAO_TECNOFIT']);
  });

  it('contract.created: renovou → tarefa de renovação fecha como "renovou"', async () => {
    // Nova tarefa de renovação para outro aluno, que renova em seguida.
    data.customers.push({ id: '404', name: 'Aluno Renova Quatro', status: 'active', contacts: [], sales: [] });
    data.contracts!['404'] = [{ id: 'c404', name: 'Plano Mensal', startDate: addDays(today, -25), dueDate: addDays(today, 5), status: 'active' }];
    expect(await fire('wh-3', 'contract.updated', `${R}/customers/404/contracts`, { id: 'c404', customer: { id: 404 } })).toBe('PROCESSADO');
    expect((await tasksOf('404')).map((t) => [t.kind, t.status])).toEqual([['RENOVACAO', 'ABERTA']]);
    data.contracts!['404']!.push({ id: 'c404b', name: 'Plano Mensal', startDate: addDays(today, 6), dueDate: addDays(today, 36), status: 'waitingStart' });
    expect(await fire('wh-4', 'contract.created', `${R}/contracts/c404b`, { id: 'c404b', customer: { id: 404 } })).toBe('PROCESSADO');
    const t = (await tasksOf('404'))[0]!;
    expect([t.status, t.doneVia]).toEqual(['FEITA', 'RENOVOU']);
  });

  it('attendance.created: check-in vai para a TV (só "Nome I." como rótulo)', async () => {
    expect(await fire('wh-5', 'attendance.created', `${R}/attendances/88`, { type: 'crossfit', customer: { id: 9301, name: 'MARIA CLARA DOS SANTOS' }, class: { id: 77, name: 'CrossFit', start: `${today} 07:00:00` }, checkin: { createdAt: `${today} 06:55:00` } })).toBe('PROCESSADO');
    const c = await prisma.tvCheckin.findFirstOrThrow({ where: { customerTecId: '9301' } });
    expect([c.label, c.start, c.tecnofitClassId]).toEqual(['Maria S.', '07:00', '77']);
  });

  it('aviso de aluno que não acompanhamos não cria cadastro; evento desconhecido é ignorado', async () => {
    expect(await fire('wh-6', 'payment.received', `${R}/financial/receivables/1`, { id: 1, customer: { id: 99999 } })).toBe('PROCESSADO');
    expect(await prisma.tecCustomer.count({ where: { tecnofitId: '99999' } })).toBe(0);
    await storeEvent('wh-7', 'company.profile.updated', null);
    expect(await processEvent('wh-7', today)).toBe('IGNORADO');
  });

  it('aviso que ficou sem processar é retomado; cadastro do webhook é só do admin de CRM', async () => {
    await storeEvent('wh-8', 'customer.status_changed', `${R}/customers/402`);
    data.resources![`${R}/customers/402`] = { id: 402, status: 'active' };
    await prisma.tecWebhookEvent.update({ where: { id: 'wh-8' }, data: { receivedAt: new Date(Date.now() - 5 * 60_000) } });
    expect(await processPending(today)).toBe(1);
    expect((await prisma.tecWebhookEvent.findUniqueOrThrow({ where: { id: 'wh-8' } })).status).toBe('PROCESSADO');
    await expect(registerWebhook(lider.principal, 'https://x.example', META)).rejects.toBeInstanceOf(AuthorizationError);
    expect(admin).toBeTruthy();
  });
});
