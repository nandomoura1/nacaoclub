import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/server/db';
import { AuthorizationError } from '@/server/errors';
import { addDays } from '@/domain/dates';
import { todayIso } from '@/lib/today';
import { setFakeTecnofit } from '@/server/tecnofit/client';
import { FakeTecnofit, type FakeData } from '@/server/tecnofit/fake';
import { runTecnofitSync } from '@/server/services/crm-sync-service';
import { assignCases, linkConsultant, listConsultants, setCrmLeader } from '@/server/services/crm-service';
import { META, ensureCatalog, hasDb, makeUser, wipeCrm } from './helpers';

/**
 * Responsável (decisão 21/11): consultor do CADASTRO do aluno na Tecnofit (sem ligação de CRM nem vendedor na venda,
 * como a API devolve hoje); cobrança com mais de 30 dias de atraso = Líder Comercial; redistribuído à mão não volta.
 */
describe.skipIf(!hasDb)('Cobrança e CRM — responsável pelo consultor do cadastro', () => {
  const today = todayIso();
  const sale = (id: string, due: string, open: number) => ({ id, totalValue: open, openValue: open, saleDate: addDays(due, -30), dueDate: due, saleStatus: 'overdue', items: [{ name: 'Plano Mensal' }] });
  const data: FakeData = {
    consultants: [{ id: '7001', name: 'DEBORA EXEMPLO', types: ['consultant'] }, { id: '7002', name: 'IGOR EXEMPLO', types: ['consultant'] }],
    calls: [], // a Tecnofit não devolve ligações
    customers: [
      // Débito de 10 dias, consultora do cadastro = Débora (venda SEM vendedor).
      { id: '801', name: 'Aluna Recente', status: 'active', consultant: { id: '7001', name: 'DEBORA EXEMPLO' }, contacts: [], sales: [sale('8801', addDays(today, -10), 199)] },
      // Débito de 45 dias, consultor do cadastro = Igor → vai para o Líder Comercial.
      { id: '802', name: 'Aluno Antigo', status: 'active', consultant: { id: '7002', name: 'IGOR EXEMPLO' }, contacts: [], sales: [sale('8802', addDays(today, -45), 289.9)] },
      // Restrito sem venda: pendência da consultora do cadastro.
      { id: '803', name: 'Aluno Restrito', status: 'restricted', consultant: { id: '7001', name: 'DEBORA EXEMPLO' }, contacts: [], sales: [] },
    ],
  };
  let admin: Awaited<ReturnType<typeof makeUser>>;
  let leader: Awaited<ReturnType<typeof makeUser>>;
  let debora: Awaited<ReturnType<typeof makeUser>>;
  let igor: Awaited<ReturnType<typeof makeUser>>;
  let agent: Awaited<ReturnType<typeof makeUser>>;
  const caseOf = (tecnofitId: string, kind = 'COBRANCA') => prisma.crmCase.findFirstOrThrow({ where: { kind, status: 'ABERTO', customer: { tecnofitId } } });

  beforeAll(async () => {
    await ensureCatalog();
    await wipeCrm();
    await prisma.appSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: { crmLeaderUserId: null } });
    setFakeTecnofit(() => new FakeTecnofit(data));
    admin = await makeUser('ADMIN');
    leader = await makeUser('CRM_LIDER', { name: 'Líder Comercial Teste' });
    debora = await makeUser('CRM', { name: 'Débora Teste' });
    igor = await makeUser('CRM', { name: 'Igor Teste' });
    agent = await makeUser('CRM', { name: 'Outra Consultora' });
  });
  afterAll(async () => {
    setFakeTecnofit(null);
    await wipeCrm();
    await prisma.appSettings.update({ where: { id: 1 }, data: { crmLeaderUserId: null } });
  });

  it('lê o consultor do cadastro; >30 dias vai para o Líder Comercial; redistribuição manual é respeitada', async () => {
    await expect(setCrmLeader(agent.principal, leader.principal.id, META)).rejects.toBeInstanceOf(AuthorizationError);
    await setCrmLeader(admin.principal, leader.principal.id, META);

    // 1ª rodada: consultores ainda sem vínculo → sem responsável, exceto o de 45 dias (Líder Comercial).
    let r = await runTecnofitSync(today);
    expect(r.status).toBe('CONCLUIDA');
    expect(r.stats).toMatchObject({ customersRead: 3, customersWithConsultant: 3 });
    expect((await prisma.tecCustomer.findUniqueOrThrow({ where: { tecnofitId: '801' } })).consultantTecId).toBe('7001');
    expect((await caseOf('801')).ownerId).toBeNull();
    expect((await caseOf('802')).ownerId).toBe(leader.principal.id);

    // Vincula Débora e Igor (Configurações): os casos até 30 dias vão para a consultora do cadastro.
    const cons = await listConsultants(admin.principal);
    await linkConsultant(admin.principal, { consultantId: cons.find((c) => c.tecnofitId === '7001')!.id, userId: debora.principal.id }, META);
    await linkConsultant(admin.principal, { consultantId: cons.find((c) => c.tecnofitId === '7002')!.id, userId: igor.principal.id }, META);
    expect((await caseOf('801')).ownerId).toBe(debora.principal.id);
    expect((await caseOf('803', 'PENDENCIA')).ownerId).toBe(debora.principal.id);
    expect((await caseOf('802')).ownerId).toBe(leader.principal.id); // segue com o líder

    // Consultor trocado na Tecnofit (cadastro relido): o caso segue o novo consultor.
    data.customers[0]!.consultant = { id: '7002', name: 'IGOR EXEMPLO' };
    await prisma.tecCustomer.update({ where: { tecnofitId: '801' }, data: { consultantCheckedOn: null } });
    r = await runTecnofitSync(today, { force: true });
    expect(r.status).toBe('CONCLUIDA');
    expect((await caseOf('801')).ownerId).toBe(igor.principal.id);

    // Líder redistribui à mão: a sincronização não desfaz.
    const c801 = await caseOf('801');
    await assignCases(leader.principal, { caseIds: [c801.id], ownerId: agent.principal.id }, META);
    await prisma.tecCustomer.update({ where: { tecnofitId: '801' }, data: { consultantCheckedOn: null } });
    await runTecnofitSync(today, { force: true });
    expect((await caseOf('801')).ownerId).toBe(agent.principal.id);
    expect(await prisma.auditLog.count({ where: { action: 'crm.case_reassigned' } })).toBeGreaterThanOrEqual(1); // Débora → Igor (o de 45 dias já nasce com o líder)
  });
});
