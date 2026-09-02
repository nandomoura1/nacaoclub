import { describe, expect, it } from 'vitest';
import { redact } from '@/lib/logger';

/**
 * Segredo em log é vazamento de segredo. A redação precisa acontecer
 * automaticamente, sem depender de disciplina de quem chama.
 */
describe('redact', () => {
  it('esconde chaves sensíveis', () => {
    const r = redact({ apiKey: 'abc', api_secret: 'xyz', password: '123', token: 't' }) as Record<string, unknown>;
    expect(r.apiKey).toBe('[REDACTED]');
    expect(r.api_secret).toBe('[REDACTED]');
    expect(r.password).toBe('[REDACTED]');
    expect(r.token).toBe('[REDACTED]');
  });

  it('esconde em profundidade', () => {
    const r = redact({ config: { tecnofit: { apiSecret: 'xyz' } } }) as any;
    expect(r.config.tecnofit.apiSecret).toBe('[REDACTED]');
  });

  it('esconde dentro de arrays', () => {
    const r = redact([{ authorization: 'Bearer x' }]) as any[];
    expect(r[0].authorization).toBe('[REDACTED]');
  });

  it('não esconde CPF por engano de nome, mas esconde o campo cpf', () => {
    const r = redact({ cpf: '000', nome: 'João' }) as Record<string, unknown>;
    expect(r.cpf).toBe('[REDACTED]');
    expect(r.nome).toBe('João');
  });

  it('preserva dado inofensivo', () => {
    const r = redact({ studentId: 'stu-1', count: 3 }) as Record<string, unknown>;
    expect(r.studentId).toBe('stu-1');
    expect(r.count).toBe(3);
  });

  it('não entra em laço infinito com estrutura profunda', () => {
    let deep: Record<string, unknown> = { fim: 1 };
    for (let i = 0; i < 20; i++) deep = { nivel: deep };
    expect(() => redact(deep)).not.toThrow();
  });
});
