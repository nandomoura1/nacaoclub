import { z } from 'zod';
import { prisma } from '@/server/db';
import { audit } from '@/server/audit';
import { assertCan } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import type { RequestMeta } from '@/server/auth/session';
import { AppError, NotFoundError } from '@/server/errors';
import { fromUtc, toUtc, weekdayOf, type IsoDate } from '@/domain/dates';
import { classesOfHour, hhmm, hourOf, minutesOf, nextClass, sameHour, suggestModality, tvLabel } from '@/domain/tv-checkins';
import { todayIso } from '@/lib/today';
import { tecnofitApi, tecnofitConfig } from '@/server/tecnofit/client';

/**
 * Check-ins na TV do box. A Tecnofit não filtra check-in por aula nem tem webhook: uma consulta
 * "check-ins de hoje" por minuto, compartilhada por todas as TVs (só quando há TV com check-in
 * ligada em aula), buscando só as páginas novas e uma varredura completa a cada 10 min.
 * A TV recebe só "Nome I." da aula atual (turma da Tecnofit vinculada à modalidade da tela),
 * sem horário de chegada; quem pediu para não aparecer some (opt-out). Dados do dia são apagados no dia seguinte.
 */

const d = (iso: IsoDate) => toUtc(iso);
const REFRESH_MS = 60_000;
const FULL_SCAN_MS = 10 * 60_000;
const KINDS = ['class', 'crossfit'] as const;

const nowMinSP = (now: Date) => {
  const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).format(now).split(':');
  return Number(h) * 60 + Number(m);
};

// ── Consulta à Tecnofit (uma por minuto para todas as TVs) ─────────────

/** Atualiza agenda e check-ins de hoje se a última consulta tiver mais de 1 min. Devolve se consultou. */
export async function refreshCheckins(today: IsoDate, now = new Date()): Promise<boolean> {
  if (!tecnofitConfig().configured) return false;
  await prisma.tvCheckinSync.createMany({ data: [{ day: d(today), kind: 'lock', fetchedAt: new Date(0) }], skipDuplicates: true });
  // Trava atômica: só uma chamada por minuto vai à Tecnofit, por mais TVs que estejam ligadas.
  const claimed = await prisma.tvCheckinSync.updateMany({ where: { day: d(today), kind: 'lock', fetchedAt: { lt: new Date(now.getTime() - REFRESH_MS) } }, data: { fetchedAt: now } });
  if (!claimed.count) return false;

  // Dados de dias anteriores saem (só o dia corrente fica guardado).
  await prisma.tvCheckin.deleteMany({ where: { day: { lt: d(today) } } });
  await prisma.tecClassSlot.deleteMany({ where: { day: { lt: d(today) } } });
  await prisma.tvCheckinSync.deleteMany({ where: { day: { lt: d(today) } } });

  const { api } = await tecnofitApi();
  try {
    const events = await api.schedule(today);
    await prisma.$transaction([
      prisma.tecClassSlot.deleteMany({ where: { day: d(today) } }),
      prisma.tecClassSlot.createMany({
        data: events.map((e) => ({ day: d(today), tecnofitEventId: e.eventId, tecnofitClassId: e.classId || e.eventId, name: e.name, start: e.startTime.slice(0, 5), end: e.endTime.slice(0, 5), capacity: e.capacity, occupied: e.occupied })),
        skipDuplicates: true,
      }),
    ]);
  } catch (e) {
    console.error('[tv-checkins] agenda', e instanceof Error ? e.message : e);
  }
  const slots = await prisma.tecClassSlot.findMany({ where: { day: d(today) } });
  const byEvent = new Map(slots.map((s) => [s.tecnofitEventId, s]));

  for (const kind of KINDS) {
    try {
      const state = await prisma.tvCheckinSync.findUnique({ where: { day_kind: { day: d(today), kind } } });
      const full = !state?.fullAt || now.getTime() - state.fullAt.getTime() > FULL_SCAN_MS;
      let page = full ? 1 : Math.floor((state?.total ?? 0) / 50) + 1;
      let total = state?.total ?? 0;
      for (let guard = 0; guard < 60; guard++, page++) {
        const r = await api.checkinsPage(today, kind, page);
        total = r.total;
        if (r.rows.length) {
          await prisma.tvCheckin.createMany({
            data: r.rows.map((x) => {
              // O id da aula no check-in pode ser o evento do dia: a agenda diz a turma.
              const ev = byEvent.get(x.classId);
              const classId = ev?.tecnofitClassId ?? x.classId;
              const startMin = minutesOf(x.classStart) ?? minutesOf(ev?.start);
              return { day: d(today), tecnofitClassId: classId, start: startMin === null ? '' : hhmm(startMin), customerTecId: x.customerId, name: x.customerName.slice(0, 120), label: tvLabel(x.customerName), className: (x.className || ev?.name || '').slice(0, 120), checkinAt: x.checkinAt };
            }),
            skipDuplicates: true,
          });
        }
        if (page >= r.pages || !r.rows.length) break;
      }
      await prisma.tvCheckinSync.upsert({
        where: { day_kind: { day: d(today), kind } },
        create: { day: d(today), kind, fetchedAt: now, total, fullAt: full ? now : null },
        update: { fetchedAt: now, total, ...(full ? { fullAt: now } : {}) },
      });
    } catch (e) {
      console.error('[tv-checkins]', kind, e instanceof Error ? e.message : e);
    }
  }
  return true;
}

// ── O que a TV mostra ─────────────────────────────────────

export interface TvCheckinView {
  /** false = fora do horário de aulas do dia (ou check-in desligado na tela). */
  active: boolean;
  /** Hora cheia sem turma (ex.: 7h): a faixa mostra "sem turma" e a próxima. */
  noClass?: boolean;
  /** Início da próxima turma ("10:00"), quando não há turma nesta hora. */
  next?: string | null;
  /** Aula agora, mas a turma da Tecnofit ainda não foi vinculada a esta modalidade. */
  configured: boolean;
  title: string | null;
  labels: string[];
  count: number;
  capacity: number | null;
}

const OFF: TvCheckinView = { active: false, configured: false, title: null, labels: [], count: 0, capacity: null };

/** Aulas de hoje da modalidade (competência gerada; senão, a grade semanal). */
async function todaysClasses(modalityId: string, spaceId: string | null, today: IsoDate) {
  const occ = await prisma.classOccurrence.findMany({
    where: { date: d(today), modalityId, status: { not: 'CANCELADA' }, ...(spaceId ? { OR: [{ spaceId }, { spaceId: null }] } : {}) },
    select: { startMin: true, durationMin: true, spaceId: true, label: true },
  });
  if (occ.length) return occ;
  return prisma.scheduleSlotVersion.findMany({
    where: { weekday: weekdayOf(today), modalityId, validFrom: { lte: d(today) }, OR: [{ validTo: null }, { validTo: { gte: d(today) } }], ...(spaceId ? { AND: [{ OR: [{ spaceId }, { spaceId: null }] }] } : {}) },
    select: { startMin: true, durationMin: true, spaceId: true, label: true },
  });
}

/**
 * Check-ins da turma da hora cheia para a TV deste link (só rótulos "Nome I.").
 * Turmas do dia = grade da Nação (modalidade + espaço da tela) e, nas horas em que a grade não tem
 * aula, as turmas da Tecnofit vinculadas à modalidade. Às 6h00 a TV passa sozinha para a turma das 6h.
 */
export async function checkinsByToken(token: string, now = new Date()): Promise<TvCheckinView | null> {
  if (!/^[a-z0-9]{8,64}$/.test(token)) return null;
  const s = await prisma.tvScreen.findUnique({ where: { token }, include: { modality: { select: { name: true } } } });
  if (!s || !s.active) return null;
  if (!s.showCheckins) return OFF;
  const today = todayIso(now);
  const nowMin = nowMinSP(now);

  const links = await prisma.tecClassLink.findMany({ where: { modalityId: s.modalityId, ...(s.spaceId ? { OR: [{ spaceId: null }, { spaceId: s.spaceId }] } : {}) }, select: { tecnofitClassId: true } });
  const ids = links.map((l) => l.tecnofitClassId);
  if (ids.length) { try { await refreshCheckins(today, now); } catch (e) { console.error('[tv-checkins] refresh', e instanceof Error ? e.message : e); } }

  const grade = (await todaysClasses(s.modalityId, s.spaceId, today)).map((c) => ({ startMin: c.startMin, durationMin: c.durationMin, label: c.label }));
  const slots = ids.length ? await prisma.tecClassSlot.findMany({ where: { day: d(today), tecnofitClassId: { in: ids } }, select: { start: true, end: true, capacity: true } }) : [];
  const gradeHours = new Set(grade.map((c) => hourOf(c.startMin)));
  const fromTecnofit = slots.flatMap((x) => {
    const st = minutesOf(x.start); const en = minutesOf(x.end);
    return st === null || gradeHours.has(hourOf(st)) ? [] : [{ startMin: st, durationMin: Math.max((en ?? st + 60) - st, 30), label: null as string | null }];
  });
  const classes = [...grade, ...fromTecnofit];
  if (!classes.length) return OFF;
  // Fora do horário de aulas do dia (antes da primeira hora ou depois da última): a faixa some.
  const first = Math.min(...classes.map((c) => hourOf(c.startMin)));
  const last = Math.max(...classes.map((c) => hourOf(c.startMin)));
  if (hourOf(nowMin) < first || hourOf(nowMin) > last) return OFF;

  const mine = classesOfHour(classes, nowMin);
  if (!mine.length) {
    const nx = nextClass(classes, nowMin);
    return { ...OFF, active: true, configured: ids.length > 0, noClass: true, next: nx ? hhmm(nx.startMin) : null, title: `${String(hourOf(nowMin)).padStart(2, '0')}h · ${s.modality.name}` };
  }
  const start = mine[0]!.startMin;
  const labelTxt = [...new Set(mine.map((c) => c.label).filter(Boolean))].join(' / ');
  const title = `${hhmm(start)} · ${s.modality.name}${labelTxt ? ` · ${labelTxt}` : ''}`;
  if (!ids.length) return { ...OFF, active: true, title };

  const [rows, hidden] = await Promise.all([
    prisma.tvCheckin.findMany({ where: { day: d(today), tecnofitClassId: { in: ids } }, select: { start: true, customerTecId: true, label: true } }),
    prisma.tvHiddenCustomer.findMany({ select: { customerTecId: true } }),
  ]);
  const hide = new Set(hidden.map((h) => h.customerTecId));
  const inHour = rows.filter((r) => sameHour(start, minutesOf(r.start)));
  const here = new Map<string, string>();
  for (const r of inHour) if (!hide.has(r.customerTecId)) here.set(r.customerTecId, r.label);
  const caps = slots.filter((x) => sameHour(start, minutesOf(x.start))).map((x) => x.capacity).filter((x): x is number => x !== null && x > 0);
  return {
    active: true, configured: true, title,
    labels: [...here.values()].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    // Quem pediu para não aparecer não entra no rótulo, mas conta no número (a vaga está ocupada).
    count: new Set(inHour.map((r) => r.customerTecId)).size,
    capacity: caps.length ? caps.reduce((a, b) => a + b, 0) : null,
  };
}

// ── Turmas da Tecnofit ↔ grade (workout.edit) ─────────────

export async function listClassLinks(principal: Principal | null) {
  assertCan(principal, 'workout.edit');
  const [links, modalities, spaces] = await Promise.all([
    prisma.tecClassLink.findMany({ orderBy: { name: 'asc' } }),
    prisma.modality.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.space.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { sortOrder: 'asc' } }),
  ]);
  let classes: { id: string; name: string; modality: string | null; place: string | null }[] = [];
  let error: string | null = null;
  if (tecnofitConfig().configured) {
    try { classes = await (await tecnofitApi()).api.classes(); } catch (e) { error = e instanceof Error ? e.message : 'Falha ao ler as turmas da Tecnofit.'; }
  } else error = 'Tecnofit não configurada (chaves na Vercel).';
  const byId = new Map(links.map((l) => [l.tecnofitClassId, l]));
  // Turmas que sumiram da Tecnofit mas têm vínculo continuam na lista (para desfazer).
  const all = [...classes, ...links.filter((l) => !classes.some((c) => c.id === l.tecnofitClassId)).map((l) => ({ id: l.tecnofitClassId, name: l.name, modality: null, place: null }))];
  return {
    error, modalities, spaces,
    rows: all.map((c) => {
      const l = byId.get(c.id);
      return { tecnofitClassId: c.id, name: c.name, modality: c.modality, place: c.place, modalityId: l?.modalityId ?? null, spaceId: l?.spaceId ?? null, suggestion: l ? null : suggestModality([c.name, c.modality ?? ''], modalities)?.id ?? null };
    }).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
  };
}

const linkSchema = z.object({ tecnofitClassId: z.string().trim().min(1).max(40), name: z.string().trim().min(1).max(120), modalityId: z.string().uuid().nullable(), spaceId: z.string().uuid().nullable() });

export async function saveClassLink(principal: Principal | null, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'workout.edit');
  const p = linkSchema.safeParse(input);
  if (!p.success) throw new AppError('Dados inválidos.');
  const v = p.data;
  if (v.modalityId && !(await prisma.modality.findUnique({ where: { id: v.modalityId } }))) throw new NotFoundError('Modalidade não encontrada.');
  if (v.spaceId && !(await prisma.space.findUnique({ where: { id: v.spaceId } }))) throw new NotFoundError('Espaço não encontrado.');
  await prisma.$transaction(async (tx) => {
    const before = await tx.tecClassLink.findUnique({ where: { tecnofitClassId: v.tecnofitClassId } });
    await tx.tecClassLink.upsert({ where: { tecnofitClassId: v.tecnofitClassId }, create: { ...v, updatedById: principal.id }, update: { name: v.name, modalityId: v.modalityId, spaceId: v.spaceId, updatedById: principal.id } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'tv.class_link', entityType: 'tec_class_link', entityId: v.tecnofitClassId, before: before ? { modalityId: before.modalityId, spaceId: before.spaceId } : null, after: { modalityId: v.modalityId, spaceId: v.spaceId }, summary: `${principal.name} ${v.modalityId ? 'vinculou' : 'desvinculou'} a turma "${v.name}" da Tecnofit ${v.modalityId ? 'à grade' : ''}`.trim() });
  });
}

// ── Recepção: quem fez check-in hoje e quem não quer aparecer (tv.privacy) ──

export async function todayCheckins(principal: Principal | null, now = new Date()) {
  assertCan(principal, 'tv.privacy');
  const today = todayIso(now);
  try { await refreshCheckins(today, now); } catch { /* mostra o que já tem */ }
  const [rows, hidden] = await Promise.all([
    prisma.tvCheckin.findMany({ where: { day: d(today) }, orderBy: [{ start: 'asc' }, { name: 'asc' }] }),
    prisma.tvHiddenCustomer.findMany({ orderBy: { name: 'asc' } }),
  ]);
  const hide = new Set(hidden.map((h) => h.customerTecId));
  const groups = new Map<string, { title: string; people: { customerTecId: string; name: string; label: string; hidden: boolean }[] }>();
  for (const r of rows) {
    const key = `${r.start}|${r.tecnofitClassId}`;
    if (!groups.has(key)) groups.set(key, { title: `${r.start || '—'} · ${r.className}`, people: [] });
    const g = groups.get(key)!;
    if (!g.people.some((p) => p.customerTecId === r.customerTecId)) g.people.push({ customerTecId: r.customerTecId, name: r.name, label: r.label, hidden: hide.has(r.customerTecId) });
  }
  return { day: today, groups: [...groups.values()], hidden: hidden.map((h) => ({ customerTecId: h.customerTecId, name: h.name, since: fromUtc(h.createdAt) })) };
}

const hideSchema = z.object({ customerTecId: z.string().trim().min(1).max(40), hidden: z.boolean() });

/** Marca/desmarca "não mostrar na TV". O nome vem do check-in já guardado (nunca digitado). */
export async function setHidden(principal: Principal | null, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'tv.privacy');
  const p = hideSchema.safeParse(input);
  if (!p.success) throw new AppError('Dados inválidos.');
  const { customerTecId, hidden } = p.data;
  await prisma.$transaction(async (tx) => {
    if (hidden) {
      const seen = await tx.tvCheckin.findFirst({ where: { customerTecId }, select: { name: true, label: true } });
      if (!seen) throw new NotFoundError('Aluno não encontrado nos check-ins de hoje.');
      await tx.tvHiddenCustomer.upsert({ where: { customerTecId }, create: { customerTecId, name: seen.name, createdById: principal.id }, update: {} });
      await audit(tx, { actorId: principal.id, ...meta }, { action: 'tv.hidden', entityType: 'tv_hidden_customer', entityId: customerTecId, summary: `${principal.name} marcou ${seen.label} (Tecnofit ${customerTecId}) para não aparecer na TV` });
    } else {
      const r = await tx.tvHiddenCustomer.deleteMany({ where: { customerTecId } });
      if (!r.count) throw new NotFoundError('Esse aluno já aparece na TV.');
      await audit(tx, { actorId: principal.id, ...meta }, { action: 'tv.unhidden', entityType: 'tv_hidden_customer', entityId: customerTecId, summary: `${principal.name} voltou a mostrar o aluno Tecnofit ${customerTecId} na TV` });
    }
  });
}
