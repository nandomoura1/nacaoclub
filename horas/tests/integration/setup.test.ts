import { afterEach, describe, expect, it } from 'vitest';
import { runFirstSetup } from '@/server/services/setup-service';
import { hasDb, makeUser } from './helpers';
import { ensureCatalog } from './helpers';

const META = { ipAddress: '10.0.0.9' };
const input = { name: 'Dono', email: 'dono@teste.dev', password: 'senha-forte-123' };

describe.skipIf(!hasDb)('primeiro acesso em produção', () => {
  afterEach(() => { delete process.env.SETUP_TOKEN; });

  it('desativado sem SETUP_TOKEN forte', async () => {
    process.env.SETUP_TOKEN = 'curto';
    await expect(runFirstSetup({ ...input, token: 'curto' }, META)).rejects.toThrow(/desativado/);
  });

  it('recusa código errado', async () => {
    process.env.SETUP_TOKEN = 'a'.repeat(32);
    await expect(runFirstSetup({ ...input, token: 'b'.repeat(32) }, META)).rejects.toThrow(/incorreto/);
  });

  it('não roda de novo quando já existe usuário', async () => {
    await ensureCatalog();
    await makeUser('ADMIN');
    process.env.SETUP_TOKEN = 'a'.repeat(32);
    await expect(runFirstSetup({ ...input, token: 'a'.repeat(32) }, META)).rejects.toThrow(/já foi configurado/);
  });
});
