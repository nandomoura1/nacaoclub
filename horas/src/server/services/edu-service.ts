import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '@/server/db';
import { audit } from '@/server/audit';
import { assertCan, can } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import type { RequestMeta } from '@/server/auth/session';
import { AppError, AuthorizationError, NotFoundError } from '@/server/errors';
import { canSee, EDU_AREAS, EDU_AUDIENCES, EDU_FORMATS, EDU_MAX_BYTES, EDU_PATH_RE, eduMime, eduPath, trackProgress, type Viewer } from '@/domain/universidade';
import { objectSize, removeObjects, signedReadUrls, signedUploadUrl, storageConfig } from '@/server/storage';

/**
 * Universidade Nação: biblioteca de capacitação (links e arquivos) com
 * "Concluí", e trilhas (ex.: Onboarding) com progresso. Diretoria e líderes
 * publicam (edu.edit); todos veem o que é para eles (edu.view).
 */

async function viewerOf(p: Principal): Promise<Viewer> {
  const leader = can(p, 'proc.admin') || (await prisma.procSector.count({ where: { leaderId: p.id, active: true } })) > 0 || p.roleKeys.includes('LIDER');
  return { editor: can(p, 'edu.edit'), leader, teacher: p.teacherIds.length > 0 || p.roleKeys.includes('PROFESSOR'), roleKeys: p.roleKeys };
}

export interface MaterialRow {
  id: string; title: string; description: string | null; area: string; category: string | null; format: string; url: string | null;
  fileName: string | null; mime: string | null; sizeBytes: number | null; audience: string; roleKey: string | null; required: boolean;
  version: string | null; durationMin: number | null; active: boolean; sortOrder: number; updatedAt: string; createdBy: string | null;
  done: boolean; fileUrl: string | null; downloadUrl: string | null; canEdit: boolean;
}

/** Biblioteca: o que esta pessoa pode ver, com o "Concluí" dela e links de arquivo assinados (1 h). */
export async function eduLibrary(principal: Principal | null) {
  assertCan(principal, 'edu.view');
  const v = await viewerOf(principal);
  const [rows, done, tracks] = await Promise.all([
    prisma.eduMaterial.findMany({ orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }] }),
    prisma.eduCompletion.findMany({ where: { userId: principal.id }, select: { materialId: true } }),
    prisma.eduTrack.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], include: { items: { orderBy: { position: 'asc' }, select: { materialId: true } } } }),
  ]);
  const doneSet = new Set(done.map((d) => d.materialId));
  const visible = rows.filter((m) => canSee(m, v));
  const users = new Map((await prisma.user.findMany({ where: { id: { in: visible.map((m) => m.createdById).filter(Boolean) as string[] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const withFile = visible.filter((m) => m.path);
  const configured = storageConfig().configured;
  const reads = configured && withFile.length ? await signedReadUrls(withFile.map((m) => m.path!)) : {};
  const downloads = configured && withFile.length ? await signedReadUrls(withFile.map((m) => m.path!), { download: Object.fromEntries(withFile.map((m) => [m.path!, m.fileName ?? 'arquivo'])) }) : {};
  const admin = can(principal, 'edu.admin');
  const materials: MaterialRow[] = visible.map((m) => ({
    id: m.id, title: m.title, description: m.description, area: m.area, category: m.category, format: m.format, url: m.url,
    fileName: m.fileName, mime: m.mime, sizeBytes: m.sizeBytes, audience: m.audience, roleKey: m.roleKey, required: m.required,
    version: m.version, durationMin: m.durationMin, active: m.active, sortOrder: m.sortOrder, updatedAt: m.updatedAt.toISOString(),
    createdBy: m.createdById ? users.get(m.createdById) ?? null : null, done: doneSet.has(m.id),
    // HTML abre pelo nosso endereço, isolado (sandbox); o resto, direto do armazenamento.
    fileUrl: m.path ? (m.mime === 'text/html' ? `/universidade/ver/${m.id}` : reads[m.path] ?? null) : null, downloadUrl: m.path ? downloads[m.path] ?? null : null,
    canEdit: admin || (v.editor && m.createdById === principal.id),
  }));
  const ids = new Set(materials.map((m) => m.id));
  return {
    materials,
    tracks: tracks.filter((t) => canSee(t, v)).map((t) => {
      const items = t.items.filter((i) => ids.has(i.materialId));
      return { id: t.id, name: t.name, description: t.description, audience: t.audience, roleKey: t.roleKey, active: t.active, items: items.map((i) => i.materialId), progress: trackProgress(items, doneSet) };
    }),
    pendingRequired: materials.filter((m) => m.required && m.active && !m.done).length,
    storage: configured,
  };
}
export type EduLibrary = Awaited<ReturnType<typeof eduLibrary>>;

/** Para o "Hoje": quantos obrigatórios faltam e o próximo passo da trilha. */
export async function eduReminder(principal: Principal | null) {
  if (!principal || !can(principal, 'edu.view')) return null;
  const v = await viewerOf(principal);
  const [req, done] = await Promise.all([
    prisma.eduMaterial.findMany({ where: { required: true, active: true }, select: { id: true, audience: true, roleKey: true, active: true } }),
    prisma.eduCompletion.findMany({ where: { userId: principal.id }, select: { materialId: true } }),
  ]);
  const d = new Set(done.map((x) => x.materialId));
  // O lembrete vale para quem é público do material (não para quem só publica).
  const mine = req.filter((m) => canSee(m, { ...v, editor: false }));
  const pending = mine.filter((m) => !d.has(m.id)).length;
  return pending ? { pending, total: mine.length } : null;
}

const materialSchema = z.object({
  title: z.string().trim().min(3, 'Dê um título ao material.').max(140),
  description: z.string().trim().max(1500).nullable(),
  area: z.enum(EDU_AREAS.map((a) => a.id) as [string, ...string[]]),
  category: z.string().trim().max(60).nullable(),
  format: z.enum(EDU_FORMATS.map((f) => f.id) as [string, ...string[]]),
  url: z.string().trim().max(1000).nullable().refine((v) => !v || /^https:\/\//.test(v), 'O link precisa começar com https://'),
  audience: z.enum(EDU_AUDIENCES.map((a) => a.id) as [string, ...string[]]),
  roleKey: z.string().trim().max(40).nullable(),
  required: z.boolean(),
  version: z.string().trim().max(30).nullable(),
  durationMin: z.number().int().min(1).max(1200).nullable(),
  active: z.boolean(),
  sortOrder: z.number().int().min(0).max(999).default(0),
  /** Arquivo já enviado ao bucket (passo 1 do upload). */
  file: z.object({ path: z.string(), fileName: z.string().max(200) }).nullable().optional(),
  removeFile: z.boolean().optional(),
});

async function editable(principal: Principal, id: string) {
  const m = await prisma.eduMaterial.findUnique({ where: { id } });
  if (!m) throw new NotFoundError('Material não encontrado.');
  if (!can(principal, 'edu.admin') && m.createdById !== principal.id) throw new AuthorizationError('Só quem publicou (ou a diretoria) edita este material.');
  return m;
}

/** Passo 1 do envio de arquivo: valida e devolve a URL para o navegador enviar direto ao bucket. */
export async function startEduUpload(principal: Principal | null, file: { name: string; size: number }) {
  assertCan(principal, 'edu.edit');
  const mime = eduMime(file.name);
  if (!mime) throw new AppError('Formato não aceito. Use PDF, HTML, PowerPoint, Word, Excel, e-book (EPUB), áudio (MP3, M4A, WAV), vídeo (MP4, MOV) ou imagem.');
  if (file.size <= 0) throw new AppError('Arquivo vazio.');
  if (file.size > EDU_MAX_BYTES) throw new AppError('Arquivo acima de 50 MB. Para áudio/vídeo longos, suba no Drive, YouTube (não listado) ou Spotify e cole o link.');
  const path = eduPath(randomUUID(), file.name);
  return { path, mime, uploadUrl: await signedUploadUrl(path) };
}

export async function saveMaterial(principal: Principal | null, id: string | null, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'edu.edit');
  const r = materialSchema.safeParse(input);
  if (!r.success) throw new AppError(r.error.issues[0]?.message ?? 'Dados inválidos.');
  const d = r.data;
  if (d.audience === 'PERFIL' && !d.roleKey) throw new AppError('Escolha o perfil.');
  const before = id ? await editable(principal, id) : null;
  let fileData: { path: string | null; fileName: string | null; mime: string | null; sizeBytes: number | null } | undefined;
  if (d.file) {
    if (!EDU_PATH_RE.test(d.file.path)) throw new AppError('Envio inválido.');
    const mime = eduMime(d.file.fileName) ?? eduMime(d.file.path);
    if (!mime) throw new AppError('Formato não aceito.');
    const size = await objectSize(d.file.path);
    if (size === null) throw new AppError('O arquivo não chegou ao armazenamento. Envie de novo.');
    fileData = { path: d.file.path, fileName: d.file.fileName, mime, sizeBytes: size };
  } else if (d.removeFile) fileData = { path: null, fileName: null, mime: null, sizeBytes: null };
  const hasFile = fileData ? !!fileData.path : !!before?.path;
  if (!d.url && !hasFile) throw new AppError('Cole o link ou envie o arquivo.');
  const data = {
    title: d.title, description: d.description || null, area: d.area, category: d.category || null, format: d.format, url: d.url || null,
    audience: d.audience, roleKey: d.audience === 'PERFIL' ? d.roleKey : null, required: d.required, version: d.version || null,
    durationMin: d.durationMin, active: d.active, sortOrder: d.sortOrder, ...(fileData ?? {}),
  };
  const saved = await prisma.$transaction(async (tx) => {
    const m = id ? await tx.eduMaterial.update({ where: { id }, data }) : await tx.eduMaterial.create({ data: { ...data, createdById: principal.id } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: id ? 'edu.material_updated' : 'edu.material_created', entityType: 'edu_material', entityId: m.id, before, after: m, summary: `${principal.name} ${id ? 'atualizou' : 'publicou'} “${m.title}” na Universidade Nação` });
    return m;
  });
  // Arquivo trocado/removido: apaga o antigo do bucket.
  if (before?.path && fileData && before.path !== fileData.path) await removeObjects([before.path]).catch(() => undefined);
  return saved.id;
}

export async function deleteMaterial(principal: Principal | null, id: string, meta: RequestMeta) {
  assertCan(principal, 'edu.edit');
  const m = await editable(principal, id);
  await prisma.$transaction(async (tx) => {
    await tx.eduMaterial.delete({ where: { id } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'edu.material_deleted', entityType: 'edu_material', entityId: id, before: m, summary: `${principal.name} excluiu “${m.title}” da Universidade Nação` });
  });
  if (m.path) await removeObjects([m.path]).catch(() => undefined);
}

/** "Concluí" (ou desfazer). */
export async function setCompleted(principal: Principal | null, materialId: string, done: boolean) {
  assertCan(principal, 'edu.view');
  const m = await prisma.eduMaterial.findUnique({ where: { id: materialId }, select: { id: true, audience: true, roleKey: true, active: true } });
  if (!m || !canSee(m, await viewerOf(principal))) throw new NotFoundError('Material não encontrado.');
  if (done) await prisma.eduCompletion.upsert({ where: { materialId_userId: { materialId, userId: principal.id } }, create: { materialId, userId: principal.id }, update: {} });
  else await prisma.eduCompletion.deleteMany({ where: { materialId, userId: principal.id } });
}

// ── Trilhas ───────────────────────────────────────────────

const trackSchema = z.object({
  name: z.string().trim().min(3, 'Dê um nome à trilha.').max(100),
  description: z.string().trim().max(800).nullable(),
  audience: z.enum(EDU_AUDIENCES.map((a) => a.id) as [string, ...string[]]),
  roleKey: z.string().trim().max(40).nullable(),
  active: z.boolean(),
  items: z.array(z.string().uuid()).max(60),
});

export async function saveTrack(principal: Principal | null, id: string | null, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'edu.edit');
  const r = trackSchema.safeParse(input);
  if (!r.success) throw new AppError(r.error.issues[0]?.message ?? 'Dados inválidos.');
  const d = r.data;
  if (d.audience === 'PERFIL' && !d.roleKey) throw new AppError('Escolha o perfil.');
  const items = [...new Set(d.items)];
  if (items.length && (await prisma.eduMaterial.count({ where: { id: { in: items } } })) !== items.length) throw new AppError('Algum material da trilha não existe mais.');
  return prisma.$transaction(async (tx) => {
    const before = id ? await tx.eduTrack.findUnique({ where: { id }, include: { items: true } }) : null;
    if (id && !before) throw new NotFoundError('Trilha não encontrada.');
    if (before && !can(principal, 'edu.admin') && before.createdById && before.createdById !== principal.id) throw new AuthorizationError('Só quem criou (ou a diretoria) edita esta trilha.');
    const data = { name: d.name, description: d.description || null, audience: d.audience, roleKey: d.audience === 'PERFIL' ? d.roleKey : null, active: d.active };
    const t = id ? await tx.eduTrack.update({ where: { id }, data }) : await tx.eduTrack.create({ data: { ...data, createdById: principal.id } });
    await tx.eduTrackItem.deleteMany({ where: { trackId: t.id } });
    if (items.length) await tx.eduTrackItem.createMany({ data: items.map((materialId, position) => ({ trackId: t.id, materialId, position })) });
    await audit(tx, { actorId: principal.id, ...meta }, { action: id ? 'edu.track_updated' : 'edu.track_created', entityType: 'edu_track', entityId: t.id, before, after: { ...t, itens: items.length }, summary: `${principal.name} ${id ? 'atualizou' : 'criou'} a trilha “${t.name}” (${items.length} materiais)` });
    return t.id;
  });
}

export async function deleteTrack(principal: Principal | null, id: string, meta: RequestMeta) {
  assertCan(principal, 'edu.admin');
  await prisma.$transaction(async (tx) => {
    const t = await tx.eduTrack.findUnique({ where: { id } });
    if (!t) throw new NotFoundError('Trilha não encontrada.');
    await tx.eduTrack.delete({ where: { id } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'edu.track_deleted', entityType: 'edu_track', entityId: id, before: t, summary: `${principal.name} excluiu a trilha “${t.name}”` });
  });
}

// ── Painel (quem concluiu) ───────────────────────────────

/** Para quem publica: por colaborador, obrigatórios e trilhas concluídos; por material, quantos concluíram. */
export async function eduPanel(principal: Principal | null) {
  assertCan(principal, 'edu.edit');
  const [users, sectors, materials, tracks, completions] = await Promise.all([
    prisma.user.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, roles: { select: { role: { select: { key: true, name: true, permissions: { select: { permission: { select: { key: true } } } } } } } }, teachers: { select: { teacherId: true } } } }),
    prisma.procSector.findMany({ where: { active: true, leaderId: { not: null } }, select: { leaderId: true } }),
    prisma.eduMaterial.findMany({ where: { active: true }, orderBy: [{ area: 'asc' }, { sortOrder: 'asc' }] }),
    prisma.eduTrack.findMany({ where: { active: true }, include: { items: { orderBy: { position: 'asc' }, select: { materialId: true } } } }),
    prisma.eduCompletion.findMany(),
  ]);
  const leaders = new Set(sectors.map((s) => s.leaderId!));
  const doneBy = new Map<string, Set<string>>();
  for (const c of completions) { const s = doneBy.get(c.userId) ?? new Set(); s.add(c.materialId); doneBy.set(c.userId, s); }
  const people = users
    .filter((u) => u.roles.some((r) => r.role.permissions.some((p) => p.permission.key === 'edu.view')))
    .map((u) => {
      const roleKeys = u.roles.map((r) => r.role.key);
      const perms = new Set(u.roles.flatMap((r) => r.role.permissions.map((p) => p.permission.key)));
      const v: Viewer = { editor: false, leader: leaders.has(u.id) || perms.has('proc.admin') || roleKeys.includes('LIDER'), teacher: u.teachers.length > 0 || roleKeys.includes('PROFESSOR'), roleKeys };
      const done = doneBy.get(u.id) ?? new Set<string>();
      const required = materials.filter((m) => m.required && canSee(m, v));
      const myTracks = tracks.filter((t) => canSee(t, v) && t.items.length);
      return {
        id: u.id, name: u.name, roles: u.roles.map((r) => r.role.name).join(', '),
        required: { total: required.length, done: required.filter((m) => done.has(m.id)).length, pending: required.filter((m) => !done.has(m.id)).map((m) => m.title) },
        tracks: myTracks.map((t) => ({ id: t.id, name: t.name, ...trackProgress(t.items, done) })),
      };
    });
  return {
    people,
    materials: materials.map((m) => ({ id: m.id, title: m.title, area: m.area, required: m.required, done: completions.filter((c) => c.materialId === m.id).length })),
  };
}
export type EduPanel = Awaited<ReturnType<typeof eduPanel>>;

/** Arquivo para abrir no app (ex.: HTML): só quem pode ver o material. */
export async function eduFileForView(principal: Principal | null, id: string) {
  assertCan(principal, 'edu.view');
  const m = await prisma.eduMaterial.findUnique({ where: { id }, select: { path: true, mime: true, fileName: true, audience: true, roleKey: true, active: true } });
  if (!m?.path || !canSee(m, await viewerOf(principal))) throw new NotFoundError('Material não encontrado.');
  return { path: m.path, mime: m.mime ?? 'application/octet-stream', fileName: m.fileName ?? 'arquivo' };
}
