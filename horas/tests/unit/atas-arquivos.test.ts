import { describe, expect, it } from 'vitest';
import { ATA_PATH_RE, ataMime, ataPath, fileSize } from '@/domain/atas-arquivos';

describe('Arquivos das atas (puro)', () => {
  it('aceita documentos e HTML, recusa SVG; caminho limpo; tamanho legível', () => {
    expect(ataMime('Proposta Nação 2027.PDF')).toBe('application/pdf');
    expect(ataMime('projeto.pptx')).toMatch(/presentation/);
    expect(ataMime('apresentacao.html')).toBe('text/html');
    expect(ataMime('logo.svg')).toBeNull();
    const p = ataPath('3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90', 'Proposta Ação Kids (v2).pdf', new Date('2026-11-19T12:00:00Z'));
    expect(p).toBe('atas/2026-11/3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90-proposta-acao-kids-v2.pdf');
    expect(ATA_PATH_RE.test(p)).toBe(true);
    expect(ATA_PATH_RE.test('universidade/2026-11/x.pdf')).toBe(false);
    expect([fileSize(900), fileSize(2048), fileSize(2_500_000)]).toEqual(['900 B', '2 KB', '2,4 MB']);
  });
});
