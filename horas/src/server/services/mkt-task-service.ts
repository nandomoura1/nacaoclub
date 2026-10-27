import { z } from 'zod';
import { prisma, type Tx } from '@/server/db';
import { audit } from '@/server/audit';
import { assertCan } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import type { RequestMeta } from '@/server/auth/session';
import { AppError, NotFoundError } from '@/server/errors';
import { isIsoDate } from '@/domain/dates';
import { isDone, labelOf, PRIORITIES, TASK_COLUMNS, type TaskColumn } from '@/domain/marketing/constants';
import { isOverdue, openDependencies, positionBetween } from '@/domain/marketing/tasks';
import { columnFor } from '@/domain/marketing/board';
import { dt, iso, listColumns } from './marketing-service';

/**
 * Tarefas de marketing (Kanban): criação, movimento entre colunas com ordem
 * fracionária, checklist, links, dependências e comentários. Tudo auditado.
 */

const COLUMN_IDS = TASK_COLUMNS.map((c) => c.id) as [TaskColumn, ...TaskColumn[]];
const PRIORITY_IDS = PRIORITIES.map((p) => p.id) as [string, ...string[]];
export const MAX_TASK_DESCRIPTION = 20_000;
const opt = (max: number) => z.string().trim().max(max).transform((v) => v || null).nullable().optional().transform((v) => v ?? null);
const uuidOrNull = z.string().uuid().or(z.literal('')).nullable().optional().transform((v) => v || null);

const taskSchema = z.object({
  title: z.string().trim().min(2, 'Informe o título da tarefa.').max(200),
  /** Briefings longos cabem (o campo no banco é texto livre). */
  description: opt(MAX_TASK_DESCRIPTION),
  campaignId: uuidOrNull, eventId: uuidOrNull,
  areaKey: z.string().nullable().optional().transform((v) => v || null),
  assigneeId: uuidOrNull,
  collaboratorIds: z.array(z.string().uuid()).max(10).default([]),
  dueDate: z.string().refine((v) => v === '' || isIsoDate(v), 'Prazo inválido.').nullable().optional().transform((v) => v || null),
  priority: z.enum(PRIORITY_IDS).default('MEDIA'),
  column: z.enum(COLUMN_IDS).optional(),
  columnId: z.string().uuid().or(z.literal('')).optional().transform((v) => v || undefined),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
});
export type TaskInput = z.input<typeof taskSchema>;

const parse = <T,>(s: z.ZodType<T>, v: unknown): T => {
  const p = s.safeParse(v);
  if (!p.success) throw new AppError(p.error.issues[0]?.message ?? 'Dados inválidos.');
  return p.data;
};

async function lastPosition(tx: Tx, column: TaskColumn) {
  const last = await tx.mktTask.findFirst({ where: { column }, orderBy: { position: 'desc' }, select: { position: true } });
  return positionBetween(last?.position ?? null, null);
}
/** Fim de uma coluna do quadro (as posições só valem dentro da coluna). */
async function endOfColumn(tx: Tx, columnId: string) {
  const last = await tx.mktTask.findFirst({ where: { columnId }, orderBy: { position: 'desc' }, select: { position: true } });
  return positionBetween(last?.position ?? null, null);
}

/** Cria tarefa dentro de uma transação (reusado pelo aceite de sugestões da IA). */
export async function createTaskIn(tx: Tx, principal: Principal, d: {
  title: string; description?: string | null; campaignId?: string | null; eventId?: string | null; areaKey?: string | null; assigneeId?: string | null;
  collaboratorIds?: string[]; dueDate?: string | null; priority?: string; column?: TaskColumn; columnId?: string; tags?: string[]; origin?: 'MANUAL' | 'IA' | 'REUNIAO' | 'ANTECEDENCIA'; milestone?: string | null;
}) {
  const area = d.areaKey ? await tx.mktArea.findUnique({ where: { key: d.areaKey } }) : null;
  if (d.areaKey && !area) throw new AppError('Área inválida.');
  if (d.campaignId && !(await tx.mktCampaign.findUnique({ where: { id: d.campaignId }, select: { id: true } }))) throw new AppError('Campanha não encontrada.');
  const picked = d.columnId ? await tx.mktBoardColumn.findUnique({ where: { id: d.columnId } }) : null;
  if (d.columnId && !picked) throw new AppError('Coluna não encontrada.');
  // Sem coluna escolhida (IA, antecedência…): a primeira coluna da etapa pedida.
  const boardCol = picked ?? columnFor({ columnId: null, column: d.column ?? 'BACKLOG' }, await listColumns(tx));
  const column = (picked?.stage ?? d.column ?? 'BACKLOG') as TaskColumn;
  // Sem responsável informado: os responsáveis padrão da área (principal + corresponsáveis).
  const assigneeId = d.assigneeId ?? area?.defaultUserId ?? null;
  const collaboratorIds = [...new Set([...(d.collaboratorIds ?? []), ...(!d.assigneeId ? area?.coOwnerIds ?? [] : [])])].filter((u) => u !== assigneeId);
  return tx.mktTask.create({
    data: {
      title: d.title, description: d.description ?? null, campaignId: d.campaignId ?? null, eventId: d.eventId ?? null, areaId: area?.id ?? null,
      assigneeId, collaboratorIds, dueDate: dt(d.dueDate ?? null), priority: (d.priority ?? 'MEDIA') as 'MEDIA', column, columnId: boardCol?.id ?? null,
      position: boardCol ? await endOfColumn(tx, boardCol.id) : await lastPosition(tx, column), tags: d.tags ?? [], origin: d.origin ?? 'MANUAL', milestone: d.milestone ?? null,
      doneAt: isDone(column) ? new Date() : null, createdById: principal.id,
    },
  });
}

export async function saveTask(principal: Principal | null, id: string | null, input: unknown, meta: RequestMeta, origin: { origin?: 'MANUAL' | 'ANTECEDENCIA'; milestone?: string | null } = {}) {
  assertCan(principal, 'mkt.edit');
  const d = parse(taskSchema, input);
  return prisma.$transaction(async (tx) => {
    if (!id) {
      const t = await createTaskIn(tx, principal, { ...d, origin: origin.origin ?? 'MANUAL', milestone: origin.milestone ?? null });
      await audit(tx, { actorId: principal.id, ...meta }, { action: 'mkt.task_created', entityType: 'mkt_task', entityId: t.id, after: { titulo: t.title, prazo: d.dueDate, origem: t.origin }, summary: `${principal.name} criou a tarefa "${t.title}"` });
      return t.id;
    }
    const before = await tx.mktTask.findUnique({ where: { id } });
    if (!before) throw new NotFoundError('Tarefa não encontrada.');
    const area = d.areaKey ? await tx.mktArea.findUnique({ where: { key: d.areaKey } }) : null;
    const t = await tx.mktTask.update({
      where: { id },
      data: { title: d.title, description: d.description, campaignId: d.campaignId, eventId: d.eventId, areaId: area?.id ?? null, assigneeId: d.assigneeId, collaboratorIds: (d.collaboratorIds ?? []).filter((u) => u !== d.assigneeId), dueDate: dt(d.dueDate), priority: d.priority as 'MEDIA', tags: d.tags },
    });
    const changed = (['title', 'description', 'campaignId', 'areaId', 'assigneeId', 'collaboratorIds', 'dueDate', 'priority', 'tags'] as const).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(t[k]));
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'mkt.task_updated', entityType: 'mkt_task', entityId: id, before: { prazo: iso(before.dueDate), responsavel: before.assigneeId }, after: { campos: changed, prazo: iso(t.dueDate), responsavel: t.assigneeId }, summary: `${principal.name} editou a tarefa "${t.title}"` });
    return id;
  });
}

/** Move no Kanban: coluna do quadro + posição entre os vizinhos. Concluir exige dependências concluídas. */
export async function moveTask(principal: Principal | null, id: string, columnId: string, beforeId: string | null, afterId: string | null, meta: RequestMeta) {
  assertCan(principal, 'mkt.edit');
  await prisma.$transaction(async (tx) => {
    const target = /^[0-9a-f-]{36}$/i.test(columnId) ? await tx.mktBoardColumn.findUnique({ where: { id: columnId } }) : null;
    if (!target) throw new AppError('Coluna não encontrada — recarregue a página.');
    const col = target.stage;
    const t = await tx.mktTask.findUnique({ where: { id }, include: { boardColumn: { select: { name: true } }, dependsOn: { include: { dependsOn: { select: { title: true, column: true } } } } } });
    if (!t) throw new NotFoundError('Tarefa não encontrada.');
    if (isDone(col) && !isDone(t.column)) {
      const open = openDependencies(t.dependsOn.map((d) => d.dependsOn));
      if (open.length) throw new AppError(`Conclua antes: ${open.join(', ')}.`);
    }
    const [prev, next] = await Promise.all([
      beforeId ? tx.mktTask.findUnique({ where: { id: beforeId }, select: { position: true } }) : null,
      afterId ? tx.mktTask.findUnique({ where: { id: afterId }, select: { position: true } }) : null,
    ]);
    const position = prev || next ? positionBetween(prev?.position ?? null, next?.position ?? null) : await endOfColumn(tx, target.id);
    await tx.mktTask.update({ where: { id }, data: { column: col, columnId: target.id, position, doneAt: isDone(col) ? t.doneAt ?? new Date() : null } });
    if (target.id !== t.columnId) {
      const from = t.boardColumn?.name ?? labelOf(TASK_COLUMNS, t.column);
      await audit(tx, { actorId: principal.id, ...meta }, { action: 'mkt.task_moved', entityType: 'mkt_task', entityId: id, before: { coluna: from }, after: { coluna: target.name }, summary: `${principal.name} moveu "${t.title}": ${from} → ${target.name}` });
    }
  });
}

export async function deleteTask(principal: Principal | null, id: string, meta: RequestMeta) {
  assertCan(principal, 'mkt.edit');
  await prisma.$transaction(async (tx) => {
    const t = await tx.mktTask.findUnique({ where: { id } });
    if (!t) throw new NotFoundError('Tarefa não encontrada.');
    await tx.mktTask.delete({ where: { id } });
    await tx.mktComment.deleteMany({ where: { entityType: 'task', entityId: id } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'mkt.task_deleted', entityType: 'mkt_task', entityId: id, before: { titulo: t.title, coluna: t.column }, summary: `${principal.name} excluiu a tarefa "${t.title}"` });
  });
}

export interface BoardFilter { campaignId?: string; areaKey?: string; assigneeId?: string; q?: string; tag?: string; late?: boolean }

export async function board(principal: Principal | null, today: string, f: BoardFilter = {}) {
  assertCan(principal, 'mkt.view');
  const rows = await prisma.mktTask.findMany({
    where: {
      ...(f.campaignId ? { campaignId: f.campaignId } : {}),
      ...(f.areaKey ? { area: { key: f.areaKey } } : {}),
      ...(f.assigneeId ? { OR: [{ assigneeId: f.assigneeId }, { collaboratorIds: { has: f.assigneeId } }] } : {}),
      ...(f.tag ? { tags: { has: f.tag } } : {}),
      ...(f.q ? { AND: [{ OR: [{ title: { contains: f.q, mode: 'insensitive' } }, { description: { contains: f.q, mode: 'insensitive' } }] }] } : {}),
    },
    orderBy: [{ position: 'asc' }],
    include: {
      area: true, campaign: { select: { id: true, name: true } }, checklist: { select: { done: true } },
      dependsOn: { include: { dependsOn: { select: { column: true } } } },
    },
  });
  const [users, columns] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: [...new Set(rows.flatMap((r) => [r.assigneeId, ...r.collaboratorIds]).filter((x): x is string => !!x))] } }, select: { id: true, name: true } }),
    listColumns(),
  ]);
  const names = new Map(users.map((u) => [u.id, u.name]));
  const tasks = rows.map((t) => ({
    id: t.id, title: t.title, column: t.column as TaskColumn, columnId: columnFor(t, columns)?.id ?? '', position: t.position, dueDate: iso(t.dueDate), priority: t.priority, tags: t.tags, origin: t.origin,
    campaign: t.campaign, area: t.area ? { key: t.area.key, name: t.area.name, color: t.area.color } : null,
    assigneeId: t.assigneeId, assignee: t.assigneeId ? names.get(t.assigneeId) ?? null : null,
    collaborators: t.collaboratorIds.map((u) => names.get(u)).filter((x): x is string => !!x),
    checklist: { total: t.checklist.length, done: t.checklist.filter((c) => c.done).length },
    blocked: t.dependsOn.some((d) => !isDone(d.dependsOn.column)),
    overdue: isOverdue({ dueDate: iso(t.dueDate), column: t.column }, today),
  }));
  return { columns, tasks: f.late ? tasks.filter((t) => t.overdue) : tasks };
}
export type BoardTask = Awaited<ReturnType<typeof board>>['tasks'][number];

export async function getTask(principal: Principal | null, id: string) {
  assertCan(principal, 'mkt.view');
  const t = await prisma.mktTask.findUnique({
    where: { id },
    include: {
      area: true, campaign: { select: { id: true, name: true } }, checklist: { orderBy: { position: 'asc' } }, links: true, boardColumn: { select: { name: true } },
      dependsOn: { include: { dependsOn: { select: { id: true, title: true, column: true } } } },
    },
  });
  if (!t) throw new NotFoundError('Tarefa não encontrada.');
  const [comments, history] = await Promise.all([
    prisma.mktComment.findMany({ where: { entityType: 'task', entityId: id }, orderBy: { createdAt: 'asc' } }),
    prisma.auditLog.findMany({ where: { entityType: 'mkt_task', entityId: id }, orderBy: { at: 'desc' }, take: 20, select: { at: true, summary: true } }),
  ]);
  const names = new Map((await prisma.user.findMany({ where: { id: { in: comments.map((c) => c.authorId).filter((x): x is string => !!x) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return {
    id: t.id, title: t.title, description: t.description, campaignId: t.campaignId, campaign: t.campaign, eventId: t.eventId,
    areaKey: t.area?.key ?? null, assigneeId: t.assigneeId, collaboratorIds: t.collaboratorIds, dueDate: iso(t.dueDate), priority: t.priority,
    column: t.column, columnName: t.boardColumn?.name ?? null, tags: t.tags, origin: t.origin, milestone: t.milestone,
    checklist: t.checklist.map((c) => ({ id: c.id, text: c.text, done: c.done })),
    links: t.links.map((l) => ({ id: l.id, url: l.url, label: l.label })),
    dependsOn: t.dependsOn.map((d) => ({ id: d.dependsOn.id, title: d.dependsOn.title, done: isDone(d.dependsOn.column) })),
    comments: comments.map((c) => ({ id: c.id, body: c.body, at: c.createdAt.toISOString(), author: c.authorId ? names.get(c.authorId) ?? null : null })),
    history: history.map((h) => ({ at: h.at.toISOString(), summary: h.summary })),
  };
}
export type TaskDetail = Awaited<ReturnType<typeof getTask>>;

// ── Checklist, links, dependências, comentários ──────────────

async function touch(tx: Tx, principal: Principal, taskId: string, meta: RequestMeta, summary: string) {
  const t = await tx.mktTask.findUnique({ where: { id: taskId }, select: { title: true } });
  if (!t) throw new NotFoundError('Tarefa não encontrada.');
  await audit(tx, { actorId: principal.id, ...meta }, { action: 'mkt.task_detail', entityType: 'mkt_task', entityId: taskId, summary: `${principal.name} ${summary} em "${t.title}"` });
}

export async function addCheckItem(principal: Principal | null, taskId: string, text: string, meta: RequestMeta) {
  assertCan(principal, 'mkt.edit');
  const v = text.trim().slice(0, 200);
  if (!v) throw new AppError('Escreva o item.');
  await prisma.$transaction(async (tx) => {
    const n = await tx.mktTaskCheckItem.count({ where: { taskId } });
    await tx.mktTaskCheckItem.create({ data: { taskId, text: v, position: n } });
    await touch(tx, principal, taskId, meta, `incluiu "${v}" no checklist`);
  });
}
export async function toggleCheckItem(principal: Principal | null, itemId: string, done: boolean) {
  assertCan(principal, 'mkt.edit');
  await prisma.mktTaskCheckItem.update({ where: { id: itemId }, data: { done } });
}
export async function removeCheckItem(principal: Principal | null, itemId: string) {
  assertCan(principal, 'mkt.edit');
  await prisma.mktTaskCheckItem.delete({ where: { id: itemId } });
}

export async function addTaskLink(principal: Principal | null, taskId: string, url: string, label: string | null, meta: RequestMeta) {
  assertCan(principal, 'mkt.edit');
  const u = url.trim();
  if (!/^https?:\/\/\S+$/i.test(u)) throw new AppError('Link inválido (use http(s)://…).');
  await prisma.$transaction(async (tx) => {
    await tx.mktTaskLink.create({ data: { taskId, url: u.slice(0, 1000), label: label?.trim().slice(0, 100) || null } });
    await touch(tx, principal, taskId, meta, 'anexou um link');
  });
}
export async function removeTaskLink(principal: Principal | null, linkId: string) {
  assertCan(principal, 'mkt.edit');
  await prisma.mktTaskLink.delete({ where: { id: linkId } });
}

/** Dependências: "esta tarefa depende de…". Sem auto-dependência nem ciclo direto. */
export async function setDependencies(principal: Principal | null, taskId: string, dependsOnIds: string[], meta: RequestMeta) {
  assertCan(principal, 'mkt.edit');
  const ids = [...new Set(dependsOnIds)].filter((x) => x !== taskId);
  await prisma.$transaction(async (tx) => {
    if (ids.length) {
      const back = await tx.mktTaskDependency.findFirst({ where: { taskId: { in: ids }, dependsOnId: taskId } });
      if (back) throw new AppError('Dependência circular: a outra tarefa já depende desta.');
    }
    await tx.mktTaskDependency.deleteMany({ where: { taskId } });
    if (ids.length) await tx.mktTaskDependency.createMany({ data: ids.map((d) => ({ taskId, dependsOnId: d })) });
    await touch(tx, principal, taskId, meta, `definiu ${ids.length} dependência(s)`);
  });
}

export async function addTaskComment(principal: Principal | null, taskId: string, body: string) {
  assertCan(principal, 'mkt.view');
  const b = body.trim().slice(0, 2000);
  if (!b) throw new AppError('Escreva o comentário.');
  if (!(await prisma.mktTask.findUnique({ where: { id: taskId }, select: { id: true } }))) throw new NotFoundError('Tarefa não encontrada.');
  await prisma.mktComment.create({ data: { entityType: 'task', entityId: taskId, authorId: principal.id, body: b } });
}
