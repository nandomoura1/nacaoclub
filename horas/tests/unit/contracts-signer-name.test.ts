import { describe, expect, it } from 'vitest';
import { signerNameMatches } from '@/domain/contracts';

describe('nome digitado na assinatura', () => {
  const nacao = 'NAÇÃO CLUB: NAÇÃO CLUB RECREAÇÕES ESPORTIVAS LTDA';
  it('aceita o nome depois do rótulo, sem ligar para acento, maiúscula e pontuação', () => {
    expect(signerNameMatches('Nação Club Recreações Esportivas Ltda', nacao)).toBe(true);
    expect(signerNameMatches('NACAO CLUB RECREACOES ESPORTIVAS LTDA.', nacao)).toBe(true);
    expect(signerNameMatches('NAÇÃO CLUB: NAÇÃO CLUB RECREAÇÕES ESPORTIVAS LTDA', nacao)).toBe(true);
    expect(signerNameMatches('  gustavo   de LIMA ', 'Gustavo de Lima')).toBe(true);
  });
  it('recusa nome diferente, incompleto ou só o rótulo', () => {
    expect(signerNameMatches('Nação Club', nacao)).toBe(false);
    expect(signerNameMatches('Gustavo Lima', 'Gustavo de Lima')).toBe(false);
    expect(signerNameMatches('', 'Gustavo de Lima')).toBe(false);
  });
});

import { signerDisplayName } from '@/domain/contracts';
describe('nome fixo na página de assinatura', () => {
  it('tira o rótulo antes de dois-pontos', () => {
    expect(signerDisplayName('NAÇÃO CLUB: NAÇÃO CLUB RECREAÇÕES ESPORTIVAS LTDA')).toBe('NAÇÃO CLUB RECREAÇÕES ESPORTIVAS LTDA');
    expect(signerDisplayName('Gustavo de Lima')).toBe('Gustavo de Lima');
  });
});
