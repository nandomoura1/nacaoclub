import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/server/db';
import { AuthorizationError } from '@/server/errors';
import { parseTrelloBoard, slimBoard, suggestMapping } from '@/domain/marketing/trello';
import { importTrello, trelloAlreadyImported } from '@/server/services/mkt-trello-service';
import { trelloExport } from '../fixtures/trello-board';
import { META, ensureCatalog, hasDb, makeUser } from './helpers';

describe.skipIf(!hasDb)('Marketing — importação do Trello', () => {
  let admin: Awaited<ReturnType<typeof makeUser>>;
  let mkt: Awaited<ReturnType<typeof makeUser>>;
  const raw = trelloExport(randomUUID().replace(/-/g, '').slice(0, 10));
  const board = parseTrelloBoard(raw);

  beforeAll(async () => {
    await ensureCatalog();
    admin = await makeUser('ADMIN', { name: 'Admin Trello' });
    mkt = await makeUser('MARKETING', { name: 'Pessoa Mkt' });
    for (const [i, key] of ['PLANEJAMENTO', 'COMUNICACAO', 'CONTEUDO', 'DESIGN', 'COMERCIAL'].entries()) {
      await prisma.mktArea.upsert({ where: { key }, create: { key, name: key, color: '#0169E9', sortOrder: i }, update: {} });
    }
  });

  it('só quem administra o marketing importa; pessoa sem acesso ao marketing é recusada', async () => {
    const mapping = suggestMapping(board);
    await expect(importTrello(mkt.principal, { board, mapping }, META)).rejects.toBeInstanceOf(AuthorizationError);
    const prof = await makeUser('PROFESSOR', { name: 'Prof' });
    await expect(importTrello(admin.principal, { board, mapping: { ...mapping, members: { [raw.members[0]!.id]: prof.principal.id } } }, META)).rejects.toThrow(/acesso ao Marketing/);
    await expect(importTrello(admin.principal, { board: { nada: 1 }, mapping }, META)).rejects.toThrow(/inválido/);
  });

  it('importa cards com checklist, links, comentários e auditoria; reimportar não duplica', async () => {
    const mapping = { ...suggestMapping(board), members: { [raw.members[0]!.id]: mkt.principal.id } };
    const r = await importTrello(admin.principal, { board: slimBoard(board, mapping), mapping }, META);
    expect(r).toMatchObject({ created: 5, checklist: 3, links: 1, comments: 1, duplicates: 0 });

    const refs = board.cards.map((c) => `trello:${c.id}`);
    const tasks = await prisma.mktTask.findMany({ where: { externalRef: { in: refs } }, include: { area: true, checklist: true, links: true } });
    expect(tasks).toHaveLength(5);
    expect(tasks.every((t) => t.origin === 'IMPORTACAO')).toBe(true);
    const arte = tasks.find((t) => t.title === 'Arte do Celebration')!;
    expect(arte).toMatchObject({ column: 'PRODUCAO', assigneeId: mkt.principal.id, tags: ['Design', 'Urgente'] });
    expect(arte.area?.key).toBe('DESIGN');
    expect(arte.dueDate?.toISOString().slice(0, 10)).toBe('2026-10-19');
    expect(arte.checklist.map((c) => [c.text, c.done])).toEqual([['Stories', false], ['Feed', true]]);
    expect(arte.links[0]!.url).toBe('https://drive.google.com/x');
    expect(await prisma.mktComment.count({ where: { entityType: 'task', entityId: arte.id } })).toBe(1);
    const done = tasks.find((t) => t.title === 'Post de boas-vindas')!;
    expect(done.column).toBe('EXECUTADO');
    expect(done.doneAt).not.toBeNull();
    expect(await prisma.auditLog.count({ where: { action: 'mkt.trello_imported', actorId: admin.principal.id } })).toBe(1);

    expect((await trelloAlreadyImported(admin.principal, board.cards.map((c) => c.id))).length).toBe(5);
    await expect(importTrello(admin.principal, { board, mapping }, META)).rejects.toThrow(/já foram importados/);
    // Um card novo no quadro: só ele entra.
    const more = parseTrelloBoard({ ...raw, cards: [...raw.cards, { id: `${raw.cards[0]!.id.slice(0, 20)}9999`, name: 'Card novo', idList: raw.lists[1]!.id, idLabels: [], idMembers: [], pos: 3 }] });
    const r2 = await importTrello(admin.principal, { board: more, mapping }, META);
    expect(r2).toMatchObject({ created: 1, duplicates: 5 });
  });
});
