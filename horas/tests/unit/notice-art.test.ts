import { describe, expect, it } from 'vitest';
import { MAX_ROWS, normalizeNoticeArt, splitClosing, subtitleFrom } from '@/domain/marketing/notice-art';
import { renderNoticeArt } from '@/server/marketing/notice-art';

describe('Gerador de comunicados', () => {
  it('faixa com data e motivo (ou o dia da semana)', () => {
    expect(subtitleFrom('2026-10-25', 'Eleições')).toBe('25/10 - ELEIÇÕES');
    expect(subtitleFrom('2026-10-25', '')).toBe('25/10 - DOMINGO');
    expect(subtitleFrom('', 'Natal')).toBe('NATAL');
  });
  it('valida as linhas e limita a 6', () => {
    expect(normalizeNoticeArt({ titleBottom: 'Funcionamento', rows: [] })).toMatchObject({ ok: false });
    expect(normalizeNoticeArt({ titleBottom: 'Funcionamento', rows: [{ time: '8h - 12h', place: '' }] })).toMatchObject({ ok: false, error: expect.stringMatching(/horário e do local/) });
    const many = Array.from({ length: 9 }, (_, i) => ({ time: `${i}h`, place: `Local ${i}`, badge: i === 2 ? 'R$25,00' : '' }));
    const r = normalizeNoticeArt({ titleBottom: '  Funcionamento ', rows: many });
    expect(r.ok && r.value.rows.length).toBe(MAX_ROWS);
    expect(r.ok && r.value.rows[2]!.badge).toBe('R$25,00');
    expect(r.ok && r.value.format).toBe('story');
  });
  it('frase final: 1ª palavra leve, resto em destaque', () => {
    expect(splitClosing('Te esperamos!')).toEqual(['Te', 'esperamos!']);
    expect(splitClosing('Bora!')).toEqual(['', 'Bora!']);
  });
  it('gera o PNG no tamanho do formato', async () => {
    const r = normalizeNoticeArt({ format: 'feed', titleTop: 'Horário de', titleBottom: 'Funcionamento', subtitle: '25/10 - ELEIÇÕES', closing: 'Te esperamos!', rows: [{ time: '8h - 12h', place: 'Academia' }, { time: '8h - 12h', place: 'Day Use', badge: 'R$25,00' }] });
    if (!r.ok) throw new Error(r.error);
    const png = await renderNoticeArt(r.value, null);
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1080, 1350]);
  }, 30_000);
});
