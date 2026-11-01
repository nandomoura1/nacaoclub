import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { prisma, type Tx } from '@/server/db';
import { audit } from '@/server/audit';
import { assertCan, can } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import type { RequestMeta } from '@/server/auth/session';
import { AppError, NotFoundError } from '@/server/errors';
import { getEnv } from '@/lib/env';
import { todayIso } from '@/lib/today';
import {
  CONTRACT_CATEGORIES, FIELD_TYPES, SIGNER_ROLES, checkTemplate, contractCode, dateInWords, documentOk, formatDocument, maskPhone, renderContract, roleLabel, templateKeys,
  type TemplateField,
} from '@/domain/contracts';
import { normalizeDestination } from '@/domain/whatsapp';
import { contractPdf } from '@/server/contracts/pdf';
import { getObject, putObject } from '@/server/storage';
import { deliverWhatsApp } from './whatsapp-service';
import { zapiStatus } from '@/server/whatsapp/zapi';
import { DEFAULT_TEMPLATES } from '@/server/contracts/templates';

/**
 * Contratos: modelos com campos variáveis; contrato preenchido, enviado por link
 * individual (WhatsApp) e assinado com código de uso único; PDF final com trilha de
 * evidências guardado no armazenamento privado. O link leva um token aleatório; o banco
 * guarda só o HMAC dele (como a sessão) e o HMAC do código.
 */

type P = Principal;
const OTP_TTL_MIN = 10;
const OTP_MAX_TRIES = 5;
const OTP_COOLDOWN_S = 60;

const mac = (v: string) => createHmac('sha256', getEnv().SESSION_SECRET).update(v).digest('hex');
/** HMAC do código de assinatura (o banco nunca guarda o código). */
export const signCodeHash = (signerId: string, code: string) => mac(`otp:${signerId}:${code}`);
const sha256 = (v: string | Uint8Array) => createHash('sha256').update(v).digest('hex');
const brt = (d: Date) => d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'medium' });
const parse = <S extends z.ZodType>(s: S, v: unknown): z.output<S> => {
  const r = s.safeParse(v);
  if (!r.success) throw new AppError(r.error.issues[0]?.message ?? 'Dados inválidos.');
  return r.data;
};
const appUrl = (origin: string | null | undefined) => (process.env.APP_URL?.replace(/\/+$/, '') || origin || '').replace(/\/+$/, '');

// ── Modelos ───────────────────────────────────────────────────

const fieldSchema = z.object({
  key: z.string().trim().regex(/^[a-z0-9_]{2,40}$/, 'Chave do campo: letras minúsculas, números e _.'),
  label: z.string().trim().min(2, 'Dê um nome a cada campo.').max(80),
  type: z.enum(FIELD_TYPES.map((f) => f.id) as [string, ...string[]]),
  required: z.boolean().default(true),
  help: z.string().trim().max(160).optional(),
});
const templateSchema = z.object({
  name: z.string().trim().min(3, 'Dê um nome ao modelo.').max(120),
  category: z.enum(CONTRACT_CATEGORIES.map((c) => c.id) as [string, ...string[]]),
  description: z.string().trim().max(500).nullable().optional(),
  body: z.string().trim().min(50, 'Escreva o texto do contrato.').max(60_000),
  fields: z.array(fieldSchema).max(60),
  signerRoles: z.array(z.enum(SIGNER_ROLES.map((r) => r.id) as [string, ...string[]])).min(1, 'Diga quem assina (ex.: Contratante e Contratado).').max(8),
  active: z.boolean().default(true),
});

export async function listTemplates(principal: P | null, opts: { all?: boolean } = {}) {
  assertCan(principal, 'contract.view');
  const rows = await prisma.contractTemplate.findMany({ where: opts.all ? {} : { active: true }, orderBy: [{ category: 'asc' }, { name: 'asc' }], include: { _count: { select: { contracts: true } } } });
  return rows.map((t) => ({ id: t.id, name: t.name, category: t.category, description: t.description, body: t.body, fields: t.fields as unknown as TemplateField[], signerRoles: t.signerRoles, active: t.active, uses: t._count.contracts, updatedAt: t.updatedAt.toISOString() }));
}
export type TemplateRow = Awaited<ReturnType<typeof listTemplates>>[number];

export async function saveTemplate(principal: P | null, id: string | null, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'contract.templates');
  const d = parse(templateSchema, input);
  const errors = checkTemplate(d.body, d.fields as TemplateField[]);
  if (errors.length) throw new AppError(errors[0]!);
  return prisma.$transaction(async (tx) => {
    const clash = await tx.contractTemplate.findFirst({ where: { name: { equals: d.name, mode: 'insensitive' }, ...(id ? { id: { not: id } } : {}) } });
    if (clash) throw new AppError('Já existe um modelo com esse nome.');
    const data = { ...d, description: d.description || null, fields: d.fields as object };
    const t = id ? await tx.contractTemplate.update({ where: { id }, data }) : await tx.contractTemplate.create({ data: { ...data, createdById: principal.id } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: id ? 'contract.template_updated' : 'contract.template_created', entityType: 'contract_template', entityId: t.id, after: { nome: t.name, campos: d.fields.length }, summary: `${principal.name} ${id ? 'alterou' : 'criou'} o modelo de contrato "${t.name}"` });
    return t.id;
  });
}

/** Modelos-base da Nação (revisar com o jurídico). Idempotente: não duplica pelo nome. */
export async function loadDefaultTemplates(principal: P | null, meta: RequestMeta) {
  assertCan(principal, 'contract.templates');
  const created: string[] = [];
  for (const t of DEFAULT_TEMPLATES) {
    if (await prisma.contractTemplate.findUnique({ where: { name: t.name } })) continue;
    await saveTemplate(principal, null, t, meta);
    created.push(t.name);
  }
  return created;
}

// ── Contratos ─────────────────────────────────────────────────

const signerSchema = z.object({
  id: z.string().uuid().optional(),
  role: z.enum(SIGNER_ROLES.map((r) => r.id) as [string, ...string[]]),
  name: z.string().trim().min(3, 'Informe o nome de quem assina.').max(120),
  document: z.string().trim().max(20).nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  email: z.string().trim().max(120).nullable().optional(),
});
const contractSchema = z.object({
  templateId: z.string().uuid('Escolha o modelo.'),
  companyId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(3, 'Dê um título ao contrato.').max(160),
  values: z.record(z.string(), z.string().max(5000)).default({}),
  signers: z.array(signerSchema).min(1, 'Inclua quem vai assinar.').max(8),
  notes: z.string().trim().max(1000).nullable().optional(),
});

async function builtins(tx: Tx, companyId: string | null, code: string, today: string) {
  const c = companyId ? await tx.company.findUnique({ where: { id: companyId } }) : null;
  return {
    empresa_razao_social: c?.legalName ?? '[razão social da empresa]',
    empresa_nome: c?.tradeName ?? c?.legalName ?? '[nome da empresa]',
    empresa_cnpj: c?.cnpj ? formatDocument(c.cnpj) : '[CNPJ da empresa]',
    empresa_endereco: c?.address ?? '[endereço da empresa]',
    empresa_representante: c?.legalRepresentative ?? '[representante legal]',
    data_hoje: dateInWords(today),
    cidade: 'Brasília/DF',
    codigo: code,
  };
}

/** Variáveis do sistema para a prévia na tela (o código definitivo sai ao salvar). */
export async function previewBuiltins(principal: P | null, companyId: string | null, code: string | null) {
  assertCan(principal, 'contract.view');
  return builtins(prisma, companyId, code ?? 'CT-0000-0000', todayIso());
}

async function nextCode(tx: Tx) {
  const year = Number(todayIso().slice(0, 4));
  const last = await tx.contract.findFirst({ where: { code: { startsWith: `CT-${year}-` } }, orderBy: { code: 'desc' }, select: { code: true } });
  return contractCode(year, (last ? Number(last.code.slice(-4)) : 0) + 1);
}

async function event(tx: Tx, contractId: string, type: string, o: { signerId?: string | null; meta?: RequestMeta; detail?: object } = {}) {
  await tx.contractEvent.create({ data: { contractId, signerId: o.signerId ?? null, type, ipAddress: o.meta?.ipAddress ?? null, userAgent: o.meta?.userAgent ?? null, detail: o.detail ?? undefined } });
}

export async function listContracts(principal: P | null, f: { status?: string; q?: string } = {}) {
  assertCan(principal, 'contract.view');
  const rows = await prisma.contract.findMany({
    where: { ...(f.status ? { status: f.status } : {}), ...(f.q ? { OR: [{ title: { contains: f.q, mode: 'insensitive' } }, { code: { contains: f.q, mode: 'insensitive' } }, { signers: { some: { name: { contains: f.q, mode: 'insensitive' } } } }] } : {}) },
    orderBy: { createdAt: 'desc' }, take: 300,
    include: { signers: { select: { name: true, role: true, status: true }, orderBy: { position: 'asc' } } },
  });
  return rows.map((c) => ({ id: c.id, code: c.code, title: c.title, category: c.category, status: c.status, createdAt: c.createdAt.toISOString(), sentAt: c.sentAt?.toISOString() ?? null, completedAt: c.completedAt?.toISOString() ?? null, signers: c.signers }));
}

export async function getContract(principal: P | null, id: string) {
  assertCan(principal, 'contract.view');
  const c = await prisma.contract.findUnique({ where: { id }, include: { signers: { orderBy: { position: 'asc' } }, events: { orderBy: { at: 'asc' } }, template: true } });
  if (!c) throw new NotFoundError('Contrato não encontrado.');
  const names = new Map(c.signers.map((s) => [s.id, s.name]));
  return {
    id: c.id, code: c.code, title: c.title, category: c.category, status: c.status, templateId: c.templateId, companyId: c.companyId,
    values: c.values as Record<string, string>, body: c.body, bodyHash: c.bodyHash, hasFinal: !!c.finalPath, finalHash: c.finalHash, notes: c.notes,
    sentAt: c.sentAt?.toISOString() ?? null, completedAt: c.completedAt?.toISOString() ?? null, cancelReason: c.cancelReason,
    template: c.template ? { id: c.template.id, name: c.template.name, body: c.template.body, fields: c.template.fields as unknown as TemplateField[], signerRoles: c.template.signerRoles } : null,
    signers: c.signers.map((s) => ({ id: s.id, role: s.role, name: s.name, document: s.document, phone: s.phone, email: s.email, status: s.status, viewedAt: s.viewedAt?.toISOString() ?? null, signedAt: s.signedAt?.toISOString() ?? null, refusedReason: s.refusedReason })),
    events: c.events.map((e) => ({ at: e.at.toISOString(), type: e.type, who: e.signerId ? names.get(e.signerId) ?? null : null, ip: e.ipAddress, detail: e.detail })),
  };
}
export type ContractDetail = Awaited<ReturnType<typeof getContract>>;

export async function saveContract(principal: P | null, id: string | null, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'contract.edit');
  const d = parse(contractSchema, input);
  for (const s of d.signers) {
    if (s.document && !documentOk(s.document)) throw new AppError(`${s.name}: CPF/CNPJ inválido.`);
    if (s.phone && !normalizeDestination(s.phone)) throw new AppError(`${s.name}: WhatsApp inválido (DDD + número).`);
  }
  return prisma.$transaction(async (tx) => {
    const t = await tx.contractTemplate.findUnique({ where: { id: d.templateId } });
    if (!t) throw new AppError('Modelo não encontrado.');
    const data = { templateId: t.id, companyId: d.companyId ?? null, title: d.title, category: t.category, values: d.values, notes: d.notes || null };
    let cid = id;
    if (id) {
      const cur = await tx.contract.findUnique({ where: { id } });
      if (!cur) throw new NotFoundError('Contrato não encontrado.');
      if (cur.status !== 'RASCUNHO') throw new AppError('Contrato já enviado para assinatura: não dá para alterar. Cancele e crie outro.');
      await tx.contract.update({ where: { id }, data });
      await tx.contractSigner.deleteMany({ where: { contractId: id } });
    } else {
      const c = await tx.contract.create({ data: { ...data, code: await nextCode(tx), createdById: principal.id } });
      cid = c.id;
      await event(tx, c.id, 'CRIADO', { meta, detail: { por: principal.name } });
    }
    await tx.contractSigner.createMany({ data: d.signers.map((s, i) => ({ contractId: cid!, role: s.role, name: s.name, document: s.document ? formatDocument(s.document) : null, phone: s.phone || null, email: s.email || null, position: i })) });
    const c = await tx.contract.findUniqueOrThrow({ where: { id: cid! } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: id ? 'contract.updated' : 'contract.created', entityType: 'contract', entityId: cid!, after: { codigo: c.code, titulo: c.title, partes: d.signers.length }, summary: `${principal.name} ${id ? 'alterou' : 'criou'} o contrato ${c.code} — ${c.title}` });
    return cid!;
  });
}

/** Texto final do contrato (campos preenchidos). Lança erro se faltar campo obrigatório. */
async function finalText(tx: Tx, c: { templateId: string | null; companyId: string | null; code: string; values: unknown }, strict = false) {
  const t = c.templateId ? await tx.contractTemplate.findUnique({ where: { id: c.templateId } }) : null;
  if (!t) throw new AppError('O modelo deste contrato não existe mais.');
  const b = await builtins(tx, c.companyId, c.code, todayIso());
  const r = renderContract(t.body, t.fields as unknown as TemplateField[], c.values as Record<string, string>, b);
  if (r.errors.length) throw new AppError(r.errors[0]!);
  // Para enviar, nada de "[CNPJ da empresa]" no texto: a empresa precisa estar escolhida e completa.
  if (strict) {
    const missing = templateKeys(t.body).filter((k) => b[k as keyof typeof b]?.startsWith('['));
    if (missing.length) throw new AppError(c.companyId ? `Complete o cadastro da empresa (Administração → Empresas): ${missing.map((k) => b[k as keyof typeof b].slice(1, -1)).join(', ')}.` : 'Escolha a empresa contratante antes de enviar.');
  }
  return r.text;
}

/** Minuta em PDF (antes de assinar) — para conferir e mandar para revisão. */
export async function draftPdf(principal: P | null, id: string) {
  assertCan(principal, 'contract.view');
  const c = await prisma.contract.findUnique({ where: { id } });
  if (!c) throw new NotFoundError('Contrato não encontrado.');
  if (c.finalPath) return { bytes: await getObject(c.finalPath), fileName: `${c.code}-assinado.pdf` };
  const body = c.body || (await finalText(prisma, c));
  return { bytes: await contractPdf({ code: c.code, title: c.title, body, bodyHash: c.bodyHash, draft: true, generatedAt: brt(new Date()) }), fileName: `${c.code}-minuta.pdf` };
}

function newToken() {
  const token = randomBytes(24).toString('base64url');
  return { token, hash: mac(`signer:${token}`) };
}
const linkOf = (origin: string, token: string) => `${appUrl(origin)}/assinar/${token}`;

/**
 * A Z-API aceita a mensagem mesmo com o celular da Nação desconectado (fica na fila e não
 * chega). Antes de mandar link/código, confere a conexão; falha na consulta = segue o envio.
 */
async function whatsAppOffline(): Promise<string | null> {
  try {
    const st = await zapiStatus();
    if (!st.connected) return 'o WhatsApp da Nação está desconectado da Z-API';
    if (st.smartphoneConnected === false) return 'o celular do WhatsApp da Nação está sem internet ou desligado';
    return null;
  } catch {
    return null;
  }
}

async function sendLink(principal: P, c: { code: string; title: string }, s: { name: string; phone: string | null }, link: string, meta: RequestMeta) {
  if (!s.phone) return 'sem WhatsApp';
  const off = await whatsAppOffline();
  if (off) return `não enviado: ${off} — copie o link e envie você mesmo`;
  try {
    const r = await deliverWhatsApp({
      kind: 'CONTRATO', to: s.phone, hasSecret: true, actor: { id: principal.id, name: principal.name }, meta,
      text: `Olá, ${s.name.split(' ')[0]}! A Nação Club enviou o contrato *${c.title}* (${c.code}) para você ler e assinar online:\n\n${link}\n\nNa hora de assinar, enviaremos um código de confirmação para este WhatsApp.`,
    });
    return r.error ? `falhou: ${r.error}` : r.testMode ? 'enviado (modo teste)' : 'enviado';
  } catch (e) {
    return `falhou: ${e instanceof Error ? e.message : 'erro'}`;
  }
}

/** Congela o texto (hash), gera um link por parte e envia pelo WhatsApp. */
export async function sendContract(principal: P | null, id: string, origin: string, meta: RequestMeta) {
  assertCan(principal, 'contract.edit');
  const prepared = await prisma.$transaction(async (tx) => {
    const c = await tx.contract.findUnique({ where: { id }, include: { signers: { orderBy: { position: 'asc' } } } });
    if (!c) throw new NotFoundError('Contrato não encontrado.');
    if (c.status !== 'RASCUNHO') throw new AppError('Este contrato já foi enviado.');
    if (!c.signers.length) throw new AppError('Inclua quem vai assinar.');
    const noPhone = c.signers.filter((s) => !s.phone);
    if (noPhone.length) throw new AppError(`Informe o WhatsApp de ${noPhone.map((s) => s.name).join(', ')}: o código de assinatura vai por lá.`);
    const body = await finalText(tx, c, true);
    const tokens = c.signers.map((s) => ({ s, ...newToken() }));
    for (const t of tokens) await tx.contractSigner.update({ where: { id: t.s.id }, data: { tokenHash: t.hash } });
    await tx.contract.update({ where: { id }, data: { body, bodyHash: sha256(body), status: 'AGUARDANDO', sentAt: new Date() } });
    await event(tx, id, 'ENVIADO', { meta, detail: { por: principal.name, hash: sha256(body) } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'contract.sent', entityType: 'contract', entityId: id, after: { codigo: c.code, partes: c.signers.map((s) => s.name) }, summary: `${principal.name} enviou o contrato ${c.code} para assinatura` });
    return { c, tokens };
  });
  const out = [];
  for (const t of prepared.tokens) {
    const link = linkOf(origin, t.token);
    out.push({ signerId: t.s.id, name: t.s.name, link, whatsapp: await sendLink(principal, prepared.c, t.s, link, meta) });
  }
  return out;
}

/** Novo link para uma parte (o anterior deixa de valer) e reenvio pelo WhatsApp. */
export async function resendLink(principal: P | null, signerId: string, origin: string, meta: RequestMeta) {
  assertCan(principal, 'contract.edit');
  const s = await prisma.contractSigner.findUnique({ where: { id: signerId }, include: { contract: true } });
  if (!s) throw new NotFoundError('Parte não encontrada.');
  if (s.contract.status === 'RASCUNHO' || s.contract.status === 'CANCELADO') throw new AppError('Envie o contrato para assinatura primeiro.');
  const t = newToken();
  await prisma.$transaction(async (tx) => {
    await tx.contractSigner.update({ where: { id: s.id }, data: { tokenHash: t.hash } });
    await event(tx, s.contractId, 'LINK_NOVO', { signerId: s.id, meta, detail: { por: principal.name } });
  });
  const link = linkOf(origin, t.token);
  return { link, whatsapp: s.status === 'PENDENTE' ? await sendLink(principal, s.contract, s, link, meta) : 'não reenviado' };
}

export async function cancelContract(principal: P | null, id: string, reason: string, meta: RequestMeta) {
  assertCan(principal, 'contract.edit');
  const r = reason.trim();
  if (r.length < 3) throw new AppError('Diga o motivo do cancelamento.');
  await prisma.$transaction(async (tx) => {
    const c = await tx.contract.findUnique({ where: { id } });
    if (!c) throw new NotFoundError('Contrato não encontrado.');
    if (c.status === 'ASSINADO') throw new AppError('Contrato já assinado por todos: não dá para cancelar aqui (faça um distrato).');
    await tx.contract.update({ where: { id }, data: { status: 'CANCELADO', cancelledAt: new Date(), cancelReason: r } });
    await tx.contractSigner.updateMany({ where: { contractId: id }, data: { tokenHash: null } });
    await event(tx, id, 'CANCELADO', { meta, detail: { por: principal.name, motivo: r } });
    await audit(tx, { actorId: principal.id, ...meta }, { action: 'contract.cancelled', entityType: 'contract', entityId: id, after: { motivo: r }, summary: `${principal.name} cancelou o contrato ${c.code}` });
  });
}

// ── Assinatura (página pública, por link) ─────────────────────

async function signerByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  return prisma.contractSigner.findUnique({ where: { tokenHash: mac(`signer:${token}`) }, include: { contract: { include: { signers: { orderBy: { position: 'asc' } } } } } });
}

/** O que a pessoa vê ao abrir o link. Registra a primeira visualização. */
export async function openSignLink(token: string, meta: RequestMeta) {
  const s = await signerByToken(token);
  if (!s || s.contract.status === 'CANCELADO') return null;
  if (!s.viewedAt) {
    await prisma.$transaction(async (tx) => {
      await tx.contractSigner.update({ where: { id: s.id }, data: { viewedAt: new Date() } });
      await event(tx, s.contractId, 'VISUALIZADO', { signerId: s.id, meta });
    });
  }
  const c = s.contract;
  return {
    code: c.code, title: c.title, status: c.status, body: c.body, bodyHash: c.bodyHash, hasFinal: !!c.finalPath,
    me: { name: s.name, role: roleLabel(s.role), status: s.status, phone: maskPhone(s.phone), signedAt: s.signedAt ? brt(s.signedAt) : null },
    signers: c.signers.map((x) => ({ name: x.name, role: roleLabel(x.role), status: x.status, signedAt: x.signedAt ? brt(x.signedAt) : null })),
  };
}
export type SignView = NonNullable<Awaited<ReturnType<typeof openSignLink>>>;

/** Envia o código de 6 dígitos para o WhatsApp da pessoa. */
export async function requestSignCode(token: string, meta: RequestMeta) {
  const s = await signerByToken(token);
  if (!s || s.contract.status !== 'AGUARDANDO') throw new AppError('Link inválido ou contrato indisponível.', 404);
  if (s.status !== 'PENDENTE') throw new AppError('Você já respondeu este contrato.');
  if (!s.phone) throw new AppError('Seu WhatsApp não está cadastrado. Fale com a Nação.');
  if (s.otpSentAt && Date.now() - s.otpSentAt.getTime() < OTP_COOLDOWN_S * 1000) throw new AppError('Código enviado há pouco. Aguarde 1 minuto para pedir outro.', 429);
  const off = await whatsAppOffline();
  if (off) throw new AppError(`Não conseguimos enviar o código agora: ${off}. Avise a Nação Club e tente de novo em alguns minutos.`, 503);
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await prisma.$transaction(async (tx) => {
    await tx.contractSigner.update({ where: { id: s.id }, data: { otpHash: signCodeHash(s.id, code), otpExpiresAt: new Date(Date.now() + OTP_TTL_MIN * 60_000), otpSentAt: new Date(), otpAttempts: 0 } });
    await event(tx, s.contractId, 'CODIGO_ENVIADO', { signerId: s.id, meta, detail: { para: maskPhone(s.phone) } });
  });
  const r = await deliverWhatsApp({
    kind: 'CONTRATO', to: s.phone, hasSecret: true, actor: { id: null, name: s.name }, meta,
    text: `Nação Club — código para assinar o contrato ${s.contract.code}: *${code}*\n\nVale por ${OTP_TTL_MIN} minutos. Não compartilhe este código.`,
  });
  if (r.error) throw new AppError('Não foi possível enviar o código pelo WhatsApp agora. Tente de novo em instantes.');
  return { to: maskPhone(s.phone) };
}

const normName = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Assina com o código. Quando todos assinam, gera e guarda o PDF final. */
export async function signWithCode(token: string, input: { code: string; name: string; agree: boolean }, meta: RequestMeta) {
  const s = await signerByToken(token);
  if (!s || s.contract.status !== 'AGUARDANDO') throw new AppError('Link inválido ou contrato indisponível.', 404);
  if (s.status !== 'PENDENTE') throw new AppError('Você já respondeu este contrato.');
  if (!input.agree) throw new AppError('Marque que leu e concorda com o contrato.');
  const typed = input.name.replace(/\s+/g, ' ').trim();
  if (normName(typed) !== normName(s.name)) throw new AppError(`Digite seu nome completo como está no contrato: ${s.name}.`);
  if (!s.otpHash || !s.otpExpiresAt) throw new AppError('Peça o código primeiro.');
  if (s.otpAttempts >= OTP_MAX_TRIES) throw new AppError('Muitas tentativas. Peça um novo código.', 429);
  if (s.otpExpiresAt < new Date()) throw new AppError('Código vencido. Peça um novo.');
  const ok = timingSafeEqual(Buffer.from(signCodeHash(s.id, input.code.replace(/\D/g, ''))), Buffer.from(s.otpHash));
  if (!ok) {
    await prisma.$transaction(async (tx) => {
      await tx.contractSigner.update({ where: { id: s.id }, data: { otpAttempts: { increment: 1 } } });
      await event(tx, s.contractId, 'CODIGO_ERRADO', { signerId: s.id, meta });
    });
    throw new AppError(`Código incorreto. Restam ${OTP_MAX_TRIES - s.otpAttempts - 1} tentativa(s).`);
  }
  const all = await prisma.$transaction(async (tx) => {
    await tx.contractSigner.update({ where: { id: s.id }, data: { status: 'ASSINADO', signedAt: new Date(), signedName: typed, ipAddress: meta.ipAddress ?? null, userAgent: meta.userAgent ?? null, otpHash: null } });
    await event(tx, s.contractId, 'ASSINADO', { signerId: s.id, meta, detail: { nome: typed, hash: s.contract.bodyHash } });
    return (await tx.contractSigner.count({ where: { contractId: s.contractId, status: { not: 'ASSINADO' } } })) === 0;
  });
  if (all) await finalize(s.contractId, meta);
  return { completed: all };
}

export async function refuseSign(token: string, reason: string, meta: RequestMeta) {
  const s = await signerByToken(token);
  if (!s || s.contract.status !== 'AGUARDANDO') throw new AppError('Link inválido ou contrato indisponível.', 404);
  if (s.status !== 'PENDENTE') throw new AppError('Você já respondeu este contrato.');
  const r = reason.replace(/\s+/g, ' ').trim().slice(0, 500);
  if (r.length < 3) throw new AppError('Conte o motivo (ex.: valor diferente do combinado).');
  await prisma.$transaction(async (tx) => {
    await tx.contractSigner.update({ where: { id: s.id }, data: { status: 'RECUSADO', refusedReason: r, ipAddress: meta.ipAddress ?? null, userAgent: meta.userAgent ?? null } });
    await event(tx, s.contractId, 'RECUSADO', { signerId: s.id, meta, detail: { motivo: r } });
  });
}

const EVENT_TEXT: Record<string, string> = {
  CRIADO: 'contrato criado', ENVIADO: 'enviado para assinatura', VISUALIZADO: 'abriu o contrato', CODIGO_ENVIADO: 'código enviado por WhatsApp',
  CODIGO_ERRADO: 'código digitado errado', ASSINADO: 'assinou', RECUSADO: 'recusou', LINK_NOVO: 'novo link gerado', CONCLUIDO: 'todas as partes assinaram', CANCELADO: 'contrato cancelado',
};

/** Todas as partes assinaram: PDF com página de evidências, guardado no armazenamento privado. */
async function finalize(contractId: string, meta: RequestMeta) {
  const c = await prisma.contract.findUniqueOrThrow({ where: { id: contractId }, include: { signers: { orderBy: { position: 'asc' } }, events: { orderBy: { at: 'asc' } } } });
  if (c.finalPath) return;
  const names = new Map(c.signers.map((s) => [s.id, s.name]));
  const bytes = await contractPdf({
    code: c.code, title: c.title, body: c.body, bodyHash: c.bodyHash, draft: false, generatedAt: brt(new Date()),
    signers: c.signers.map((s) => ({ name: s.name, role: s.role, document: s.document, phone: s.phone, signedAt: s.signedAt ? `${brt(s.signedAt)} (Brasília)` : null, signedName: s.signedName, ip: s.ipAddress, userAgent: s.userAgent })),
    events: [...c.events.map((e) => ({ at: brt(e.at), text: `${e.signerId ? `${names.get(e.signerId)}: ` : ''}${EVENT_TEXT[e.type] ?? e.type}${e.ipAddress ? ` (IP ${e.ipAddress})` : ''}` })), { at: brt(new Date()), text: EVENT_TEXT.CONCLUIDO! }],
  });
  const path = `contratos/${todayIso().slice(0, 7)}/${c.id}-${c.code.toLowerCase()}.pdf`;
  await putObject(path, bytes, 'application/pdf');
  await prisma.$transaction(async (tx) => {
    await tx.contract.update({ where: { id: c.id }, data: { status: 'ASSINADO', completedAt: new Date(), finalPath: path, finalHash: sha256(bytes) } });
    await event(tx, c.id, 'CONCLUIDO', { meta, detail: { hash_pdf: sha256(bytes) } });
    await audit(tx, { actorId: null, ...meta }, { action: 'contract.completed', entityType: 'contract', entityId: c.id, after: { codigo: c.code }, summary: `Contrato ${c.code} assinado por todas as partes` });
  });
}

/** PDF para quem tem o link: o assinado (se concluído) ou a minuta para leitura. */
export async function signerPdf(token: string) {
  const s = await signerByToken(token);
  if (!s || s.contract.status === 'CANCELADO') return null;
  const c = s.contract;
  if (c.finalPath) return { bytes: await getObject(c.finalPath), fileName: `${c.code}-assinado.pdf` };
  return { bytes: await contractPdf({ code: c.code, title: c.title, body: c.body, bodyHash: c.bodyHash, draft: true, generatedAt: brt(new Date()) }), fileName: `${c.code}-minuta.pdf` };
}

export const canSeeContracts = (p: P | null) => !!p && can(p, 'contract.view');
