import { z } from 'zod';
import { prisma } from '@/server/db';
import { audit } from '@/server/audit';
import { assertCan } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import type { RequestMeta } from '@/server/auth/session';
import { AppError, NotFoundError } from '@/server/errors';
import { checkColumns, stageLabel } from '@/domain/marketing/board';
import { isDone, TASK_COLUMNS, type TaskColumn } from '@/domain/marketing/constants';

/**
 * Colunas do Kanban de Marketing (Configurações): criar, renomear, mudar
 * etapa, reordenar e excluir (movendo as tarefas). Tudo auditado.
 */

const STAGE_IDS = TASK_COLUMNS.map((c) => c.id) as [TaskColumn, ...TaskColumn[]];
const schema = z.object({
  name: z.string().trim().min(2, 'Dê um nome à coluna.').max(40, 'Nome longo demais (até 40 letras).'),
  color: z.string().regex(/^#[0-9a-f]{6}$/i, 'Cor inválida.').nullable(),
  stage: z.enum(STAGE_IDS, { message: 'Escolha como a coluna funciona.' }),
});

export async function saveColumn(principal: Principal | null, id: string | null, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'mkt.admin');
  const p = schema.safeParse(input);
  if (!p.success) throw new AppError(p.error.issues[0]?.message ?? 'Dados inválidos.');
  const d = p.data;
  return prisma.$transaction(async (tx) => {
    const all = await tx.mktBoardColumn.findMany();
    const before = id ? all.find((c) => c.id === id) : null;
    if (id && !before) throw new NotFoundError('Coluna não encontrada.');
    if (all.some((c) => c.id !== id && c.name.toLowerCase() === d.name.toLowerCase())) throw new AppError('Já existe uma coluna com esse nome.');
    const err = checkColumns([...all.filter((c) => c.id !== id), d]);
    if (err) throw new AppError(err);
    const c = before
      ? await tx.mktBoardColumn.update({ where: { id: before.id }, data: d })
      : await tx.mktBoardColumn.create({ data: { ...d, position: Math.max(-1, ...all.map((x) => x.position)) + 1 } });
    // Mudou a etapa: as tarefas da coluna passam a contar como a nova etapa.
    if (before && before.stage !== d.stage) {
      const tasks = await tx.mktTask.findMany({ where: { columnId: c.id }, select: { id: true, doneAt: true } });
      await tx.mktTask.updateMany({ where: { columnId: c.id }, data: { column: d.stage } });
      if (isDone(d.stage) !== isDone(before.stage)) {
        await tx.mktTask.updateMany({ where: { id: { in: tasks.map((t) => t.id) } }, data: { doneAt: isDone(d.stage) ? new Date() : null } });
      }
    }
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: before ? 'mkt.column_updated' : 'mkt.column_created', entityType: 'mkt_board_column', entityId: c.id,
      before: before ? { nome: before.name, etapa: before.stage } : null, after: { nome: c.name, etapa: c.stage },
      summary: before ? `${principal.name} alterou a coluna "${c.name}" do Kanban` : `${principal.name} criou a coluna "${c.name}" (${stageLabel(c.stage)}) no Kanban`,
    });
    return c.id;
  });
}

export async function reorderColumns(principal: Principal | null, ids: string[], meta: RequestMeta) {
  assertCan(principal, 'mkt.admin');
  await prisma.$transaction(async (tx) => {
    const all = await tx.mktBoardColumn.findMany({ select: { id: true } });
    if (ids.length !== all.length || !all.every((c) => ids.includes(c.id))) throw new AppError('A lista de colunas mudou — recarregue a página.');
    for (const [i, id] of ids.entries()) await tx.mktBoardColumn.update({ where: { id }, data: { position: i } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'mkt.columns_reordered', entityType: 'mkt_board_column', entityId: ids[0]!, summary: `${principal.name} reordenou as colunas do Kanban` });
  });
}

/** Exclui a coluna; as tarefas dela vão para `moveToId` (obrigatório se houver tarefas). */
export async function deleteColumn(principal: Principal | null, id: string, moveToId: string | null, meta: RequestMeta) {
  assertCan(principal, 'mkt.admin');
  await prisma.$transaction(async (tx) => {
    const all = await tx.mktBoardColumn.findMany();
    const c = all.find((x) => x.id === id);
    if (!c) throw new NotFoundError('Coluna não encontrada.');
    const err = checkColumns(all.filter((x) => x.id !== id));
    if (err) throw new AppError(err);
    const n = await tx.mktTask.count({ where: { columnId: id } });
    const to = moveToId ? all.find((x) => x.id === moveToId && x.id !== id) : null;
    if (n && !to) throw new AppError(`A coluna tem ${n} tarefa(s): escolha para onde elas vão.`);
    if (n && to) {
      const doneChange = isDone(to.stage) !== isDone(c.stage);
      await tx.mktTask.updateMany({ where: { columnId: id }, data: { columnId: to.id, column: to.stage, ...(doneChange ? { doneAt: isDone(to.stage) ? new Date() : null } : {}) } });
    }
    await tx.mktBoardColumn.delete({ where: { id } });
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: 'mkt.column_deleted', entityType: 'mkt_board_column', entityId: id, before: { nome: c.name, etapa: c.stage },
      summary: `${principal.name} excluiu a coluna "${c.name}" do Kanban${n && to ? ` (${n} tarefa(s) foram para "${to.name}")` : ''}`,
    });
  });
}
