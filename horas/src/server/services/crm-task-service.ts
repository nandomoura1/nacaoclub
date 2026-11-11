import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/server/db';
import { audit } from '@/server/audit';
import { assertCan, can } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import type { RequestMeta } from '@/server/auth/session';
import { AppError, AuthorizationError, NotFoundError } from '@/server/errors';
import { formatDateBR, fromUtc, toUtc, type IsoDate } from '@/domain/dates';
import { TASK_KINDS, brl, cadenceStep, daysBetween, daysLate, formatMobile, maskMobile, type CaseKind } from '@/domain/cobranca';
import { todayIso } from '@/lib/today';

/**
 * Tarefas de CRM do consultor — o sistema NÃO fala com o aluno.
 * Todo dia (depois da sincronização e às 07h30, antes do envio): cada caso aberto ganha a
 * tarefa do passo da régua em que está (D-3 … D+15), a pendência na recepção, ou o retorno
 * agendado na Tecnofit que venceu. Baixa: ligação concluída registrada na Tecnofit depois
 * que a tarefa entrou na lista, caso resolvido (pagou) ou "já registrei" à mão.
 * Tarefa não feita continua na lista (no topo, "atrasada há N dias").
 */

const d = (iso: IsoDate) => toUtc(iso);
const iso = (v: Date | null) => (v ? fromUtc(v) : null);
const SYSTEM = { actorId: null, userAgent: 'tarefas-crm' };
const REGUA = new Set(['D-3', 'D0', 'D+3', 'D+5', 'D+7', 'D+15']);

export interface TaskGenResult { created: number; done: number; superseded: number; closed: number }

/** Gera e dá baixa nas tarefas do dia. Idempotente: rodar de novo no mesmo dia não duplica. */
export async function generateTasks(today: IsoDate): Promise<TaskGenResult> {
  const r: TaskGenResult = { created: 0, done: 0, superseded: 0, closed: 0 };

  // 1) Caso que fechou: tarefas abertas saem (pagou = PAGAMENTO).
  const closedCases = await prisma.crmTask.findMany({ where: { status: 'ABERTA', case: { status: { not: 'ABERTO' } } }, select: { id: true, case: { select: { kind: true, status: true } } } });
  for (const t of closedCases) {
    await prisma.crmTask.update({ where: { id: t.id }, data: { status: 'FEITA', doneOn: d(today), doneVia: t.case.kind === 'COBRANCA' && t.case.status === 'RESOLVIDO' ? 'PAGAMENTO' : 'CASO_RESOLVIDO' } });
    r.closed++;
  }

  const cases = await prisma.crmCase.findMany({
    where: { status: 'ABERTO' },
    include: { customer: { select: { lastCallDoneOn: true, nextCallOn: true } }, tasks: { where: { status: 'ABERTA' } } },
  });
  for (const c of cases) {
    const lastDone = iso(c.customer.lastCallDoneOn);
    const nextCall = iso(c.customer.nextCallOn);

    // 2) Baixa pela ligação concluída na Tecnofit no dia em que a tarefa entrou na lista ou depois.
    let open = c.tasks;
    for (const t of open) {
      if (lastDone && lastDone >= iso(t.createdOn)!) {
        await prisma.crmTask.update({ where: { id: t.id }, data: { status: 'FEITA', doneOn: d(lastDone), doneVia: 'LIGACAO_TECNOFIT' } });
        r.done++;
      }
    }
    open = await prisma.crmTask.findMany({ where: { caseId: c.id, status: 'ABERTA' } });

    const want: { kind: string; ref: IsoDate }[] = [];
    // Retorno/promessa agendado na Tecnofit que chegou: vira tarefa; enquanto for futuro, pausa a régua.
    const paused = !!nextCall && nextCall > today;
    if (nextCall && nextCall <= today) want.push({ kind: 'RETORNO', ref: nextCall });
    if (c.kind === 'PENDENCIA') want.push({ kind: 'PENDENCIA', ref: iso(c.openedOn)! });
    else if (!paused) {
      const due = iso(c.oldestDue);
      const step = cadenceStep(due, today);
      if (step && due) want.push({ kind: step.kind, ref: due });
    }

    for (const w of want) {
      const exists = await prisma.crmTask.findUnique({ where: { caseId_kind_refDate: { caseId: c.id, kind: w.kind, refDate: d(w.ref) } } });
      if (exists) continue;
      // Novo passo da régua: o passo anterior ainda aberto é substituído e fica anotado como "sem contato".
      const older = REGUA.has(w.kind) ? open.filter((t) => REGUA.has(t.kind)) : [];
      const missed = [...new Set(older.flatMap((t) => [...t.missed, t.kind]))];
      await prisma.$transaction(async (tx) => {
        for (const o of older) await tx.crmTask.update({ where: { id: o.id }, data: { status: 'SUBSTITUIDA' } });
        const t = await tx.crmTask.create({ data: { caseId: c.id, kind: w.kind, refDate: d(w.ref), createdOn: d(today), missed } });
        if (w.kind === 'D+15') {
          await audit(tx, SYSTEM, { action: 'crm.case_escalated', entityType: 'crm_case', entityId: c.id, after: { taskId: t.id }, summary: 'Caso de cobrança chegou ao D+15: escalado para o líder de CRM' });
        }
      });
      r.superseded += older.length;
      r.created++;
      open = open.filter((t) => !older.includes(t));
    }
  }
  return r;
}

// ── Lista do consultor ─────────────────────────────────────

export const TASK_VIEWS = ['minhas', 'sem', 'escalados', 'todas'] as const;
export type TaskView = (typeof TASK_VIEWS)[number];

function viewWhere(principal: Principal, view: TaskView): Prisma.CrmTaskWhereInput {
  if (view === 'minhas') return { case: { ownerId: principal.id } };
  if (!can(principal, 'crm.view_all')) throw new AuthorizationError('Só o líder de CRM vê as tarefas do time.');
  if (view === 'sem') return { case: { ownerId: null } };
  if (view === 'escalados') return { kind: 'D+15' };
  return {};
}

export async function taskCounts(principal: Principal | null) {
  assertCan(principal, 'crm.view');
  const all = can(principal, 'crm.view_all');
  const open = { status: 'ABERTA' };
  const [minhas, sem, escalados, todas] = await Promise.all([
    prisma.crmTask.count({ where: { ...open, case: { ownerId: principal.id } } }),
    all ? prisma.crmTask.count({ where: { ...open, case: { ownerId: null } } }) : 0,
    all ? prisma.crmTask.count({ where: { ...open, kind: 'D+15' } }) : 0,
    all ? prisma.crmTask.count({ where: open }) : 0,
  ]);
  return { minhas, sem, escalados, todas };
}

export async function listTasks(principal: Principal | null, view: TaskView) {
  assertCan(principal, 'crm.view');
  const today = todayIso();
  const personal = can(principal, 'crm.view_personal');
  const rows = await prisma.crmTask.findMany({
    where: { status: 'ABERTA', ...viewWhere(principal, view) },
    include: { case: { include: { customer: { select: { tecnofitId: true, name: true, mobile: true, status: true, nextCallOn: true } } } } },
    take: 800,
  });
  const ownerIds = [...new Set(rows.map((t) => t.case.ownerId).filter((x): x is string => !!x))];
  const owners = new Map((await prisma.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return rows.map((t) => {
    const ref = iso(t.refDate)!;
    const due = iso(t.case.oldestDue);
    const k = TASK_KINDS[t.kind] ?? { label: t.kind, todo: '' };
    const age = daysBetween(iso(t.createdOn)!, today);
    return {
      id: t.id,
      kind: t.kind,
      label: k.label,
      todo: k.todo.replace('{venc}', due ? formatDateBR(due) : '—').replace('{ref}', formatDateBR(ref)),
      age,
      missed: t.missed,
      caseKind: t.case.kind as CaseKind,
      customer: { tecnofitId: t.case.customer.tecnofitId, name: t.case.customer.name, status: t.case.customer.status },
      // Dado pessoal: completo só com crm.view_personal.
      phone: personal ? formatMobile(t.case.customer.mobile) : maskMobile(t.case.customer.mobile),
      openValue: Number(t.case.openValue),
      daysLate: due ? daysLate(due, today) : null,
      ownerId: t.case.ownerId,
      ownerName: t.case.ownerId ? owners.get(t.case.ownerId) ?? 'Usuário removido' : null,
    };
  }).sort((a, b) => b.age - a.age || (b.daysLate ?? -99) - (a.daysLate ?? -99) || b.openValue - a.openValue);
}
export type TaskRow = Awaited<ReturnType<typeof listTasks>>[number];

/** Resumo por consultor (líder): abertas, atrasadas e feitas nos últimos 7 dias. */
export async function teamSummary(principal: Principal | null) {
  assertCan(principal, 'crm.view_all');
  const today = todayIso();
  const [open, done] = await Promise.all([
    prisma.crmTask.findMany({ where: { status: 'ABERTA' }, select: { createdOn: true, case: { select: { ownerId: true } } } }),
    prisma.crmTask.findMany({ where: { status: 'FEITA', doneOn: { gte: d(fromUtc(new Date(toUtc(today).getTime() - 6 * 86_400_000))) } }, select: { doneVia: true, case: { select: { ownerId: true } } } }),
  ]);
  const ids = [...new Set([...open, ...done].map((t) => t.case.ownerId).filter((x): x is string => !!x))];
  const names = new Map((await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const by = new Map<string, { name: string; open: number; late: number; done7: number; byCall7: number }>();
  const get = (id: string | null) => {
    const key = id ?? '—';
    if (!by.has(key)) by.set(key, { name: id ? names.get(id) ?? 'Usuário removido' : 'Sem responsável', open: 0, late: 0, done7: 0, byCall7: 0 });
    return by.get(key)!;
  };
  for (const t of open) { const g = get(t.case.ownerId); g.open++; if (iso(t.createdOn)! < today) g.late++; }
  for (const t of done) { const g = get(t.case.ownerId); g.done7++; if (t.doneVia === 'LIGACAO_TECNOFIT') g.byCall7++; }
  return [...by.values()].sort((a, b) => b.late - a.late || b.open - a.open);
}

const doneSchema = z.object({ taskId: z.string().uuid() });

/** "Já registrei na Tecnofit": baixa manual (a sincronização de amanhã também daria baixa pela ligação). */
export async function markTaskDone(principal: Principal | null, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'crm.work');
  const p = doneSchema.safeParse(input);
  if (!p.success) throw new AppError('Tarefa inválida.');
  return prisma.$transaction(async (tx) => {
    const t = await tx.crmTask.findUnique({ where: { id: p.data.taskId }, include: { case: { select: { ownerId: true } } } });
    if (!t) throw new NotFoundError('Tarefa não encontrada.');
    if (t.case.ownerId !== principal.id && !can(principal, 'crm.view_all')) throw new AuthorizationError('Esta tarefa é de outro consultor.');
    if (t.status !== 'ABERTA') throw new AppError('Esta tarefa já saiu da lista.');
    await tx.crmTask.update({ where: { id: t.id }, data: { status: 'FEITA', doneOn: d(todayIso()), doneVia: 'MANUAL', doneById: principal.id } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'crm.task_done', entityType: 'crm_task', entityId: t.id, after: { kind: t.kind, via: 'MANUAL' }, summary: `${principal.name} marcou a tarefa ${t.kind} como feita (registrada na Tecnofit)` });
  });
}

// ── Resumo diário para o WhatsApp (sem nome/telefone de aluno) ─────

/** Um item por consultor com tarefas abertas: texto do resumo para a automação "Tarefas de CRM do dia". */
export async function dailyDigests(today: IsoDate) {
  const tasks = await prisma.crmTask.findMany({ where: { status: 'ABERTA' }, select: { kind: true, createdOn: true, caseId: true, case: { select: { ownerId: true, openValue: true } } } });
  const unassigned = tasks.filter((t) => !t.case.ownerId).length;
  const by = new Map<string, typeof tasks>();
  for (const t of tasks) if (t.case.ownerId) by.set(t.case.ownerId, [...(by.get(t.case.ownerId) ?? []), t]);

  // Líderes (crm.view_all) recebem também o resumo do time, mesmo sem tarefas próprias.
  const leaders = await prisma.user.findMany({ where: { active: true, roles: { some: { role: { permissions: { some: { permission: { key: 'crm.view_all' } } } } } } }, select: { id: true } });
  const leaderIds = new Set(leaders.map((l) => l.id));
  const ids = [...new Set([...by.keys(), ...leaderIds])];
  const users = await prisma.user.findMany({ where: { id: { in: ids }, active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, phone: true, teachers: { select: { teacher: { select: { phone: true } } } } } });
  const escalated = tasks.filter((t) => t.kind === 'D+15').length;

  return users.flatMap((u) => {
    const mine = by.get(u.id) ?? [];
    const lines: string[] = [];
    if (mine.length) {
      const late = mine.filter((t) => fromUtc(t.createdOn) < today).length;
      const cases = new Map(mine.map((t) => [t.caseId, Number(t.case.openValue)]));
      const value = [...cases.values()].reduce((s, v) => s + v, 0);
      const count = (k: (x: string) => boolean) => mine.filter((t) => k(t.kind)).length;
      lines.push(`• *${mine.length} tarefa(s)*${late ? ` — ${late} atrasada(s) 🔴` : ''}${value > 0 ? ` · ${brl(value)} em aberto` : ''}`);
      const parts = [
        [count((k) => k === 'D-3' || k === 'D0'), 'lembrete(s) de vencimento'],
        [count((k) => k === 'D+3' || k === 'D+5' || k === 'D+7'), 'cobrança(s) em atraso'],
        [count((k) => k === 'RETORNO'), 'retorno(s)/promessa(s) para conferir'],
        [count((k) => k === 'PENDENCIA'), 'pendência(s) na recepção'],
        [count((k) => k === 'D+15'), 'caso(s) escalado(s)'],
      ].filter(([n]) => (n as number) > 0).map(([n, l]) => `   ${n} ${l}`);
      lines.push(...parts);
    }
    // Líder sem tarefa própria só recebe se houver algo do time para olhar.
    if (leaderIds.has(u.id) && (unassigned || escalated)) {
      if (!mine.length) lines.push('• Nenhuma tarefa sua hoje.');
      lines.push('', '*Time*', ...(unassigned ? [`• ${unassigned} tarefa(s) sem responsável para distribuir`] : []), ...(escalated ? [`• ${escalated} caso(s) escalado(s) no D+15`] : []));
    }
    if (!lines.length) return [];
    return [{ userId: u.id, name: u.name, phone: u.phone ?? u.teachers.map((t) => t.teacher.phone).find(Boolean) ?? null, text: lines.join('\n') }];
  });
}
