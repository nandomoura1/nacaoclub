import { describe, expect, it } from 'vitest';
import { buildAlertDedupeKey, buildDedupeKey, dayBucket } from '@/server/services/dedupe';

/**
 * Deduplicação é a garantia central do produto: o mesmo giro de catraca
 * jamais pode virar dois cards na tela do professor (seção 12).
 */
describe('buildDedupeKey', () => {
  const base = {
    studentExternalId: 'STU-1',
    accessPointExternalId: 'AP-3',
    eventType: 'ENTRY',
    occurredAt: new Date('2026-09-01T18:42:31.000Z'),
  };

  it('produz a mesma chave para o mesmo evento', () => {
    expect(buildDedupeKey(base)).toBe(buildDedupeKey({ ...base }));
  });

  it('ignora diferença de milissegundos entre origens', () => {
    // O webhook e o poller descrevem o mesmo giro com precisão diferente.
    const webhook = buildDedupeKey({ ...base, occurredAt: new Date('2026-09-01T18:42:31.004Z') });
    const polling = buildDedupeKey({ ...base, occurredAt: new Date('2026-09-01T18:42:31.876Z') });
    expect(webhook).toBe(polling);
  });

  it('distingue duas entradas em segundos diferentes', () => {
    const a = buildDedupeKey(base);
    const b = buildDedupeKey({ ...base, occurredAt: new Date('2026-09-01T18:42:32.000Z') });
    expect(a).not.toBe(b);
  });

  it('distingue alunos diferentes na mesma catraca e instante', () => {
    const a = buildDedupeKey(base);
    const b = buildDedupeKey({ ...base, studentExternalId: 'STU-2' });
    expect(a).not.toBe(b);
  });

  it('distingue catracas diferentes para o mesmo aluno e instante', () => {
    const a = buildDedupeKey(base);
    const b = buildDedupeKey({ ...base, accessPointExternalId: 'AP-9' });
    expect(a).not.toBe(b);
  });

  it('distingue entrada de saída', () => {
    const a = buildDedupeKey(base);
    const b = buildDedupeKey({ ...base, eventType: 'EXIT' });
    expect(a).not.toBe(b);
  });

  it('casa o mesmo evento descrito por ID e por rótulo equivalente', () => {
    // Rótulos com acento e caixa diferentes descrevem a mesma catraca.
    const a = buildDedupeKey({
      ...base,
      accessPointExternalId: null,
      accessPointLabel: 'Catraca Futevôlei',
    });
    const b = buildDedupeKey({
      ...base,
      accessPointExternalId: null,
      accessPointLabel: 'CATRACA FUTEVOLEI',
    });
    expect(a).toBe(b);
  });

  it('prefere o ID externo ao rótulo quando ambos existem', () => {
    const comRotulo = buildDedupeKey({ ...base, accessPointLabel: 'Qualquer coisa' });
    expect(comRotulo).toBe(buildDedupeKey(base));
  });

  it('não colide um evento sem catraca com um de catraca conhecida', () => {
    const semCatraca = buildDedupeKey({
      ...base,
      accessPointExternalId: null,
      accessPointLabel: null,
    });
    expect(semCatraca).not.toBe(buildDedupeKey(base));
  });
});

describe('buildAlertDedupeKey', () => {
  it('repete a chave dentro da mesma janela', () => {
    const a = buildAlertDedupeKey('stu-1', 'LOW_FREQUENCY', '2026-09-01');
    const b = buildAlertDedupeKey('stu-1', 'LOW_FREQUENCY', '2026-09-01');
    expect(a).toBe(b);
  });

  it('gera chave nova em outro dia', () => {
    const a = buildAlertDedupeKey('stu-1', 'LOW_FREQUENCY', '2026-09-01');
    const b = buildAlertDedupeKey('stu-1', 'LOW_FREQUENCY', '2026-09-02');
    expect(a).not.toBe(b);
  });
});

describe('dayBucket', () => {
  it('formata como AAAA-MM-DD', () => {
    expect(dayBucket(new Date(2026, 8, 1, 23, 59))).toBe('2026-09-01');
  });
});
