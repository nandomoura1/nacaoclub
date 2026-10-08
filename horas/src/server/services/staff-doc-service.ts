import { createHash } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '@/server/db';
import { audit } from '@/server/audit';
import { assertCan, can } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import type { RequestMeta } from '@/server/auth/session';
import { AppError, NotFoundError } from '@/server/errors';
import { formatDateBR, isIsoDate } from '@/domain/dates';
import {
  docChecklist, internshipStatus, isIntern, STAFF_DOC_KINDS, staffDocLabel, type InternStatus, type StaffDocKind,
} from '@/domain/staff-docs';

/**
 * Pasta de documentos de cada funcionário (identidade, CREF, contratos) e o
 * contador do contrato de estágio. Arquivos ficam no banco (bytea), só para
 * quem tem "teacher.docs"; todo envio e remoção vai para a auditoria.
 */

export const MAX_STAFF_DOC_BYTES = 6 * 1024 * 1024;
export const STAFF_DOC_ACCEPTED = /\.(pdf|png|jpe?g|webp|heic)$/i;
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

const uploadSchema = z.object({
  kind: z.enum(STAFF_DOC_KINDS.map((k) => k.id) as [StaffDocKind, ...StaffDocKind[]]),
  validFrom: z.string().refine((v) => v === '' || isIsoDate(v), 'Data de início inválida.').transform((v) => v || null),
  validUntil: z.string().refine((v) => v === '' || isIsoDate(v), 'Data de fim inválida.').transform((v) => v || null),
  number: z.string().trim().max(60).transform((v) => v || null),
  notes: z.string().trim().max(500).transform((v) => v || null),
});

/** Linha do painel da equipe: checklist + contador do estágio. */
async function teamRows(today: string, where: { active?: boolean; id?: string } = { active: true }) {
  const teachers = await prisma.teacher.findMany({
    where,
    orderBy: { name: 'asc' },
    select: {
      id: true, name: true, displayName: true, active: true,
      contractType: { select: { name: true } }, position: { select: { name: true } },
      documents: { select: { kind: true, validFrom: true, validUntil: true } },
    },
  });
  return teachers.map((t) => {
    const intern = isIntern(t.contractType?.name, t.position?.name);
    const docs = t.documents.map((d) => ({ kind: d.kind, validFrom: iso(d.validFrom), validUntil: iso(d.validUntil) }));
    const checklist = docChecklist(intern, docs, today);
    return {
      id: t.id, name: t.name, displayName: t.displayName, active: t.active,
      contractType: t.contractType?.name ?? null, position: t.position?.name ?? null,
      intern, files: docs.length, checklist,
      internship: intern ? internshipStatus(docs, today) : null,
      missing: checklist.filter((c) => c.state === 'faltando' || c.state === 'vencido').length,
    };
  });
}
export type TeamDocRow = Awaited<ReturnType<typeof teamRows>>[number];

export async function listTeamDocs(principal: Principal | null, today: string) {
  assertCan(principal, 'teacher.docs');
  return teamRows(today);
}

export async function teacherDocs(principal: Principal | null, teacherId: string, today: string) {
  assertCan(principal, 'teacher.docs');
  const [row] = await teamRows(today, { id: teacherId });
  if (!row) throw new NotFoundError('Professor não encontrado.');
  const docs = await prisma.teacherDocument.findMany({ where: { teacherId }, orderBy: [{ kind: 'asc' }, { createdAt: 'desc' }] });
  const users = new Map((await prisma.user.findMany({ where: { id: { in: docs.map((d) => d.uploadedById).filter((x): x is string => !!x) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return {
    ...row,
    documents: docs.map((d) => ({
      id: d.id, kind: d.kind, filename: d.filename, sizeBytes: d.sizeBytes, validFrom: iso(d.validFrom), validUntil: iso(d.validUntil),
      number: d.number, notes: d.notes, createdAt: d.createdAt.toISOString(), uploadedBy: d.uploadedById ? users.get(d.uploadedById) ?? null : null,
    })),
  };
}
export type TeacherDocsView = Awaited<ReturnType<typeof teacherDocs>>;

export async function uploadTeacherDoc(principal: Principal | null, teacherId: string, input: Record<string, string>, file: File, meta: RequestMeta) {
  assertCan(principal, 'teacher.docs');
  const p = uploadSchema.safeParse(input);
  if (!p.success) throw new AppError(p.error.issues[0]?.message ?? 'Dados inválidos.');
  const d = p.data;
  if (!STAFF_DOC_ACCEPTED.test(file.name)) throw new AppError('Envie PDF ou foto (JPG, PNG, WEBP, HEIC).');
  if (file.size === 0) throw new AppError('Arquivo vazio.');
  if (file.size > MAX_STAFF_DOC_BYTES) throw new AppError('O arquivo passa de 6 MB. Envie um PDF/foto menor.');
  if (d.kind === 'CONTRATO_ESTAGIO' && (!d.validFrom || !d.validUntil)) throw new AppError('Contrato de estágio precisa das datas de início e fim (é o que alimenta o contador).');
  if (d.validFrom && d.validUntil && d.validUntil < d.validFrom) throw new AppError('A data de fim é anterior à de início.');
  const bytes = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  return prisma.$transaction(async (tx) => {
    const t = await tx.teacher.findUnique({ where: { id: teacherId }, select: { id: true, name: true } });
    if (!t) throw new NotFoundError('Professor não encontrado.');
    const dup = await tx.teacherDocument.findFirst({ where: { teacherId, sha256 } });
    if (dup) throw new AppError(`Este arquivo já está na pasta (${dup.filename}).`);
    const doc = await tx.teacherDocument.create({
      data: {
        teacherId, kind: d.kind, filename: file.name.slice(0, 200), mimeType: file.type || 'application/octet-stream', sizeBytes: file.size, sha256,
        validFrom: d.validFrom ? new Date(`${d.validFrom}T00:00:00Z`) : null, validUntil: d.validUntil ? new Date(`${d.validUntil}T00:00:00Z`) : null,
        number: d.number, notes: d.notes, uploadedById: principal.id, file: { create: { data: bytes } },
      },
    });
    const period = d.validFrom || d.validUntil ? ` (${d.validFrom ? formatDateBR(d.validFrom) : '…'} a ${d.validUntil ? formatDateBR(d.validUntil) : '…'})` : '';
    // Auditoria sem o número do documento (dado pessoal).
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: 'teacher.doc_uploaded', entityType: 'teacher', entityId: teacherId,
      after: { tipo: d.kind, arquivo: doc.filename, inicio: d.validFrom, fim: d.validUntil },
      summary: `${principal.name} enviou ${staffDocLabel(d.kind)}${period} de ${t.name}`,
    });
    return doc.id;
  });
}

export async function deleteTeacherDoc(principal: Principal | null, documentId: string, meta: RequestMeta) {
  assertCan(principal, 'teacher.docs');
  await prisma.$transaction(async (tx) => {
    const d = await tx.teacherDocument.findUnique({ where: { id: documentId }, include: { teacher: { select: { name: true } } } });
    if (!d) throw new NotFoundError('Documento não encontrado.');
    await tx.teacherDocument.delete({ where: { id: documentId } });
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: 'teacher.doc_deleted', entityType: 'teacher', entityId: d.teacherId,
      before: { tipo: d.kind, arquivo: d.filename, inicio: iso(d.validFrom), fim: iso(d.validUntil) },
      summary: `${principal.name} removeu ${staffDocLabel(d.kind)} (${d.filename}) de ${d.teacher.name}`,
    });
  });
}

export async function getTeacherDocFile(principal: Principal | null, documentId: string) {
  assertCan(principal, 'teacher.docs');
  const d = await prisma.teacherDocument.findUnique({ where: { id: documentId }, include: { file: true } });
  if (!d || !d.file) throw new NotFoundError('Documento não encontrado.');
  return { filename: d.filename, data: Buffer.from(d.file.data) };
}

export interface InternAlert { teacherId: string; name: string; status: InternStatus }

/**
 * Estagiários ativos com contrato vencido, vencendo em até 30 dias ou sem
 * contrato. Aparece no "Hoje" para quem monta a escala (não expõe arquivos).
 */
export async function internAlerts(principal: Principal | null, today: string): Promise<InternAlert[]> {
  if (!principal || !(can(principal, 'teacher.docs') || can(principal, 'schedule.edit'))) return [];
  const rows = await teamRows(today);
  return rows
    .filter((r) => r.internship && r.internship.state !== 'vigente')
    .map((r) => ({ teacherId: r.id, name: r.displayName || r.name, status: r.internship! }))
    .sort((a, b) => (a.status.daysLeft ?? -1e9) - (b.status.daysLeft ?? -1e9));
}
