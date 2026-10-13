import { prisma } from '@/server/db';
import { audit } from '@/server/audit';
import { isConfirmation, maskDestination, phoneKey } from '@/domain/whatsapp';
import { monthName } from '@/domain/wa-jobs';
import { deliverWhatsApp } from '@/server/services/whatsapp-service';

/**
 * Webhook "Ao receber" da Z-API: guarda a mensagem, descobre de quem é
 * (professor/usuário pelo telefone) e, se a pessoa tem uma confirmação
 * pendente (grade do mês), registra "confirmado" ou "pediu ajuste".
 */

export interface ZapiReceived {
  type?: string; instanceId?: string; messageId?: string; phone?: string; fromMe?: boolean; isGroup?: boolean; isNewsletter?: boolean; broadcast?: boolean;
  senderName?: string; chatName?: string;
  text?: { message?: string };
  buttonsResponseMessage?: { message?: string };
  listResponseMessage?: { title?: string; message?: string };
}

/** Token do webhook: ZAPI_WEBHOOK_TOKEN ou, se não houver, o CRON_SECRET. */
export const webhookToken = () => process.env.ZAPI_WEBHOOK_TOKEN || process.env.CRON_SECRET || null;

const textOf = (p: ZapiReceived) => (p.text?.message ?? p.buttonsResponseMessage?.message ?? p.listResponseMessage?.message ?? p.listResponseMessage?.title ?? '').trim().slice(0, 1000) || null;

async function whoIs(key: string) {
  // Poucos cadastros: casa em memória pela chave DDD + 8 dígitos.
  const [teachers, users] = await Promise.all([
    prisma.teacher.findMany({ where: { phone: { not: null } }, select: { id: true, phone: true } }),
    prisma.user.findMany({ where: { phone: { not: null }, active: true }, select: { id: true, phone: true } }),
  ]);
  return { teacherId: teachers.find((t) => phoneKey(t.phone) === key)?.id ?? null, userId: users.find((u) => phoneKey(u.phone) === key)?.id ?? null };
}

export type InboundOutcome = 'ignorada' | 'duplicada' | 'registrada' | 'CONFIRMOU' | 'AJUSTE';

export async function handleZapiReceived(p: ZapiReceived): Promise<InboundOutcome> {
  if (p.type && p.type !== 'ReceivedCallback') return 'ignorada';
  if (p.fromMe || p.isGroup || p.isNewsletter || p.broadcast || !p.messageId) return 'ignorada';
  const instance = process.env.ZAPI_INSTANCE_ID?.trim();
  if (instance && p.instanceId && p.instanceId !== instance) return 'ignorada';
  const key = phoneKey(p.phone);
  if (!key) return 'ignorada';
  if (await prisma.waInbound.findUnique({ where: { messageId: p.messageId }, select: { id: true } })) return 'duplicada';

  const text = textOf(p);
  const who = await whoIs(key);
  // Confirmação pendente para este número (a mais recente). Quem pediu ajuste e depois manda "ok" também confirma.
  const pending = await prisma.waConfirmation.findFirst({ where: { phoneKey: key, status: { in: ['PENDENTE', 'AJUSTE'] } }, orderBy: { sentAt: 'desc' } });
  let handled: InboundOutcome = 'registrada';
  let ack: string | null = null;
  if (pending && text) {
    const ok = isConfirmation(text);
    if (ok || pending.status === 'PENDENTE') {
      handled = ok ? 'CONFIRMOU' : 'AJUSTE';
      const first = pending.name.split(' ')[0];
      const what = pending.subject ?? `Grade mensal · ${monthName(pending.period)}`;
      ack = ok
        ? `Obrigado, ${first}! Confirmado ✅ _(${what})_`
        : `Recebido, ${first}! Repassamos para a coordenação, que vai falar com você. 💙`;
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.waInbound.create({
      data: { messageId: p.messageId!, phoneKey: key, toMasked: maskDestination(`55${key}`), senderName: (p.senderName ?? p.chatName ?? null)?.slice(0, 120) ?? null, text, teacherId: who.teacherId, userId: who.userId, handled: handled === 'registrada' ? null : handled },
    });
    if (pending && handled !== 'registrada') {
      const status = handled === 'CONFIRMOU' ? 'CONFIRMADO' : 'AJUSTE';
      // Ajuste acumula as mensagens; confirmação mantém o que já foi dito antes.
      const reply = status === 'AJUSTE' ? [pending.reply, text].filter(Boolean).join('\n').slice(0, 2000) : pending.reply;
      await tx.waConfirmation.update({ where: { id: pending.id }, data: { status, reply, repliedAt: new Date() } });
      await audit(tx, { actorId: null }, {
        action: 'whatsapp.reply', entityType: 'wa_confirmation', entityId: pending.id, after: { status, periodo: pending.period },
        summary: `${pending.name} ${status === 'CONFIRMADO' ? 'confirmou' : 'pediu ajuste em'} "${pending.subject ?? `Grade mensal · ${monthName(pending.period)}`}" pelo WhatsApp`,
      });
    }
  });
  if (ack) {
    try { await deliverWhatsApp({ kind: 'LIVRE', to: `55${key}`, text: ack, actor: { id: null, name: 'Resposta automática' } }); } catch { /* o registro já foi feito */ }
  }
  return handled;
}
