import { describe, expect, it } from 'vitest';
import { canSee, eduPath, EDU_PATH_RE, guessFormat, trackProgress, youtubeEmbed } from '@/domain/universidade';

describe('Universidade Nação — regras puras', () => {
  it('formato sugerido pelo arquivo ou link', () => {
    expect(guessFormat('Audiobook Nação cap1.mp3')).toBe('AUDIO');
    expect(guessFormat('https://open.spotify.com/episode/x')).toBe('AUDIO');
    expect(guessFormat('https://youtu.be/abcdefghijk')).toBe('VIDEO');
    expect(guessFormat('Manual do Colaborador.pdf')).toBe('PDF');
    expect(guessFormat('Onboarding.pptx')).toBe('APRESENTACAO');
    expect(guessFormat('https://www.canva.com/design/xyz/view')).toBe('APRESENTACAO');
    expect(guessFormat('ebook.epub')).toBe('EBOOK');
    expect(guessFormat('https://nacao.com.br/x')).toBe('LINK');
  });
  it('caminho seguro e embed do YouTube', () => {
    const p = eduPath('11111111-2222-3333-4444-555555555555', 'Manual do Colaborador v2.PDF', new Date('2026-10-18T12:00:00Z'));
    expect(p).toBe('universidade/2026-10/11111111-2222-3333-4444-555555555555-manual-do-colaborador-v2.pdf');
    expect(EDU_PATH_RE.test(p)).toBe(true);
    expect(EDU_PATH_RE.test('../etc/passwd')).toBe(false);
    expect(youtubeEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(youtubeEmbed('https://drive.google.com/x')).toBeNull();
  });
  it('quem vê', () => {
    const base = { editor: false, leader: false, teacher: false, roleKeys: ['RECEPCAO'] };
    expect(canSee({ audience: 'TODOS', roleKey: null }, base)).toBe(true);
    expect(canSee({ audience: 'LIDERES', roleKey: null }, base)).toBe(false);
    expect(canSee({ audience: 'LIDERES', roleKey: null }, { ...base, leader: true })).toBe(true);
    expect(canSee({ audience: 'PROFESSORES', roleKey: null }, { ...base, teacher: true })).toBe(true);
    expect(canSee({ audience: 'PERFIL', roleKey: 'RECEPCAO' }, base)).toBe(true);
    expect(canSee({ audience: 'TODOS', roleKey: null, active: false }, base)).toBe(false);
    expect(canSee({ audience: 'LIDERES', roleKey: null, active: false }, { ...base, editor: true })).toBe(true);
  });
  it('progresso da trilha', () => {
    expect(trackProgress([{ materialId: 'a' }, { materialId: 'b' }, { materialId: 'c' }], new Set(['a']))).toEqual({ total: 3, completed: 1, pct: 33, next: 'b', finished: false });
    expect(trackProgress([], new Set()).finished).toBe(false);
  });
});
