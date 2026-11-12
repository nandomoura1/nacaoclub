import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/server/db';
import { AuthorizationError } from '@/server/errors';
import { loadPrincipal } from '@/server/auth/principal';
import { addDays, toUtc } from '@/domain/dates';
import { todayIso } from '@/lib/today';
import { setFakeTecnofit } from '@/server/tecnofit/client';
import { FakeTecnofit, sampleData } from '@/server/tecnofit/fake';
import { runTecnofitSync } from '@/server/services/crm-sync-service';
import { assignCases, linkConsultant, listConsultants, listQueue, queueCounts, syncNow } from '@/server/services/crm-service';
import { META, ensureCatalog, hasDb, makeUser, wipeCrm } from './helpers';

/** Cobrança F1: Tecnofit (simulada) → débitos → casos → fila por consultor, com permissões e LGPD. */
describe.skipIf(!hasDb)('Cobrança e CRM — sincronização e fila', () => {
  const today = todayIso();
  const data = sampleData(today);
  let admin: Awaited<ReturnType<typeof makeUser>>;
  let lider: Awaited<ReturnType<typeof makeUser>>;
  let agent: Awaited<ReturnType<typeof makeUser>>;
  let agent2: Awaited<ReturnType<typeof makeUser>>;
  let outsider: Awaited<ReturnType<typeof makeUser>>;

  const caseOf = async (tecnofitId: string, kind = 'COBRANCA') =>
    prisma.crmCase.findFirst({ where: { kind, customer: { tecnofitId } }, orderBy: { createdAt: 'desc' } });

  beforeAll(async () => {
    await ensureCatalog();
    await wipeCrm();
    setFakeTecnofit(() => new FakeTecnofit(data));
    admin = await makeUser('ADMIN');
    lider = await makeUser('CRM_LIDER', { name: 'Líder CRM Teste' });
    agent = await makeUser('CRM', { name: 'Consultora Teste A' });
    agent2 = await makeUser('CRM', { name: 'Consultor Teste B' });
    outsider = await makeUser('MARKETING');
  });
  afterAll(async () => { setFakeTecnofit(null); await wipeCrm(); });

  it('primeira sincronização: abre cobrança (vencida e D-3), pendência na recepção e ignora o que vence longe', async () => {
    // Aluno antigo sem caso: sai do espelho (LGPD, 90 dias).
    await prisma.tecCustomer.create({ data: { tecnofitId: `old-${randomUUID().slice(0, 6)}`, name: 'Antigo', lastSeenOn: toUtc(addDays(today, -120)) } });

    const r = await runTecnofitSync(today);
    expect(r.status).toBe('CONCLUIDA');
    expect(r.stats.errors).toEqual([]);
    expect(r.stats.purged).toBe(1);

    expect((await caseOf('101'))?.status).toBe('ABERTO'); // vencida há 10 dias
    expect((await caseOf('102'))?.status).toBe('ABERTO'); // vence em 2 dias (D-3)
    expect((await caseOf('103'))?.status).toBe('ABERTO'); // bloqueado COM venda em atraso = cobrança
    expect(await caseOf('103', 'PENDENCIA')).toBeNull();
    expect((await caseOf('104', 'PENDENCIA'))?.status).toBe('ABERTO'); // restrito sem venda = pendência
    expect(await caseOf('105')).toBeNull(); // vence em 20 dias: fora

    const c102 = await prisma.tecCustomer.findUniqueOrThrow({ where: { tecnofitId: '102' } });
    expect(c102.mobile).toBe('61988880102'); // WhatsApp ganha do fixo
    // Sem consultor vinculado ainda: tudo "sem responsável".
    expect(await prisma.crmCase.count({ where: { status: 'ABERTO', ownerId: { not: null } } })).toBe(0);

    // Auditoria sem dado pessoal (só id Tecnofit).
    const mine = (await prisma.crmCase.findMany({ select: { id: true } })).map((c) => c.id);
    const logs = await prisma.auditLog.findMany({ where: { action: 'crm.case_opened', entityId: { in: mine } } });
    expect(logs.length).toBe(4);
    expect(logs.every((l) => !/Exemplo|9999|8888/.test(l.summary + JSON.stringify(l.after)))).toBe(true);
  });

  it('vincular consultor → os casos sem responsável dos alunos dele passam para o usuário', async () => {
    await expect(linkConsultant(lider.principal, {}, META)).rejects.toBeInstanceOf(AuthorizationError); // config é do admin
    const cons = await listConsultants(admin.principal);
    const a = cons.find((c) => c.tecnofitId === '9001')!;
    await expect(linkConsultant(admin.principal, { consultantId: a.id, userId: outsider.principal.id }, META)).rejects.toThrow(/time de CRM/);
    expect(await linkConsultant(admin.principal, { consultantId: a.id, userId: agent.principal.id }, META)).toBe(1); // aluno 101
    expect((await caseOf('101'))?.ownerId).toBe(agent.principal.id);
    const b = cons.find((c) => c.tecnofitId === '9002')!;
    await expect(linkConsultant(admin.principal, { consultantId: b.id, userId: agent.principal.id }, META)).rejects.toThrow(/já está vinculado/);
  });

  it('fila: consultor vê só a dele; líder vê todos e distribui; quem não é do CRM não vê nada', async () => {
    const mine = await listQueue(agent.principal, { view: 'minha' });
    expect(mine.map((r) => r.customer.tecnofitId)).toEqual(['101']);
    expect(mine[0]!.phone).toBe('(61) 99999-0101'); // perfil CRM tem crm.view_personal
    expect(mine[0]!.step).toMatch(/D\+7/);
    await expect(listQueue(agent.principal, { view: 'todos' })).rejects.toBeInstanceOf(AuthorizationError);
    await expect(listQueue(outsider.principal, { view: 'minha' })).rejects.toBeInstanceOf(AuthorizationError);

    const sem = await listQueue(lider.principal, { view: 'sem' });
    expect(sem.map((r) => r.customer.tecnofitId).sort()).toEqual(['102', '103', '104']);
    // Mais atrasado e maior valor primeiro; pendência no fim.
    expect(sem[0]!.customer.tecnofitId).toBe('103');
    expect(sem.at(-1)!.kind).toBe('PENDENCIA');

    await expect(assignCases(agent.principal, { caseIds: [sem[0]!.id], ownerId: agent.principal.id }, META)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(assignCases(lider.principal, { caseIds: [sem[0]!.id], ownerId: outsider.principal.id }, META)).rejects.toThrow(/time de CRM/);
    expect(await assignCases(lider.principal, { caseIds: sem.map((r) => r.id), ownerId: agent2.principal.id }, META)).toBe(3);
    expect((await queueCounts(agent2.principal)).minha).toBe(3);
    expect(await prisma.auditLog.count({ where: { action: 'crm.case_assigned', actorId: lider.principal.id } })).toBe(3);
  });

  it('sem crm.view_personal o celular sai mascarado do servidor', async () => {
    const perm = await prisma.permission.findUniqueOrThrow({ where: { key: 'crm.view' } });
    const role = await prisma.role.create({ data: { key: `CRM_VIEW_${randomUUID().slice(0, 6)}`, name: 'Só ver fila', permissions: { create: { permissionId: perm.id } } } });
    await prisma.userRole.create({ data: { userId: agent.principal.id, roleId: role.id } });
    const crm = await prisma.role.findUniqueOrThrow({ where: { key: 'CRM' } });
    await prisma.userRole.delete({ where: { userId_roleId: { userId: agent.principal.id, roleId: crm.id } } });
    const p = (await loadPrincipal(prisma, agent.principal.id))!;
    const rows = await listQueue(p, { view: 'minha' });
    expect(rows[0]!.phone).toBe('(61) 9••••-0101');
    expect(JSON.stringify(rows)).not.toContain('99999-0101');
    expect(JSON.stringify(rows)).not.toContain('61999990101');
    await prisma.userRole.create({ data: { userId: agent.principal.id, roleId: crm.id } });
  });

  it('pagamento total resolve o caso; parcial abate; rodar de novo no mesmo dia não duplica', async () => {
    data.customers.find((c) => c.id === '101')!.sales[0]!.openValue = 0;
    data.customers.find((c) => c.id === '103')!.sales[0]!.openValue = 50;
    // Aluno 104 regularizou o cadastro na recepção.
    data.customers.find((c) => c.id === '104')!.status = 'active';

    // Orçamento zero: prepara e não processa ninguém; a chamada seguinte continua de onde parou.
    const part = await runTecnofitSync(today, { force: true, budgetMs: 0 });
    expect(part.status).toBe('RODANDO');
    expect(part.remaining).toBeGreaterThan(0);
    const r = await runTecnofitSync(today);
    expect(r.status).toBe('CONCLUIDA');

    const c101 = await caseOf('101');
    expect(c101?.status).toBe('RESOLVIDO');
    expect(Number(c101?.recoveredValue)).toBeCloseTo(289.9);
    expect((await prisma.tecDebt.findUniqueOrThrow({ where: { tecnofitSaleId: '5001' } })).status).toBe('QUITADO');

    const c103 = await caseOf('103');
    expect(c103?.status).toBe('ABERTO');
    expect(Number(c103?.openValue)).toBe(50);
    expect(Number(c103?.originalValue)).toBe(150);
    expect(Number(c103?.recoveredValue)).toBe(100);
    expect(c103?.ownerId).toBe(agent2.principal.id); // responsável é fixo até fechar

    expect((await caseOf('104', 'PENDENCIA'))?.status).toBe('RESOLVIDO');

    await runTecnofitSync(today, { force: true });
    expect(await prisma.crmCase.count({ where: { status: 'ABERTO' } })).toBe(2); // 102 e 103
    expect(Number((await caseOf('103'))?.recoveredValue)).toBe(100);
  });

  it('o banco impede dois casos abertos do mesmo tipo para o mesmo aluno', async () => {
    const c = await caseOf('102');
    await expect(prisma.crmCase.create({ data: { customerId: c!.customerId, kind: 'COBRANCA', openedOn: toUtc(today) } })).rejects.toThrow();
  });

  it('"Sincronizar agora" é só do admin e fica no histórico', async () => {
    await expect(syncNow(lider.principal, {}, META)).rejects.toBeInstanceOf(AuthorizationError);
    const r = await syncNow(admin.principal, {}, META);
    expect(r.status).toBe('CONCLUIDA');
    expect(await prisma.auditLog.count({ where: { action: 'crm.sync_manual', actorId: admin.principal.id } })).toBe(1);
  });

  it('rodada de um dia anterior que ficou pela metade é encerrada quando começa a de hoje', async () => {
    const stale = await prisma.tecSyncRun.create({ data: { day: toUtc(addDays(today, -1)), status: 'RODANDO', mode: 'SIMULADO', pending: ['999'] } });
    await runTecnofitSync(today, { force: true });
    expect((await prisma.tecSyncRun.findUniqueOrThrow({ where: { id: stale.id } })).status).toBe('INTERROMPIDA');
  });
});

