import { formatDateBR } from '../dates';
import { formatBRL } from './money';
import { monthLabel, type Month } from './months';

/** Texto da cobrança para o WhatsApp do responsável (o PDF vai anexado à mão). */
export function chargeWhatsapp(c: { name: string; month: string; totalCents: number; dueDate: string; pixKey: string | null; payee: string; number: number }): string {
  return [
    `*Nação Club · Ajuda de Custo ${monthLabel(c.month as Month)}*`,
    `${c.name}`,
    '',
    `💰 Valor: *${formatBRL(c.totalCents)}*`,
    `📅 Vencimento: *${formatDateBR(c.dueDate)}*`,
    c.pixKey ? `🔑 PIX: ${c.pixKey}` : '💳 Pagamento via boleto ou PIX',
    `Favorecido: ${c.payee}`,
    '',
    `Segue em anexo a prestação de contas (documento nº ${c.number}). Qualquer dúvida, estamos à disposição. 💙`,
  ].join('\n');
}

/** "(61) 99999-0000" → "5561999990000" (wa.me); vazio/curto → null (abre o WhatsApp sem destinatário). */
export function waPhone(phone: string | null | undefined): string | null {
  const d = (phone ?? '').replace(/\D/g, '');
  if (d.length < 10) return null;
  return d.length <= 11 ? `55${d}` : d;
}
