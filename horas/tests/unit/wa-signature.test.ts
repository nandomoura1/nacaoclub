import { describe, expect, it } from 'vitest';
import { withSignature } from '@/domain/whatsapp';

describe('assinatura das mensagens do sistema', () => {
  it('acrescenta "Assistente Nação Tech" no fim, uma vez só', () => {
    expect(withSignature('Olá!\n')).toBe('Olá!\n\n_Assistente Nação Tech_');
    expect(withSignature(withSignature('Olá!'))).toBe('Olá!\n\n_Assistente Nação Tech_');
    expect(withSignature('Texto\n\nAssistente Nação Tech')).toBe('Texto\n\nAssistente Nação Tech');
  });
});
