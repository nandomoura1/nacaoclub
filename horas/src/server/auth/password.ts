import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

/**
 * Hash de senha com scrypt (nativo do Node).
 *
 * Escolha deliberada: scrypt é memory-hard e vem no runtime, sem dependência
 * nativa para compilar no deploy. Formato: scrypt$N$salt_hex$hash_hex.
 * O prefixo versionado permite migrar de algoritmo sem invalidar sessões.
 */
const KEYLEN = 64;
const SALT_BYTES = 16;

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 8) throw new Error('A senha deve ter ao menos 8 caracteres.');
  const salt = randomBytes(SALT_BYTES);
  const derived = await scrypt(password, salt, KEYLEN);
  return `scrypt$1$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'scrypt') return false;

  const salt = Buffer.from(parts[2]!, 'hex');
  const expected = Buffer.from(parts[3]!, 'hex');
  if (expected.length !== KEYLEN) return false;

  const derived = await scrypt(password, salt, KEYLEN);
  // Comparação em tempo constante: evita oráculo de temporização.
  return timingSafeEqual(derived, expected);
}
