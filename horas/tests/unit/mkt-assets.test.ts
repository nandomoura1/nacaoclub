import { describe, expect, it } from 'vitest';
import { assetMime, assetPath, canMove, formatBytes, guessKind, titleFromFile } from '@/domain/marketing/assets';

describe('Biblioteca — regras puras', () => {
  it('aceita só formatos de criativo', () => {
    expect(assetMime('Post Feed.PNG')).toBe('image/png');
    expect(assetMime('reels.mov')).toBe('video/quicktime');
    expect(assetMime('script.exe')).toBeNull();
    expect(assetMime('sem-extensao')).toBeNull();
  });
  it('sugere tipo e título pelo nome', () => {
    expect(guessKind('logo-nacao.svg')).toBe('LOGO');
    expect(guessKind('reels_kids.mp4')).toBe('VIDEO');
    expect(guessKind('IMG_2033.jpg')).toBe('FOTO');
    expect(guessKind('post-black-friday.png')).toBe('ARTE');
    expect(guessKind('briefing.pdf')).toBe('DOCUMENTO');
    expect(titleFromFile('post_black-friday  2026.png')).toBe('Post black friday 2026');
  });
  it('caminho seguro no bucket (sem acento, espaço ou ../)', () => {
    const p = assetPath('11111111-2222-3333-4444-555555555555', '../Ação Verão!.JPG', new Date('2026-10-14T12:00:00Z'));
    expect(p).toBe('biblioteca/2026-10/11111111-2222-3333-4444-555555555555-acao-verao.jpg');
  });
  it('fluxo de aprovação', () => {
    const editor = { edit: true, approve: false };
    const gestor = { edit: true, approve: true };
    expect(canMove('RASCUNHO', 'EM_APROVACAO', editor)).toBe(true);
    expect(canMove('EM_APROVACAO', 'APROVADO', editor)).toBe(false);
    expect(canMove('EM_APROVACAO', 'APROVADO', gestor)).toBe(true);
    expect(canMove('EM_APROVACAO', 'AJUSTES', gestor)).toBe(true);
    expect(canMove('AJUSTES', 'EM_APROVACAO', editor)).toBe(true);
    expect(canMove('ARQUIVADO', 'APROVADO', gestor)).toBe(false);
    expect(canMove('APROVADO', 'ARQUIVADO', editor)).toBe(true);
    expect(formatBytes(3_500_000)).toBe('3,3 MB');
  });
});
