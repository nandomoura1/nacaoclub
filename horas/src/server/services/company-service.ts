import { createHash } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '@/server/db';
import { audit } from '@/server/audit';
import { assertCan, can } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import type { RequestMeta } from '@/server/auth/session';
import { AppError, NotFoundError } from '@/server/errors';
import { formatDateBR, isIsoDate } from '@/domain/dates';
import { COMPANY_DOC_KINDS, companyChecklist, companyDocLabel, isCnpj, onlyDigits, validity, type CompanyDocKind } from '@/domain/company';

/**
 * Empresas do grupo (Administração): dados gerais, contas bancárias e a pasta
 * de documentos essenciais com validade. Arquivos no banco (bytea), download
 * só com "company.view"; tudo auditado (sem números de conta no log).
 */

export const MAX_COMPANY_DOC_BYTES = 6 * 1024 * 1024;
export const COMPANY_DOC_ACCEPTED = /\.(pdf|png|jpe?g|webp|heic|docx?|xlsx?)$/i;
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const dateOrNull = (v: string | null) => (v ? new Date(`${v}T00:00:00Z`) : null);

const text = (max: number) => z.string().trim().max(max).transform((v) => v || null).nullable().optional().transform((v) => v ?? null);
const optDate = z.string().refine((v) => v === '' || isIsoDate(v), 'Data inválida.').transform((v) => v || null).nullable().optional().transform((v) => v ?? null);

const bankSchema = z.object({
  bank: z.string().trim().min(2, 'Informe o banco de cada conta.').max(80),
  agency: text(20), account: text(30), accountType: text(30), pixKey: text(120), notes: text(200),
});

const companySchema = z.object({
  legalName: z.string().trim().min(2, 'Informe a razão social.').max(160),
  tradeName: text(120),
  cnpj: z.string().trim().transform((v) => onlyDigits(v)).refine((v) => v === '' || isCnpj(v), 'CNPJ inválido (confira os dígitos).').transform((v) => v || null),
  stateRegistration: text(40), municipalRegistration: text(40), openingDate: optDate,
  taxRegime: text(60), mainActivity: text(200), address: text(300), email: text(120), phone: text(40),
  legalRepresentative: text(160), accountant: text(160), notes: text(2000),
  active: z.boolean().default(true),
  bankAccounts: z.array(bankSchema).max(20).default([]),
});
export type CompanyInput = z.input<typeof companySchema>;

function rowOf(c: { id: string; legalName: string; tradeName: string | null; cnpj: string | null; active: boolean; documents: { kind: string; validUntil: Date | null; archived: boolean }[]; _count: { bankAccounts: number } }, today: string) {
  const checklist = companyChecklist(c.documents.map((d) => ({ kind: d.kind, validUntil: iso(d.validUntil), archived: d.archived })), today);
  return {
    id: c.id, legalName: c.legalName, tradeName: c.tradeName, cnpj: c.cnpj, active: c.active, bankAccounts: c._count.bankAccounts,
    files: c.documents.length, checklist,
    expired: checklist.filter((x) => x.state === 'vencido').length,
    expiring: checklist.filter((x) => x.state === 'vence_em_breve').length,
    missing: checklist.filter((x) => x.state === 'faltando').length,
  };
}

export async function listCompanies(principal: Principal | null, today: string) {
  assertCan(principal, 'company.view');
  const rows = await prisma.company.findMany({
    orderBy: [{ active: 'desc' }, { sortOrder: 'asc' }, { legalName: 'asc' }],
    include: { documents: { select: { kind: true, validUntil: true, archived: true } }, _count: { select: { bankAccounts: true } } },
  });
  return rows.map((c) => rowOf(c, today));
}

export async function getCompany(principal: Principal | null, id: string, today: string) {
  assertCan(principal, 'company.view');
  const c = await prisma.company.findUnique({
    where: { id },
    include: {
      bankAccounts: { orderBy: { sortOrder: 'asc' } },
      documents: { orderBy: [{ archived: 'asc' }, { kind: 'asc' }, { createdAt: 'desc' }] },
      _count: { select: { bankAccounts: true } },
    },
  });
  if (!c) throw new NotFoundError('Empresa não encontrada.');
  const users = new Map((await prisma.user.findMany({ where: { id: { in: c.documents.map((d) => d.uploadedById).filter((x): x is string => !!x) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return {
    ...rowOf(c, today),
    data: {
      legalName: c.legalName, tradeName: c.tradeName, cnpj: c.cnpj, stateRegistration: c.stateRegistration, municipalRegistration: c.municipalRegistration,
      openingDate: iso(c.openingDate), taxRegime: c.taxRegime, mainActivity: c.mainActivity, address: c.address, email: c.email, phone: c.phone,
      legalRepresentative: c.legalRepresentative, accountant: c.accountant, notes: c.notes, active: c.active,
      bankAccounts: c.bankAccounts.map((b) => ({ bank: b.bank, agency: b.agency, account: b.account, accountType: b.accountType, pixKey: b.pixKey, notes: b.notes })),
    },
    documents: c.documents.map((d) => ({
      id: d.id, kind: d.kind, title: d.title, filename: d.filename, sizeBytes: d.sizeBytes, validFrom: iso(d.validFrom), validUntil: iso(d.validUntil),
      notes: d.notes, archived: d.archived, createdAt: d.createdAt.toISOString(), uploadedBy: d.uploadedById ? users.get(d.uploadedById) ?? null : null,
      validity: validity(iso(d.validUntil), today),
    })),
  };
}
export type CompanyView = Awaited<ReturnType<typeof getCompany>>;

export async function saveCompany(principal: Principal | null, id: string | null, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'company.edit');
  const p = companySchema.safeParse(input);
  if (!p.success) throw new AppError(p.error.issues[0]?.message ?? 'Dados inválidos.');
  const { bankAccounts, openingDate, ...d } = p.data;
  return prisma.$transaction(async (tx) => {
    if (d.cnpj) {
      const other = await tx.company.findUnique({ where: { cnpj: d.cnpj } });
      if (other && other.id !== id) throw new AppError(`Este CNPJ já está cadastrado (${other.legalName}).`);
    }
    const before = id ? await tx.company.findUnique({ where: { id }, include: { bankAccounts: true } }) : null;
    if (id && !before) throw new NotFoundError('Empresa não encontrada.');
    const data = { ...d, openingDate: dateOrNull(openingDate) };
    const c = id
      ? await tx.company.update({ where: { id }, data })
      : await tx.company.create({ data: { ...data, sortOrder: ((await tx.company.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? 0) + 1 } });
    await tx.companyBankAccount.deleteMany({ where: { companyId: c.id } });
    if (bankAccounts.length) await tx.companyBankAccount.createMany({ data: bankAccounts.map((b, i) => ({ ...b, companyId: c.id, sortOrder: i })) });
    // Log com os campos alterados e os bancos, sem números de conta/PIX.
    const changed = before ? Object.keys(data).filter((k) => String((before as Record<string, unknown>)[k] ?? '') !== String((data as Record<string, unknown>)[k] ?? '')) : Object.keys(data);
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: id ? 'company.updated' : 'company.created', entityType: 'company', entityId: c.id,
      after: { campos: changed, contas: bankAccounts.map((b) => b.bank) },
      summary: `${principal.name} ${id ? 'atualizou' : 'cadastrou'} a empresa ${c.legalName}`,
    });
    return c.id;
  });
}

const uploadSchema = z.object({
  kind: z.enum(COMPANY_DOC_KINDS.map((k) => k.id) as [CompanyDocKind, ...CompanyDocKind[]]),
  title: z.string().trim().max(120).transform((v) => v || null),
  validFrom: z.string().refine((v) => v === '' || isIsoDate(v), 'Data inválida.').transform((v) => v || null),
  validUntil: z.string().refine((v) => v === '' || isIsoDate(v), 'Data inválida.').transform((v) => v || null),
  notes: z.string().trim().max(500).transform((v) => v || null),
});

export async function uploadCompanyDoc(principal: Principal | null, companyId: string, input: Record<string, string>, file: File, meta: RequestMeta) {
  assertCan(principal, 'company.edit');
  const p = uploadSchema.safeParse(input);
  if (!p.success) throw new AppError(p.error.issues[0]?.message ?? 'Dados inválidos.');
  const d = p.data;
  if (!COMPANY_DOC_ACCEPTED.test(file.name)) throw new AppError('Envie PDF, foto, Word ou Excel.');
  if (file.size === 0) throw new AppError('Arquivo vazio.');
  if (file.size > MAX_COMPANY_DOC_BYTES) throw new AppError('O arquivo passa de 6 MB.');
  if (d.validFrom && d.validUntil && d.validUntil < d.validFrom) throw new AppError('A validade é anterior à data de emissão.');
  const bytes = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  return prisma.$transaction(async (tx) => {
    const c = await tx.company.findUnique({ where: { id: companyId }, select: { legalName: true } });
    if (!c) throw new NotFoundError('Empresa não encontrada.');
    const dup = await tx.companyDocument.findFirst({ where: { companyId, sha256 } });
    if (dup) throw new AppError(`Este arquivo já está na pasta (${dup.filename}).`);
    const doc = await tx.companyDocument.create({
      data: {
        companyId, kind: d.kind, title: d.title, filename: file.name.slice(0, 200), mimeType: file.type || 'application/octet-stream', sizeBytes: file.size, sha256,
        validFrom: dateOrNull(d.validFrom), validUntil: dateOrNull(d.validUntil), notes: d.notes, uploadedById: principal.id, file: { create: { data: bytes } },
      },
    });
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: 'company.doc_uploaded', entityType: 'company', entityId: companyId, after: { tipo: d.kind, titulo: d.title, arquivo: doc.filename, validade: d.validUntil },
      summary: `${principal.name} enviou ${d.title ?? companyDocLabel(d.kind)}${d.validUntil ? ` (válido até ${formatDateBR(d.validUntil)})` : ''} de ${c.legalName}`,
    });
    return doc.id;
  });
}

export async function setCompanyDocArchived(principal: Principal | null, documentId: string, archived: boolean, meta: RequestMeta) {
  assertCan(principal, 'company.edit');
  await prisma.$transaction(async (tx) => {
    const d = await tx.companyDocument.findUnique({ where: { id: documentId }, include: { company: { select: { legalName: true } } } });
    if (!d) throw new NotFoundError('Documento não encontrado.');
    await tx.companyDocument.update({ where: { id: documentId }, data: { archived } });
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: archived ? 'company.doc_archived' : 'company.doc_restored', entityType: 'company', entityId: d.companyId, after: { arquivo: d.filename },
      summary: `${principal.name} ${archived ? 'arquivou' : 'reativou'} ${d.title ?? companyDocLabel(d.kind)} (${d.filename}) de ${d.company.legalName}`,
    });
  });
}

export async function deleteCompanyDoc(principal: Principal | null, documentId: string, meta: RequestMeta) {
  assertCan(principal, 'company.edit');
  await prisma.$transaction(async (tx) => {
    const d = await tx.companyDocument.findUnique({ where: { id: documentId }, include: { company: { select: { legalName: true } } } });
    if (!d) throw new NotFoundError('Documento não encontrado.');
    await tx.companyDocument.delete({ where: { id: documentId } });
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: 'company.doc_deleted', entityType: 'company', entityId: d.companyId, before: { tipo: d.kind, arquivo: d.filename, validade: iso(d.validUntil) },
      summary: `${principal.name} excluiu ${d.title ?? companyDocLabel(d.kind)} (${d.filename}) de ${d.company.legalName}`,
    });
  });
}

export async function getCompanyDocFile(principal: Principal | null, documentId: string) {
  assertCan(principal, 'company.view');
  const d = await prisma.companyDocument.findUnique({ where: { id: documentId }, include: { file: true } });
  if (!d || !d.file) throw new NotFoundError('Documento não encontrado.');
  return { filename: d.filename, data: Buffer.from(d.file.data) };
}

/** Documentos vencidos ou vencendo (Hoje / painel), só para quem vê empresas. */
export async function companyAlerts(principal: Principal | null, today: string) {
  if (!principal || !can(principal, 'company.view')) return [];
  const docs = await prisma.companyDocument.findMany({
    where: { archived: false, validUntil: { not: null }, company: { active: true } },
    include: { company: { select: { id: true, legalName: true, tradeName: true } } },
  });
  return docs
    .map((d) => ({ companyId: d.company.id, company: d.company.tradeName || d.company.legalName, label: d.title ?? companyDocLabel(d.kind), ...validity(iso(d.validUntil), today) }))
    .filter((a) => a.state === 'vencido' || a.state === 'vence_em_breve')
    .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0));
}
