import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '@/server/auth/password';

describe('hash de senha', () => {
  it('valida a senha correta', async () => {
    const hash = await hashPassword('nacao@2026');
    expect(await verifyPassword('nacao@2026', hash)).toBe(true);
  });

  it('rejeita a senha errada', async () => {
    const hash = await hashPassword('nacao@2026');
    expect(await verifyPassword('nacao@2025', hash)).toBe(false);
  });

  it('gera hashes diferentes para a mesma senha', async () => {
    // Salt aleatório: dois usuários com a mesma senha não compartilham hash.
    expect(await hashPassword('mesmasenha')).not.toBe(await hashPassword('mesmasenha'));
  });

  it('nunca guarda a senha em claro', async () => {
    const hash = await hashPassword('segredoabsoluto');
    expect(hash).not.toContain('segredoabsoluto');
    expect(hash.startsWith('scrypt$1$')).toBe(true);
  });

  it('recusa senha curta demais', async () => {
    await expect(hashPassword('1234')).rejects.toThrow();
  });

  it('não quebra com hash malformado', async () => {
    expect(await verifyPassword('x', 'lixo')).toBe(false);
    expect(await verifyPassword('x', '')).toBe(false);
    expect(await verifyPassword('x', 'scrypt$1$00$00')).toBe(false);
  });
});
