/**
 * PIX "copia e cola" estático com valor (BR Code, padrão EMV do Banco Central).
 * É o mesmo texto que vira o QR Code: qualquer app de banco lê e já preenche
 * chave, valor e favorecido. Não é cobrança registrada (sem baixa automática).
 */

const ascii = (s: string, max: number) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 .,/-]/g, '').trim().toUpperCase().slice(0, max);
const field = (id: string, value: string) => `${id}${String(value.length).padStart(2, '0')}${value}`;

/** CRC16-CCITT (poli 0x1021, inicial 0xFFFF), exigido no campo 63. */
export function crc16(text: string): string {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(text)) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Chave como o PIX espera: CPF/CNPJ só dígitos, celular com +55, e-mail minúsculo, aleatória como está. */
export function normalizePixKey(key: string): string {
  const k = key.trim();
  if (/@/.test(k)) return k.toLowerCase();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(k)) return k.toLowerCase();
  const digits = k.replace(/\D/g, '');
  if (/^\+/.test(k)) return `+${digits}`;
  if (/[()]/.test(k) || (digits.length === 11 && /^\d{2}9/.test(digits) && !/[.-]/.test(k))) return `+55${digits}`;
  if (digits.length === 11 || digits.length === 14) return digits; // CPF / CNPJ
  return k;
}

export function pixPayload(o: { key: string; name: string; city: string; amountCents: number; txid?: string; description?: string }): string {
  const account = field('00', 'br.gov.bcb.pix') + field('01', normalizePixKey(o.key)) + (o.description ? field('02', ascii(o.description, 40)) : '');
  const txid = (o.txid ?? '***').replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';
  const body = [
    field('00', '01'),
    field('26', account),
    field('52', '0000'),
    field('53', '986'),
    o.amountCents > 0 ? field('54', (o.amountCents / 100).toFixed(2)) : '',
    field('58', 'BR'),
    field('59', ascii(o.name, 25) || 'NACAO CLUB'),
    field('60', ascii(o.city, 15) || 'BRASILIA'),
    field('62', field('05', txid)),
  ].join('');
  const withCrc = `${body}6304`;
  return withCrc + crc16(withCrc);
}
