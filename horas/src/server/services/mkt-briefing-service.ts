import { z } from 'zod';
import { prisma } from '@/server/db';
import { assertCan } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import type { RequestMeta } from '@/server/auth/session';
import { AppError, NotFoundError } from '@/server/errors';
import type { IsoDate } from '@/domain/dates';
import type { BriefingInput } from '@/domain/marketing/briefing';
import { iso } from './marketing-service';
import { publishNotice, saveNotice, type SendResult } from './mkt-notice-service';

/**
 * Briefing da campanha: junta o resumo, o que o Comercial precisa saber e as
 * tarefas com responsável. O envio pelo sistema vira um comunicado da
 * Comunicação Interna (histórico, "OK" de leitura e mural).
 */

const appUrl = () => (process.env.APP_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '')).replace(/\/$/, '');

export interface TeamMember { id: string; name: string; why: string[]; hasPhone: boolean }

export async function briefingData(principal: Principal | null, id: string) {
  assertCan(principal, 'mkt.view');
  const c = await prisma.mktCampaign.findUnique({
    where: { id },
    include: { event: true, tasks: { orderBy: [{ dueDate: 'asc' }, { position: 'asc' }], select: { title: true, assigneeId: true, collaboratorIds: true, dueDate: true, column: true, boardColumn: { select: { name: true } } } } },
  });
  if (!c) throw new NotFoundError('Campanha não encontrada.');

  // Equipe da campanha: responsável, participantes, quem tem tarefa e quem atende os leads.
  const why = new Map<string, Set<string>>();
  const add = (uid: string | null | undefined, w: string) => { if (uid) why.set(uid, (why.get(uid) ?? new Set()).add(w)); };
  add(c.ownerId, 'responsável');
  c.participantIds.forEach((u) => add(u, 'participante'));
  c.tasks.forEach((t) => { add(t.assigneeId, 'tem tarefa'); t.collaboratorIds.forEach((u) => add(u, 'colabora')); });
  add(c.leadOwnerId, 'atende os leads');
  const users = await prisma.user.findMany({
    where: { id: { in: [...why.keys()] } },
    select: { id: true, name: true, active: true, phone: true, teachers: { select: { teacher: { select: { phone: true } } } } },
  });
  const name = new Map(users.map((u) => [u.id, u.name]));
  const team: TeamMember[] = users.filter((u) => u.active)
    .map((u) => ({ id: u.id, name: u.name, why: [...why.get(u.id)!], hasPhone: !!(u.phone ?? u.teachers.some((t) => t.teacher.phone)) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  const input: BriefingInput = {
    id: c.id, name: c.name, type: c.type, startDate: iso(c.startDate)!, endDate: iso(c.endDate),
    details: c.details, objective: c.objective, audience: c.audience, product: c.product, offer: c.offer, message: c.message, cta: c.cta,
    channels: c.channels, conversionChannel: c.conversionChannel, conversionUrl: c.conversionUrl, goal: c.goal,
    owner: c.ownerId ? name.get(c.ownerId) ?? null : null, leadOwner: c.leadOwnerId ? name.get(c.leadOwnerId) ?? null : null,
    event: c.event ? { name: c.event.name, startDate: iso(c.event.startDate)!, endDate: iso(c.event.endDate), location: c.event.location, registrationUrl: c.event.registrationUrl } : null,
    tasks: c.tasks.map((t) => ({
      title: t.title, assignee: t.assigneeId ? name.get(t.assigneeId) ?? null : null, dueDate: iso(t.dueDate), column: t.column, columnName: t.boardColumn?.name ?? null,
      with: t.collaboratorIds.map((u) => name.get(u)).filter((x): x is string => !!x),
    })),
  };
  return { input, team, link: appUrl() ? `${appUrl()}/marketing/campanhas/${c.id}` : null };
}

const sendSchema = z.object({
  text: z.string().trim().min(10, 'O briefing está vazio.').max(6000, 'Briefing longo demais para o WhatsApp — tire as tarefas já feitas ou encurte o texto.'),
  userIds: z.array(z.string().uuid()).max(200),
  roleKeys: z.array(z.string().max(40)).max(20),
  numbers: z.array(z.string().trim().min(5).max(60)).max(50),
  askConfirmation: z.boolean(),
});

/** Envia o briefing por WhatsApp para as pessoas escolhidas (vira um comunicado publicado). */
export async function sendBriefing(principal: Principal | null, campaignId: string, input: unknown, today: IsoDate, meta: RequestMeta): Promise<SendResult | null> {
  assertCan(principal, 'mkt.edit');
  const r = sendSchema.safeParse(input);
  if (!r.success) throw new AppError(r.error.issues[0]?.message ?? 'Dados inválidos.');
  const d = r.data;
  if (!d.userIds.length && !d.roleKeys.length && !d.numbers.length) throw new AppError('Escolha pelo menos uma pessoa, perfil ou grupo.');
  const c = await prisma.mktCampaign.findUnique({ where: { id: campaignId }, select: { name: true } });
  if (!c) throw new NotFoundError('Campanha não encontrada.');
  // O título do comunicado já vira a 1ª linha da mensagem; o briefing traz o seu cabeçalho.
  const body = d.text.replace(/^📋 \*BRIEFING — .*\*\n?/, '').trim();
  const id = await saveNotice(principal, null, {
    kind: 'CAMPANHA', title: `Briefing — ${c.name}`.slice(0, 100), body, audience: 'SELECAO',
    filter: { userIds: d.userIds, roleKeys: d.roleKeys, numbers: d.numbers }, campaignId,
    sendWhatsApp: true, askConfirmation: d.askConfirmation, pinned: false, showUntil: null,
  }, meta);
  return publishNotice(principal, id, today, meta);
}
