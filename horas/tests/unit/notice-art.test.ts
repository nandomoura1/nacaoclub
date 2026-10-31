import { describe, expect, it } from 'vitest';
import { MAX_ROWS, NOTICE_ART_BACKDROPS, NOTICE_ART_THEMES, fitParagraphs, normalizeNoticeArt, splitClosing, subtitleFrom, textParagraphs } from '@/domain/marketing/notice-art';
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
  it('paleta: só as do manual da marca; desconhecida volta para a original', () => {
    const base = { titleBottom: 'Funcionamento', rows: [{ time: '8h', place: 'Academia' }] };
    expect(normalizeNoticeArt({ ...base, theme: 'azul-claro' })).toMatchObject({ ok: true, value: { theme: 'azul-claro' } });
    expect(normalizeNoticeArt({ ...base, theme: 'rosa' as never })).toMatchObject({ ok: true, value: { theme: 'original' } });
    expect(NOTICE_ART_THEMES.map((t) => t.accent)).toEqual(expect.arrayContaining(['#459EFF', '#BBE3FF']));
  });
  it('fundo: só a cor original ou o Azul Escuro', () => {
    const base = { titleBottom: 'Funcionamento', rows: [{ time: '8h', place: 'Academia' }] };
    expect(NOTICE_ART_BACKDROPS.map((b) => b.color)).toEqual(['#232427', '#1C2C3C']);
    expect(normalizeNoticeArt({ ...base, backdrop: 'azul-escuro' })).toMatchObject({ ok: true, value: { backdrop: 'azul-escuro' } });
    expect(normalizeNoticeArt({ ...base, backdrop: 'azul-claro' as never })).toMatchObject({ ok: true, value: { backdrop: 'original' } });
  });
  it('gera o PNG em todas as paletas', async () => {
    for (const t of NOTICE_ART_THEMES) for (const b of NOTICE_ART_BACKDROPS) {
      const r = normalizeNoticeArt({ theme: t.id, backdrop: b.id, background: 'nenhuma', titleBottom: 'Funcionamento', rows: [{ time: '8h', place: 'Academia', badge: 'R$25' }] });
      if (!r.ok) throw new Error(r.error);
      const png = await renderNoticeArt(r.value, null);
      expect(png.subarray(1, 4).toString()).toBe('PNG');
    }
  }, 60_000);
  it('gera o PNG no tamanho do formato', async () => {
    const r = normalizeNoticeArt({ format: 'feed', titleTop: 'Horário de', titleBottom: 'Funcionamento', subtitle: '25/10 - ELEIÇÕES', closing: 'Te esperamos!', rows: [{ time: '8h - 12h', place: 'Academia' }, { time: '8h - 12h', place: 'Day Use', badge: 'R$25,00' }] });
    if (!r.ok) throw new Error(r.error);
    const png = await renderNoticeArt(r.value, null);
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1080, 1350]);
  }, 30_000);

  it('texto livre: dispensa a tabela, exige texto, guarda parágrafos e negrito', () => {
    expect(normalizeNoticeArt({ titleBottom: 'Aviso', content: 'texto', text: '  ' })).toMatchObject({ ok: false, error: expect.stringMatching(/texto/) });
    const r = normalizeNoticeArt({ titleBottom: 'Obras', content: 'texto', rows: [], text: 'Obra na  piscina.\r\n\n\n\nAcesso pelo *portão lateral*.' });
    expect(r).toMatchObject({ ok: true, value: { content: 'texto', text: 'Obra na piscina.\n\nAcesso pelo *portão lateral*.' } });
    expect(textParagraphs('Acesso pelo *portão lateral*.')).toEqual([[{ bold: false, text: 'Acesso pelo ' }, { bold: true, text: 'portão lateral' }, { bold: false, text: '.' }]]);
    // Texto curto sai grande; texto longo diminui a letra para caber.
    const short = fitParagraphs('Piscina fechada para manutenção.', 800, 560, 54, 24);
    const long = fitParagraphs('Lorem ipsum dolor sit amet '.repeat(16), 800, 560, 54, 24);
    expect(short.size).toBe(54);
    expect(long.size).toBeLessThan(short.size);
    expect(long.lines * long.size * 1.32).toBeLessThanOrEqual(560);
  });

  it('desenha o criativo com texto livre (story e feed)', async () => {
    for (const format of ['story', 'feed'] as const) {
      const r = normalizeNoticeArt({ format, titleTop: 'Aviso de', titleBottom: 'Obras de manutenção', subtitle: '31/10 - SÁBADO', content: 'texto', text: 'Ao longo do dia teremos uma obra de manutenção na *área da piscina*.\nAgradecemos a compreensão!', closing: 'Te esperamos!', background: 'nenhuma' });
      if (!r.ok) throw new Error(r.error);
      const png = await renderNoticeArt(r.value, null);
      expect(png.subarray(1, 4).toString()).toBe('PNG');
    }
  }, 30_000);
});
