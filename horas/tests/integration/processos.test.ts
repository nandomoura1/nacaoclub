import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/server/db';
import { AuthorizationError } from '@/server/errors';
import { addDemandComment, demandComments, deleteDemand, listDemands, myOpenDemands, procPanel, saveDemand, saveSector, setDemandStatus } from '@/server/services/proc-service';
import { META, ensureCatalog, hasDb, makeUser } from './helpers';

describe.skipIf(!hasDb)('Gestão de Processos', () => {
  const today = '2026-10-13';
  let admin: Awaited<ReturnType<typeof makeUser>>;
  let lider: Awaited<ReturnType<typeof makeUser>>;
  let outro: Awaited<ReturnType<typeof makeUser>>;
  let mkt: Awaited<ReturnType<typeof makeUser>>;
  let sectorA: string; let sectorB: string;

  beforeAll(async () => {
    await ensureCatalog();
    admin = await makeUser('ADMIN', { name: 'Diretoria' });
    lider = await makeUser('LIDER', { name: 'Líder Lanchonete' });
    outro = await makeUser('LIDER', { name: 'Líder Kids' });
    mkt = await makeUser('MARKETING');
    const tag = Math.random().toString(36).slice(2, 7);
    sectorA = await saveSector(admin.principal, null, { name: `Lanchonete ${tag}`, description: null, leaderId: lider.principal.id, taskUrl: null, sortOrder: 90, active: true }, META);
    sectorB = await saveSector(admin.principal, null, { name: `Kids ${tag}`, description: null, leaderId: outro.principal.id, taskUrl: 'https://nacao-task-7f33b.web.app/kids', sortOrder: 91, active: true }, META);
  });

  it('setores: só diretoria cadastra; link do Nação Task precisa ser https; nome único', async () => {
    await expect(saveSector(lider.principal, null, { name: 'X', description: null, leaderId: null, taskUrl: null, sortOrder: 1, active: true }, META)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(saveSector(admin.principal, null, { name: 'Setor Y', description: null, leaderId: null, taskUrl: 'http://x', sortOrder: 1, active: true }, META)).rejects.toThrow(/https/);
    const name = (await prisma.procSector.findUniqueOrThrow({ where: { id: sectorA } })).name;
    await expect(saveSector(admin.principal, null, { name: name.toUpperCase(), description: null, leaderId: null, taskUrl: null, sortOrder: 1, active: true }, META)).rejects.toThrow(/Já existe/);
    expect(await prisma.procSector.count({ where: { name: 'Esportes e modalidades' } })).toBe(1); // setores iniciais da migration
  });

  it('demandas: diretoria cobra qualquer setor; líder abre e atualiza só no seu; escopo de visão', async () => {
    const d1 = await saveDemand(admin.principal, null, { sectorId: sectorA, title: 'Inventário do freezer', description: null, ownerId: null, dueDate: '2026-10-10', priority: 'ALTA' }, META);
    const created = await prisma.procDemand.findUniqueOrThrow({ where: { id: d1 } });
    expect([created.ownerId, created.origin, created.requesterId]).toEqual([lider.principal.id, 'DIRETORIA', admin.principal.id]); // sem responsável = líder
    await saveDemand(admin.principal, null, { sectorId: sectorB, title: 'Decoração do Dia das Crianças', description: null, ownerId: null, dueDate: '2026-10-20', priority: 'MEDIA' }, META);

    await expect(saveDemand(lider.principal, null, { sectorId: sectorB, title: 'Invadindo outro setor', description: null, ownerId: null, dueDate: null, priority: 'BAIXA' }, META)).rejects.toBeInstanceOf(AuthorizationError);
    const d3 = await saveDemand(lider.principal, null, { sectorId: sectorA, title: 'Trocar fornecedor de pão', description: null, ownerId: null, dueDate: null, priority: 'BAIXA' }, META);
    expect((await prisma.procDemand.findUniqueOrThrow({ where: { id: d3 } })).origin).toBe('LIDER');

    const mine = await listDemands(lider.principal, today);
    expect(mine.map((d) => d.title)).toEqual(['Inventário do freezer', 'Trocar fornecedor de pão']); // atrasada primeiro; nada do Kids
    expect(mine[0]!.late).toBe(true);
    expect((await listDemands(admin.principal, today, { sectorId: sectorB })).length).toBe(1);
    await expect(listDemands(mkt.principal, today)).rejects.toBeInstanceOf(AuthorizationError);

    // Status: o líder do outro setor não mexe; o dono conclui (doneAt), reabrir limpa.
    const kids = (await listDemands(admin.principal, today, { sectorId: sectorB }))[0]!;
    await expect(setDemandStatus(lider.principal, kids.id, 'CONCLUIDA', META)).rejects.toBeInstanceOf(AuthorizationError);
    await setDemandStatus(lider.principal, d1, 'CONCLUIDA', META);
    expect((await prisma.procDemand.findUniqueOrThrow({ where: { id: d1 } })).doneAt).not.toBeNull();
    await setDemandStatus(lider.principal, d1, 'EM_ANDAMENTO', META);
    expect((await prisma.procDemand.findUniqueOrThrow({ where: { id: d1 } })).doneAt).toBeNull();

    // Comentários: quem enxerga comenta; quem não enxerga, não.
    await addDemandComment(lider.principal, d1, 'Freezer 2 com defeito, aguardando técnico.', META);
    await expect(addDemandComment(outro.principal, d1, 'oi', META)).rejects.toThrow(/não encontrada/);
    expect((await demandComments(admin.principal, d1)).map((c) => c.author)).toEqual(['Líder Lanchonete']);

    // Painel e Hoje.
    const panel = await procPanel(lider.principal, today);
    expect(panel.sectors.map((s) => s.id)).toEqual([sectorA]);
    expect(panel.sectors[0]!.stats).toMatchObject({ open: 2, late: 1, health: 'amarelo' });
    const hoje = await myOpenDemands(lider.principal, today);
    expect([hoje?.mode, hoje?.items[0]?.title]).toEqual(['minhas', 'Inventário do freezer']);
    expect((await myOpenDemands(admin.principal, today))?.mode).toBe('atrasadas');
    expect(await myOpenDemands(mkt.principal, today)).toBeNull();

    // Excluir é só da diretoria; tudo auditado.
    await expect(deleteDemand(lider.principal, d3, META)).rejects.toBeInstanceOf(AuthorizationError);
    await deleteDemand(admin.principal, d3, META);
    expect(await prisma.auditLog.count({ where: { entityId: d1, action: { startsWith: 'proc.' } } })).toBe(4);
  });
});
