import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '@/server/db';
import { audit } from '@/server/audit';
import { assertCan } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import type { RequestMeta } from '@/server/auth/session';
import { AppError } from '@/server/errors';
import { AREAS, isDone, TASK_COLUMNS } from '@/domain/marketing/constants';
import { planImport, TRELLO_LIMITS, trelloRef, type TrelloBoard, type TrelloMapping } from '@/domain/marketing/trello';
import { dt, marketingPeople } from './marketing-service';

/**
 * Importação única de um quadro do Trello para o Kanban de Marketing.
 * O navegador lê o JSON e manda só o essencial; aqui tudo é revalidado,
 * o plano é refeito e gravado numa transação. Cards já importados são pulados.
 */

const s = (max: number) => z.string().max(max);
const isoOrNull = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();

const boardSchema = z.object({
  name: s(200), url: s(300).nullable(),
  lists: z.array(z.object({ id: s(64), name: s(200), closed: z.boolean(), cards: z.number() })).max(500),
  labels: z.array(z.object({ id: s(64), name: s(100), color: s(30).nullable(), cards: z.number() })).max(500),
  members: z.array(z.object({ id: s(64), name: s(120), username: s(120).nullable(), cards: z.number() })).max(500),
  cards: z.array(z.object({
    id: s(64).min(1), name: s(300), desc: s(TRELLO_LIMITS.desc), listId: s(64), closed: z.boolean(), due: isoOrNull, done: z.boolean(),
    memberIds: z.array(s(64)).max(50), labelIds: z.array(s(64)).max(50),
    checklists: z.array(z.object({ name: s(200), items: z.array(z.object({ text: s(500), done: z.boolean() })).max(TRELLO_LIMITS.items) })).max(20),
    attachments: z.array(z.object({ name: s(100), url: s(1000).regex(/^https?:\/\//) })).max(TRELLO_LIMITS.links),
    comments: z.array(z.object({ author: s(100), date: s(10), text: s(TRELLO_LIMITS.text) })).max(TRELLO_LIMITS.comments),
    url: s(300).nullable(), pos: z.number(),
  })).max(TRELLO_LIMITS.cards),
});

const COLUMN_OR_SKIP = ['IGNORAR', ...TASK_COLUMNS.map((c) => c.id)] as [string, ...string[]];
const AREA_OR_NONE = ['', ...AREAS.map((a) => a.key)] as [string, ...string[]];
const mappingSchema = z.object({
  lists: z.record(z.string(), z.enum(COLUMN_OR_SKIP)),
  labels: z.record(z.string(), z.enum(AREA_OR_NONE)),
  members: z.record(z.string(), z.union([z.string().uuid(), z.literal('')])),
  campaignId: z.string().uuid().nullable(),
  includeArchived: z.boolean(),
  guessAreaFromTitle: z.boolean(),
  importComments: z.boolean(),
});

function parseInput(input: unknown) {
  const r = z.object({ board: boardSchema, mapping: mappingSchema }).safeParse(input);
  if (!r.success) throw new AppError('Arquivo do Trello inválido ou grande demais. Exporte o quadro de novo e tente outra vez.');
  return { board: r.data.board as TrelloBoard, mapping: r.data.mapping as TrelloMapping };
}

/** Quais cards deste quadro já foram importados antes. */
export async function trelloAlreadyImported(principal: Principal | null, cardIds: string[]) {
  assertCan(principal, 'mkt.admin');
  const refs = cardIds.slice(0, TRELLO_LIMITS.cards).map(trelloRef);
  const rows = await prisma.mktTask.findMany({ where: { externalRef: { in: refs } }, select: { externalRef: true } });
  return rows.map((r) => r.externalRef!);
}

export interface TrelloImportResult { created: number; ignoredList: number; archived: number; duplicates: number; checklist: number; links: number; comments: number }

export async function importTrello(principal: Principal | null, input: unknown, meta: RequestMeta): Promise<TrelloImportResult> {
  assertCan(principal, 'mkt.admin');
  const { board, mapping } = parseInput(input);

  // Responsáveis só entre quem tem acesso ao Marketing.
  const people = new Set((await marketingPeople()).map((p) => p.id));
  const bad = Object.values(mapping.members).find((id) => id && !people.has(id));
  if (bad) throw new AppError('Uma das pessoas escolhidas não tem acesso ao Marketing.');
  if (mapping.campaignId && !(await prisma.mktCampaign.findUnique({ where: { id: mapping.campaignId }, select: { id: true } }))) {
    throw new AppError('Campanha não encontrada.');
  }

  return prisma.$transaction(async (tx) => {
    const refs = board.cards.map((c) => trelloRef(c.id));
    const existing = new Set((await tx.mktTask.findMany({ where: { externalRef: { in: refs } }, select: { externalRef: true } })).map((r) => r.externalRef!));
    const plan = planImport(board, mapping, existing);
    if (!plan.tasks.length) throw new AppError(plan.skipped.duplicates ? 'Todos os cards deste quadro já foram importados.' : 'Nenhum card para importar com este mapeamento.');

    const areas = new Map((await tx.mktArea.findMany()).map((a) => [a.key, a]));
    // Entram no fim de cada coluna, na ordem do Trello.
    const tops = await tx.mktTask.groupBy({ by: ['column'], _max: { position: true } });
    const pos = new Map(tops.map((t) => [t.column as string, t._max.position ?? 0]));
    const now = new Date();

    const tasks = plan.tasks.map((t) => {
      const area = t.areaKey ? areas.get(t.areaKey) : undefined;
      const p = (pos.get(t.column) ?? 0) + 1000;
      pos.set(t.column, p);
      return {
        id: randomUUID(), title: t.title, description: t.description, campaignId: mapping.campaignId, areaId: area?.id ?? null,
        assigneeId: t.assigneeId ?? area?.defaultUserId ?? null, collaboratorIds: t.collaboratorIds, dueDate: dt(t.dueDate),
        column: t.column, position: p, tags: t.tags, origin: 'IMPORTACAO' as const, externalRef: t.ref,
        doneAt: isDone(t.column) ? now : null, createdById: principal.id,
      };
    });
    await tx.mktTask.createMany({ data: tasks });

    const checklist = plan.tasks.flatMap((t, i) => t.checklist.map((c, n) => ({ id: randomUUID(), taskId: tasks[i]!.id, text: c.text, done: c.done, position: n })));
    const links = plan.tasks.flatMap((t, i) => t.links.map((l) => ({ id: randomUUID(), taskId: tasks[i]!.id, url: l.url, label: l.label })));
    const comments = plan.tasks.flatMap((t, i) => t.comments.map((body, n) => ({
      id: randomUUID(), entityType: 'task', entityId: tasks[i]!.id, authorId: null, body, createdAt: new Date(now.getTime() + n),
    })));
    if (checklist.length) await tx.mktTaskCheckItem.createMany({ data: checklist });
    if (links.length) await tx.mktTaskLink.createMany({ data: links });
    if (comments.length) await tx.mktComment.createMany({ data: comments });

    const result: TrelloImportResult = { created: tasks.length, ...plan.skipped, checklist: checklist.length, links: links.length, comments: comments.length };
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: 'mkt.trello_imported', entityType: 'mkt_import', entityId: mapping.campaignId,
      after: { quadro: board.name, ...result },
      summary: `${principal.name} importou ${tasks.length} card(s) do quadro "${board.name}" do Trello`,
    });
    return result;
  }, { timeout: 60_000, maxWait: 10_000 });
}
