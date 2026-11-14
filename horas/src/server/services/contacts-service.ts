import { z } from 'zod';
import { prisma } from '@/server/db';
import { audit } from '@/server/audit';
import { assertCan, can } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import type { RequestMeta } from '@/server/auth/session';
import { AppError, NotFoundError } from '@/server/errors';
import { parseContactLines, samePhone, type ContactDraft } from '@/domain/contacts';

/**
 * Contatos (Administração → Contatos). Duas partes:
 * - **Equipe**: colaboradores ativos do cadastro (fonte única; o telefone se edita na ficha). Só para
 *   quem tem `teacher.view_personal` — o número nunca sai do servidor sem essa permissão.
 * - **Agenda**: contatos de fora do cadastro (terceirizados, fornecedores, monitores…), `contacts.view`
 *   para ver e `contacts.edit` para cadastrar/importar/desativar (não se exclui: desativa).
 */

type P = Principal;
const parse = <S extends z.ZodType>(s: S, v: unknown): z.output<S> => {
  const r = s.safeParse(v);
  if (!r.success) throw new AppError(r.error.issues[0]?.message ?? 'Dados inválidos.');
  return r.data;
};
const opt = z.string().trim().max(200).optional().nullable().transform((v) => (v ? v : null));

export interface TeamContact { id: string; name: string; group: string; role: string | null; phone: string | null; team: string }

export async function contactsPage(principal: P | null, opts: { inactive?: boolean } = {}) {
  assertCan(principal, 'contacts.view');
  const edit = can(principal, 'contacts.edit');
  const personal = can(principal, 'teacher.view_personal');
  const contacts = await prisma.contact.findMany({
    where: edit && opts.inactive ? {} : { active: true },
    orderBy: [{ groupName: 'asc' }, { name: 'asc' }],
  });
  let team: TeamContact[] | null = null;
  if (personal) {
    const ts = await prisma.teacher.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: {
        id: true, name: true, phone: true, team: true,
        position: { select: { name: true } }, primaryModality: { select: { name: true } },
        wsMembers: { select: { sector: { select: { name: true } } } },
      },
    });
    team = ts.map((t) => ({
      id: t.id, name: t.name, team: t.team, phone: t.phone?.trim() || null, role: t.position?.name ?? null,
      group: t.team === 'ESCALA'
        ? [...new Set(t.wsMembers.map((m) => m.sector.name))].join(' / ') || 'Equipe sem setor'
        : t.primaryModality?.name ? `Professores · ${t.primaryModality.name}` : 'Professores',
    })).sort((a, b) => a.group.localeCompare(b.group, 'pt-BR') || a.name.localeCompare(b.name, 'pt-BR'));
  }
  return {
    canEdit: edit,
    canSeeTeam: personal,
    contacts: contacts.map((c) => ({ id: c.id, name: c.name, group: c.groupName, company: c.company, phone: c.phone, phone2: c.phone2, note: c.note, active: c.active })),
    team,
  };
}
export type ContactsPage = Awaited<ReturnType<typeof contactsPage>>;

const ContactSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2, 'Informe o nome.').max(120),
  groupName: z.string().trim().min(2, 'Informe o grupo.').max(80),
  company: opt, phone: opt, phone2: opt, note: opt,
});

export async function saveContact(principal: P | null, input: unknown, meta: RequestMeta = {}) {
  assertCan(principal, 'contacts.edit');
  const v = parse(ContactSchema, input);
  const data = { name: v.name, groupName: v.groupName, company: v.company, phone: v.phone, phone2: v.phone2, note: v.note };
  return prisma.$transaction(async (tx) => {
    const before = v.id ? await tx.contact.findUnique({ where: { id: v.id } }) : null;
    if (v.id && !before) throw new NotFoundError('Contato não encontrado.');
    const c = v.id ? await tx.contact.update({ where: { id: v.id }, data }) : await tx.contact.create({ data: { ...data, createdById: principal.id } });
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: v.id ? 'contacts.updated' : 'contacts.created', entityType: 'contact', entityId: c.id,
      before: before ? { name: before.name, groupName: before.groupName, company: before.company, note: before.note, phoneChanged: before.phone !== c.phone || before.phone2 !== c.phone2 } : undefined,
      after: { name: c.name, groupName: c.groupName, company: c.company, note: c.note },
      summary: `${principal.name} ${v.id ? 'editou' : 'cadastrou'} o contato "${c.name}" (${c.groupName})`,
    });
    return c.id;
  });
}

export async function setContactActive(principal: P | null, input: { id: string; active: boolean }, meta: RequestMeta = {}) {
  assertCan(principal, 'contacts.edit');
  const v = parse(z.object({ id: z.string().uuid(), active: z.boolean() }), input);
  await prisma.$transaction(async (tx) => {
    const c = await tx.contact.findUnique({ where: { id: v.id } });
    if (!c) throw new NotFoundError('Contato não encontrado.');
    await tx.contact.update({ where: { id: v.id }, data: { active: v.active } });
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: v.active ? 'contacts.reactivated' : 'contacts.deactivated', entityType: 'contact', entityId: c.id,
      before: { active: c.active }, after: { active: v.active },
      summary: `${principal.name} ${v.active ? 'reativou' : 'desativou'} o contato "${c.name}"`,
    });
  });
}

/** Prévia da importação: o que entra, o que já existe (mesmo nome ou telefone) e o que é da equipe. */
export async function previewImport(principal: P | null, input: { text: string; group: string }) {
  assertCan(principal, 'contacts.edit');
  const v = parse(z.object({ text: z.string().max(50_000), group: z.string().trim().max(80) }), input);
  const { rows, skipped } = parseContactLines(v.text, v.group || 'Outros');
  const existing = await prisma.contact.findMany({ where: { active: true }, select: { name: true, phone: true, phone2: true } });
  const teachers = await prisma.teacher.findMany({ where: { active: true }, select: { name: true, phone: true } });
  const key = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  return {
    skipped,
    rows: rows.map((r) => {
      const dupe = existing.some((e) => key(e.name) === key(r.name) || (r.phone && (samePhone(e.phone, r.phone) || samePhone(e.phone2, r.phone))));
      const inTeam = !!r.phone && teachers.some((t) => samePhone(t.phone, r.phone));
      return { ...r, status: dupe ? ('existe' as const) : inTeam ? ('equipe' as const) : ('novo' as const) };
    }),
  };
}

const DraftSchema = z.object({
  name: z.string().trim().min(2).max(120), groupName: z.string().trim().min(2).max(80),
  company: opt, phone: opt, phone2: opt, note: opt,
});

/** Grava as linhas confirmadas na prévia (a tela manda só as marcadas). */
export async function importContacts(principal: P | null, input: { rows: ContactDraft[] }, meta: RequestMeta = {}) {
  assertCan(principal, 'contacts.edit');
  const rows = parse(z.array(DraftSchema).min(1, 'Nada marcado para importar.').max(500), input.rows);
  return prisma.$transaction(async (tx) => {
    await tx.contact.createMany({ data: rows.map((r) => ({ ...r, createdById: principal.id })) });
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: 'contacts.imported', entityType: 'contact',
      after: { count: rows.length, groups: [...new Set(rows.map((r) => r.groupName))] },
      summary: `${principal.name} importou ${rows.length} contato(s) para a agenda`,
    });
    return rows.length;
  });
}
