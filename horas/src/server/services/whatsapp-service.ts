import { z } from 'zod';
import { prisma } from '@/server/db';
import { audit } from '@/server/audit';
import { assertCan } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import type { RequestMeta } from '@/server/auth/session';
import { AppError } from '@/server/errors';
import { maskDestination, normalizeDestination, previewOf, WA_KINDS } from '@/domain/whatsapp';
import { zapiConfig, zapiSendPdf, zapiSendText, zapiStatus } from '@/server/whatsapp/zapi';

/**
 * Envio de WhatsApp pelo sistema. Todo envio fica registrado (destino
 * mascarado, sem texto quando há senha) e auditado. Em modo teste
 * (ZAPI_TEST_PHONE) tudo vai para o número de teste.
 */

const sendSchema = z.object({
  kind: z.enum(WA_KINDS.map((k) => k.id) as [string, ...string[]]),
  to: z.string().trim().min(8, 'Informe o número (com DDD) ou o ID do grupo.').max(60),
  text: z.string().trim().min(1, 'A mensagem está vazia.').max(4000, 'Mensagem longa demais para o WhatsApp.'),
  hasSecret: z.boolean().default(false),
});

export interface SendResult { status: 'SENT' | 'SIMULATED'; testMode: boolean; to: string }

export async function sendWhatsApp(principal: Principal | null, input: unknown, meta: RequestMeta, pdf?: { bytes: Uint8Array; fileName: string }): Promise<SendResult> {
  assertCan(principal, 'whatsapp.send');
  const r = sendSchema.safeParse(input);
  if (!r.success) throw new AppError(r.error.issues[0]?.message ?? 'Dados inválidos.');
  const d = r.data;
  if (d.kind === 'ACESSO') assertCan(principal, 'admin.users');
  const dest = normalizeDestination(d.to);
  if (!dest) throw new AppError('Número inválido. Use DDD + número (ex.: 61 98466-2806) ou o ID do grupo.');
  const cfg = zapiConfig();
  if (!cfg.configured) throw new AppError('WhatsApp ainda não configurado: peça ao administrador para cadastrar a Z-API (Administração → WhatsApp).');
  const target = cfg.testPhone ? (normalizeDestination(cfg.testPhone) ?? dest) : dest;
  const testMode = !!cfg.testPhone;
  const text = testMode ? `🧪 [TESTE — seria para ${maskDestination(dest)}]\n\n${d.text}` : d.text;

  let providerId: string | null = null;
  let error: string | null = null;
  try {
    providerId = pdf ? await zapiSendPdf(target, pdf.bytes, pdf.fileName, text) : await zapiSendText(target, text);
  } catch (e) {
    error = e instanceof Error ? e.message : 'Falha no envio.';
  }
  const status = error ? 'FAILED' : cfg.fake ? 'SIMULATED' : 'SENT';
  await prisma.$transaction(async (tx) => {
    const m = await tx.waMessage.create({
      data: { kind: d.kind, toMasked: maskDestination(dest), preview: previewOf(d.text, d.hasSecret), hasFile: !!pdf, status, testMode, providerId, error, createdById: principal.id },
    });
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: error ? 'whatsapp.failed' : 'whatsapp.sent', entityType: 'wa_message', entityId: m.id,
      // Em falha, guarda as credenciais MASCARADAS (4 primeiros…4 últimos) para diagnóstico sem expor segredo.
      after: { tipo: d.kind, para: m.toMasked, teste: testMode, arquivo: !!pdf, erro: error, ...(error ? { credenciais: cfg.hints } : {}) },
      summary: `${principal.name} ${error ? 'tentou enviar' : 'enviou'} WhatsApp (${WA_KINDS.find((k) => k.id === d.kind)!.label}) para ${m.toMasked}${testMode ? ' — modo teste' : ''}${error ? `: ${error}` : ''}`,
    });
  });
  if (error) throw new AppError(error);
  return { status: status as SendResult['status'], testMode, to: maskDestination(dest) };
}

export async function whatsAppOverview(principal: Principal | null) {
  assertCan(principal, 'whatsapp.admin');
  const cfg = zapiConfig();
  let status: { connected: boolean; smartphoneConnected: boolean | null; error: string | null } | null = null;
  let statusError: string | null = null;
  if (cfg.configured) {
    try { status = await zapiStatus(); } catch (e) { statusError = e instanceof Error ? e.message : 'Falha ao consultar a Z-API.'; }
  }
  const rows = await prisma.waMessage.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  const users = new Map((await prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.createdById).filter((x): x is string => !!x))] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return {
    configured: cfg.configured, fake: cfg.fake, testPhone: cfg.testPhone ? maskDestination(normalizeDestination(cfg.testPhone) ?? cfg.testPhone) : null,
    clientToken: !!cfg.clientToken, hints: cfg.hints, status, statusError,
    messages: rows.map((r) => ({ id: r.id, kind: r.kind, to: r.toMasked, preview: r.preview, hasFile: r.hasFile, status: r.status, testMode: r.testMode, error: r.error, by: r.createdById ? users.get(r.createdById) ?? null : null, at: r.createdAt.toISOString() })),
  };
}
export type WhatsAppOverview = Awaited<ReturnType<typeof whatsAppOverview>>;
