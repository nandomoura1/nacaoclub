import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/server/db';
import { AuthorizationError } from '@/server/errors';
import { fakePut, objectSize } from '@/server/storage';
import { addTaskImage, board, deleteTask, getTask, removeTaskImage, saveTask, setTaskCover, startTaskImage } from '@/server/services/mkt-task-service';
import { META, ensureCatalog, hasDb, makeUser } from './helpers';

/** Imagens nos cartões do Kanban (armazenamento local, STORAGE_FAKE=1). */
describe.skipIf(!hasDb)('Marketing — imagens no cartão do Kanban', () => {
  const prev = process.env.STORAGE_FAKE;
  let mkt: Awaited<ReturnType<typeof makeUser>>;
  let lider: Awaited<ReturnType<typeof makeUser>>;

  beforeAll(async () => {
    process.env.STORAGE_FAKE = '1';
    await ensureCatalog();
    mkt = await makeUser('MARKETING');
    lider = await makeUser('LIDER');
  });
  afterAll(() => { process.env.STORAGE_FAKE = prev; });

  const send = async (taskId: string, name: string) => {
    const up = await startTaskImage(mkt.principal, taskId, { name, size: 3 });
    await fakePut(up.path, Buffer.from([1, 2, 3]));
    return { id: await addTaskImage(mkt.principal, taskId, { path: up.path, fileName: name }, META), path: up.path };
  };

  it('anexa, a primeira vira capa, troca a capa, exclui e limpa o armazenamento', async () => {
    const taskId = await saveTask(mkt.principal, null, { title: 'Post com arte' }, META);
    await expect(startTaskImage(mkt.principal, taskId, { name: 'x.svg', size: 10 })).rejects.toThrow(/PNG, JPG/);
    await expect(startTaskImage(mkt.principal, taskId, { name: 'x.png', size: 11 * 1024 * 1024 })).rejects.toThrow(/10 MB/);
    await expect(startTaskImage(lider.principal, taskId, { name: 'x.png', size: 10 })).rejects.toBeInstanceOf(AuthorizationError);
    // Sem o arquivo no armazenamento, não anexa; caminho forjado é recusado.
    const up = await startTaskImage(mkt.principal, taskId, { name: 'Arte Final.PNG', size: 3 });
    await expect(addTaskImage(mkt.principal, taskId, { path: up.path, fileName: 'Arte Final.PNG' }, META)).rejects.toThrow(/não chegou/);
    await expect(addTaskImage(mkt.principal, taskId, { path: 'biblioteca/2026-01/x.png', fileName: 'x.png' }, META)).rejects.toThrow(/inválido/);

    const a = await send(taskId, 'arte-1.png');
    const b = await send(taskId, 'arte-2.jpg');
    let t = await getTask(mkt.principal, taskId);
    expect(t.attachments.map((x) => [x.fileName, x.isCover])).toEqual([['arte-1.png', true], ['arte-2.jpg', false]]);
    expect(t.attachments[0]!.url).toContain('/api/dev-storage');
    let card = (await board(mkt.principal, '2026-10-29')).tasks.find((x) => x.id === taskId)!;
    expect(card).toMatchObject({ images: 2 });
    expect(card.cover).toContain(encodeURIComponent(a.path));

    await setTaskCover(mkt.principal, b.id, true);
    card = (await board(mkt.principal, '2026-10-29')).tasks.find((x) => x.id === taskId)!;
    expect(card.cover).toContain(encodeURIComponent(b.path));

    // Excluir a capa: a outra imagem assume; o arquivo sai do armazenamento.
    await removeTaskImage(mkt.principal, b.id, META);
    expect(await objectSize(b.path)).toBeNull();
    t = await getTask(mkt.principal, taskId);
    expect(t.attachments.map((x) => [x.fileName, x.isCover])).toEqual([['arte-1.png', true]]);

    // Excluir a tarefa leva as imagens junto.
    await deleteTask(mkt.principal, taskId, META);
    expect(await objectSize(a.path)).toBeNull();
    expect(await prisma.mktTaskAttachment.count({ where: { taskId } })).toBe(0);
  });
});
