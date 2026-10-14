import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/server/db';
import { audit } from '@/server/audit';
import { assertCan, can } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import type { RequestMeta } from '@/server/auth/session';
import { AppError, AuthorizationError, NotFoundError } from '@/server/errors';
import { isIsoDate } from '@/domain/dates';
import { DEMAND_STATUSES, demandOrder, isLate, isOpen, OPEN_STATUSES, ORIGINS, PRIORITIES, sectorStats, type SectorStats } from '@/domain/processos';
import { dt, iso } from './marketing-service';

/**
 * Gestão de Processos: setores, líderes e demandas acompanhadas pela gestão.
 * Diretoria (proc.admin) vê e cobra tudo; o líder vê os setores que lidera e
 * as demandas em que é responsável. Rotinas e checklists ficam no Nação Task.
 */

const isAdmin = (p: Principal) => can(p, 'proc.admin');

async function ledSectorIds(p: Principal) {
  return (await prisma.procSector.findMany({ where: { leaderId: p.id }, select: { id: true } })).map((s) => s.id);
}

/** O que esta pessoa enxerga: tudo (diretoria) ou os setores que lidera + o que é dela. */
async function demandScope(p: Principal): Promise<Prisma.ProcDemandWhereInput> {
  if (isAdmin(p)) return {};
  return { OR: [{ sectorId: { in: await ledSectorIds(p) } }, { ownerId: p.id }] };
}

async function canWork(p: Principal, d: { sectorId: string; ownerId: string | null }) {
  if (isAdmin(p)) return true;
  if (!can(p, 'proc.edit')) return false;
  return d.ownerId === p.id || (await ledSectorIds(p)).includes(d.sectorId);
}

export async function procPeople() {
  const users = await prisma.user.findMany({
    where: { active: true }, orderBy: { name: 'asc' },
    select: { id: true, name: true, roles: { select: { role: { select: { permissions: { select: { permission: { select: { key: true } } } } } } } } },
  });
  return users.map((u) => ({ id: u.id, name: u.name, canProc: u.roles.some((r) => r.role.permissions.some((x) => x.permission.key === 'proc.view')) }));
}
export type ProcPerson = Awaited<ReturnType<typeof procPeople>>[number];

// ── Painel ────────────────────────────────────────────────

export interface SectorCard {
  id: string; name: string; description: string | null; leaderId: string | null; leader: string | null; taskUrl: string | null; active: boolean;
  stats: SectorStats; top: { id: string; title: string; dueDate: string | null; late: boolean; priority: string }[];
  /** WhatsApp do líder (cadastro do usuário ou do professor vinculado). */
  leaderPhone: string | null;
  open: { title: string; status: string; dueDate: string | null; priority: string; doneAt: null }[];
}

export async function procPanel(principal: Principal | null, today: string): Promise<{ sectors: SectorCard[]; totals: SectorStats & { sectors: number } }> {
  assertCan(principal, 'proc.view');
  const admin = isAdmin(principal);
  const led = admin ? null : await ledSectorIds(principal);
  const monthStart = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
  const sectors = await prisma.procSector.findMany({
    where: { active: true, ...(led ? { id: { in: led } } : {}) },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { demands: { where: { OR: [{ status: { in: OPEN_STATUSES } }, { doneAt: { gte: monthStart } }] }, select: { id: true, title: true, status: true, dueDate: true, priority: true, doneAt: true } } },
  });
  const leaders = new Map((await prisma.user.findMany({ where: { id: { in: sectors.map((s) => s.leaderId).filter((x): x is string => !!x) } }, select: { id: true, name: true, phone: true, teachers: { select: { teacher: { select: { phone: true } } } } } })).map((u) => [u.id, u]));
  const names = new Map([...leaders].map(([id, u]) => [id, u.name]));
  const lite = (d: (typeof sectors)[number]['demands'][number]) => ({ status: d.status, dueDate: iso(d.dueDate), priority: d.priority, doneAt: d.doneAt?.toISOString() ?? null });
  const cards = sectors.map((s) => ({
    id: s.id, name: s.name, description: s.description, leaderId: s.leaderId, leader: s.leaderId ? names.get(s.leaderId) ?? null : null, taskUrl: s.taskUrl, active: s.active,
    stats: sectorStats(s.demands.map(lite), today),
    top: s.demands.filter((d) => isOpen(d.status)).map((d) => ({ ...lite(d), id: d.id, title: d.title }))
      .sort((a, b) => demandOrder(a, b, today)).slice(0, 3).map((d) => ({ id: d.id, title: d.title, dueDate: d.dueDate, late: isLate(d, today), priority: d.priority })),
    leaderPhone: (() => { const u = s.leaderId ? leaders.get(s.leaderId) : null; return u ? u.phone ?? u.teachers.map((t) => t.teacher.phone).find(Boolean) ?? null : null; })(),
    open: s.demands.filter((d) => isOpen(d.status)).map((d) => ({ title: d.title, status: d.status, dueDate: iso(d.dueDate), priority: d.priority, doneAt: null })),
  }));
  const all = sectors.flatMap((s) => s.demands.map(lite));
  return { sectors: cards, totals: { ...sectorStats(all, today), sectors: cards.length } };
}

// ── Demandas ──────────────────────────────────────────────

export interface DemandRow {
  id: string; title: string; description: string | null; sectorId: string; sector: string; ownerId: string | null; owner: string | null; requester: string | null;
  dueDate: string | null; priority: string; status: string; origin: string; late: boolean; doneAt: string | null; createdAt: string; comments: number; canWork: boolean;
}

export async function listDemands(principal: Principal | null, today: string, f: { sectorId?: string; view?: 'abertas' | 'concluidas' | 'todas'; mine?: boolean } = {}): Promise<DemandRow[]> {
  assertCan(principal, 'proc.view');
  const view = f.view ?? 'abertas';
  const where: Prisma.ProcDemandWhereInput = {
    AND: [
      await demandScope(principal),
      f.sectorId ? { sectorId: f.sectorId } : {},
      f.mine ? { ownerId: principal.id } : {},
      view === 'abertas' ? { status: { in: OPEN_STATUSES } } : view === 'concluidas' ? { status: { in: ['CONCLUIDA', 'CANCELADA'] } } : {},
    ],
  };
  const rows = await prisma.procDemand.findMany({ where, include: { sector: { select: { name: true, leaderId: true } }, _count: { select: { comments: true } } }, take: 500, orderBy: { createdAt: 'desc' } });
  const ids = [...new Set(rows.flatMap((r) => [r.ownerId, r.requesterId]).filter((x): x is string => !!x))];
  const names = new Map((await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const led = isAdmin(principal) ? null : new Set(await ledSectorIds(principal));
  const editor = can(principal, 'proc.edit');
  return rows.map((r) => {
    const d = { status: r.status, dueDate: iso(r.dueDate), priority: r.priority, doneAt: r.doneAt?.toISOString() ?? null };
    return {
      id: r.id, title: r.title, description: r.description, sectorId: r.sectorId, sector: r.sector.name, ownerId: r.ownerId, owner: r.ownerId ? names.get(r.ownerId) ?? null : null,
      requester: r.requesterId ? names.get(r.requesterId) ?? null : null, dueDate: d.dueDate, priority: r.priority, status: r.status, origin: r.origin,
      late: isLate(d, today), doneAt: d.doneAt, createdAt: r.createdAt.toISOString(), comments: r._count.comments,
      canWork: !led || (editor && (r.ownerId === principal.id || led.has(r.sectorId))),
    };
  }).sort((a, b) => demandOrder(a, b, today));
}

const demandSchema = z.object({
  sectorId: z.string().uuid('Escolha o setor.'),
  title: z.string().trim().min(3, 'Dê um título à demanda.').max(160),
  description: z.string().trim().max(4000).nullable(),
  ownerId: z.string().uuid().nullable(),
  dueDate: z.string().refine(isIsoDate, 'Prazo inválido.').nullable(),
  priority: z.enum(PRIORITIES.map((p) => p.id) as [string, ...string[]]),
  origin: z.enum(ORIGINS.map((o) => o.id) as [string, ...string[]]).optional(),
});

/** Diretoria abre em qualquer setor; o líder, só nos que lidera. Sem responsável = líder do setor. */
export async function saveDemand(principal: Principal | null, id: string | null, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'proc.view');
  const r = demandSchema.safeParse(input);
  if (!r.success) throw new AppError(r.error.issues[0]?.message ?? 'Dados inválidos.');
  const d = r.data;
  const sector = await prisma.procSector.findUnique({ where: { id: d.sectorId } });
  if (!sector || !sector.active) throw new NotFoundError('Setor não encontrado.');
  const admin = isAdmin(principal);
  if (!admin && !(can(principal, 'proc.edit') && sector.leaderId === principal.id)) throw new AuthorizationError('Você só abre demandas nos setores que lidera.');
  if (d.ownerId && !(await prisma.user.findFirst({ where: { id: d.ownerId, active: true }, select: { id: true } }))) throw new AppError('Responsável não encontrado.');
  const data = {
    sectorId: d.sectorId, title: d.title, description: d.description || null, ownerId: d.ownerId ?? sector.leaderId,
    dueDate: dt(d.dueDate), priority: d.priority as 'MEDIA',
  };
  return prisma.$transaction(async (tx) => {
    if (id) {
      const before = await tx.procDemand.findUnique({ where: { id } });
      if (!before) throw new NotFoundError('Demanda não encontrada.');
      if (!(await canWork(principal, before))) throw new AuthorizationError('Esta demanda não é do seu setor.');
      const after = await tx.procDemand.update({ where: { id }, data });
      await audit(tx, { actorId: principal.id, ...meta }, { action: 'proc.demand_updated', entityType: 'proc_demand', entityId: id, before, after, summary: `${principal.name} editou a demanda "${after.title}" (${sector.name})` });
      return id;
    }
    const created = await tx.procDemand.create({ data: { ...data, requesterId: principal.id, origin: d.origin ?? (admin ? 'DIRETORIA' : 'LIDER') } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'proc.demand_created', entityType: 'proc_demand', entityId: created.id, after: created, summary: `${principal.name} abriu a demanda "${created.title}" para ${sector.name}` });
    return created.id;
  });
}

export async function setDemandStatus(principal: Principal | null, id: string, status: string, meta: RequestMeta) {
  assertCan(principal, 'proc.view');
  if (!DEMAND_STATUSES.some((s) => s.id === status)) throw new AppError('Status inválido.');
  await prisma.$transaction(async (tx) => {
    const d = await tx.procDemand.findUnique({ where: { id }, include: { sector: { select: { name: true } } } });
    if (!d) throw new NotFoundError('Demanda não encontrada.');
    if (!(await canWork(principal, d))) throw new AuthorizationError('Esta demanda não é do seu setor.');
    if (d.status === status) return;
    const doneAt = status === 'CONCLUIDA' ? new Date() : isOpen(status) ? null : d.doneAt;
    await tx.procDemand.update({ where: { id }, data: { status: status as 'ABERTA', doneAt } });
    const label = DEMAND_STATUSES.find((s) => s.id === status)!.label.toLowerCase();
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'proc.demand_status', entityType: 'proc_demand', entityId: id, before: { status: d.status }, after: { status }, summary: `${principal.name} marcou "${d.title}" (${d.sector.name}) como ${label}` });
  });
}

export async function deleteDemand(principal: Principal | null, id: string, meta: RequestMeta) {
  assertCan(principal, 'proc.admin');
  await prisma.$transaction(async (tx) => {
    const d = await tx.procDemand.findUnique({ where: { id } });
    if (!d) throw new NotFoundError('Demanda não encontrada.');
    await tx.procDemand.delete({ where: { id } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'proc.demand_deleted', entityType: 'proc_demand', entityId: id, before: d, summary: `${principal.name} excluiu a demanda "${d.title}"` });
  });
}

export async function demandComments(principal: Principal | null, id: string) {
  assertCan(principal, 'proc.view');
  const d = await prisma.procDemand.findFirst({ where: { AND: [{ id }, await demandScope(principal)] }, select: { id: true } });
  if (!d) throw new NotFoundError('Demanda não encontrada.');
  const rows = await prisma.procComment.findMany({ where: { demandId: id }, orderBy: { createdAt: 'asc' } });
  const names = new Map((await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.authorId).filter((x): x is string => !!x) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return rows.map((r) => ({ id: r.id, body: r.body, author: r.authorId ? names.get(r.authorId) ?? null : null, at: r.createdAt.toISOString() }));
}

export async function addDemandComment(principal: Principal | null, id: string, body: string, meta: RequestMeta) {
  assertCan(principal, 'proc.view');
  const text = body.trim().slice(0, 2000);
  if (text.length < 2) throw new AppError('Escreva o comentário.');
  const d = await prisma.procDemand.findFirst({ where: { AND: [{ id }, await demandScope(principal)] } });
  if (!d) throw new NotFoundError('Demanda não encontrada.');
  await prisma.$transaction(async (tx) => {
    const c = await tx.procComment.create({ data: { demandId: id, authorId: principal.id, body: text } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'proc.demand_comment', entityType: 'proc_demand', entityId: id, after: { comentario: c.id }, summary: `${principal.name} comentou em "${d.title}"` });
  });
}

// ── Setores ───────────────────────────────────────────────

const sectorSchema = z.object({
  name: z.string().trim().min(2, 'Dê um nome ao setor.').max(80),
  description: z.string().trim().max(300).nullable(),
  leaderId: z.string().uuid().nullable(),
  taskUrl: z.string().trim().max(500).refine((v) => !v || /^https:\/\//.test(v), 'O link do Nação Task deve começar com https://').nullable(),
  sortOrder: z.number().int().min(0).max(999),
  active: z.boolean(),
});

export async function listSectors(principal: Principal | null) {
  assertCan(principal, 'proc.admin');
  const rows = await prisma.procSector.findMany({ orderBy: [{ active: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }], include: { _count: { select: { demands: true } } } });
  return rows.map((s) => ({ id: s.id, name: s.name, description: s.description, leaderId: s.leaderId, taskUrl: s.taskUrl, sortOrder: s.sortOrder, active: s.active, demands: s._count.demands }));
}

export async function saveSector(principal: Principal | null, id: string | null, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'proc.admin');
  const r = sectorSchema.safeParse(input);
  if (!r.success) throw new AppError(r.error.issues[0]?.message ?? 'Dados inválidos.');
  const data = { ...r.data, description: r.data.description || null, taskUrl: r.data.taskUrl || null };
  if (data.leaderId && !(await prisma.user.findFirst({ where: { id: data.leaderId, active: true }, select: { id: true } }))) throw new AppError('Líder não encontrado.');
  const dup = await prisma.procSector.findFirst({ where: { name: { equals: data.name, mode: 'insensitive' }, ...(id ? { NOT: { id } } : {}) } });
  if (dup) throw new AppError('Já existe um setor com esse nome.');
  return prisma.$transaction(async (tx) => {
    const before = id ? await tx.procSector.findUnique({ where: { id } }) : null;
    if (id && !before) throw new NotFoundError('Setor não encontrado.');
    const s = id ? await tx.procSector.update({ where: { id }, data }) : await tx.procSector.create({ data });
    await audit(tx, { actorId: principal.id, ...meta }, { action: id ? 'proc.sector_updated' : 'proc.sector_created', entityType: 'proc_sector', entityId: s.id, before, after: s, summary: `${principal.name} ${id ? 'atualizou' : 'criou'} o setor ${s.name}` });
    return s.id;
  });
}

// ── Para a tela Hoje ──────────────────────────────────────

/** Demandas abertas que são minhas ou dos setores que lidero (diretoria: as atrasadas de todos). */
export async function myOpenDemands(principal: Principal, today: string) {
  if (!can(principal, 'proc.view')) return null;
  const led = await ledSectorIds(principal);
  const where: Prisma.ProcDemandWhereInput = isAdmin(principal) && !led.length
    ? { status: { in: OPEN_STATUSES }, dueDate: { lt: dt(today)! } }
    : { status: { in: OPEN_STATUSES }, OR: [{ ownerId: principal.id }, { sectorId: { in: led } }] };
  const rows = await prisma.procDemand.findMany({ where, include: { sector: { select: { name: true } } }, take: 50 });
  const list = rows.map((r) => ({ id: r.id, title: r.title, sector: r.sector.name, status: r.status, dueDate: iso(r.dueDate), priority: r.priority, doneAt: null }))
    .sort((a, b) => demandOrder(a, b, today));
  return { mode: isAdmin(principal) && !led.length ? ('atrasadas' as const) : ('minhas' as const), items: list.slice(0, 6).map((d) => ({ ...d, late: isLate(d, today) })), total: list.length };
}
