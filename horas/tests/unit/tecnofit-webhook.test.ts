import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifySignature } from '@/server/services/tecnofit-webhook-service';

describe('Webhook da Tecnofit: assinatura', () => {
  const secret = 'whsec_teste';
  const body = '{"event":"payment.received","resource_url":"https://integracao.tecnofit.com.br/v1/x"}';
  const sign = (ts: string, b = body, s = secret) => `v1=${createHmac('sha256', s).update(`${ts}.${b}`).digest('hex')}`;
  const now = 1_800_000_000;

  it('aceita HMAC-SHA256 de "<timestamp>.<corpo>" no formato v1=<hex>', () => {
    expect(verifySignature(secret, String(now), sign(String(now)), body, now)).toBe(true);
    expect(verifySignature(secret, String(now * 1000), sign(String(now * 1000)), body, now)).toBe(true); // ms
  });
  it('recusa secret errado, corpo alterado, sem cabeçalho e aviso velho (> 5 min)', () => {
    expect(verifySignature(secret, String(now), sign(String(now), body, 'outro'), body, now)).toBe(false);
    expect(verifySignature(secret, String(now), sign(String(now)), body + ' ', now)).toBe(false);
    expect(verifySignature(secret, null, sign(String(now)), body, now)).toBe(false);
    expect(verifySignature(secret, String(now - 400), sign(String(now - 400)), body, now)).toBe(false);
    expect(verifySignature('', String(now), sign(String(now)), body, now)).toBe(false);
  });
});
