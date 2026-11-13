import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/server/db';
import { audit } from '@/server/audit';
import { assertCan, can } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import type { RequestMeta } from '@/server/auth/session';
import { AppError, AuthorizationError, NotFoundError } from '@/server/errors';
import { addDays, formatDateBR, fromUtc, isIsoDate, toUtc, weekdayOf, type IsoDate } from '@/domain/dates';
import { DEFAULT_SEND, FILTERABLE_KINDS, SEND_HOURS, TASK_KINDS, brl, cadenceStep, daysBetween, daysLate, formatMobile, kindAllowed, maskMobile, type CaseKind } from '@/domain/cobranca';
import { todayIso } from '@/lib/today';

/**
 * Tarefas de CRM do consultor — o sistema NÃO fala com o aluno.
 * Geradas todo dia (depois da sincronização e antes de cada envio): o passo da régua de cada
 * caso aberto (D-3 … D+15), a pendência na recepção e o retorno agendado na Tecnofit que venceu.
 * O líder filtra (regras por consultor: tipos que ele recebe; e no dia a dia: adiar ou tirar
 * uma tarefa da lista), cria tarefas manuais (aluno opcional) e escolhe o horário do WhatsApp
 * de cada consultor. Baixa: ligação concluída registrada na Tecnofit depois que a tarefa entrou
 * na lista, caso resolvido (pagou) ou "já registrei" à mão. Não feita continua no topo.
 */

type P = Principal;
const d = (iso: IsoDate) => toUtc(iso);
const iso = (v: Date | null) => (v ? fromUtc(v) : null);
const SYSTEM = { actorId: null, userAgent: 'tarefas-crm' };
const REGUA = new Set(['D-3', 'D0', 'D+3', 'D+5', 'D+7', 'D+15']);
const parse = <S extends z.ZodType>(s: S, v: unknown): z.output<S> => {
  const r = s.safeParse(v);
  if (!r.success) throw new AppError(r.error.issues[0]?.message ?? 'Dados inválidos.');
  return r.data;
};

export interface TaskGenResult { created: number; done: number; superseded: number; closed: number }

/** Gera e dá baixa nas tarefas do dia. Idempotente: rodar de novo no mesmo dia não duplica. */
/**
 * `customerIds` (ids de tec_customers) limita a geração a esses alunos — usado pelos avisos da
 * Tecnofit (webhooks), que chegam um a um ao longo do dia.
 */
export async function generateTasks(today: IsoDate, opts: { customerIds?: string[] } = {}): Promise<TaskGenResult> {
  const r: TaskGenResult = { created: 0, done: 0, superseded: 0, closed: 0 };
  const only = opts.customerIds ? { customerId: { in: opts.customerIds } } : {};

  // 1) Caso que fechou: tarefas abertas dele saem (pagou = PAGAMENTO).
  const closedCases = await prisma.crmTask.findMany({ where: { status: 'ABERTA', ...only, case: { status: { not: 'ABERTO' } } }, select: { id: true, case: { select: { kind: true, status: true } } } });
  for (const t of closedCases) {
    await prisma.crmTask.update({ where: { id: t.id }, data: { status: 'FEITA', doneOn: d(today), doneVia: t.case!.kind === 'COBRANCA' && t.case!.status === 'RESOLVIDO' ? 'PAGAMENTO' : 'CASO_RESOLVIDO' } });
    r.closed++;
  }

  // 2) Baixa pela ligação concluída na Tecnofit no dia em que a tarefa apareceu ou depois (geradas e manuais com aluno).
  const withCustomer = await prisma.crmTask.findMany({ where: { status: 'ABERTA', customerId: { not: null }, ...only }, select: { id: true, showFrom: true, createdOn: true, customer: { select: { lastCallDoneOn: true } } } });
  for (const t of withCustomer) {
    const lastDone = iso(t.customer?.lastCallDoneOn ?? null);
    const since = [iso(t.createdOn)!, iso(t.showFrom)!].sort()[0]!;
    if (lastDone && lastDone >= since && lastDone <= today) {
      await prisma.crmTask.update({ where: { id: t.id }, data: { status: 'FEITA', doneOn: d(lastDone), doneVia: 'LIGACAO_TECNOFIT' } });
      r.done++;
    }
  }

  // 3) Renovações: contrato que termina em até 30 dias e ainda não renovou.
  const rr = await renewalTasks(today, opts.customerIds);
  r.created += rr.created; r.closed += rr.closed;

  const cases = await prisma.crmCase.findMany({ where: { status: 'ABERTO', ...only }, include: { customer: { select: { nextCallOn: true } } } });
  for (const c of cases) {
    // Responsável das tarefas acompanha o do caso (redistribuição do líder).
    await prisma.crmTask.updateMany({ where: { caseId: c.id, status: 'ABERTA', NOT: { ownerId: c.ownerId } }, data: { ownerId: c.ownerId } });
    let open = await prisma.crmTask.findMany({ where: { caseId: c.id, status: 'ABERTA' } });
    const nextCall = iso(c.customer.nextCallOn);

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
      // Já existe (inclusive tirada da lista pelo líder): não recria.
      const exists = await prisma.crmTask.findUnique({ where: { caseId_kind_refDate: { caseId: c.id, kind: w.kind, refDate: d(w.ref) } } });
      if (exists) continue;
      // Novo passo da régua: o anterior ainda aberto é substituído e fica anotado como "sem contato".
      const older = REGUA.has(w.kind) ? open.filter((t) => REGUA.has(t.kind)) : [];
      const missed = [...new Set(older.flatMap((t) => [...t.missed, t.kind]))];
      await prisma.$transaction(async (tx) => {
        for (const o of older) await tx.crmTask.update({ where: { id: o.id }, data: { status: 'SUBSTITUIDA' } });
        const t = await tx.crmTask.create({ data: { caseId: c.id, customerId: c.customerId, ownerId: c.ownerId, kind: w.kind, refDate: d(w.ref), createdOn: d(today), showFrom: d(today), missed } });
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

/** Dias antes do fim do contrato em que a tarefa de renovação entra na lista. */
export const RENEWAL_DAYS = 30;
/** Depois do fim sem renovar, a tarefa sai sozinha ("não renovou"). */
const RENEWAL_GRACE_DAYS = 15;

async function renewalTasks(today: IsoDate, customerIds?: string[]) {
  let created = 0, closed = 0;
  const only = customerIds ? { customerId: { in: customerIds } } : {};
  // Renovou, contrato sumiu ou passou do prazo: a tarefa fecha.
  const open = await prisma.crmTask.findMany({ where: { status: 'ABERTA', kind: 'RENOVACAO', ...only }, select: { id: true, refDate: true, customerId: true } });
  for (const t of open) {
    const c = t.customerId ? await prisma.tecContract.findFirst({ where: { customerId: t.customerId, dueDate: t.refDate } }) : null;
    const expired = iso(t.refDate)! < addDays(today, -RENEWAL_GRACE_DAYS);
    if (!c || c.renewed || expired) {
      await prisma.crmTask.update({ where: { id: t.id }, data: { status: 'FEITA', doneOn: d(today), doneVia: c?.renewed ? 'RENOVOU' : expired ? 'NAO_RENOVOU' : 'CONTRATO_ALTERADO' } });
      closed++;
    }
  }
  const ending = await prisma.tecContract.findMany({
    where: { renewed: false, dueDate: { gte: d(today), lte: d(addDays(today, RENEWAL_DAYS)) }, ...only },
    include: { customer: { select: { id: true, consultantTecId: true } } },
  });
  for (const c of ending) {
    const exists = await prisma.crmTask.findFirst({ where: { customerId: c.customerId, kind: 'RENOVACAO', refDate: c.dueDate } });
    if (exists) continue;
    const consultant = c.customer.consultantTecId ? await prisma.crmConsultant.findUnique({ where: { tecnofitId: c.customer.consultantTecId } }) : null;
    await prisma.crmTask.create({ data: { kind: 'RENOVACAO', customerId: c.customerId, ownerId: consultant?.active ? consultant.userId : null, refDate: c.dueDate, createdOn: d(today), showFrom: d(today), title: c.name } });
    created++;
  }
  return { created, closed };
}

// ── Regras do líder por consultor ────────────────────────

export interface AgentRule { taskKinds: string[]; sendHour: number; sendDays: number[] }
const ruleOf = (s: { taskKinds: string[]; sendHour: number; sendDays: number[] } | null | undefined): AgentRule =>
  s ? { taskKinds: s.taskKinds, sendHour: s.sendHour, sendDays: s.sendDays } : { taskKinds: [], sendHour: DEFAULT_SEND.hour, sendDays: [...DEFAULT_SEND.days] };

async function rulesFor(userIds: string[]) {
  const rows = await prisma.crmAgentSetting.findMany({ where: { userId: { in: userIds } } });
  const by = new Map(rows.map((r) => [r.userId, ruleOf(r)]));
  return (id: string | null) => (id ? by.get(id) ?? ruleOf(null) : ruleOf(null));
}

/** Time de CRM (quem tem crm.work) com as regras de cada um — tela do líder. */
export async function teamRules(principal: P | null) {
  assertCan(principal, 'crm.view_all');
  const users = await prisma.user.findMany({
    where: { active: true, roles: { some: { role: { permissions: { some: { permission: { key: 'crm.work' } } } } } } },
    select: { id: true, name: true, phone: true, teachers: { select: { teacher: { select: { phone: true } } } } },
    orderBy: { name: 'asc' },
  });
  const rule = await rulesFor(users.map((u) => u.id));
  // Dado pessoal: só se tem WhatsApp, nunca o número.
  return users.map((u) => ({ id: u.id, name: u.name, hasPhone: !!(u.phone ?? u.teachers.map((t) => t.teacher.phone).find(Boolean)), ...rule(u.id) }));
}

const ruleSchema = z.object({
  userId: z.string().uuid(),
  taskKinds: z.array(z.string()).max(20).refine((a) => a.every((k) => FILTERABLE_KINDS.includes(k)), 'Tipo de tarefa inválido.'),
  sendHour: z.number().int().refine((h) => (SEND_HOURS as readonly number[]).includes(h), 'Horário fora do permitido (6h às 14h).'),
  sendDays: z.array(z.number().int().min(1).max(7)).min(1, 'Escolha ao menos um dia da semana.').max(7),
});

export async function saveAgentRule(principal: P | null, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'crm.view_all');
  const v = parse(ruleSchema, input);
  const ok = (await teamRules(principal)).some((u) => u.id === v.userId);
  if (!ok) throw new AppError('Essa pessoa não está no time de CRM.');
  // Todos os tipos marcados = "todos" (assim um tipo novo também entra).
  const kinds = FILTERABLE_KINDS.every((k) => v.taskKinds.includes(k)) ? [] : [...new Set(v.taskKinds)];
  if (!kinds.length && v.taskKinds.length === 0) throw new AppError('Marque ao menos um tipo de tarefa.');
  const days = [...new Set(v.sendDays)].sort();
  await prisma.$transaction(async (tx) => {
    const before = await tx.crmAgentSetting.findUnique({ where: { userId: v.userId } });
    await tx.crmAgentSetting.upsert({ where: { userId: v.userId }, create: { userId: v.userId, taskKinds: kinds, sendHour: v.sendHour, sendDays: days, updatedById: principal.id }, update: { taskKinds: kinds, sendHour: v.sendHour, sendDays: days, updatedById: principal.id } });
    const who = (await tx.user.findUnique({ where: { id: v.userId }, select: { name: true } }))?.name ?? '—';
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: 'crm.agent_rule', entityType: 'user', entityId: v.userId, before: before ? ruleOf(before) : null, after: { taskKinds: kinds, sendHour: v.sendHour, sendDays: days },
      summary: `${principal.name} ajustou as tarefas de CRM de ${who}: ${kinds.length ? kinds.join(', ') : 'todos os tipos'} · WhatsApp às ${v.sendHour}h`,
    });
  });
}

// ── Lista ─────────────────────────────────────────────────

export const TASK_VIEWS = ['minhas', 'sem', 'escalados', 'renovacoes', 'agendadas', 'retidas', 'todas'] as const;
export type TaskView = (typeof TASK_VIEWS)[number];

const OPEN: Prisma.CrmTaskWhereInput = { status: 'ABERTA' };

function viewWhere(principal: P, view: TaskView, today: IsoDate): Prisma.CrmTaskWhereInput {
  const visible = { showFrom: { lte: d(today) } };
  if (view === 'minhas') return { ...visible, ownerId: principal.id };
  if (!can(principal, 'crm.view_all')) throw new AuthorizationError('Só o líder de CRM vê as tarefas do time.');
  if (view === 'sem') return { ...visible, ownerId: null };
  if (view === 'escalados') return { ...visible, kind: 'D+15' };
  if (view === 'renovacoes') return { ...visible, kind: 'RENOVACAO' };
  if (view === 'agendadas') return { showFrom: { gt: d(today) } };
  return visible; // todas / retidas (filtradas depois pela regra do consultor)
}

async function rowsFor(principal: P, view: TaskView, today: IsoDate) {
  const rows = await prisma.crmTask.findMany({
    where: { ...OPEN, ...viewWhere(principal, view, today) },
    include: {
      customer: { select: { tecnofitId: true, name: true, mobile: true, status: true } },
      case: { select: { kind: true, openValue: true, oldestDue: true } },
    },
    take: 1000,
  });
  const rule = await rulesFor([...new Set(rows.map((t) => t.ownerId).filter((x): x is string => !!x))]);
  const withHeld = rows.map((t) => ({ t, held: !!t.ownerId && !kindAllowed(t.kind, rule(t.ownerId).taskKinds) }));
  // Consultor só vê o que as regras do líder deixam; "Retidas" mostra o resto ao líder.
  if (view === 'minhas') return withHeld.filter((x) => !x.held);
  if (view === 'retidas') return withHeld.filter((x) => x.held);
  return withHeld;
}

export async function taskCounts(principal: P | null) {
  assertCan(principal, 'crm.view');
  const today = todayIso();
  const all = can(principal, 'crm.view_all');
  const n = async (v: TaskView) => (v === 'minhas' || all ? (await rowsFor(principal, v, today)).length : 0);
  const [minhas, sem, escalados, renovacoes, agendadas, retidas, todas] = await Promise.all(TASK_VIEWS.map(n));
  return { minhas: minhas!, sem: sem!, escalados: escalados!, renovacoes: renovacoes!, agendadas: agendadas!, retidas: retidas!, todas: todas! };
}

export async function listTasks(principal: P | null, view: TaskView) {
  assertCan(principal, 'crm.view');
  const today = todayIso();
  const personal = can(principal, 'crm.view_personal');
  const rows = await rowsFor(principal, view, today);
  const ownerIds = [...new Set(rows.map(({ t }) => t.ownerId).filter((x): x is string => !!x))];
  const owners = new Map((await prisma.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return rows.map(({ t, held }) => {
    const ref = iso(t.refDate)!;
    const due = iso(t.case?.oldestDue ?? null);
    const k = TASK_KINDS[t.kind] ?? { label: t.kind, todo: '' };
    const showFrom = iso(t.showFrom)!;
    return {
      id: t.id,
      kind: t.kind,
      label: t.kind === 'MANUAL' ? (t.title ?? 'Tarefa do líder') : k.label,
      plan: t.kind === 'RENOVACAO' ? t.title : null,
      todo: t.kind === 'MANUAL' ? (t.note ?? '') : k.todo.replace('{venc}', due ? formatDateBR(due) : '—').replace('{ref}', formatDateBR(ref)),
      manual: t.kind === 'MANUAL',
      showFrom,
      age: Math.max(daysBetween(showFrom, today), 0),
      missed: t.missed,
      held,
      caseKind: (t.case?.kind ?? null) as CaseKind | null,
      customer: t.customer ? { tecnofitId: t.customer.tecnofitId, name: t.customer.name, status: t.customer.status } : null,
      // Dado pessoal: completo só com crm.view_personal.
      phone: t.customer ? (personal ? formatMobile(t.customer.mobile) : maskMobile(t.customer.mobile)) : null,
      openValue: t.case ? Number(t.case.openValue) : 0,
      daysLate: due ? daysLate(due, today) : null,
      ownerId: t.ownerId,
      ownerName: t.ownerId ? owners.get(t.ownerId) ?? 'Usuário removido' : null,
    };
  }).sort((a, b) => b.age - a.age || Number(b.manual) - Number(a.manual) || (b.daysLate ?? -99) - (a.daysLate ?? -99) || b.openValue - a.openValue);
}
export type TaskRow = Awaited<ReturnType<typeof listTasks>>[number];

/** Resumo por consultor (líder): abertas, atrasadas, feitas nos últimos 7 dias. */
export async function teamSummary(principal: P | null) {
  assertCan(principal, 'crm.view_all');
  const today = todayIso();
  const [open, done] = await Promise.all([
    prisma.crmTask.findMany({ where: { ...OPEN, showFrom: { lte: d(today) } }, select: { showFrom: true, ownerId: true } }),
    prisma.crmTask.findMany({ where: { status: 'FEITA', doneOn: { gte: d(addDays(today, -6)) } }, select: { doneVia: true, ownerId: true } }),
  ]);
  const ids = [...new Set([...open, ...done].map((t) => t.ownerId).filter((x): x is string => !!x))];
  const names = new Map((await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const by = new Map<string, { name: string; open: number; late: number; done7: number; byCall7: number }>();
  const get = (id: string | null) => {
    const key = id ?? '—';
    if (!by.has(key)) by.set(key, { name: id ? names.get(id) ?? 'Usuário removido' : 'Sem responsável', open: 0, late: 0, done7: 0, byCall7: 0 });
    return by.get(key)!;
  };
  for (const t of open) { const g = get(t.ownerId); g.open++; if (iso(t.showFrom)! < today) g.late++; }
  for (const t of done) { const g = get(t.ownerId); g.done7++; if (t.doneVia === 'LIGACAO_TECNOFIT') g.byCall7++; }
  return [...by.values()].sort((a, b) => b.late - a.late || b.open - a.open);
}

// ── Ações ─────────────────────────────────────────────────

async function openTask(tx: Prisma.TransactionClient, id: string) {
  const t = await tx.crmTask.findUnique({ where: { id } });
  if (!t) throw new NotFoundError('Tarefa não encontrada.');
  if (t.status !== 'ABERTA') throw new AppError('Esta tarefa já saiu da lista.');
  return t;
}

/** "Já registrei na Tecnofit" / "Feita": baixa manual (dono ou líder). */
export async function markTaskDone(principal: P | null, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'crm.work');
  const { taskId } = parse(z.object({ taskId: z.string().uuid() }), input);
  return prisma.$transaction(async (tx) => {
    const t = await tx.crmTask.findUnique({ where: { id: taskId } });
    if (!t) throw new NotFoundError('Tarefa não encontrada.');
    if (t.ownerId !== principal.id && !can(principal, 'crm.view_all')) throw new AuthorizationError('Esta tarefa é de outro consultor.');
    if (t.status !== 'ABERTA') throw new AppError('Esta tarefa já saiu da lista.');
    await tx.crmTask.update({ where: { id: t.id }, data: { status: 'FEITA', doneOn: d(todayIso()), doneVia: 'MANUAL', doneById: principal.id } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'crm.task_done', entityType: 'crm_task', entityId: t.id, after: { kind: t.kind, via: 'MANUAL' }, summary: `${principal.name} marcou a tarefa ${t.kind === 'MANUAL' ? `"${t.title}"` : t.kind} como feita` });
  });
}

const dateStr = z.string().refine((v) => isIsoDate(v), 'Data inválida.');

/** Líder adia uma tarefa (some da lista e do WhatsApp até a data). */
export async function snoozeTask(principal: P | null, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'crm.view_all');
  const v = parse(z.object({ taskId: z.string().uuid(), until: dateStr }), input);
  const today = todayIso();
  if (v.until <= today) throw new AppError('Escolha uma data a partir de amanhã.');
  if (v.until > addDays(today, 60)) throw new AppError('Adie no máximo 60 dias.');
  await prisma.$transaction(async (tx) => {
    const t = await openTask(tx, v.taskId);
    await tx.crmTask.update({ where: { id: t.id }, data: { showFrom: d(v.until) } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'crm.task_snoozed', entityType: 'crm_task', entityId: t.id, before: { showFrom: iso(t.showFrom) }, after: { showFrom: v.until }, summary: `${principal.name} adiou a tarefa ${t.kind} para ${formatDateBR(v.until)}` });
  });
}

/** Líder tira uma tarefa da lista (motivo obrigatório). Não volta a ser gerada; o próximo passo da régua, sim. */
export async function removeTask(principal: P | null, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'crm.view_all');
  const v = parse(z.object({ taskId: z.string().uuid(), reason: z.string().trim().min(3, 'Diga o motivo.').max(300) }), input);
  await prisma.$transaction(async (tx) => {
    const t = await openTask(tx, v.taskId);
    await tx.crmTask.update({ where: { id: t.id }, data: { status: 'REMOVIDA', removedReason: v.reason, doneOn: d(todayIso()), doneVia: 'LIDER', doneById: principal.id } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'crm.task_removed', entityType: 'crm_task', entityId: t.id, after: { kind: t.kind, reason: v.reason }, summary: `${principal.name} tirou a tarefa ${t.kind} da lista: ${v.reason}` });
  });
}

const manualSchema = z.object({
  ownerId: z.string().uuid('Escolha o consultor.'),
  showFrom: dateStr,
  title: z.string().trim().min(3, 'Diga o que fazer.').max(120),
  note: z.string().trim().max(600).optional().nullable(),
  customerId: z.string().uuid().optional().nullable(),
});

/** Líder cria tarefa manual para um consultor (aparece na data escolhida; padrão amanhã). Aluno opcional. */
export async function createManualTask(principal: P | null, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'crm.view_all');
  const v = parse(manualSchema, input);
  const today = todayIso();
  if (v.showFrom < today || v.showFrom > addDays(today, 60)) throw new AppError('Escolha uma data de hoje até 60 dias.');
  if (!(await teamRules(principal)).some((u) => u.id === v.ownerId)) throw new AppError('Essa pessoa não está no time de CRM.');
  if (v.customerId && !(await prisma.tecCustomer.findUnique({ where: { id: v.customerId } }))) throw new NotFoundError('Aluno não encontrado.');
  return prisma.$transaction(async (tx) => {
    const t = await tx.crmTask.create({
      data: { kind: 'MANUAL', ownerId: v.ownerId, customerId: v.customerId ?? null, title: v.title, note: v.note || null, refDate: d(v.showFrom), createdOn: d(v.showFrom), showFrom: d(v.showFrom), createdById: principal.id },
    });
    const who = (await tx.user.findUnique({ where: { id: v.ownerId }, select: { name: true } }))?.name ?? '—';
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'crm.task_manual', entityType: 'crm_task', entityId: t.id, after: { ownerId: v.ownerId, showFrom: v.showFrom, withCustomer: !!v.customerId }, summary: `${principal.name} criou a tarefa "${v.title}" para ${who} (${formatDateBR(v.showFrom)})` });
    return t.id;
  });
}

/** Busca de aluno para a tarefa manual: só quem está no espelho da Tecnofit (alunos com caso/débito). */
export async function searchCustomers(principal: P | null, q: string) {
  assertCan(principal, 'crm.view_all');
  const term = q.trim().slice(0, 60);
  if (term.length < 2) return [];
  const rows = await prisma.tecCustomer.findMany({ where: { name: { contains: term, mode: 'insensitive' } }, select: { id: true, name: true, tecnofitId: true }, orderBy: { name: 'asc' }, take: 15 });
  return rows;
}

// ── WhatsApp diário (sem nome/telefone de aluno) ──────────

/**
 * Resumos do dia por consultor: só o que as regras do líder deixam e o que aparece hoje.
 * `hour`: só quem tem esse horário e hoje é dia de envio (null = todos, ex.: "Enviar agora").
 */
export async function dailyDigests(today: IsoDate, opts: { hour?: number | null } = {}) {
  const tasks = await prisma.crmTask.findMany({ where: { ...OPEN, showFrom: { lte: d(today) } }, select: { kind: true, showFrom: true, caseId: true, ownerId: true, case: { select: { openValue: true } } } });
  const owners = [...new Set(tasks.map((t) => t.ownerId).filter((x): x is string => !!x))];
  const leaders = await prisma.user.findMany({ where: { active: true, roles: { some: { role: { permissions: { some: { permission: { key: 'crm.view_all' } } } } } } }, select: { id: true } });
  const leaderIds = new Set(leaders.map((l) => l.id));
  const ids = [...new Set([...owners, ...leaderIds])];
  const rule = await rulesFor(ids);
  const visible = tasks.filter((t) => !t.ownerId || kindAllowed(t.kind, rule(t.ownerId).taskKinds));
  const unassigned = visible.filter((t) => !t.ownerId).length;
  const escalated = visible.filter((t) => t.kind === 'D+15').length;
  const by = new Map<string, typeof tasks>();
  for (const t of visible) if (t.ownerId) by.set(t.ownerId, [...(by.get(t.ownerId) ?? []), t]);

  const wd = weekdayOf(today);
  const users = await prisma.user.findMany({ where: { id: { in: ids }, active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, phone: true, teachers: { select: { teacher: { select: { phone: true } } } } } });
  return users.flatMap((u) => {
    const r = rule(u.id);
    if (opts.hour != null && (r.sendHour !== opts.hour || !r.sendDays.includes(wd))) return [];
    const mine = by.get(u.id) ?? [];
    const lines: string[] = [];
    if (mine.length) {
      const late = mine.filter((t) => fromUtc(t.showFrom) < today).length;
      const cases = new Map(mine.filter((t) => t.caseId).map((t) => [t.caseId!, Number(t.case?.openValue ?? 0)]));
      const value = [...cases.values()].reduce((s, v) => s + v, 0);
      const count = (k: (x: string) => boolean) => mine.filter((t) => k(t.kind)).length;
      lines.push(`• *${mine.length} tarefa(s)*${late ? ` — ${late} atrasada(s) 🔴` : ''}${value > 0 ? ` · ${brl(value)} em aberto` : ''}`);
      lines.push(...[
        [count((k) => k === 'MANUAL'), 'tarefa(s) do líder'],
        [count((k) => k === 'D-3' || k === 'D0'), 'lembrete(s) de vencimento'],
        [count((k) => k === 'D+3' || k === 'D+5' || k === 'D+7'), 'cobrança(s) em atraso'],
        [count((k) => k === 'RETORNO'), 'retorno(s)/promessa(s) para conferir'],
        [count((k) => k === 'PENDENCIA'), 'pendência(s) na recepção'],
        [count((k) => k === 'D+15'), 'caso(s) escalado(s)'],
        [count((k) => k === 'RENOVACAO'), 'renovação(ões) de plano'],
      ].filter(([n]) => (n as number) > 0).map(([n, l]) => `   ${n} ${l}`));
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
