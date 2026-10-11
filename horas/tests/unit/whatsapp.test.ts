import { describe, expect, it } from 'vitest';
import { accessMessage, maskDestination, normalizeDestination, previewOf } from '@/domain/whatsapp';

describe('WhatsApp (puro)', () => {
  it('normaliza telefone brasileiro e ID de grupo; recusa inválido', () => {
    expect(normalizeDestination('(61) 98466-2806')).toBe('5561984662806');
    expect(normalizeDestination('+55 61 98466-2806')).toBe('5561984662806');
    expect(normalizeDestination('6132221234')).toBe('556132221234');
    expect(normalizeDestination('120363019502650977-group')).toBe('120363019502650977-group');
    expect(normalizeDestination('123')).toBeNull();
    expect(normalizeDestination('abc-group')).toBeNull();
  });
  it('mascara o destino para o registro', () => {
    expect(maskDestination('5561984662806')).toBe('(61) 9••••-2806');
    expect(maskDestination('120363019502650977-group')).toBe('grupo …0977');
  });
  it('não guarda texto com senha e corta prévias longas', () => {
    expect(previewOf('Senha: 123', true)).toBeNull();
    expect(previewOf('a'.repeat(300), false)!.length).toBe(158);
  });
  it('mensagem de acesso', () => {
    const t = accessMessage({ name: 'Maria Júlia Souza', email: 'maju@nacao.club', password: 'Abc-123', url: 'https://adm.nacao.club/login' });
    expect(t).toContain('Olá, Maria!');
    expect(t).toContain('*Abc-123*');
    expect(t).toContain('https://adm.nacao.club/login');
  });
});

import { parseInstance } from '@/server/whatsapp/zapi';
describe('credenciais coladas', () => {
  it('limpa aspas/espaços e aceita o link inteiro', () => {
    expect(parseInstance(' "ABC123" \n', "'TOK9'")).toEqual({ id: 'ABC123', token: 'TOK9' });
    expect(parseInstance('https://api.z-api.io/instances/ABC123/token/TOK9/send-text', undefined)).toEqual({ id: 'ABC123', token: 'TOK9' });
    expect(parseInstance('ABC123', 'https://api.z-api.io/instances/ABC123/token/TOK9/send-text')).toEqual({ id: 'ABC123', token: 'TOK9' });
  });
});
