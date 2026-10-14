import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '@/server/db';
import { audit } from '@/server/audit';
import { assertCan, can } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import type { RequestMeta } from '@/server/auth/session';
import { AppError, NotFoundError } from '@/server/errors';
import { ASSET_KINDS, ASSET_STATUSES, assetMime, assetPath, canMove, isPreviewable, MAX_ASSET_BYTES } from '@/domain/marketing/assets';
import { objectSize, removeObjects, signedReadUrls, signedUploadUrl, storageConfig } from '@/server/storage';

/**
 * Biblioteca de criativos: o arquivo vai direto do navegador para o bucket
 * privado (URL assinada); o sistema guarda título, campanha, status de
 * aprovação e quem aprovou. Leitura só por URL assinada de 1 hora.
 */

export interface AssetRow {
  id: string; title: string; kind: string; status: string; campaignId: string | null; campaign: string | null; eventId: string | null;
  tags: string[]; notes: string | null; fileName: string; mime: string; sizeBytes: number; reviewNote: string | null; reviewedBy: string | null;
  reviewedAt: string | null; uploadedBy: string | null; createdAt: string; previewUrl: string | null; downloadUrl: string | null;
}

export async function listAssets(principal: Principal | null, f: { status?: string; kind?: string; campaignId?: string; q?: string } = {}): Promise<AssetRow[]> {
  assertCan(principal, 'mkt.view');
  const q = f.q?.trim();
  const rows = await prisma.mktAsset.findMany({
    where: {
      ...(f.status ? { status: f.status } : { status: { not: 'ARQUIVADO' } }),
      ...(f.kind ? { kind: f.kind } : {}),
      ...(f.campaignId ? { campaignId: f.campaignId } : {}),
      ...(q ? { OR: [{ title: { contains: q, mode: 'insensitive' } }, { fileName: { contains: q, mode: 'insensitive' } }, { tags: { has: q.toLowerCase() } }] } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 300,
  });
  const ids = [...new Set(rows.flatMap((r) => [r.campaignId, r.uploadedById, r.reviewedById]).filter(Boolean) as string[])];
  const [campaigns, users] = await Promise.all([
    prisma.mktCampaign.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
  ]);
  const name = new Map([...campaigns, ...users].map((x) => [x.id, x.name]));
  const configured = storageConfig().configured;
  const previews = configured ? await signedReadUrls(rows.filter((r) => isPreviewable(r.mime)).map((r) => r.path)) : {};
  const downloads = configured ? await signedReadUrls(rows.map((r) => r.path), { download: Object.fromEntries(rows.map((r) => [r.path, r.fileName])) }) : {};
  return rows.map((r) => ({
    id: r.id, title: r.title, kind: r.kind, status: r.status, campaignId: r.campaignId, campaign: r.campaignId ? name.get(r.campaignId) ?? null : null, eventId: r.eventId,
    tags: r.tags, notes: r.notes, fileName: r.fileName, mime: r.mime, sizeBytes: r.sizeBytes, reviewNote: r.reviewNote,
    reviewedBy: r.reviewedById ? name.get(r.reviewedById) ?? null : null, reviewedAt: r.reviewedAt?.toISOString() ?? null,
    uploadedBy: r.uploadedById ? name.get(r.uploadedById) ?? null : null, createdAt: r.createdAt.toISOString(),
    previewUrl: previews[r.path] ?? null, downloadUrl: downloads[r.path] ?? null,
  }));
}

/** 1º passo do envio: valida o arquivo e devolve a URL para o navegador enviar direto ao bucket. */
export async function startAssetUpload(principal: Principal | null, file: { name: string; size: number }) {
  assertCan(principal, 'mkt.edit');
  const mime = assetMime(file.name);
  if (!mime) throw new AppError('Formato não aceito. Use imagem (PNG, JPG, WEBP, GIF, SVG), vídeo (MP4, MOV, WEBM), PDF, AI/EPS, PSD ou ZIP.');
  if (file.size <= 0) throw new AppError('Arquivo vazio.');
  if (file.size > MAX_ASSET_BYTES) throw new AppError('Arquivo acima de 50 MB. Exporte em tamanho menor (ou envie o link do Drive nas observações).');
  const path = assetPath(randomUUID(), file.name);
  return { path, mime, uploadUrl: await signedUploadUrl(path) };
}

const assetSchema = z.object({
  title: z.string().trim().min(2, 'Dê um título ao arquivo.').max(120),
  kind: z.enum(ASSET_KINDS.map((k) => k.id) as [string, ...string[]]),
  campaignId: z.string().uuid().nullable(),
  tags: z.array(z.string().trim().toLowerCase().max(30)).max(12).default([]),
  notes: z.string().trim().max(1000).nullable(),
});

/** 2º passo: confirma que o arquivo chegou ao bucket e registra na Biblioteca. */
export async function registerAsset(principal: Principal | null, input: { path: string; fileName: string; sendToReview?: boolean } & Record<string, unknown>, meta: RequestMeta) {
  assertCan(principal, 'mkt.edit');
  const r = assetSchema.safeParse(input);
  if (!r.success) throw new AppError(r.error.issues[0]?.message ?? 'Dados inválidos.');
  if (!/^biblioteca\/\d{4}-\d{2}\/[0-9a-f-]{36}-[a-z0-9.-]+$/.test(input.path)) throw new AppError('Envio inválido.');
  const mime = assetMime(input.fileName) ?? assetMime(input.path);
  if (!mime) throw new AppError('Formato não aceito.');
  const size = await objectSize(input.path);
  if (size === null) throw new AppError('O arquivo não chegou ao armazenamento. Envie de novo.');
  const d = r.data;
  return prisma.$transaction(async (tx) => {
    const a = await tx.mktAsset.create({
      data: {
        title: d.title, kind: d.kind, campaignId: d.campaignId, tags: [...new Set(d.tags.filter(Boolean))], notes: d.notes || null,
        path: input.path, fileName: String(input.fileName).slice(0, 200), mime, sizeBytes: size, status: input.sendToReview ? 'EM_APROVACAO' : 'RASCUNHO', uploadedById: principal.id,
      },
    });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'mkt.asset_uploaded', entityType: 'mkt_asset', entityId: a.id, after: { titulo: a.title, tipo: a.kind, status: a.status }, summary: `${principal.name} enviou “${a.title}” para a Biblioteca` });
    return a.id;
  });
}

export async function updateAsset(principal: Principal | null, id: string, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'mkt.edit');
  const r = assetSchema.safeParse(input);
  if (!r.success) throw new AppError(r.error.issues[0]?.message ?? 'Dados inválidos.');
  const d = r.data;
  await prisma.$transaction(async (tx) => {
    const before = await tx.mktAsset.findUnique({ where: { id } });
    if (!before) throw new NotFoundError('Arquivo não encontrado.');
    const after = await tx.mktAsset.update({ where: { id }, data: { title: d.title, kind: d.kind, campaignId: d.campaignId, tags: [...new Set(d.tags.filter(Boolean))], notes: d.notes || null } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'mkt.asset_updated', entityType: 'mkt_asset', entityId: id, before, after, summary: `${principal.name} editou “${after.title}” na Biblioteca` });
  });
}

/** Aprovação: quem edita manda para aprovação/arquiva; quem aprova aprova ou pede ajustes (com comentário). */
export async function setAssetStatus(principal: Principal | null, id: string, status: string, note: string | null, meta: RequestMeta) {
  assertCan(principal, 'mkt.view');
  if (!ASSET_STATUSES.some((s) => s.id === status)) throw new AppError('Status inválido.');
  await prisma.$transaction(async (tx) => {
    const a = await tx.mktAsset.findUnique({ where: { id } });
    if (!a) throw new NotFoundError('Arquivo não encontrado.');
    const who = { edit: can(principal, 'mkt.edit'), approve: can(principal, 'mkt.approve') };
    if (!canMove(a.status, status, who)) {
      if ((status === 'APROVADO' || status === 'AJUSTES') && !who.approve) assertCan(principal, 'mkt.approve');
      throw new AppError('Essa mudança de status não é permitida agora.');
    }
    if (status === 'AJUSTES' && !note?.trim()) throw new AppError('Diga o que precisa ajustar.');
    const review = status === 'APROVADO' || status === 'AJUSTES';
    await tx.mktAsset.update({ where: { id }, data: { status, ...(review ? { reviewNote: note?.trim().slice(0, 1000) || null, reviewedById: principal!.id, reviewedAt: new Date() } : {}) } });
    const label = ASSET_STATUSES.find((s) => s.id === status)!.label;
    await audit(tx, { actorId: principal!.id, ...meta }, { action: 'mkt.asset_status', entityType: 'mkt_asset', entityId: id, before: { status: a.status }, after: { status, comentario: note }, summary: `${principal!.name} marcou “${a.title}” como ${label}` });
  });
}

export async function deleteAsset(principal: Principal | null, id: string, meta: RequestMeta) {
  assertCan(principal, 'mkt.admin');
  const a = await prisma.mktAsset.findUnique({ where: { id } });
  if (!a) throw new NotFoundError('Arquivo não encontrado.');
  await removeObjects([a.path]);
  await prisma.$transaction(async (tx) => {
    await tx.mktAsset.delete({ where: { id } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'mkt.asset_deleted', entityType: 'mkt_asset', entityId: id, before: a, summary: `${principal.name} excluiu “${a.title}” da Biblioteca` });
  });
}

/** Números para o topo da Biblioteca e o Command Center. */
export async function assetCounts() {
  const g = await prisma.mktAsset.groupBy({ by: ['status'], _count: { _all: true } });
  return Object.fromEntries(g.map((x) => [x.status, x._count._all])) as Record<string, number>;
}
