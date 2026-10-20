import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/server/db';
import { AuthorizationError } from '@/server/errors';
import { saveAreaOwners } from '@/server/services/marketing-service';
import { deleteColumn, saveColumn } from '@/server/services/mkt-board-service';
import { board, moveTask, saveTask } from '@/server/services/mkt-task-service';
import { META, ensureCatalog, hasDb, makeUser } from './helpers';

/** Corresponsáveis por área/tarefa e colunas editáveis do Kanban. */
describe.skipIf(!hasDb)('Marketing — corresponsáveis e colunas do Kanban', () => {
  const tag = randomUUID().slice(0, 5);
  let admin: Awaited<ReturnType<typeof makeUser>>;
  let ana: Awaited<ReturnType<typeof makeUser>>;
  let bia: Awaited<ReturnType<typeof makeUser>>;
  let caio: Awaited<ReturnType<typeof makeUser>>;
  beforeAll(async () => {
    await ensureCatalog();
    admin = await makeUser('ADMIN'); ana = await makeUser('MARKETING'); bia = await makeUser('MARKETING'); caio = await makeUser('MARKETING');
  });

  it('área com vários responsáveis: tarefa nova já nasce com todos; filtro acha corresponsável', async () => {
    const area = await prisma.mktArea.findUniqueOrThrow({ where: { key: 'CONTEUDO' } });
    const before = { defaultUserId: area.defaultUserId, coOwnerIds: area.coOwnerIds };
    await expect(saveAreaOwners(ana.principal, area.id, ana.principal.id, [], META)).rejects.toBeInstanceOf(AuthorizationError);
    await saveAreaOwners(admin.principal, area.id, ana.principal.id, [bia.principal.id, ana.principal.id, caio.principal.id], META);
    expect((await prisma.mktArea.findUniqueOrThrow({ where: { id: area.id } })).coOwnerIds.sort()).toEqual([bia.principal.id, caio.principal.id].sort());
    const id = await saveTask(ana.principal, null, { title: `Reels ${tag}`, areaKey: 'CONTEUDO' }, META);
    const t = await prisma.mktTask.findUniqueOrThrow({ where: { id } });
    expect(t.assigneeId).toBe(ana.principal.id);
    expect(t.collaboratorIds.sort()).toEqual([bia.principal.id, caio.principal.id].sort());
    expect(t.columnId).not.toBeNull();
    // Editar: tira o Caio; a Bia continua achando a tarefa no filtro "responsável".
    await saveTask(ana.principal, id, { title: `Reels ${tag}`, areaKey: 'CONTEUDO', assigneeId: ana.principal.id, collaboratorIds: [bia.principal.id] }, META);
    const { tasks } = await board(ana.principal, '2026-10-20', { assigneeId: bia.principal.id, q: tag });
    expect(tasks.map((x) => [x.id, x.collaborators])).toEqual([[id, [bia.principal.name]]]);
    expect((await board(ana.principal, '2026-10-20', { assigneeId: caio.principal.id, q: tag })).tasks).toHaveLength(0);
    await prisma.mktArea.update({ where: { id: area.id }, data: before });
  });

  it('colunas: cria, move tarefa, muda etapa (conta como feita) e exclui movendo as tarefas', async () => {
    await expect(saveColumn(ana.principal, null, { name: `Revisão ${tag}`, color: null, stage: 'APROVACAO' }, META)).rejects.toBeInstanceOf(AuthorizationError);
    const rev = await saveColumn(admin.principal, null, { name: `Revisão ${tag}`, color: '#ff0000', stage: 'APROVACAO' }, META);
    await expect(saveColumn(admin.principal, null, { name: `revisão ${tag}`, color: null, stage: 'APROVACAO' }, META)).rejects.toThrow(/Já existe/);
    const id = await saveTask(ana.principal, null, { title: `Post ${tag}` }, META);
    await moveTask(ana.principal, id, rev, null, null, META);
    let t = await prisma.mktTask.findUniqueOrThrow({ where: { id } });
    expect([t.columnId, t.column, t.doneAt]).toEqual([rev, 'APROVACAO', null]);
    await saveColumn(admin.principal, rev, { name: `Entregue ${tag}`, color: '#ff0000', stage: 'RESULTADOS' }, META);
    t = await prisma.mktTask.findUniqueOrThrow({ where: { id } });
    expect(t.column).toBe('RESULTADOS');
    expect(t.doneAt).not.toBeNull();
    const backlog = (await prisma.mktBoardColumn.findFirstOrThrow({ where: { stage: 'BACKLOG' }, orderBy: { position: 'asc' } })).id;
    await expect(deleteColumn(admin.principal, rev, null, META)).rejects.toThrow(/escolha para onde/);
    await deleteColumn(admin.principal, rev, backlog, META);
    t = await prisma.mktTask.findUniqueOrThrow({ where: { id } });
    expect([t.columnId, t.column, t.doneAt]).toEqual([backlog, 'BACKLOG', null]);
    expect(await prisma.auditLog.count({ where: { entityId: rev, action: { startsWith: 'mkt.column_' } } })).toBe(3);
  });
});
