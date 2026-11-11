import { z } from 'zod';
import { prisma } from '@/server/db';
import { audit } from '@/server/audit';
import { assertCan, can } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import type { RequestMeta } from '@/server/auth/session';
import { AppError, AuthorizationError, NotFoundError } from '@/server/errors';
import { fromUtc } from '@/domain/dates';
import { agingOf, cadenceStep, daysLate, formatMobile, maskMobile, priorityScore, type CaseKind } from '@/domain/cobranca';
import { todayIso } from '@/lib/today';
import { tecnofitConfig } from '@/server/tecnofit/client';
import { runTecnofitSync } from './crm-sync-service';

/**
 * Cobrança e CRM — telas. Toda leitura passa por permissão; o celular completo só
 * sai do servidor com `crm.view_personal` (sem ela: mascarado). Consultor vê a
 * própria fila; o líder (`crm.view_all`) vê todos e distribui os sem responsável.
 */

type P = Principal;
const parse = <S extends z.ZodType>(s: S, v: unknown): z.output<S> => {
  const r = s.safeParse(v);
  if (!r.success) throw new AppError(r.error.issues[0]?.message ?? 'Dados inválidos.');
  return r.data;
};

export const QUEUE_VIEWS = ['minha', 'sem', 'todos'] as const;
export type QueueView = (typeof QUEUE_VIEWS)[number];

function viewWhere(principal: P, view: QueueView) {
  if (view === 'minha') return { ownerId: principal.id };
  if (!can(principal, 'crm.view_all')) throw new AuthorizationError('Só o líder de CRM vê a fila de todos.');
  return view === 'sem' ? { ownerId: null } : {};
}

export async function queueCounts(principal: P | null) {
  assertCan(principal, 'crm.view');
  const all = can(principal, 'crm.view_all');
  const [minha, sem, todos] = await Promise.all([
    prisma.crmCase.count({ where: { status: 'ABERTO', ownerId: principal.id } }),
    all ? prisma.crmCase.count({ where: { status: 'ABERTO', ownerId: null } }) : 0,
    all ? prisma.crmCase.count({ where: { status: 'ABERTO' } }) : 0,
  ]);
  return { minha, sem, todos };
}

export async function listQueue(principal: P | null, opts: { view: QueueView; kind?: CaseKind; q?: string }) {
  assertCan(principal, 'crm.view');
  const today = todayIso();
  const personal = can(principal, 'crm.view_personal');
  const rows = await prisma.crmCase.findMany({
    where: {
      status: 'ABERTO',
      ...viewWhere(principal, opts.view),
      ...(opts.kind ? { kind: opts.kind } : {}),
      ...(opts.q ? { customer: { name: { contains: opts.q, mode: 'insensitive' as const } } } : {}),
    },
    include: { customer: { include: { debts: { where: { status: 'ABERTO' }, orderBy: { dueDate: 'asc' } } } } },
    take: 500,
  });
  const ownerIds = [...new Set(rows.map((r) => r.ownerId).filter((x): x is string => !!x))];
  const consultantIds = [...new Set(rows.map((r) => r.customer.consultantTecId).filter((x): x is string => !!x))];
  const [owners, consultants] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true } }),
    prisma.crmConsultant.findMany({ where: { tecnofitId: { in: consultantIds } }, select: { tecnofitId: true, name: true } }),
  ]);
  const ownerName = new Map(owners.map((u) => [u.id, u.name]));
  const consultantName = new Map(consultants.map((c) => [c.tecnofitId, c.name]));

  return rows
    .map((r) => {
      const oldestDue = r.oldestDue ? fromUtc(r.oldestDue) : null;
      const late = oldestDue ? daysLate(oldestDue, today) : null;
      const kind = r.kind as CaseKind;
      return {
        id: r.id,
        kind,
        customer: { tecnofitId: r.customer.tecnofitId, name: r.customer.name, status: r.customer.status },
        // Dado pessoal: completo só com crm.view_personal.
        phone: personal ? formatMobile(r.customer.mobile) : maskMobile(r.customer.mobile),
        hasPhone: !!r.customer.mobile,
        openValue: Number(r.openValue),
        originalValue: Number(r.originalValue),
        recoveredValue: Number(r.recoveredValue),
        oldestDue,
        daysLate: late,
        aging: late === null ? null : agingOf(late),
        step: kind === 'COBRANCA' ? cadenceStep(oldestDue, today)?.label ?? 'Antes do D-3' : null,
        openedOn: fromUtc(r.openedOn),
        ownerId: r.ownerId,
        ownerName: r.ownerId ? ownerName.get(r.ownerId) ?? 'Usuário removido' : null,
        consultantName: r.customer.consultantTecId ? consultantName.get(r.customer.consultantTecId) ?? null : null,
        debts: r.customer.debts.map((x) => ({ description: x.description, dueDate: x.dueDate ? fromUtc(x.dueDate) : null, openValue: Number(x.openValue) })),
        score: priorityScore({ kind, openValue: Number(r.openValue), oldestDue, openedOn: fromUtc(r.openedOn) }, today),
      };
    })
    .sort((a, b) => b.score - a.score);
}
export type QueueRow = Awaited<ReturnType<typeof listQueue>>[number];

/** Pessoas que podem ser responsáveis por casos (têm crm.work). */
export async function crmAgents(principal: P | null) {
  assertCan(principal, 'crm.view');
  return prisma.user.findMany({
    where: { active: true, roles: { some: { role: { permissions: { some: { permission: { key: 'crm.work' } } } } } } },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
}

const assignSchema = z.object({ caseIds: z.array(z.string().uuid()).min(1, 'Escolha ao menos um caso.').max(500), ownerId: z.string().uuid().nullable() });

/** Líder distribui/reatribui casos (um ou vários). */
export async function assignCases(principal: P | null, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'crm.view_all');
  const { caseIds, ownerId } = parse(assignSchema, input);
  if (ownerId) {
    const ok = (await crmAgents(principal)).some((u) => u.id === ownerId);
    if (!ok) throw new AppError('Essa pessoa não está no time de CRM (precisa do perfil CRM / Cobrança ou Líder de CRM).');
  }
  return prisma.$transaction(async (tx) => {
    const cases = await tx.crmCase.findMany({ where: { id: { in: caseIds }, status: 'ABERTO' }, select: { id: true, ownerId: true } });
    if (!cases.length) throw new NotFoundError('Nenhum caso aberto encontrado.');
    await tx.crmCase.updateMany({ where: { id: { in: cases.map((c) => c.id) } }, data: { ownerId } });
    const who = ownerId ? (await tx.user.findUnique({ where: { id: ownerId }, select: { name: true } }))?.name : null;
    for (const c of cases) {
      await audit(tx, { actorId: principal.id, ...meta }, {
        action: 'crm.case_assigned', entityType: 'crm_case', entityId: c.id,
        before: { ownerId: c.ownerId }, after: { ownerId },
        summary: `${principal.name} passou o caso para ${who ?? 'Sem responsável'}`,
      });
    }
    return cases.length;
  });
}

// ── Configurações (crm.admin) ─────────────────────────────────

export async function listConsultants(principal: P | null) {
  assertCan(principal, 'crm.admin');
  const [rows, open] = await Promise.all([
    prisma.crmConsultant.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] }),
    prisma.tecCustomer.groupBy({ by: ['consultantTecId'], where: { cases: { some: { status: 'ABERTO' } } }, _count: true }),
  ]);
  const count = new Map(open.map((o) => [o.consultantTecId, o._count]));
  return rows.map((c) => ({ id: c.id, tecnofitId: c.tecnofitId, name: c.name, userId: c.userId, active: c.active, openCustomers: count.get(c.tecnofitId) ?? 0 }));
}

const linkSchema = z.object({ consultantId: z.string().uuid(), userId: z.string().uuid().nullable() });

/**
 * Vincula consultor da Tecnofit ↔ usuário (escolha explícita, nunca pelo nome).
 * Os casos abertos sem responsável dos alunos desse consultor passam para o usuário.
 */
export async function linkConsultant(principal: P | null, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'crm.admin');
  const { consultantId, userId } = parse(linkSchema, input);
  if (userId) {
    const ok = (await crmAgents(principal)).some((u) => u.id === userId);
    if (!ok) throw new AppError('Essa pessoa não está no time de CRM (dê o perfil CRM / Cobrança ou Líder de CRM em Usuários).');
  }
  return prisma.$transaction(async (tx) => {
    const c = await tx.crmConsultant.findUnique({ where: { id: consultantId } });
    if (!c) throw new NotFoundError('Consultor não encontrado.');
    if (userId) {
      const clash = await tx.crmConsultant.findFirst({ where: { userId, id: { not: c.id } } });
      if (clash) throw new AppError(`Esse usuário já está vinculado ao consultor ${clash.name}.`);
    }
    await tx.crmConsultant.update({ where: { id: c.id }, data: { userId } });
    let moved = 0;
    if (userId) {
      const r = await tx.crmCase.updateMany({ where: { status: 'ABERTO', ownerId: null, customer: { consultantTecId: c.tecnofitId } }, data: { ownerId: userId } });
      moved = r.count;
    }
    const who = userId ? (await tx.user.findUnique({ where: { id: userId }, select: { name: true } }))?.name : null;
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: 'crm.consultant_linked', entityType: 'crm_consultant', entityId: c.id,
      before: { userId: c.userId }, after: { userId, casesAssigned: moved },
      summary: who ? `${principal.name} vinculou o consultor ${c.name} (Tecnofit) ao usuário ${who}` : `${principal.name} desvinculou o consultor ${c.name} (Tecnofit)`,
    });
    return moved;
  });
}

export async function syncOverview(principal: P | null) {
  assertCan(principal, 'crm.admin');
  const cfg = tecnofitConfig();
  const runs = await prisma.tecSyncRun.findMany({ orderBy: { startedAt: 'desc' }, take: 10 });
  return {
    config: { configured: cfg.configured, fake: cfg.fake, base: cfg.base, companyId: cfg.companyId, keyHint: cfg.keyHint },
    runs: runs.map((r) => ({
      id: r.id, day: fromUtc(r.day), status: r.status, mode: r.mode, error: r.error, apiCalls: r.apiCalls, invocations: r.invocations,
      remaining: Array.isArray(r.pending) ? r.pending.length : 0,
      stats: r.stats as { candidates?: number; processed?: number; casesOpened?: number; casesResolved?: number; debtsPaid?: number; consultants?: number; purged?: number; warning?: string; errors?: { customer: string; error: string }[] },
      startedAt: r.startedAt.toISOString(), finishedAt: r.finishedAt?.toISOString() ?? null,
    })),
  };
}

/** "Sincronizar agora" (crm.admin): roda um pedaço (≤ 50 s); clicar de novo continua. */
export async function syncNow(principal: P | null, opts: { force?: boolean }, meta: RequestMeta) {
  assertCan(principal, 'crm.admin');
  const r = await runTecnofitSync(todayIso(), { budgetMs: 50_000, force: opts.force, actorId: principal.id });
  await prisma.$transaction((tx) => audit(tx, { actorId: principal.id, ...meta }, {
    action: 'crm.sync_manual', entityType: 'tec_sync_run', entityId: r.runId, after: { status: r.status, processed: r.processed, remaining: r.remaining },
    summary: `${principal.name} rodou a sincronização com a Tecnofit (${r.status === 'CONCLUIDA' ? 'concluída' : r.status === 'FALHOU' ? 'falhou' : `faltam ${r.remaining} alunos`})`,
  }));
  return r;
}
